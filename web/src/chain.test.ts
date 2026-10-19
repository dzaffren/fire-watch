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
import { sealsOf, sealsWithTime } from "./chain";

vi.hoisted(() => {
  vi.stubEnv("VITE_RPC_URL", "http://rpc.test/");
  vi.stubEnv("VITE_CONTRACT_ADDRESS", "0x6a55489a05a9c79d2cd35212878d113557dceb2a");
});

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const CONTRACT = "0x6a55489a05a9c79d2cd35212878d113557dceb2a";
const fireRecords = parseAbi(["function sealOf(bytes32 recordId) view returns (bytes32 fingerprint, uint64 sealedAt)"]);

const recordId = (i: number) => toHex(i + 1, { size: 32 });
const sealed = (id: Hex) => keccak256(id);
// 2026-10-14 20:02 UTC, when scenario 1's forecast was sealed.
const SEALED_AT = 1792008120n;

/** Base Sepolia as the browser sees it: FireRecords' seals, read only through Multicall3's aggregate3. */
function fakeRpc(seals: Map<Hex, Hex>) {
  const calls: { to: string; records: number }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const { id, method, params } = JSON.parse(init.body as string);
      if (method !== "eth_call") throw new Error(`unexpected ${method}`);
      const { to, data } = params[0];
      const { args } = decodeFunctionData({ abi: multicall3Abi, data });
      const reads = (args[0] as readonly { target: Hex; callData: Hex }[]).map(({ target, callData }) => {
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
      calls.push({ to: to.toLowerCase(), records: reads.length });
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
    expect(calls).toEqual([{ to: MULTICALL3, records: 19 }]);
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

describe("sealsWithTime", () => {
  it("reads each seal's fingerprint and time by the chain's clock, in one eth_call through Multicall3", async () => {
    const ids = [recordId(0), recordId(1), recordId(2)];
    const calls = fakeRpc(new Map([[ids[0], sealed(ids[0])], [ids[2], sealed(ids[2])]]));

    await expect(sealsWithTime(ids)).resolves.toEqual([
      { fingerprint: sealed(ids[0]), sealedAt: SEALED_AT },
      { fingerprint: zeroHash, sealedAt: 0n },
      { fingerprint: sealed(ids[2]), sealedAt: SEALED_AT },
    ]);
    expect(calls).toEqual([{ to: MULTICALL3, records: 3 }]);
  });

  it("reads 1,200 seals in three eth_calls of at most 500, in order", async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => recordId(i));
    const calls = fakeRpc(sealedAll(ids));

    await expect(sealsWithTime(ids)).resolves.toEqual(ids.map((id) => ({ fingerprint: sealed(id), sealedAt: SEALED_AT })));
    expect(calls.map((c) => c.records).sort((a, b) => a - b)).toEqual([200, 500, 500]);
  });
});
