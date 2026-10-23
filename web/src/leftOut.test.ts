import { keccak256, toHex, zeroHash, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import vectors from "../../fixtures/join-vectors.json";
import type { HotspotRecord, PackDetail } from "./api";
import { fingerprint, forecastFingerprint } from "./fingerprint";
import { checkRuns, distanceM, JOIN_M, JOIN_S, type RunRecords } from "./leftOut";
import { leaf, rootOf } from "./merkle";

type Sent = RunRecords["hotspots"][number];
type Roots = Map<number, { root: Hex; sealedAt: number }>;

const CONCESSION = "ID-WOOD-CONCESSION-0341";
const H = 3600;
// 2026-10-28 06:00 UTC, when the pack's fire was first seen.
const T0 = 1793167200;
const START = T0 - 48 * H;
const AS_OF = T0 + 30 * H;
const LAT = -300000;
const LON = 11000000;

let next = 0;

/** A detection sealed in `run`, `dlat_e5` north of the fire's first detection, `dt` seconds after it. */
function hotspot(run: number, dlat_e5: number, dt: number, more: Partial<Sent> = {}): Sent {
  const record_id = keccak256(toHex(`hotspot:${next++}`));
  return {
    record_id,
    source: "VIIRS_NOAA20_NRT",
    lat_e5: LAT + dlat_e5,
    lon_e5: LON,
    acquired_at: new Date((T0 + dt) * 1000).toISOString(),
    acquired_unix: T0 + dt,
    frp_e2: 520,
    confidence: "n",
    tx_hash: null,
    sealed_at: null,
    fingerprint_version: 2,
    map_version: "Trase pulpwood concessions 2023–2024, v2026-02-20",
    concessions: [{ id: CONCESSION, inside: true, edge_m: 410 }],
    run,
    stored_unix: T0 + dt + 600,
    ...more,
  };
}

function forecast(run: number): RunRecords["forecasts"][number] {
  return {
    record_id: keccak256(toHex(`forecast:${next++}`)),
    concession_id: CONCESSION,
    fire_key: keccak256(toHex("fire")),
    after_pass_unix: T0,
    made_unix: T0 + 600,
    until_unix: T0 + 600 + 48 * H,
    inside_by_unix: null,
    from: null,
    crossing: null,
    rule_version: 1,
    run,
  };
}

/** FireRuns as the chain holds it: each run's root built from all its records, sealed at `sealedAt`;
 *  a run missing from `sealedAt` is not sealed yet. */
function chain(records: RunRecords, sealedAt: Record<number, number>): Roots {
  const roots: Roots = new Map();
  for (const [key, at] of Object.entries(sealedAt)) {
    const run = Number(key);
    const leaves = [
      ...records.hotspots.filter((h) => h.run === run).map((h) => leaf(h.record_id, fingerprint(h))),
      ...records.forecasts.filter((f) => f.run === run).map((f) => leaf(f.record_id, forecastFingerprint(f))),
    ];
    roots.set(run, { root: rootOf(leaves), sealedAt: at });
  }
  return roots;
}

const pack = (hotspots: HotspotRecord[], first: number, last: number, as_of_unix = AS_OF) =>
  ({ concession_id: CONCESSION, as_of_unix, hotspots, runs: { first, last } }) as PackDetail;

const inPack = (h: Sent): HotspotRecord => {
  const { stored_unix: _, ...record } = h;
  return { ...record, proof: [] };
};

const SEALED = { 1: START - H, 2: T0 + H, 3: T0 + 21 * H, 4: T0 + 29 * H + 1800 };

/** Runs 2 to 4 of a fire's window: two pack detections, a forecast, a detection of another concession
 *  beside the fire, and one of this concession 4.4 km away. */
function window() {
  const p1 = hotspot(2, 0, 0);
  const p2 = hotspot(3, 100, 9 * H);
  const otherConcession = hotspot(3, 200, 9 * H, { concessions: [{ id: "ID-WOOD-CONCESSION-0540", inside: false, edge_m: 900 }] });
  const far = hotspot(4, 4000, 18 * H);
  const sent: RunRecords = { hotspots: [p1, p2, otherConcession, far], forecasts: [forecast(2)] };
  return { p1, p2, sent, packed: pack([inPack(p1), inPack(p2)], 2, 4) };
}

const ends = (roots: Roots, first: number, last: number) => ({
  first: { run: first, sealedAt: roots.get(first)!.sealedAt },
  last: { run: last, sealedAt: roots.get(last)!.sealedAt },
});

describe("distanceM", () => {
  it.each(vectors)("gives fires.py's distance: $name", ({ a, b, distance_m }) => {
    expect(distanceM(a, b)).toBe(distance_m);
  });
});

describe("checkRuns", () => {
  it.each(vectors)("joins a detection as fires.py does: $name", async ({ a, b, joins }) => {
    const mine = hotspot(1, 0, 0, { ...a, stored_unix: a.acquired_unix });
    const other = hotspot(1, 0, 0, { ...b, stored_unix: b.acquired_unix });
    const sent = { hotspots: [mine, other], forecasts: [] };
    const asOf = Math.max(a.acquired_unix, b.acquired_unix) + H;
    const roots = chain(sent, { 1: asOf - H });

    const check = await checkRuns(pack([inPack(mine)], 1, 1, asOf), sent, roots);
    expect(check.missing.map((h) => h.record_id)).toEqual(joins ? [other.record_id] : []);
    expect(check.unmatched).toEqual([]);
  });

  it("finds nothing left out when every run rebuilds and the ends hold", async () => {
    const { sent, packed } = window();
    const roots = chain(sent, SEALED);

    await expect(checkRuns(packed, sent, roots)).resolves.toEqual({
      ...ends(roots, 2, 4),
      records: 5,
      beforeRuns: false,
      missing: [],
      unmatched: [],
    });
  });

  it("lists a detection left out through another one left out, oldest first", async () => {
    const { sent, packed } = window();
    // 600 m and 11 hours from the pack's newest detection, then 600 m and 9 hours on.
    const joined = hotspot(3, 640, 20 * H);
    const throughJoined = hotspot(4, 1180, 29 * H);
    sent.hotspots.unshift(throughJoined);
    sent.hotspots.push(joined);

    const check = await checkRuns(packed, sent, chain(sent, SEALED));
    expect(check.missing).toEqual([joined, throughJoined]);
    expect(check.unmatched).toEqual([]);
  });

  it("joins at 48 hours to the second, and lists one pass by latitude, then longitude", async () => {
    const p = hotspot(1, 0, 0);
    const east = hotspot(1, 10, 48 * H, { lon_e5: LON + 5 });
    const west = hotspot(1, 10, 48 * H);
    const south = hotspot(1, 0, 48 * H);
    const sent = { hotspots: [p, east, west, south], forecasts: [] };

    const check = await checkRuns(pack([inPack(p)], 1, 1, T0 + 49 * H), sent, chain(sent, { 1: T0 + 48 * H + 1800 }));
    expect(check.missing).toEqual([south, west, east]);
  });

  it("names a run whose records don't rebuild its root, and uses none of them", async () => {
    const { sent, packed } = window();
    const joined = hotspot(3, 640, 20 * H);
    sent.hotspots.push(joined);
    const roots = chain(sent, SEALED);
    const changed = { ...sent, hotspots: sent.hotspots.map((h) => (h === joined ? { ...h, frp_e2: 1 } : h)) };

    const check = await checkRuns(packed, changed, roots);
    expect(check.unmatched).toEqual([3]);
    expect(check.missing).toEqual([]);
  });

  it("names a run with no records sent, and one not sealed yet", async () => {
    const { sent, packed } = window();
    const roots = chain(sent, SEALED);
    roots.set(3, { root: zeroHash, sealedAt: 0 });

    const check = await checkRuns(packed, { ...sent, hotspots: sent.hotspots.filter((h) => h.run !== 4) }, roots);
    expect(check.unmatched).toEqual([3, 4]);
    expect(check.records).toBe(4);
  });

  it("names the run before the window when it was sealed inside the window", async () => {
    const { sent, packed } = window();

    expect((await checkRuns(packed, sent, chain(sent, { ...SEALED, 1: START - 1 }))).unmatched).toEqual([]);
    expect((await checkRuns(packed, sent, chain(sent, { ...SEALED, 1: START }))).unmatched).toEqual([1]);
  });

  it("names the run after the window when it was sealed by the cut", async () => {
    const { sent, packed } = window();
    const after = (sealedAt: number) => {
      const roots = chain(sent, SEALED);
      roots.set(5, { root: keccak256(toHex("run 5")), sealedAt });
      return roots;
    };

    expect((await checkRuns(packed, sent, after(AS_OF + 1))).unmatched).toEqual([]);
    expect((await checkRuns(packed, sent, after(AS_OF))).unmatched).toEqual([5]);
  });

  it("names a run past the window that holds one of the pack's detections", async () => {
    const { p1, p2, sent } = window();
    const late = hotspot(6, 0, 25 * H);
    sent.hotspots.push(late);

    const check = await checkRuns(pack([inPack(p1), inPack(p2), inPack(late)], 2, 4), sent, chain(sent, SEALED));
    expect(check.unmatched).toEqual([6]);
    expect(check.records).toBe(5);
  });

  it("skips a detection stored after the cut only in a run sealed after the cut", async () => {
    const { sent, packed } = window();
    const storedLate = { stored_unix: AS_OF + 60 };
    const inEarlierRun = hotspot(3, -300, 3 * H, storedLate);
    const inLastRun = hotspot(4, 300, 2 * H, storedLate);
    const storedInTime = hotspot(4, 400, 4 * H);
    sent.hotspots.push(inEarlierRun, inLastRun, storedInTime);

    const check = await checkRuns(packed, sent, chain(sent, { ...SEALED, 4: AS_OF + H }));
    expect(check.missing).toEqual([inEarlierRun, storedInTime]);
    expect(check.unmatched).toEqual([]);
  });

  it("says the window starts before run roots when run 1 was sealed inside it", async () => {
    const p = hotspot(1, 0, 0);
    const sent = { hotspots: [p], forecasts: [] };
    const packed = pack([inPack(p)], 1, 1);

    expect((await checkRuns(packed, sent, chain(sent, { 1: START + 1 }))).beforeRuns).toBe(true);
    expect((await checkRuns(packed, sent, chain(sent, { 1: START }))).beforeRuns).toBe(false);
  });

  it("holds the 1 km and 48 hours of the fire rule", () => {
    expect([JOIN_M, JOIN_S]).toEqual([1000, 172800]);
  });
});
