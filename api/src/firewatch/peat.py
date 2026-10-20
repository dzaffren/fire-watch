"""load-peat: load WRI's Global Peatlands map, cut to the concessions' reach, and work out a fire's
damage parts from it (D62, D69–D71).

Usage: load-peat [path] | load-peat --cut

With no path the committed cut is read and its sha256 checked; a path given is read as is, which
is how tests and the e2e load a smaller cut. --cut redoes the committed cut from the pinned tiles,
with GFW_API_KEY, against the concessions in DATABASE_URL.

The estimate, so anyone can redo it:

1. Take the fire's detections, as the fire route groups them.
2. Draw each detection's square in its own UTM zone: 187.5 m each way from the point, along the
   zone's grid. Zone floor((lon + 180) / 6) + 1, EPSG 326xx north of the equator, 327xx south.
3. Join the squares. Split the result at the concession's edge into inside and outside.
4. Intersect each part with the peat pieces. Areas are on the WGS 84 ellipsoid. "Other ground" is
   a part's area less its peat.
5. Round each of the four parts to 0.01 ha.

The page applies the factors to the four parts (D71).

The peat cut, so anyone can redo it: every peat pixel of the 10 pinned tiles inside 5.5 km of a
concession (D13's 5 km, plus half a square's diagonal), vectorized by tile in 4,000-pixel blocks.
"""

import argparse
import gzip
import hashlib
import json
import os
import sys
from pathlib import Path
from time import perf_counter

import httpx

from firewatch import concessions
from firewatch.db import connect

MAP_VERSION = "gfw_peatlands v20230315"
TILE_URL = (
    "https://data-api.globalforestwatch.org/dataset/gfw_peatlands/v20230315/download/geotiff"
    "?grid=10/40000&tile_id={tile}&pixel_meaning=is"
)
# The 10-degree tiles that cover Indonesia, each named by its north-west corner.
TILES = {
    "00N_090E": "cce441c7a0c02c9c7664bc212fc4d089fa3dbfd67f57d0e2d09e3e3aeb8b12b9",
    "00N_100E": "d7bf4c60edbaa872aa01112c1b46629b481883ff08aeb536a2f0bfa9fd617187",
    "00N_110E": "1957a9d21d006600678bd3dc985a00fe601efbb87e772f8b87e4bec311132c94",
    "00N_120E": "11a7de8aa98a85c48ec45da25dfa902b7dd9896726ed72619992bdf6332ce096",
    "00N_130E": "2c199f6cd1a2ef41c69c1b10ff9b34c998c1e11e734dd9154ee9524bab7defd0",
    "00N_140E": "43389d8b8d13172ffa3ebbf2ba8f5a76a52dd29ddee9db4acfaa16608226e399",
    "10N_090E": "d5af401221dc9494d822fab52dbecd37dac6b8c4e90306601b19b462d0e3bf8e",
    "10N_100E": "24000d68ce2c258282b62cd522f6d29f37b7f7b981bbc212adb7af9d2255dfde",
    "10N_110E": "29000fc662ab61cb1f22ae5b3cc5bd9d3746cf18d48f0f5b929e49740f30189b",
    "10N_120E": "e88b36858d1cd2c48a69a68908b321623685afc9629be03b6a2a76e6ca5b17bf",
}
CUT = Path(__file__).parents[3] / "fixtures" / "peat" / "gfw-peatlands-v20230315.geojson.gz"
CUT_SHA256 = "a6c9c48f52a0d02006939267ec9a5f419e24d7d22c08763d4eb96a8c338b82b9"
REACH_M = 5500
BLOCK = 4000
# A pixel's corners are whole multiples of 0.00025 degrees, so 5 places keep them exact.
PLACES = 5
PIECE_VERTICES = 256

REACH = """
CREATE TEMP TABLE reach ON COMMIT DROP AS
SELECT ST_Union(ST_Buffer(boundary::geography, %(reach_m)s)::geometry) AS geom FROM concessions
"""
TILE_REACH = """
SELECT ST_AsGeoJSON(ST_Intersection(geom, ST_MakeEnvelope(%s, %s, %s, %s, 4326)))::json AS geom
FROM reach
"""
FILL = """
INSERT INTO peat (map_version, geom)
SELECT %(map_version)s, (ST_Dump(ST_Subdivide(ST_SetSRID(ST_GeomFromGeoJSON(geom), 4326),
                                               %(vertices)s))).geom
FROM peat_cut
"""
HAS_PEAT = "SELECT EXISTS (SELECT 1 FROM peat) AS found"
DAMAGE = """
WITH squares AS (
    SELECT ST_Union(ST_Transform(ST_Expand(ST_Transform(point, zone), 187.5), 4326)) AS geom
    FROM (
        SELECT ST_SetSRID(ST_MakePoint(lon_e5 / 1e5, lat_e5 / 1e5), 4326) AS point,
               CASE WHEN lat_e5 >= 0 THEN 32600 ELSE 32700 END
                   + floor((lon_e5 / 1e5 + 180) / 6)::integer + 1 AS zone
        FROM hotspots WHERE record_id = ANY(%(record_ids)s)
    ) AS d
), parts AS (
    SELECT ST_Intersection(s.geom, c.boundary) AS inside,
           ST_Difference(s.geom, c.boundary) AS outside
    FROM squares s JOIN concessions c ON c.id = %(id)s
), areas AS (
    SELECT ST_Area(inside::geography) AS inside_m2,
           coalesce((SELECT sum(ST_Area(ST_Intersection(inside, p.geom)::geography))
                     FROM peat p WHERE ST_Intersects(p.geom, inside)), 0) AS inside_peat_m2,
           ST_Area(outside::geography) AS outside_m2,
           coalesce((SELECT sum(ST_Area(ST_Intersection(outside, p.geom)::geography))
                     FROM peat p WHERE ST_Intersects(p.geom, outside)), 0) AS outside_peat_m2
    FROM parts
)
SELECT round((inside_peat_m2 / 1e4)::numeric, 2)::float8 AS inside_peat_ha,
       round((greatest(inside_m2 - inside_peat_m2, 0) / 1e4)::numeric, 2)::float8
           AS inside_other_ha,
       round((outside_peat_m2 / 1e4)::numeric, 2)::float8 AS outside_peat_ha,
       round((greatest(outside_m2 - outside_peat_m2, 0) / 1e4)::numeric, 2)::float8
           AS outside_other_ha
FROM areas
"""


