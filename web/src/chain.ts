import { createPublicClient, http, parseAbi, type Hex } from "viem";

const abi = parseAbi([
  "function sealOf(bytes32 recordId) view returns (bytes32 fingerprint, uint64 sealedAt)",
]);

const client = createPublicClient({ transport: http(import.meta.env.VITE_RPC_URL) });

// Multicall3, at the same address on Base Sepolia as on most chains (D38).
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
// 488 seals in one eth_call worked on the public RPC; its gas cap is unmeasured (D38).
const RECORDS_PER_CALL = 500;

export interface Seal {
  fingerprint: Hex;
  sealedAt: bigint;
}

export async function sealOf(recordId: Hex): Promise<Seal> {
  const [fingerprint, sealedAt] = await client.readContract({
    address: import.meta.env.VITE_CONTRACT_ADDRESS,
    abi,
    functionName: "sealOf",
    args: [recordId],
  });
  return { fingerprint, sealedAt };
}

/** Each record's sealed fingerprint, in order; zero for one not sealed yet. One eth_call per 500 records. */
export async function sealsOf(recordIds: Hex[]): Promise<Hex[]> {
  const chunks: Hex[][] = [];
  for (let i = 0; i < recordIds.length; i += RECORDS_PER_CALL) chunks.push(recordIds.slice(i, i + RECORDS_PER_CALL));
  const results = await Promise.all(
    chunks.map((ids) =>
      client.multicall({
        multicallAddress: MULTICALL3,
        batchSize: 0,
        allowFailure: false,
        contracts: ids.map((id) => ({
          address: import.meta.env.VITE_CONTRACT_ADDRESS,
          abi,
          functionName: "sealOf",
          args: [id],
        }) as const),
      }),
    ),
  );
  return results.flat().map(([fingerprint]) => fingerprint);
}
