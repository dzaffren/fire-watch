import gzip
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import httpx
import numpy as np
import psycopg
import rasterio
from rasterio.transform import from_origin

from firewatch import concessions, peat

FIXTURES = Path(__file__).parents[2] / "fixtures"
TRASE_CUT = FIXTURES / "concessions" / "trase-cut.geojson"
PEAT_CUT = FIXTURES / "peat" / "peat-cut.geojson.gz"
LOAD_PEAT = Path(sys.executable).parent / "load-peat"
C0332 = "ID-WOOD-CONCESSION-0332"


def stored(url):
    with psycopg.connect(url) as conn:
        return conn.execute("SELECT count(*), array_agg(DISTINCT map_version) FROM peat").fetchone()


def load_peat(url, *args):
    return subprocess.run(
        [LOAD_PEAT, *args], env={**os.environ, "DATABASE_URL": url},
        capture_output=True, text=True, timeout=120,
    )


def test_loads_a_path_as_given_and_reload_replaces(migrated_db):
    for _ in range(2):
        result = load_peat(migrated_db, PEAT_CUT)
        assert result.returncode == 0, result.stderr
        count, versions = stored(migrated_db)
        assert result.stdout.strip() == f"Loaded {count:,} peat pieces from {peat.MAP_VERSION}"

    features = len(json.loads(gzip.decompress(PEAT_CUT.read_bytes()))["features"])
    assert count >= features > 0
    assert versions == [peat.MAP_VERSION]
    with psycopg.connect(migrated_db) as conn:
        assert conn.execute("SELECT max(ST_NPoints(geom)) FROM peat").fetchone()[0] <= 256


def test_refuses_a_changed_cut(migrated_db, tmp_path, monkeypatch, capsys):
    assert hashlib.sha256(peat.committed()).hexdigest() == peat.CUT_SHA256
    changed = tmp_path / peat.CUT.name
    changed.write_bytes(PEAT_CUT.read_bytes())
    monkeypatch.setattr(peat, "CUT", changed)
    monkeypatch.setenv("DATABASE_URL", migrated_db)

    assert peat.main([]) == 1
    assert "has changed: sha256" in capsys.readouterr().err
    assert stored(migrated_db)[0] == 0


def _tile() -> bytes:
    """A 1 degree GeoTIFF over ID-WOOD-CONCESSION-0332, all peat but a band across it, at -2.90
    to -2.95."""
    data = np.ones((1000, 1000), dtype=np.uint8)
    data[400:450, :] = 0
    with rasterio.MemoryFile() as mem:
        with mem.open(
            driver="GTiff", width=1000, height=1000, count=1, dtype="uint8", crs="EPSG:4326",
            transform=from_origin(112.5, -2.5, 0.001, 0.001),
        ) as tif:
            tif.write(data, 1)
        return mem.read()


def test_cut_gives_the_same_bytes_twice(migrated_db, tmp_path, monkeypatch):
    concessions.load(TRASE_CUT.read_bytes(), migrated_db)
    tile = _tile()
    monkeypatch.setattr(peat, "TILES", {"00N_110E": hashlib.sha256(tile).hexdigest()})
    # Several blocks, the last ones short, as at a real tile's 40,000 pixels in 4,000s.
    monkeypatch.setattr(peat, "BLOCK", 300)
    monkeypatch.setenv("DATABASE_URL", migrated_db)
    asked = []

    def handler(request):
        asked.append(str(request.url))
        return httpx.Response(200, content=tile)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    cuts = []
    for name in ("one", "two"):
        monkeypatch.setattr(peat, "CUT", tmp_path / f"{name}.geojson.gz")
        assert peat.main(["--cut"], client) == 0
        cuts.append(peat.CUT.read_bytes())

    assert cuts[0] == cuts[1]
    assert asked == [peat.TILE_URL.format(tile="00N_110E")] * 2
    polygons = [
        json.dumps(f["geometry"]) for f in json.loads(gzip.decompress(cuts[0]))["features"]
    ]
    with psycopg.connect(migrated_db) as conn:
        found = conn.execute(
            "SELECT count(*),"
            " bool_and(ST_DWithin(g::geography, c.boundary::geography, 5600)),"
            " bool_or(ST_Intersects(g, ST_MakeEnvelope(112.5, -2.949, 113.5, -2.901, 4326))),"
            " bool_or(ST_YMin(g) > -2.9), bool_or(ST_YMax(g) < -2.95)"
            " FROM unnest(%s::text[]) AS p (j)"
            " CROSS JOIN LATERAL (SELECT ST_SetSRID(ST_GeomFromGeoJSON(j), 4326) AS g) AS s"
            " JOIN concessions c ON c.id = %s",
            (polygons, C0332),
        ).fetchone()
    # Peat within reach on both sides of the band, none in it, none out of reach.
    assert found == (len(polygons), True, False, True, True)
