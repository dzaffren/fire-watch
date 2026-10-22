import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import vectors from "../../fixtures/merkle-vectors.json";
import { leaf, rootFrom } from "./merkle";

const leaves = vectors.flatMap((tree) => tree.leaves.map((l) => ({ ...l, tree: tree.name, root: tree.root as Hex })));

describe("merkle", () => {
  it("has the shared trees of 1, 2, 3 and 5 leaves", () => {
    expect(vectors.map((t) => t.leaves.length)).toEqual([1, 2, 3, 5]);
  });

  it.each(leaves)("gives the shared leaf: $tree, $record_id", ({ record_id, fingerprint, leaf: expected }) => {
    expect(leaf(record_id as Hex, fingerprint as Hex)).toBe(expected);
  });

  it.each(leaves)("leads each proof to its tree's root: $tree, $record_id", ({ leaf: l, proof, root }) => {
    expect(rootFrom(l as Hex, proof as Hex[])).toBe(root);
  });

  it("leads a changed fingerprint to another root", () => {
    const { record_id, proof } = vectors[1].leaves[0];
    const changed = leaf(record_id as Hex, vectors[1].leaves[1].fingerprint as Hex);
    expect(rootFrom(changed, proof as Hex[])).not.toBe(vectors[1].root);
  });
});
