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

/** "370 m" under a kilometre, "3.1 km" from there. */
export const distance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/** "Inside, 3.1 km from the edge"; within one VIIRS pixel of the edge it says so. */
export function whereFromEdge(match: { inside: boolean; edge_m: number }): string {
  const side = `${match.inside ? "Inside" : "Outside"}, ${distance(match.edge_m)} from the edge`;
  return match.edge_m < ONE_PIXEL_M ? `${side}, within one satellite pixel of it` : side;
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
