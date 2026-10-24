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

  it("names the join when only the other fire's detections link the inside one to this fire, on the pass that joins them", () => {
    const outsideB = at(12, 1600, 2, false, 2000);
    const join = { ...JOIN, at_unix: T + 24 * H, first_seen: { reading: "outside" as const, inside: false, edge_m: 2000 } };
    // The bridge joins this fire to B; the inside detection is 800 m from B and 1.6 km from the bridge.
    const hotspots = [at(0, 0, 1, false, 3100), outsideB, BRIDGE, at(24, 2400, 3, true, 800)];
    expect(sideJoin({ ...fire(hotspots), inside_from_unix: T + 24 * H, joined: [join] }, ID, true)).toEqual(join);
  });

  it("gives null when the inside detection links to this fire through the same pass's detections", () => {
    const outsideB = at(12, 1600, 2, false, 2000);
    const join = { ...JOIN, at_unix: T + 24 * H, first_seen: { reading: "outside" as const, inside: false, edge_m: 2000 } };
    // The inside detection is 900 m from the bridge, which is 800 m from this fire's first detection.
    const hotspots = [at(0, 0, 1, false, 3100), outsideB, BRIDGE, at(24, 1700, 3, true, 800)];
    expect(sideJoin({ ...fire(hotspots), inside_from_unix: T + 24 * H, joined: [join] }, ID, true)).toBeNull();
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
