import { concat, encodeAbiParameters, keccak256, type Hex } from "viem";

// A run's Merkle tree (D108). Must match api/src/firewatch/merkle.py byte for byte.

/** keccak256 of keccak256 of the ABI-encoded record ID and fingerprint, so a leaf can't pass for an inner node. */
export function leaf(recordId: Hex, fingerprint: Hex): Hex {
  return keccak256(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [recordId, fingerprint])));
}

const pair = (a: Hex, b: Hex): Hex => {
  const [x, y] = [a.toLowerCase() as Hex, b.toLowerCase() as Hex];
  return keccak256(x < y ? concat([x, y]) : concat([y, x]));
};

/** The root that a leaf and its proof, the sibling hashes bottom up, lead to. */
export function rootFrom(leafHash: Hex, proof: readonly Hex[]): Hex {
  return proof.reduce(pair, leafHash);
}

/** The root of a run's leaves: sorted, each pair hashed, an odd node at the end of a level moved up unchanged. */
export function rootOf(leaves: Hex[]): Hex {
  let level = [...leaves].sort();
  while (level.length > 1) level = level.flatMap((n, i) => (i % 2 ? [] : [i + 1 < level.length ? pair(n, level[i + 1]) : n]));
  return level[0];
}
