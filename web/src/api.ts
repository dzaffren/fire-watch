import type { Hex } from "viem";
import { sealOf, sealsOf, sealsWithTime } from "./chain";
import { fingerprint, forecastFingerprint, type ForecastFields, type MatchedDetection } from "./fingerprint";
import type { PackSource } from "./ComplaintPack";
import type { FireRecordSource } from "./FireRecordPage";

export type { ConcessionMatch, Point } from "./fingerprint";

export interface HotspotRecord extends MatchedDetection {
  record_id: Hex;
  acquired_at: string;
  tx_hash: Hex | null;
  sealed_at: string | null;
  /** The fire it belongs to near this concession, by the record ID of the fire's first detection. */
  fire_key?: Hex;
  /** Its satellite pass within the fire, from 1, in a fire's own detections. */
  pass?: number;
}

/** One ring of a concession's boundary as [longitude, latitude] pairs: an outer edge or a hole. */
export type Ring = [number, number][];

export interface ConcessionSummary {
  id: string;
  province: string;
  area_ha: number;
  inside: number;
  near: number;
}

/** The concessions with hotspots in a date range; `recording_started` is null until the first record. */
export interface ConcessionListing {
  recording_started: string | null;
  map_version: string;
  concessions: ConcessionSummary[];
}

/** Where a fire was first seen against one concession's edge (D26). `inside` and `edge_m` are the
 *  first-pass detection nearest the edge; `edge` means it was within 375 m, `both` that the first
 *  pass had detections on both sides. */
export interface FirstSeen {
  reading: "inside" | "outside" | "edge" | "both";
  inside: boolean;
  edge_m: number;
}

/** Detections within 1 km and 48 hours of each other near one concession (D25). */
export interface FireSummary {
  key: Hex;
  first_seen_unix: number;
  last_seen_unix: number;
  passes: number;
  detections: number;
  first_seen: FirstSeen;
  /** The first pass with a detection more than 375 m inside, or outside, the edge. */
  inside_from_unix: number | null;
  outside_from_unix: number | null;
  /** Seen on 4 or more passes, never more than 750 m from its first detection (D27). */
  never_spread: boolean;
  /** Hours recording had run when the fire was first seen, when under 48. */
  recorded_before_h: number | null;
  /** When its newest forecast says it is seen inside, while that forecast waits (D39). */
  forecast_inside_by_unix?: number | null;
}

/** A forecast made after a pass, while the fire was not yet seen inside this concession (D39–D41). */
export interface Forecast extends ForecastFields {
  record_id: Hex;
  tx_hash: Hex | null;
  sealed_at: string | null;
  outcome: "waiting" | "seen_inside" | "not_seen_inside" | "joined" | "seen_before_seal";
  /** The pass that saw the fire inside; null for a forecast that joined another fire or wasn't seen inside. */
  outcome_unix: number | null;
}

/** One fire with every detection in it, oldest first, whatever the chosen dates. */
export interface FireDetail extends FireSummary {
  hotspots: HotspotRecord[];
  /** When the API answered: a pack made from this view holds the detections stored by then (D33). */
  as_of_unix: number;
  /** Every forecast made for it near this concession, newest first (D41). */
  forecasts?: Forecast[];
  /** When the recorder made its first forecast for any fire; null before then. */
  forecasts_from_unix?: number | null;
}

/** Which fire a pack holds, and as of when; the pack's link carries all three (D33, D34). */
export interface PackRef {
  id: string;
  key: Hex;
  asOf: number;
}

/** One fire as it stood at `as_of_unix`, with its concession, for a complaint pack. */
export interface PackDetail extends FireDetail {
  concession_id: string;
  province: string;
  boundary: Ring[];
  map_version: string;
  rule_version: number;
}

export interface ConcessionDetail extends ConcessionSummary {
  boundary: Ring[];
  hotspots: HotspotRecord[];
  /** Fires with a detection in the dates, most detections first, then newest first seen. */
  fires: FireSummary[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`);
  if (!res.ok) throw new Error(`API answered ${res.status}`);
  return res.json();
}

const range = (from: string, to: string) => new URLSearchParams({ from, to });

export const concessions = (from: string, to: string) => get<ConcessionListing>(`/api/concessions?${range(from, to)}`);

export const concession = (id: string, from: string, to: string) =>
  get<ConcessionDetail>(`/api/concessions/${encodeURIComponent(id)}?${range(from, to)}`);

export const fire = (id: string, key: Hex) =>
  get<FireDetail>(`/api/concessions/${encodeURIComponent(id)}/fires/${key}`);

/** The pack, or null when the API knows no such fire as of then. */
export async function pack({ id, key, asOf }: PackRef): Promise<PackDetail | null> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/concessions/${encodeURIComponent(id)}/fires/${key}?as_of=${asOf}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API answered ${res.status}`);
  return res.json();
}

/** The pack's public link: the site root with the concession, the fire key and the as-of time. */
export const packHref = (id: string, f: FireDetail) =>
  `/?${new URLSearchParams({ pack: id, fire: f.key, as_of: String(f.as_of_unix) })}`;

/** The pack a link names, or null when part of it is missing or malformed. */
export function packRef(params: URLSearchParams): PackRef | null {
  const id = params.get("pack");
  const key = params.get("fire");
  const asOf = Number(params.get("as_of"));
  if (!id || !key || !/^0x[0-9a-f]{64}$/.test(key) || !Number.isInteger(asOf) || asOf <= 0) return null;
  return { id, key: key as Hex, asOf };
}

export const apiSource: FireRecordSource = {
  concessions,
  concession,
  fire,
  packHref,
  sealOf: async (record) => (await sealOf(record.record_id)).fingerprint,
  fingerprint,
  forecastSeals: async (forecasts) =>
    (await sealsWithTime(forecasts.map((f) => f.record_id))).map((s) => ({ fingerprint: s.fingerprint, sealedAt: Number(s.sealedAt) })),
  forecastFingerprint,
};

export const packSource: PackSource = {
  pack,
  contract: import.meta.env.VITE_CONTRACT_ADDRESS,
  sealsOf: (records) => sealsOf(records.map((r) => r.record_id)),
  fingerprint,
};
