"""Record fingerprints, versions 1 to 3 (D17, D49). Must match web/src/fingerprint.ts byte for byte.

Version 1 is the detection alone, kept for walking-skeleton rows. Version 2 adds the map
version and every concession match, sorted by concession ID. Version 3 is a spread forecast:
its times as Unix seconds and its points as whole numbers times 100,000, 0 for "not inside".
"""

from eth_abi import encode
from eth_utils import keccak

VERSION = 1
TYPES = ["uint8", "string", "int32", "int32", "uint64", "uint32", "string"]
TYPES_V2 = TYPES + ["string", "string[]", "bool[]", "uint32[]"]
TYPES_V3 = [
    "uint8", "string", "bytes32", "uint64", "uint64", "uint64", "uint64",
    "int32", "int32", "int32", "int32", "uint8",
]


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


def _unix(at) -> int | None:
    return int(at.timestamp()) if at is not None else None


def _point(row, name: str) -> dict | None:
    if row[f"{name}_lat_e5"] is None:
        return None
    return {"lat_e5": row[f"{name}_lat_e5"], "lon_e5": row[f"{name}_lon_e5"]}


def forecast_fields(row) -> dict:
    """A stored forecast as version 3 seals it, and as the API serves it."""
    return {
        "concession_id": row["concession_id"],
        "fire_key": "0x" + bytes(row["fire_key"]).hex(),
        "after_pass_unix": _unix(row["after_pass_at"]),
        "made_unix": _unix(row["made_at"]),
        "until_unix": _unix(row["until_at"]),
        "inside_by_unix": _unix(row["inside_by_at"]),
        "from": _point(row, "from"),
        "crossing": _point(row, "crossing"),
        "rule_version": row["rule_version"],
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


def forecast_fingerprint(fields: dict) -> bytes:
    """fields: as forecast_fields gives them."""
    start, crossing = fields["from"] or {}, fields["crossing"] or {}
    return keccak(
        encode(
            TYPES_V3,
            [
                3,
                fields["concession_id"],
                bytes.fromhex(fields["fire_key"][2:]),
                fields["after_pass_unix"],
                fields["made_unix"],
                fields["until_unix"],
                fields["inside_by_unix"] or 0,
                start.get("lat_e5", 0),
                start.get("lon_e5", 0),
                crossing.get("lat_e5", 0),
                crossing.get("lon_e5", 0),
                fields["rule_version"],
            ],
        )
    )
