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
}

/** A polygon's outer ring as [longitude, latitude] pairs; a concession may have several. */
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

export interface ConcessionDetail extends ConcessionSummary {
  boundary: Ring[];
  hotspots: HotspotRecord[];
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

export const apiSource: FireRecordSource = {
  concessions,
  concession,
  sealOf: async (record) => (await sealOf(record.record_id)).fingerprint,
  fingerprint,
};
