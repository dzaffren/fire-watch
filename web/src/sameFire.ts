import type { FireDetail, JoinedFire } from "./api";
import type { Point } from "./fingerprint";

// The fire rule's step 2, as api/src/firewatch/fires.py has it (D124).
export const JOIN_M = 1000;
export const JOIN_S = 48 * 3600;
const EARTH_RADIUS_M = 6371008.8;
// The rule's step 6: a side counts from more than 375 m beyond the edge.
const EDGE_DOUBT_M = 375;

const radians = (degrees: number) => degrees * (Math.PI / 180);

/** Haversine metres between two points, in fires.py's distance_m's order of operations, so both give the same float. */
export function distanceM(a: Point, b: Point): number {
  const [latA, latB] = [radians(a.lat_e5 / 1e5), radians(b.lat_e5 / 1e5)];
  const dLat = latB - latA;
  const dLon = radians((b.lon_e5 - a.lon_e5) / 1e5);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export type Detection = Point & { acquired_unix: number };

export const joins = (a: Detection, b: Detection) =>
  distanceM(a, b) <= JOIN_M && Math.abs(a.acquired_unix - b.acquired_unix) <= JOIN_S;

/** The fire joined to this one whose detection first put it on a side of the edge, or null when the fire's own
 *  detections did (D142). It replays the rule's steps 2 and 10 on the fire's detections, pass by pass. */
export function sideJoin(fire: FireDetail, id: string, inside: boolean): JoinedFire | null {
  const from = inside ? fire.inside_from_unix : fire.outside_from_unix;
  const joined = fire.joined ?? [];
  if (from === null || !joined.length) return null;
  const hs = fire.hotspots;
  const parent = hs.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const pass = (i: number) => hs[i].pass ?? 1;
  const sidePass = pass(hs.findIndex((h) => h.acquired_unix === from));
  const onSide = hs.flatMap((h, i) => {
    const m = h.concessions.find((c) => c.id === id);
    return pass(i) === sidePass && m && m.inside === inside && m.edge_m > EDGE_DOUBT_M ? [i] : [];
  });
  let start = 0;
  for (let i = 0; i < hs.length; i++) {
    if (pass(i) !== pass(start)) start = i;
    // Oldest first, so only the 48 hours before can join.
    for (let j = i - 1; j >= 0 && hs[i].acquired_unix - hs[j].acquired_unix <= JOIN_S; j--)
      if (joins(hs[i], hs[j])) parent[root(i)] = root(j);
    const last = i === hs.length - 1 || pass(i + 1) !== pass(i);
    if (!last || pass(i) < sidePass || !onSide.some((k) => root(k) === root(0))) continue;
    // A join is dated by its pass's first detection, as fires.py's step 10 dates it.
    const at = hs[start].acquired_unix;
    return pass(i) === sidePass ? null : (joined.find((f) => f.at_unix === at) ?? null);
  }
  return null;
}
