import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import vectors from "../../fixtures/merkle-vectors.json";
import { leaf, rootFrom } from "./merkle";
import { inRun } from "./preview/fixture";

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

  it.each(vectors)("builds the shared tree in the previews' inRun: $name", ({ leaves: given, root }) => {
    const records = given.map((l) => ({
      record_id: l.record_id as Hex,
      fingerprint: l.fingerprint as Hex,
      tx_hash: null as Hex | null,
      sealed_at: null as string | null,
    }));
    const run = inRun(records, 1, 0, (r) => r.fingerprint);
    expect(run.root).toBe(root);
    expect(run.records.map((r) => r.proof)).toEqual(given.map((l) => l.proof));
  });

  it("leads a changed fingerprint to another root", () => {
    const { record_id, proof } = vectors[1].leaves[0];
    const changed = leaf(record_id as Hex, vectors[1].leaves[1].fingerprint as Hex);
    expect(rootFrom(changed, proof as Hex[])).not.toBe(vectors[1].root);
  });
});
