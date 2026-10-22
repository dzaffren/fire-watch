import {
  decodeFunctionData,
  encodeFunctionResult,
  keccak256,
  multicall3Abi,
  parseAbi,
  toHex,
  zeroHash,
  type Hex,
} from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkReads, sealsOf } from "./chain";

vi.hoisted(() => {
  vi.stubEnv("VITE_RPC_URL", "http://rpc.test/");
  vi.stubEnv("VITE_CONTRACT_ADDRESS", "0x6a55489a05a9c79d2cd35212878d113557dceb2a");
  vi.stubEnv("VITE_FIRE_RUNS_ADDRESS", "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512");
});

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const CONTRACT = "0x6a55489a05a9c79d2cd35212878d113557dceb2a";
const FIRE_RUNS = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
const fireRecords = parseAbi(["function sealOf(bytes32 recordId) view returns (bytes32 fingerprint, uint64 sealedAt)"]);
const fireRuns = parseAbi(["function runOf(uint256 run) view returns (bytes32 root, uint64 sealedAt)"]);

const recordId = (i: number) => toHex(i + 1, { size: 32 });
const sealed = (id: Hex) => keccak256(id);
// 2026-10-14 20:02 UTC, when scenario 1's forecast was sealed.
const SEALED_AT = 1792008120n;

// 2026-10-24 08:03:12 UTC, when run 412's root was sealed.
const RUN_SEALED_AT = 1792828992n;
const runRoot = (run: bigint) => keccak256(toHex(run, { size: 32 }));

/** Base Sepolia as the browser sees it: FireRecords' seals and FireRuns' roots up to `runs`, read only
 *  through Multicall3's aggregate3. */
function fakeRpc(seals: Map<Hex, Hex>, runs = 0n) {
  const calls: { to: string; records: number; runs: bigint[] }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const { id, method, params } = JSON.parse(init.body as string);
      if (method !== "eth_call") throw new Error(`unexpected ${method}`);
      const { to, data } = params[0];
      const { args } = decodeFunctionData({ abi: multicall3Abi, data });
      const asked: bigint[] = [];
      const reads = (args[0] as readonly { target: Hex; callData: Hex }[]).map(({ target, callData }) => {
        if (target.toLowerCase() === FIRE_RUNS) {
          const [run] = decodeFunctionData({ abi: fireRuns, data: callData }).args;
          asked.push(run);
          const sealedRun = run >= 1n && run <= runs;
          const returnData = encodeFunctionResult({
            abi: fireRuns,
            functionName: "runOf",
            result: sealedRun ? [runRoot(run), RUN_SEALED_AT] : [zeroHash, 0n],
          });
          return { success: true, returnData };
        }
        expect(target.toLowerCase()).toBe(CONTRACT);
        const [record] = decodeFunctionData({ abi: fireRecords, data: callData }).args;
        const fingerprint = seals.get(record) ?? zeroHash;
        const returnData = encodeFunctionResult({
          abi: fireRecords,
          functionName: "sealOf",
          result: [fingerprint, fingerprint === zeroHash ? 0n : SEALED_AT],
        });
        return { success: true, returnData };
      });
      calls.push({ to: to.toLowerCase(), records: reads.length, runs: asked });
      const result = encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", result: reads });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return calls;
}

const sealedAll = (ids: Hex[]) => new Map(ids.map((id) => [id, sealed(id)]));

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sealsOf", () => {
  it("reads a 19-detection fire's seals in one eth_call through Multicall3", async () => {
    const ids = Array.from({ length: 19 }, (_, i) => recordId(i));
    const calls = fakeRpc(sealedAll(ids));

    await expect(sealsOf(ids)).resolves.toEqual(ids.map(sealed));
    expect(calls).toEqual([{ to: MULTICALL3, records: 19, runs: [] }]);
  });

  it("reads 1,200 seals in three eth_calls of at most 500, in order", async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => recordId(i));
    const calls = fakeRpc(sealedAll(ids));

    await expect(sealsOf(ids)).resolves.toEqual(ids.map(sealed));
    expect(calls.map((c) => c.records).sort((a, b) => a - b)).toEqual([200, 500, 500]);
    expect(calls.every((c) => c.to === MULTICALL3)).toBe(true);
  });

  it("gives zero for a record not sealed yet", async () => {
    const ids = [recordId(0), recordId(1), recordId(2)];
    fakeRpc(new Map([[ids[0], sealed(ids[0])], [ids[2], sealed(ids[2])]]));

    await expect(sealsOf(ids)).resolves.toEqual([sealed(ids[0]), zeroHash, sealed(ids[2])]);
  });
});

describe("checkReads", () => {
  const SEALED = Number(SEALED_AT);
  const RUN_SEALED = Number(RUN_SEALED_AT);

  it("reads a record with no run on FireRecords, with its time by the chain's clock", async () => {
    const ids = [recordId(0), recordId(1)];
    const calls = fakeRpc(new Map([[ids[0], sealed(ids[0])]]));

    await expect(checkReads(ids.map((record_id) => ({ record_id, run: null })))).resolves.toEqual([
      { contract: "FireRecords", fingerprint: sealed(ids[0]), sealedAt: SEALED },
      { contract: "FireRecords", fingerprint: zeroHash, sealedAt: 0 },
    ]);
    expect(calls).toEqual([{ to: MULTICALL3, records: 2, runs: [] }]);
  });

  it("mixes FireRuns and FireRecords reads in one aggregate3, each run read once", async () => {
    const ids = Array.from({ length: 6 }, (_, i) => recordId(i));
    const calls = fakeRpc(new Map([[ids[0], sealed(ids[0])], [ids[1], sealed(ids[1])]]), 2n);
    const records = [
      { record_id: ids[0], run: null },
      { record_id: ids[1] },
      { record_id: ids[2], run: 1 },
      { record_id: ids[3], run: 2 },
      { record_id: ids[4], run: 1 },
      { record_id: ids[5], run: 2 },
    ];

    await expect(checkReads(records)).resolves.toEqual([
      { contract: "FireRecords", fingerprint: sealed(ids[0]), sealedAt: SEALED },
      { contract: "FireRecords", fingerprint: sealed(ids[1]), sealedAt: SEALED },
      { contract: "FireRuns", run: 1, root: runRoot(1n), sealedAt: RUN_SEALED },
      { contract: "FireRuns", run: 2, root: runRoot(2n), sealedAt: RUN_SEALED },
      { contract: "FireRuns", run: 1, root: runRoot(1n), sealedAt: RUN_SEALED },
      { contract: "FireRuns", run: 2, root: runRoot(2n), sealedAt: RUN_SEALED },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].records).toBe(4);
    expect([...calls[0].runs].sort()).toEqual([1n, 2n]);
  });

  it("gives a zero root for a run not sealed yet", async () => {
    fakeRpc(new Map(), 1n);

    await expect(checkReads([{ record_id: recordId(0), run: 2 }])).resolves.toEqual([
      { contract: "FireRuns", run: 2, root: zeroHash, sealedAt: 0 },
    ]);
  });

  it("reads 1,200 records with no run in three eth_calls of at most 500, in order", async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => recordId(i));
    const calls = fakeRpc(sealedAll(ids));

    await expect(checkReads(ids.map((record_id) => ({ record_id })))).resolves.toEqual(
      ids.map((id) => ({ contract: "FireRecords", fingerprint: sealed(id), sealedAt: Number(SEALED_AT) })),
    );
    expect(calls.map((c) => c.records).sort((a, b) => a - b)).toEqual([200, 500, 500]);
  });
});
