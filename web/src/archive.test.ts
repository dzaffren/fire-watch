/// <reference types="node" />
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import type { PackDetail } from "./api";
import type { Point } from "./fingerprint";
import { detectedShort } from "./format";
import { distanceM, joins, type Detection } from "./sameFire";

// The pinned cut of NASA FIRMS's archive around the example fire, 10 to 12 Oct 2026, fetched on 2026-10-24 (D145).
const SOURCES = ["VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"];
const cutFile = (source: string) => `fixtures/firms/archive/${source}.csv`;

const rows = SOURCES.flatMap((source) => {
  const [head, ...lines] = readFileSync(resolve("..", cutFile(source)), "utf8").trim().split("\n");
  const cols = head.split(",");
  return lines.map((line): Detection & { source: string } => {
    const r = Object.fromEntries(line.split(",").map((v, i) => [cols[i], v]));
    const hhmm = r.acq_time.padStart(4, "0");
    return {
      source,
      lat_e5: Math.round(Number(r.latitude) * 1e5),
      lon_e5: Math.round(Number(r.longitude) * 1e5),
      acquired_unix: Date.parse(`${r.acq_date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`) / 1000,
    };
  });
});
const pack: PackDetail = JSON.parse(readFileSync(resolve("public/case/pack-0332.json"), "utf8"));

/** Even-odd over every ring of the concession, so a hole counts as outside. */
const inside = (p: Point) => {
  const [x, y] = [p.lon_e5 / 1e5, p.lat_e5 / 1e5];
  let odd = false;
  for (const ring of pack.boundary)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [[xi, yi], [xj, yj]] = [ring[i], ring[j]];
      if (yi > y !== yj > y && x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) odd = !odd;
    }
  return odd;
};

it("holds NOAA-20's 11 Oct sightings under 1 km from the first detection, outside and before the records begin (D146)", () => {
  const first = pack.hotspots[0];
  const begin = pack.first_seen_unix - pack.recorded_before_h! * 3600;

  const before = rows.filter((r) => r.source === "VIIRS_NOAA20_NRT" && r.acquired_unix < begin && distanceM(r, first) < 1000);

  expect(before.map((r) => [detectedShort(r.acquired_unix), Math.round(distanceM(r, first))])).toEqual([
    ["11 Oct 05:33", 965],
    ["11 Oct 18:15", 680],
  ]);
  expect(before.some(inside)).toBe(false);
});

it("holds other satellites' 10 Oct sightings under 1 km from the second fire's first pass, on both sides (D145)", () => {
  // Pass 2's detections that the first detection reaches through the pass are the first fire's; the rest are the
  // second fire's first pass.
  const pass2 = pack.hotspots.filter((h) => h.pass === 2);
  const firstFire = [pack.hotspots[0]];
  for (const h of firstFire) for (const g of pass2) if (!firstFire.includes(g) && joins(h, g)) firstFire.push(g);
  const second = pass2.filter((h) => !firstFire.includes(h));
  expect([second.length, detectedShort(second[0].acquired_unix)]).toEqual([16, detectedShort(pack.joined![0].first_seen_unix)]);

  const near = rows.filter((r) => detectedShort(r.acquired_unix).startsWith("10 Oct") && second.some((h) => distanceM(r, h) < 1000));

  expect([...new Set(near.map((r) => r.source))].sort()).toEqual(["MODIS_NRT", "VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT"]);
  expect([near.filter(inside).length, near.filter((r) => !inside(r)).length]).toEqual([2, 6]);
});

it("is the cut the README's curl lines redo, by its sha256 (D145)", () => {
  const readme = readFileSync(resolve("../README.md"), "utf8");
  const redo = readme.slice(readme.indexOf("## Redo the real case's data"));

  for (const source of SOURCES) {
    const sha = createHash("sha256").update(readFileSync(resolve("..", cutFile(source)))).digest("hex");
    expect(redo).toContain(`${sha}  ${cutFile(source)}`);
  }
});
