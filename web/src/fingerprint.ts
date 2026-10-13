import { encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from "viem";

export interface FingerprintFields {
  source: string;
  lat_e5: number;
  lon_e5: number;
  acquired_unix: number;
  frp_e2: number;
  confidence: string;
}

const VERSION = 1;
const LAYOUT = parseAbiParameters("uint8, string, int32, int32, uint64, uint32, string");

export function fingerprint(f: FingerprintFields): Hex {
  return keccak256(
    encodeAbiParameters(LAYOUT, [
      VERSION,
      f.source,
      f.lat_e5,
      f.lon_e5,
      BigInt(f.acquired_unix),
      f.frp_e2,
      f.confidence,
    ]),
  );
}
