import type { Hex } from "viem";
import type { FingerprintFields } from "./fingerprint";

export interface HotspotRecord extends FingerprintFields {
  record_id: Hex;
  acquired_at: string;
  tx_hash: Hex | null;
  sealed_at: string | null;
  concessions?: ConcessionMatch[];
  map_version?: string;
}

/** One concession within 5 km of a hotspot, and how far the hotspot is from its edge. */
export interface ConcessionMatch {
  id: string;
  inside: boolean;
  edge_m: number;
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

export interface ConcessionDetail extends ConcessionSummary {
  boundary: Ring[];
  hotspots: HotspotRecord[];
}

export async function latestHotspot(): Promise<HotspotRecord | null> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/hotspots/latest`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API answered ${res.status}`);
  return res.json();
}
