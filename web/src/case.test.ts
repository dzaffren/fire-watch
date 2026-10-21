/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { zeroHash } from "viem";
import { afterEach, expect, it, vi } from "vitest";
import type { HotspotRecord } from "./api";
import { caseSource } from "./caseSource";
import { fingerprint } from "./fingerprint";
import { passTimes } from "./FireView";
import { detectedShort } from "./format";
import { EXAMPLE_PACK_HREF } from "./Landing";

vi.mock("./chain", () => ({ sealsOf: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
});

const readCopy = () => {
  vi.stubGlobal("fetch", async (path: string) => new Response(readFileSync(resolve("public", path.slice(1)))));
  return caseSource.pack();
};

const HOUR = 3600;
const inside = (h: HotspotRecord) => h.concessions.some((m) => m.id === "ID-WOOD-CONCESSION-0332" && m.inside);

it("reads the committed copy of the example fire's pack, as the landing's case tells it (D84, D85)", async () => {
  const pack = await readCopy();

  const link = new URLSearchParams(EXAMPLE_PACK_HREF.slice(1));
  expect([pack.concession_id, pack.key, String(pack.as_of_unix)]).toEqual([link.get("pack"), link.get("fire"), link.get("as_of")]);
  expect(pack.hotspots).toHaveLength(283);
  expect(pack.first_seen).toEqual({ reading: "outside", inside: false, edge_m: 3100 });
  expect(detectedShort(pack.inside_from_unix!)).toBe("13 Oct 06:37");

  const times = passTimes(pack.hotspots);
  expect(times.map(detectedShort)).toEqual([
    "12 Oct 05:16",
    "13 Oct 06:37",
    "13 Oct 17:37",
    "14 Oct 06:18",
    "14 Oct 17:20",
    "15 Oct 18:43",
    "16 Oct 18:21",
    "17 Oct 05:23",
  ]);
  const passes = times.map((_, p) => pack.hotspots.filter((h) => h.pass === p + 1));
  expect(passes.map((hs) => [hs.length, hs.filter(inside).length])).toEqual([
    [1, 0],
    [35, 6],
    [43, 27],
    [37, 16],
    [66, 43],
    [6, 0],
    [62, 46],
    [33, 26],
  ]);

  // Passes 1 to 6 were sealed on 16 Oct, when recording began, 23 hours to 4 days late; 7 and 8 within 3 hours.
  const lag = (h: HotspotRecord) => Date.parse(h.sealed_at!) / 1000 - h.acquired_unix;
  const early = passes.slice(0, 6).flat();
  expect(early.every((h) => h.sealed_at!.startsWith("2026-10-16"))).toBe(true);
  expect(Math.min(...early.map(lag))).toBeGreaterThan(22 * HOUR);
  expect(Math.max(...early.map(lag))).toBeLessThan(4 * 24 * HOUR);
  expect(passes.slice(6).flat().every((h) => lag(h) < 3 * HOUR)).toBe(true);
});

it("names no company (shape O10)", () => {
  const text = readFileSync(resolve("public/case/pack-0332.json"), "utf8");

  expect(text).not.toMatch(/\bPT\b|\bTbk\b|\bLtd\b|\bGroup\b/);
});

it("checks each record against its seal, loading the chain code only when asked", async () => {
  const { sealsOf } = await import("./chain");
  const [a, b, c] = (await readCopy()).hotspots;
  vi.mocked(sealsOf).mockResolvedValue([fingerprint(a), zeroHash, fingerprint(a)]);

  const checks = await caseSource.check([a, b, c]);

  expect(sealsOf).toHaveBeenCalledWith([a.record_id, b.record_id, c.record_id]);
  expect(checks).toEqual([{ state: "matches" }, { state: "pending" }, { state: "mismatch", sealed: fingerprint(a) }]);
});
