import type { Hex } from "viem";
import { sealOf } from "./chain";
import { fingerprint, type MatchedDetection } from "./fingerprint";
import type { FireRecordSource } from "./FireRecordPage";

export type { ConcessionMatch } from "./fingerprint";

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
}

/** One fire with every detection in it, oldest first, whatever the chosen dates. */
export interface FireDetail extends FireSummary {
  hotspots: HotspotRecord[];
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

export const apiSource: FireRecordSource = {
  concessions,
  concession,
  fire,
  sealOf: async (record) => (await sealOf(record.record_id)).fingerprint,
  fingerprint,
};
