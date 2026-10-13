import { createPublicClient, http, parseAbi, type Hex } from "viem";

const abi = parseAbi([
  "function sealOf(bytes32 recordId) view returns (bytes32 fingerprint, uint64 sealedAt)",
]);

const client = createPublicClient({ transport: http(import.meta.env.VITE_RPC_URL) });

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
