import type { Hex } from "viem";
import type { FingerprintFields } from "./fingerprint";

export interface HotspotRecord extends FingerprintFields {
  record_id: Hex;
  acquired_at: string;
  tx_hash: Hex | null;
  sealed_at: string | null;
}

export async function latestHotspot(): Promise<HotspotRecord | null> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/hotspots/latest`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API answered ${res.status}`);
  return res.json();
}
