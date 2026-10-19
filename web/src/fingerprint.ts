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

export interface Point {
  lat_e5: number;
  lon_e5: number;
}

/** What version 3 seals of a forecast: everything it says, and which fire and pass it follows (D49). */
export interface ForecastFields {
  concession_id: string;
  /** The fire it was made for, by its key then; a fire that joins another keeps its forecasts (D44). */
  fire_key: Hex;
  after_pass_unix: number;
  made_unix: number;
  /** 48 hours after it was made; passes from its seal until then decide it (D39, D44). */
  until_unix: number;
  /** When it says the fire is seen inside, or null for "not by until_unix". */
  inside_by_unix: number | null;
  /** Where it runs from, and where it says the fire crosses the edge; null when it says not. */
  from: Point | null;
  crossing: Point | null;
  rule_version: number;
}

const LAYOUT_V1 = parseAbiParameters("uint8, string, int32, int32, uint64, uint32, string");
const LAYOUT_V2 = parseAbiParameters(
  "uint8, string, int32, int32, uint64, uint32, string, string, string[], bool[], uint32[]",
);
const LAYOUT_V3 = parseAbiParameters("uint8, string, bytes32, uint64, uint64, uint64, uint64, int32, int32, int32, int32, uint8");

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

/** Version 3: a forecast, with 0 for a time or point it doesn't give. */
export function forecastFingerprint(f: ForecastFields): Hex {
  return keccak256(
    encodeAbiParameters(LAYOUT_V3, [
      3,
      f.concession_id,
      f.fire_key,
      BigInt(f.after_pass_unix),
      BigInt(f.made_unix),
      BigInt(f.until_unix),
      BigInt(f.inside_by_unix ?? 0),
      f.from?.lat_e5 ?? 0,
      f.from?.lon_e5 ?? 0,
      f.crossing?.lat_e5 ?? 0,
      f.crossing?.lon_e5 ?? 0,
      f.rule_version,
    ]),
  );
}
