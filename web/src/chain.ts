import { createPublicClient, http, parseAbi, type Hex } from "viem";

const fireRecords = parseAbi([
  "function sealOf(bytes32 recordId) view returns (bytes32 fingerprint, uint64 sealedAt)",
]);
const fireRuns = parseAbi(["function runOf(uint256 run) view returns (bytes32 root, uint64 sealedAt)"]);

const client = createPublicClient({ transport: http(import.meta.env.VITE_RPC_URL) });

// Multicall3, at the same address on Base Sepolia as on most chains (D38).
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
// 488 seals in one eth_call worked on the public RPC; its gas cap is unmeasured (D38).
const RECORDS_PER_CALL = 500;

/** A record's seal as the chain holds it, with its time by the chain's clock in Unix seconds: its own
 *  fingerprint on FireRecords, or its run's root on FireRuns. Zeros for one not sealed yet. */
export type Seal =
  | { contract: "FireRecords"; fingerprint: Hex; sealedAt: number }
  | { contract: "FireRuns"; run: number; root: Hex; sealedAt: number };

type Read =
  | { address: Hex; abi: typeof fireRecords; functionName: "sealOf"; args: readonly [Hex] }
  | { address: Hex; abi: typeof fireRuns; functionName: "runOf"; args: readonly [bigint] };

/** Every read's answer, in order, in one aggregate3 call through Multicall3 per 500 reads. */
async function readAll(reads: Read[]): Promise<(readonly [Hex, bigint])[]> {
  const chunks: Read[][] = [];
  for (let i = 0; i < reads.length; i += RECORDS_PER_CALL) chunks.push(reads.slice(i, i + RECORDS_PER_CALL));
  const results = await Promise.all(
    chunks.map((contracts) =>
      client.multicall({ multicallAddress: MULTICALL3, batchSize: 0, allowFailure: false, contracts }),
    ),
  );
  return results.flat() as (readonly [Hex, bigint])[];
}

const sealOf = (recordId: Hex): Read => ({
  address: import.meta.env.VITE_CONTRACT_ADDRESS,
  abi: fireRecords,
  functionName: "sealOf",
  args: [recordId],
});

/** Each record's sealed fingerprint on FireRecords, in order; zero for one not sealed yet. */
export async function sealsOf(recordIds: Hex[]): Promise<Hex[]> {
  return (await readAll(recordIds.map(sealOf))).map(([fingerprint]) => fingerprint);
}

/** Each record's seal, in order: its run's root on FireRuns for a record with a run, each run read
 *  once, and its own seal on FireRecords for one without. */
export async function checkReads(records: { record_id: Hex; run?: number | null }[]): Promise<Seal[]> {
  const runs = [...new Set(records.flatMap((r) => (r.run == null ? [] : [r.run])))];
  const own = records.filter((r) => r.run == null);
  const answers = await readAll([
    ...runs.map((run): Read => ({
      address: import.meta.env.VITE_FIRE_RUNS_ADDRESS,
      abi: fireRuns,
      functionName: "runOf",
      args: [BigInt(run)],
    })),
    ...own.map((r) => sealOf(r.record_id)),
  ]);
  const roots = new Map(runs.map((run, i) => [run, answers[i]]));
  let next = runs.length;
  return records.map((r): Seal => {
    if (r.run == null) {
      const [fingerprint, sealedAt] = answers[next++];
      return { contract: "FireRecords", fingerprint, sealedAt: Number(sealedAt) };
    }
    const [root, sealedAt] = roots.get(r.run)!;
    return { contract: "FireRuns", run: r.run, root, sealedAt: Number(sealedAt) };
  });
}
