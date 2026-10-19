import { describe, expect, it } from "vitest";
import vectors from "../../fixtures/fingerprint-vectors.json";
import { fingerprint, forecastFingerprint, type Detection, type ForecastFields, type MatchedDetection } from "./fingerprint";

const v1 = vectors.filter((v) => !("version" in v));
const v2 = vectors.filter((v) => "version" in v && v.version === 2);
const v3 = vectors.filter((v) => "version" in v && v.version === 3);

describe("fingerprint, version 1", () => {
  it.each(v1)("matches the shared vector: $name", ({ fields, fingerprint: expected }) => {
    expect(fingerprint(fields as Detection)).toBe(expected);
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

describe("forecastFingerprint, version 3", () => {
  it("has the shared vectors", () => {
    expect(v3).toHaveLength(3);
  });

  it.each(v3)("matches the shared vector: $name", ({ fields, fingerprint: expected }) => {
    expect(forecastFingerprint(fields as ForecastFields)).toBe(expected);
  });
});
