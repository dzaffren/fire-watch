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
