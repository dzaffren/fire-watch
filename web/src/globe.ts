import { themeFill } from "./maps";

/** The fire globe's data and its flat world map (design brief, tier 3 budget; D75–D77). */

/** West, south, east and north, in degrees. */
export type Box = [number, number, number, number];
export type Point = [lon: number, lat: number];

export interface GlobeData {
  /** Natural Earth 110m land, each ring as lon, lat pairs in degrees. */
  land: Float32Array[];
  /** Every NOAA-20 detection of 14 Oct 2026 as lon, lat pairs: one per 0.01° cell, and in full near the 0332 fire. */
  fires: Float32Array;
  near: Near;
}

export interface Near {
  box: Box;
  fires: Point[];
  /** The rings of ID-WOOD-CONCESSION-0332's edge, Trase v2026-02-20. */
  concession: Point[][];
  /** Natural Earth 10m land in and just beyond the box: at this scale 110m puts some of the day's fires at sea. */
  land: Point[][];
}

export interface GlobeColours {
  sea: string;
  land: string;
  coast: string;
  fire: string;
  edge: string;
  inside: string;
}

export const WORLD: Box = [-180, -90, 180, 90];
// The flat map leaves out Antarctica and the far north, where there are no fires to show.
export const FLAT_WORLD: Box = [-180, -60, 180, 80];
// The example fire on 14 Oct 2026: the middle of its 103 detections that day. It was first seen on 12 Oct, outside
// ID-WOOD-CONCESSION-0332 and 3,100 m from its edge, and was seen inside from 13 Oct (D75).
export const EXAMPLE_FIRE: Point = [112.81, -3.09];
// FIRMS's NOAA-20 detections worldwide on 14 Oct 2026, and in the box around Indonesia (D73).
export const DAY_DETECTIONS = 62489;
export const DAY_DETECTIONS_INDONESIA = 9923;

const DIR = `${import.meta.env.BASE_URL}globe/`;

// The files are gzipped as committed, so they cost the same whether or not the host compresses them.
async function unzipped(name: string): Promise<DataView> {
  const response = await fetch(DIR + name);
  if (!response.ok || !response.body) throw new Error(`${name}: ${response.status}`);
  return new DataView(await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}

function land(view: DataView): Float32Array[] {
  const rings: Float32Array[] = [];
  let at = 2;
  for (let r = view.getUint16(0, true); r > 0; r--) {
    const n = view.getInt16(at, true);
    at += 2;
    const ring = new Float32Array(n * 2);
    for (let i = 0; i < n * 2; i++, at += 2) ring[i] = view.getInt16(at, true) / 10;
    rings.push(ring);
  }
  return rings;
}

// Cells of 0.01°, sorted by latitude: latitudes as steps from the one before, then longitudes.
function fires(view: DataView, near: Point[]): Float32Array {
  const n = view.getUint32(0, true);
  const out = new Float32Array((n + near.length) * 2);
  let lat = 0;
  for (let i = 0; i < n; i++) {
    lat += view.getInt16(4 + i * 2, true);
    out[i * 2] = view.getInt16(4 + n * 2 + i * 2, true) / 100;
    out[i * 2 + 1] = lat / 100;
  }
  near.forEach(([x, y], i) => out.set([x, y], (n + i) * 2));
  return out;
}

export async function loadGlobe(): Promise<GlobeData> {
  const [landView, fireView, nearView] = await Promise.all([
    unzipped("land-110m.bin"),
    unzipped("fires-2026-10-14.bin"),
    unzipped("near-0332.bin"),
  ]);
  const near: Near = JSON.parse(new TextDecoder().decode(nearView));
  return { land: land(landView), fires: fires(fireView, near.fires), near };
}

export function globeColours(): GlobeColours {
  return {
    sea: themeFill("--fw-water"),
    land: themeFill("--fw-map"),
    // In dark the land and sea tokens are close, and the globe has no labels to show where the coast is.
    coast: themeFill("--fw-faint"),
    fire: themeFill("--fw-fire"),
    edge: themeFill("--fw-ink"),
    inside: themeFill("--fw-concession"),
  };
}

/** The equirectangular map of `box`, fitted into the canvas: land on sea, then the 0332 concession and each fire
 * as a dot of `dot` CSS px. With no `dot` it draws land and sea only, for the globe's textures, with the coast `coast`
 * canvas px wide. The near box is drawn from its own finer land. */
export function drawFlat(
  canvas: HTMLCanvasElement,
  data: GlobeData,
  box: Box,
  colours: GlobeColours,
  { dot, coast }: { dot?: number; coast?: number } = {},
) {
  const land: ArrayLike<number>[] = box === data.near.box ? data.near.land.map((r) => r.flat()) : data.land;
  const ctx = canvas.getContext("2d")!;
  const [west, south, east, north] = box;
  const scale = Math.min(canvas.width / (east - west), canvas.height / (north - south));
  const left = (canvas.width - (east - west) * scale) / 2;
  const top = (canvas.height - (north - south) * scale) / 2;
  const x = (lon: number) => left + (lon - west) * scale;
  const y = (lat: number) => top + (north - lat) * scale;
  const ring = (path: Path2D, points: ArrayLike<number>) => {
    for (let i = 0; i < points.length; i += 2) path[i ? "lineTo" : "moveTo"](x(points[i]), y(points[i + 1]));
    path.closePath();
  };

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, (east - west) * scale, (north - south) * scale);
  ctx.clip();
  ctx.fillStyle = colours.sea;
  ctx.fill();
  const shore = new Path2D();
  land.forEach((r) => ring(shore, r));
  ctx.fillStyle = colours.land;
  ctx.fill(shore, "evenodd");
  const ratio = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
  ctx.strokeStyle = colours.coast;
  ctx.lineWidth = coast ?? ratio;
  ctx.stroke(shore);
  if (!dot) {
    ctx.restore();
    return;
  }

  const edge = new Path2D();
  data.near.concession.forEach((r) => ring(edge, r.flat()));
  ctx.fillStyle = colours.inside;
  ctx.fill(edge, "evenodd");
  ctx.strokeStyle = colours.edge;
  ctx.lineWidth = 1.5 * ratio;
  ctx.setLineDash([4 * ratio, 3 * ratio]);
  ctx.stroke(edge);

  // Round, as the map's fire markers are.
  const radius = (dot * ratio) / 2;
  const dots = new Path2D();
  for (let i = 0; i < data.fires.length; i += 2) {
    const lon = data.fires[i];
    const lat = data.fires[i + 1];
    if (lon < west || lon > east || lat < south || lat > north) continue;
    dots.moveTo(x(lon) + radius, y(lat));
    dots.arc(x(lon), y(lat), radius, 0, 2 * Math.PI);
  }
  ctx.fillStyle = colours.fire;
  ctx.fill(dots);
  ctx.restore();
}

/** Whether this browser can draw the 3D globe. */
export function canDraw3d(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}
