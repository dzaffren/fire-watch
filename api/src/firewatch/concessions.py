"""load-concessions: load Trase's Indonesia pulpwood concession map (D12, D16).

Usage: load-concessions [path]. With no path the pinned file is downloaded and its sha256
checked; a path given is read as is, which is how tests load a cut-down map.
"""

import hashlib
import json
import sys
from pathlib import Path

import httpx

from firewatch.db import connect

URL = (
    "https://resources.trase.earth/data/facilities-data/"
    "indonesia_wood_pulp_concessions_2023_2024_v2026_02_20.geo.json"
)
SHA256 = "42a7006431f56b676dfc6f282e4cf477eff490347590c3d8370803b595614043"
MAP_VERSION = "Trase pulpwood concessions 2023–2024, v2026-02-20"
# Likely proposed, not yet licensed (D16).
SKIPPED_PERMIT_YEAR = 2024

UPSERT = """
INSERT INTO concessions (id, province, area_ha, map_version, boundary)
VALUES (%(id)s, %(province)s, %(area_ha)s, %(map_version)s,
        ST_SetSRID(ST_GeomFromGeoJSON(%(boundary)s), 4326))
ON CONFLICT (id) DO UPDATE SET
    province = EXCLUDED.province,
    area_ha = EXCLUDED.area_ha,
    map_version = EXCLUDED.map_version,
    boundary = EXCLUDED.boundary
"""


def download(url: str = URL, sha256: str = SHA256, client: httpx.Client | None = None) -> bytes:
    client = client or httpx.Client(timeout=300, follow_redirects=True)
    response = client.get(url)
    response.raise_for_status()
    digest = hashlib.sha256(response.content).hexdigest()
    if digest != sha256:
        raise ValueError(f"{url} has changed: sha256 {digest}, expected {sha256}")
    return response.content


def _rows(geojson: dict) -> list[dict]:
    # Company names are left behind (shape O10).
    return [
        {
            "id": f["properties"]["wood_supplier_trase_id"],
            "province": f["properties"]["province"].title(),
            "area_ha": round(f["properties"]["concession_area_ha"]),
            "map_version": MAP_VERSION,
            "boundary": json.dumps(f["geometry"]),
        }
        for f in geojson["features"]
        if f["properties"]["wood_supplier_permit_year"] != SKIPPED_PERMIT_YEAR
    ]


def load(data: bytes, url: str | None = None) -> int:
    rows = _rows(json.loads(data))
    with connect(url) as conn:
        conn.cursor().executemany(UPSERT, rows)
    return len(rows)


def main() -> int:
    args = sys.argv[1:]
    if len(args) > 1:
        print("usage: load-concessions [path]", file=sys.stderr)
        return 2
    try:
        data = Path(args[0]).read_bytes() if args else download()
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1
    print(f"Loaded {load(data)} concessions from {MAP_VERSION}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
