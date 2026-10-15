import { describe, expect, it } from "vitest";
import vectors from "../../fixtures/fingerprint-vectors.json";
import { fingerprint, type MatchedDetection } from "./fingerprint";

const v1 = vectors.filter((v) => !("version" in v));
const v2 = vectors.filter((v) => "version" in v && v.version === 2);

describe("fingerprint, version 1", () => {
  it.each(v1)("matches the shared vector: $name", ({ fields, fingerprint: expected }) => {
    expect(fingerprint(fields)).toBe(expected);
  });
});

describe("fingerprint, version 2", () => {
  it("has the shared vectors", () => {
    expect(v2).toHaveLength(4);
  });

  it.each(v2)("matches the shared vector: $name", ({ fields, fingerprint: expected }) => {
    expect(fingerprint({ ...(fields as Omit<MatchedDetection, "fingerprint_version">), fingerprint_version: 2 })).toBe(expected);
  });
});
