import { encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from "viem";

export interface Detection {
  source: string;
  lat_e5: number;
  lon_e5: number;
  acquired_unix: number;
  frp_e2: number;
  confidence: string;
}

/** One concession within 5 km of a hotspot, and how far the hotspot is from its edge. */
export interface ConcessionMatch {
  id: string;
  inside: boolean;
  edge_m: number;
}

/** Version 2 seals the detection with the map it was matched against and every match (D17). */
export interface MatchedDetection extends Detection {
  fingerprint_version: 2;
  map_version: string;
  concessions: ConcessionMatch[];
}

export type FingerprintFields = Detection | MatchedDetection;

const LAYOUT_V1 = parseAbiParameters("uint8, string, int32, int32, uint64, uint32, string");
const LAYOUT_V2 = parseAbiParameters(
  "uint8, string, int32, int32, uint64, uint32, string, string, string[], bool[], uint32[]",
);

export function fingerprint(f: FingerprintFields): Hex {
  if ("fingerprint_version" in f && f.fingerprint_version === 2) {
    const matches = [...f.concessions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return keccak256(
      encodeAbiParameters(LAYOUT_V2, [
        2,
        f.source,
        f.lat_e5,
        f.lon_e5,
        BigInt(f.acquired_unix),
        f.frp_e2,
        f.confidence,
        f.map_version,
        matches.map((m) => m.id),
        matches.map((m) => m.inside),
        matches.map((m) => m.edge_m),
      ]),
    );
  }
  return keccak256(
    encodeAbiParameters(LAYOUT_V1, [1, f.source, f.lat_e5, f.lon_e5, BigInt(f.acquired_unix), f.frp_e2, f.confidence]),
  );
}
