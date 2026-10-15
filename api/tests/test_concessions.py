import json
import os
import subprocess
import sys
from pathlib import Path

import httpx
import psycopg
import pytest

from firewatch.concessions import MAP_VERSION, URL, download, load

TRASE_CUT = Path(__file__).parents[2] / "fixtures" / "concessions" / "trase-cut.geojson"
LOAD_CONCESSIONS = Path(sys.executable).parent / "load-concessions"


def stored(url):
    with psycopg.connect(url) as conn:
        return conn.execute(
            "SELECT id, province, area_ha, map_version, ST_NumGeometries(boundary)"
            " FROM concessions ORDER BY id"
        ).fetchall()


def test_skips_permit_2024(migrated_db):
    geojson = json.loads(TRASE_CUT.read_text())
    (proposed,) = [
        f for f in geojson["features"]
        if f["properties"]["wood_supplier_trase_id"] == "ID-WOOD-CONCESSION-0275"
    ]
    proposed["properties"]["wood_supplier_permit_year"] = 2024.0

    assert load(json.dumps(geojson).encode(), migrated_db) == 2

    assert stored(migrated_db) == [
        ("ID-WOOD-CONCESSION-0377", "Kalimantan Selatan", 248719, MAP_VERSION, 21),
        ("ID-WOOD-CONCESSION-0540", "Sumatera Selatan", 251385, MAP_VERSION, 2),
    ]


def test_loads_a_path_as_given_and_reloads_in_place(migrated_db):
    env = {**os.environ, "DATABASE_URL": migrated_db}
    for _ in range(2):
        result = subprocess.run(
            [LOAD_CONCESSIONS, TRASE_CUT], env=env, capture_output=True, text=True, timeout=60
        )
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == f"Loaded 3 concessions from {MAP_VERSION}"

    assert [row[:3] for row in stored(migrated_db)] == [
        ("ID-WOOD-CONCESSION-0275", "Kalimantan Selatan", 22131),
        ("ID-WOOD-CONCESSION-0377", "Kalimantan Selatan", 248719),
        ("ID-WOOD-CONCESSION-0540", "Sumatera Selatan", 251385),
    ]


def test_rejects_a_changed_file():
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(200, content=TRASE_CUT.read_bytes())

    with pytest.raises(ValueError, match="sha256"):
        download(httpx.Client(transport=httpx.MockTransport(handler)))
    assert seen == [URL]
