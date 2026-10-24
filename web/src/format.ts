import type { FirstSeen } from "./api";

const SATELLITES: Record<string, string> = { VIIRS_NOAA20_NRT: "VIIRS NOAA-20" };
const CONFIDENCE: Record<string, string> = { n: "Nominal", l: "Low", h: "High" };

function decimal(scaled: number, places: number): string {
  const unit = 10 ** places;
  const abs = Math.abs(scaled);
  const fraction = String(abs % unit).padStart(places, "0").replace(/0+$/, "");
  const whole = Math.floor(abs / unit);
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function location(lat_e5: number, lon_e5: number): string {
  return `${decimal(lat_e5, 5)}°${lat_e5 < 0 ? "S" : "N"}, ${decimal(lon_e5, 5)}°${lon_e5 < 0 ? "W" : "E"}`;
}

export function detected(unix: number): string {
  const iso = new Date(unix * 1000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export const firePower = (frp_e2: number) => `${decimal(frp_e2, 2)} MW`;
export const satellite = (source: string) => SATELLITES[source] ?? source;
export const confidence = (code: string) => CONFIDENCE[code] ?? code;
export const shortHash = (hash: string, head: number, tail: number) => `${hash.slice(0, head)}…${hash.slice(-tail)}`;

const ONE_PIXEL_M = 375;

/** "370 m" while it rounds to under a kilometre, "1.0 km" and "3.1 km" from there. */
export const distance = (m: number) => (m < 995 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/** "Inside, 3.1 km from the edge"; within one VIIRS pixel of the edge it says so. */
export function whereFromEdge(match: { inside: boolean; edge_m: number }): string {
  const side = `${match.inside ? "Inside" : "Outside"}, ${distance(match.edge_m)} from the edge`;
  return match.edge_m <= ONE_PIXEL_M ? `${side}, within one satellite pixel of it` : side;
}

export const count = (n: number) => n.toLocaleString("en-GB");

/** "14 Oct 06:18", the short form the detections table uses. */
export function detectedShort(unix: number): string {
  const d = new Date(unix * 1000);
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${d.getUTCDate()} ${month} ${d.toISOString().slice(11, 16)}`;
}

/** "2 h 47 min" between detection and seal. */
export function gap(fromUnix: number, toIso: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(toIso) / 1000 - fromUnix) / 60));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} h`;
}

/** "22 hours 41 minutes", the long form for a sentence. */
export function duration(seconds: number): string {
  const minutes = Math.round(Math.abs(seconds) / 60);
  const unit = (n: number, one: string) => `${count(n)} ${one}${n === 1 ? "" : "s"}`;
  if (minutes < 60) return unit(minutes, "minute");
  if (minutes < 2880) {
    const m = minutes % 60;
    return m ? `${unit(Math.floor(minutes / 60), "hour")} ${unit(m, "minute")}` : unit(minutes / 60, "hour");
  }
  const h = Math.floor((minutes % 1440) / 60);
  return h ? `${unit(Math.floor(minutes / 1440), "day")} ${unit(h, "hour")}` : unit(Math.floor(minutes / 1440), "day");
}

/** "outside, 950 m from the edge": where a first pass saw a fire against this concession (D26). */
export function seenWhere(f: FirstSeen): string {
  if (f.reading === "both") return "on both sides of the edge";
  if (f.reading === "edge") return `${distance(f.edge_m)} ${f.inside ? "inside" : "outside"} the edge, within one satellite pixel of it`;
  return `${f.reading}, ${distance(f.edge_m)} from the edge`;
}

/** The fire view's headline: where the fire's first pass saw it against this concession (D26), and
 *  whether that pass was one detection with a long gap after it (D112). */
export const firstSeenLine = (f: FirstSeen, aloneH?: number | null) =>
  `First seen ${seenWhere(f)}${aloneH != null ? ", as one detection" : ""}`;

/** The fires table's short form: "Outside, 950 m", or "Too close to tell". */
export function firstSeenShort(f: FirstSeen): string {
  if (f.reading === "both") return "Both sides of the edge";
  if (f.reading === "edge") return "Too close to tell";
  return `${f.reading === "inside" ? "Inside" : "Outside"}, ${distance(f.edge_m)}`;
}

export const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;
