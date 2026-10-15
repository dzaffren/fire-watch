"""Record fingerprints, versions 1 and 2 (D17). Must match web/src/fingerprint.ts byte for byte.

Version 1 is the detection alone, kept for walking-skeleton rows. Version 2 adds the map
version and every concession match, sorted by concession ID.
"""

from eth_abi import encode
from eth_utils import keccak

VERSION = 1
TYPES = ["uint8", "string", "int32", "int32", "uint64", "uint32", "string"]
TYPES_V2 = TYPES + ["string", "string[]", "bool[]", "uint32[]"]


def record_fields(row) -> dict:
    return {
        "source": row["source"],
        "lat_e5": row["lat_e5"],
        "lon_e5": row["lon_e5"],
        "acquired_unix": int(row["acquired_at"].timestamp()),
        "frp_e2": row["frp_e2"],
        "confidence": row["confidence"],
    }


def record_fields_v2(row, matches) -> dict:
    """matches: the hotspot's concessions as dicts with id, inside and edge_m."""
    return {
        **record_fields(row),
        "map_version": row["map_version"],
        "concessions": [
            {"id": m["id"], "inside": m["inside"], "edge_m": m["edge_m"]} for m in matches
        ],
    }


def fingerprint(source, lat_e5, lon_e5, acquired_unix, frp_e2, confidence) -> bytes:
    return keccak(
        encode(TYPES, [VERSION, source, lat_e5, lon_e5, acquired_unix, frp_e2, confidence])
    )


def fingerprint_v2(
    source, lat_e5, lon_e5, acquired_unix, frp_e2, confidence, map_version, concessions
) -> bytes:
    matches = sorted(concessions, key=lambda m: m["id"])
    return keccak(
        encode(
            TYPES_V2,
            [
                2,
                source,
                lat_e5,
                lon_e5,
                acquired_unix,
                frp_e2,
                confidence,
                map_version,
                [m["id"] for m in matches],
                [m["inside"] for m in matches],
                [m["edge_m"] for m in matches],
            ],
        )
    )
