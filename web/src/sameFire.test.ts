/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import vectors from "../../fixtures/join-vectors.json";
import type { FireDetail, HotspotRecord, JoinedFire, PackDetail } from "./api";
import { joins, sideJoin } from "./sameFire";

const ID = "ID-WOOD-CONCESSION-0332";
const H = 3600;
const pack: PackDetail = JSON.parse(readFileSync(resolve("public/case/pack-0332.json"), "utf8"));
const T = pack.first_seen_unix;

/** The example fire's first detection, moved `hours` later and `northM` metres north, on a side of the edge. */
function at(hours: number, northM: number, pass: number, inside: boolean, edgeM: number): HotspotRecord {
  const first = pack.hotspots[0];
  const lat_e5 = first.lat_e5 + Math.round(northM / 1.112);
  return { ...first, acquired_unix: T + hours * H, lat_e5, pass, concessions: [{ id: ID, inside, edge_m: edgeM }] };
}

// Another fire, 1.6 km north, seen inside on pass 2, joined to this one by a detection between them on pass 3.
const OTHER_INSIDE = at(12, 1600, 2, true, 800);
const BRIDGE = at(24, 800, 3, false, 2000);
const JOIN: JoinedFire = { at_unix: T + 24 * H, first_seen_unix: T + 12 * H, first_seen: { reading: "inside", inside: true, edge_m: 800 } };

function fire(hotspots: HotspotRecord[]): FireDetail {
  return { ...pack, hotspots, inside_from_unix: T + 12 * H, outside_from_unix: T, joined: [JOIN] };
}

describe("sideJoin", () => {
  it("names the 14 Oct 17:20 join for the example pack's inside time, and none for its outside time", () => {
    expect(pack.joined).toHaveLength(1);
    expect(sideJoin(pack, ID, true)).toEqual(pack.joined?.[0]);
    expect(sideJoin(pack, ID, true)?.at_unix).toBe(Date.UTC(2026, 9, 14, 17, 20) / 1000);
    expect(sideJoin(pack, ID, false)).toBeNull();
  });

  it("names the join that brought in the other fire's inside detection", () => {
    expect(sideJoin(fire([at(0, 0, 1, false, 3100), OTHER_INSIDE, BRIDGE]), ID, true)).toEqual(JOIN);
  });

  it("gives null when the fire's own detection was inside on the same pass", () => {
    expect(sideJoin(fire([at(0, 0, 1, false, 3100), at(12, 300, 2, true, 500), OTHER_INSIDE, BRIDGE]), ID, true)).toBeNull();
  });

  it("gives null for a fire with no join", () => {
    expect(sideJoin({ ...pack, joined: [] }, ID, true)).toBeNull();
  });
});

describe("joins", () => {
  it.each(vectors)("pairs two detections as fires.py does: $name", ({ a, b, joins: joined }) => {
    expect(joins(a, b)).toBe(joined);
  });
});
