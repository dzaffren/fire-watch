"""Record fingerprint, version 1 (D8). Must match web/src/fingerprint.ts byte for byte."""

from eth_abi import encode
from eth_utils import keccak

VERSION = 1
TYPES = ["uint8", "string", "int32", "int32", "uint64", "uint32", "string"]


def record_fields(row) -> dict:
    return {
        "source": row["source"],
        "lat_e5": row["lat_e5"],
        "lon_e5": row["lon_e5"],
        "acquired_unix": int(row["acquired_at"].timestamp()),
        "frp_e2": row["frp_e2"],
        "confidence": row["confidence"],
    }


def fingerprint(source, lat_e5, lon_e5, acquired_unix, frp_e2, confidence) -> bytes:
    return keccak(
        encode(TYPES, [VERSION, source, lat_e5, lon_e5, acquired_unix, frp_e2, confidence])
    )
