import { describe, expect, it } from "vitest";
import vectors from "../../fixtures/fingerprint-vectors.json";
import { fingerprint } from "./fingerprint";

describe("fingerprint, version 1", () => {
  it.each(vectors)("matches the shared vector: $name", ({ fields, fingerprint: expected }) => {
    expect(fingerprint(fields)).toBe(expected);
  });
});