def damage(conn, concession_id: str, record_ids: list[bytes]) -> tuple[dict | None, int]:
    """The fire's four parts in hectares, or None while peat is empty, and the milliseconds the
    query took."""
    began = perf_counter()
    found = None
    if conn.execute(HAS_PEAT).fetchone()["found"]:
        found = conn.execute(DAMAGE, {"id": concession_id, "record_ids": record_ids}).fetchone()
    return found, round((perf_counter() - began) * 1000)


def committed() -> bytes:
    data = CUT.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != CUT_SHA256:
        raise ValueError(f"{CUT} has changed: sha256 {digest}, expected {CUT_SHA256}")
    return data


def load(data: bytes, url: str | None = None) -> int:
    """Replaces the peat with the cut's polygons, in pieces of at most 256 vertices."""
    features = json.loads(gzip.decompress(data))["features"]
    with connect(url) as conn, conn.cursor() as cur:
        cur.execute("CREATE TEMP TABLE peat_cut (geom text) ON COMMIT DROP")
        with cur.copy("COPY peat_cut (geom) FROM STDIN") as copy:
            for f in features:
                copy.write_row([json.dumps(f["geometry"])])
        cur.execute("DELETE FROM peat")
        cur.execute(FILL, {"map_version": MAP_VERSION, "vertices": PIECE_VERTICES})
        pieces = cur.rowcount
        cur.execute("ANALYZE peat")
    return pieces


def _rounded(ring: list) -> list:
    return [[round(x, PLACES), round(y, PLACES)] for x, y in ring]


def cut(client: httpx.Client) -> bytes:
    """The peat pixels of every pinned tile within REACH_M of a concession, as gzipped GeoJSON
    polygons in tile, block and raster order."""
    # Only the cut and dev groups install rasterio; the API image has neither.
    import numpy as np
    import rasterio
    from rasterio.features import geometry_mask, shapes
    from rasterio.windows import Window

    polygons = []
    with connect() as conn:
        conn.execute(REACH, {"reach_m": REACH_M})
        for tile, sha256 in TILES.items():
            data = concessions.download(TILE_URL.format(tile=tile), sha256, client)
            with rasterio.MemoryFile(data) as mem, mem.open() as src:
                reach = conn.execute(TILE_REACH, tuple(src.bounds)).fetchone()["geom"]
                if reach is None or not reach["coordinates"]:
                    continue
                for row in range(0, src.height, BLOCK):
                    for col in range(0, src.width, BLOCK):
                        window = Window(
                            col, row, min(BLOCK, src.width - col), min(BLOCK, src.height - row)
                        )
                        peat = src.read(1, window=window) == 1
                        if not peat.any():
                            continue
                        transform = src.window_transform(window)
                        peat &= ~geometry_mask([reach], peat.shape, transform)
                        for shape, _ in shapes(
                            peat.astype(np.uint8), mask=peat, transform=transform
                        ):
                            polygons.append([_rounded(ring) for ring in shape["coordinates"]])
    collection = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {},
             "geometry": {"type": "Polygon", "coordinates": rings}}
            for rings in polygons
        ],
    }
    return gzip.compress(json.dumps(collection, separators=(",", ":")).encode(), mtime=0)


def main(argv: list[str] | None = None, client: httpx.Client | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="load-peat", description="Load WRI's Global Peatlands map, cut to the concessions."
    )
    parser.add_argument("path", nargs="?", type=Path, help="a cut, read as is")
    parser.add_argument(
        "--cut", action="store_true", help=f"redo {CUT.name} from the pinned tiles"
    )
    args = parser.parse_args(argv)
    try:
        if args.cut:
            client = client or httpx.Client(
                timeout=300, follow_redirects=True,
                headers={"x-api-key": os.environ["GFW_API_KEY"]},
            )
            data = cut(client)
            CUT.parent.mkdir(parents=True, exist_ok=True)
            CUT.write_bytes(data)
            print(f"Cut {CUT} from {len(TILES)} tiles: sha256 {hashlib.sha256(data).hexdigest()}")
            return 0
        data = args.path.read_bytes() if args.path else committed()
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1
    print(f"Loaded {load(data):,} peat pieces from {MAP_VERSION}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
