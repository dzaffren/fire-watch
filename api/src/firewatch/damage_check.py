"""damage-check-2023: check the damage estimate's squares against NASA's MODIS burned-area map for
2023, and write the shares of peat and other ground that MODIS found burned (D126–D131).

Usage: damage-check-2023 --modis <dir> [--firms <path>] [--map <path>] [--out <dir>]

--modis is the folder holding the 12 MCD64A1 files below, which the README's fetch line gets; each
must match its sha256. With no --firms or --map the pinned files are downloaded and their sha256
checked; a path given is read as is, which is how tests run on a cut. The concession map and the
committed peat cut are loaded into DATABASE_URL.

The check, so anyone can redo it:

1. Take every 2023 detection within 5 km of a concession, as `backtest-2023` matches them. Count
   each detection once.
2. Draw each detection's square as the damage estimate does: 187.5 m each way in its UTM zone.
3. Join the squares. A patch is one connected piece of the join. A large patch holds more than 20
   squares, counted by their centres.
4. Burned ground is every MODIS pixel with a 2023 burn date in any of the 12 monthly files.
5. For the large patches, measure the area, its peat, its burned part and its burned peat. For all
   ground, measure the area and its burned part. Areas are on the WGS 84 ellipsoid. Round each to
   whole hectares.
6. Each share is the burned part over the area, rounded to three places. Peat and other ground
   use the large patches. All ground uses every patch.
"""

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import httpx

from firewatch import backtest, concessions, migrate, peat
from firewatch.db import connect

# UMD's copy of MCD64A1 Collection 6.1, window 19, each month's burn dates. In each file -2 is
# water, -1 unmapped, 0 unburned, and 1 to 366 the day of 2023 it burned.
MODIS_NAME = "MCD64monthly.A2023{day}.Win19.061.burndate.tif"
MODIS_FILES = {
    MODIS_NAME.format(day=day): sha256
    for day, sha256 in {
        "001": "e6081bd99a37381ca8845fc919f52f312de5ab6c3fea07e47aee770f62eb59c1",
        "032": "a554db1adb76aa3c74630566ff55952affc4d3410cacfdb2b1bed9d5aaef27b0",
        "060": "2c007e1d3efff7a6f3a664719d80cb5d9d896cab200bb4ea977f67035209eff9",
        "091": "4e3c8a85144821e48118a6503ea54326798a7987c86d91e0c88c05d2cf832a52",
        "121": "63f9ed51896395f1649cd78a607ec80b6b74e2f49863b41d3d6f13bd81f37722",
        "152": "e085f32a8cf9ef8baa973071c91f1a81cc28297878d97688e9e650bb739acc74",
        "182": "64d964e08fab259591210c00788f4d70340120d49f130e21957498f62c6a42b1",
        "213": "c51cc0aaf458f17b3d1660488bf1b94c9ed6602a34de11a6ca855ed4382ccc10",
        "244": "ce48779f90e1b5e496820cd2d6da6eabcd428ba477fbe04775d7808a3091f0d0",
        "274": "f75aa4d4459f68254989bb5172d2d369905fdd46652ef1149547cd11693e6a2d",
        "305": "dffd9188f5526d3dd72d03d3acbd5bc44459680eef736e28167807ae6d23565a",
        "335": "7d96755ab8922330f8ed10b54887941bc58af831a7105c1aadfab95439b15792",
    }.items()
}
OUT = Path(__file__).parents[3] / "fixtures" / "damage"
LARGE_PATCH_SQUARES = 21
# More than half a square's diagonal, 265 m, so the window holds every square.
MARGIN_DEGREES = 0.01

# Step 2 to 5. Each step a table with its index, so PostGIS joins pieces by their boxes.
CHECK = (
    f"""
CREATE TEMP TABLE check_squares ON COMMIT DROP AS
SELECT {peat.POINT} AS centre, {peat.SQUARE} AS geom FROM check_detections
""",
    "CREATE INDEX ON check_squares USING gist (centre)",
    """
CREATE TEMP TABLE check_patches ON COMMIT DROP AS
SELECT (ST_Dump(ST_Union(geom))).geom AS geom FROM check_squares
""",
    "CREATE INDEX ON check_patches USING gist (geom)",
    """
CREATE TEMP TABLE check_large ON COMMIT DROP AS
SELECT geom FROM check_patches AS p
WHERE (SELECT count(*) FROM check_squares AS s WHERE ST_Intersects(p.geom, s.centre))
    >= %(large)s
""",
    """
CREATE TEMP TABLE check_burned_pieces ON COMMIT DROP AS
SELECT (ST_Dump(ST_Subdivide(ST_SetSRID(ST_GeomFromGeoJSON(geom), 4326), %(vertices)s))).geom
    AS geom
FROM check_burned
""",
    "CREATE INDEX ON check_burned_pieces USING gist (geom)",
    "ANALYZE check_squares, check_patches, check_large, check_burned_pieces",
    """
WITH large_burned AS MATERIALIZED (
    SELECT ST_CollectionExtract(ST_Intersection(l.geom, b.geom), 3) AS geom
    FROM check_large AS l JOIN check_burned_pieces AS b ON ST_Intersects(l.geom, b.geom)
)
SELECT
    (SELECT coalesce(sum(ST_Area(geom::geography)), 0) FROM check_large) AS large_m2,
    (SELECT coalesce(sum(ST_Area(ST_Intersection(l.geom, p.geom)::geography)), 0)
     FROM check_large AS l JOIN peat AS p ON ST_Intersects(l.geom, p.geom)) AS large_peat_m2,
    (SELECT coalesce(sum(ST_Area(geom::geography)), 0) FROM large_burned) AS large_burned_m2,
    (SELECT coalesce(sum(ST_Area(ST_Intersection(lb.geom, p.geom)::geography)), 0)
     FROM large_burned AS lb JOIN peat AS p ON ST_Intersects(lb.geom, p.geom))
        AS large_burned_peat_m2,
    (SELECT sum(ST_Area(geom::geography)) FROM check_patches) AS all_m2,
    (SELECT coalesce(sum(ST_Area(ST_Intersection(pa.geom, b.geom)::geography)), 0)
     FROM check_patches AS pa JOIN check_burned_pieces AS b ON ST_Intersects(pa.geom, b.geom))
        AS all_burned_m2
""",
)


def modis_files(folder: Path) -> list[Path]:
    """The pinned files in folder, each checked by its sha256."""
    paths = []
    for name, sha256 in MODIS_FILES.items():
        path = folder / name
        if not path.exists():
            raise ValueError(f"{path} is missing; the README's fetch line gets the 12 files")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != sha256:
            raise ValueError(f"{path} has changed: sha256 {digest}, expected {sha256}")
        paths.append(path)
    return paths


def burned(paths: list[Path], bounds: tuple[float, float, float, float]) -> list[str]:
    """Every pixel within bounds with a burn date in any of the files, as GeoJSON polygons in
    raster order."""
    # Only the cut and dev groups install rasterio; the API image has neither.
    import numpy as np
    import rasterio
    from rasterio.features import shapes
    from rasterio.windows import Window

    west, south, east, north = bounds
    seen = transform = None
    for path in paths:
        with rasterio.open(path) as src:
            top, left = src.index(west, north)
            bottom, right = src.index(east, south)
            window = Window.from_slices((top, bottom + 1), (left, right + 1)).intersection(
                Window(0, 0, src.width, src.height)
            )
            month = src.read(1, window=window) > 0
            transform = src.window_transform(window)
        seen = month if seen is None else seen | month
    return [
        json.dumps(shape)
        for shape, _ in shapes(seen.astype(np.uint8), mask=seen, transform=transform)
    ]


def measure(conn, points: list[tuple[int, int]], polygons: list[str]) -> dict:
    """The check's areas in square metres, from each detection's lat_e5 and lon_e5 and the
    burned polygons."""
    with conn.cursor() as cur:
        cur.execute(
            "CREATE TEMP TABLE check_detections (lat_e5 integer, lon_e5 integer) ON COMMIT DROP"
        )
        cur.execute("CREATE TEMP TABLE check_burned (geom text) ON COMMIT DROP")
        with cur.copy("COPY check_detections (lat_e5, lon_e5) FROM STDIN") as copy:
            for point in points:
                copy.write_row(point)
        with cur.copy("COPY check_burned (geom) FROM STDIN") as copy:
            for polygon in polygons:
                copy.write_row([polygon])
        params = {"large": LARGE_PATCH_SQUARES, "vertices": peat.PIECE_VERTICES}
        for statement in CHECK[:-1]:
            cur.execute(statement, params)
        return cur.execute(CHECK[-1]).fetchone()


def _ground(m2: float, burned_m2: float) -> dict:
    return {
        "ha": round(m2 / 1e4), "burned_ha": round(burned_m2 / 1e4),
        "share": round(burned_m2 / m2, 3),
    }


def main(argv: list[str] | None = None, client: httpx.Client | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="damage-check-2023",
        description="Check the damage estimate's squares against MODIS's 2023 burned area.",
    )
    parser.add_argument("--modis", type=Path, required=True, help="the folder of the 12 files")
    parser.add_argument("--firms", type=Path, help="a FIRMS CSV, read as is")
    parser.add_argument("--map", type=Path, help="a Trase GeoJSON map, read as is")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args(argv)
    began = time.perf_counter()
    try:
        files = modis_files(args.modis)
        firms_data = (
            args.firms.read_bytes() if args.firms
            else concessions.download(backtest.FIRMS_URL, backtest.FIRMS_SHA256, client)
        )
        map_data = args.map.read_bytes() if args.map else concessions.download(client=client)
        peat_data = peat.committed()
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1

    migrate.up()
    concessions.load(map_data)
    peat.load(peat_data)
    ids = {row["id"] for row in concessions._rows(json.loads(map_data))}
    with connect() as conn:
        found = backtest.detections(conn, backtest.hotspots(firms_data.decode()), ids)
        once = {d.record_id: (d.lat_e5, d.lon_e5) for ds in found.values() for d in ds}
        points = sorted(once.values())
        lats, lons = [lat / 1e5 for lat, _ in points], [lon / 1e5 for _, lon in points]
        bounds = (
            min(lons) - MARGIN_DEGREES, min(lats) - MARGIN_DEGREES,
            max(lons) + MARGIN_DEGREES, max(lats) + MARGIN_DEGREES,
        )
        m2 = measure(conn, points, burned(files, bounds))

    large_other = m2["large_m2"] - m2["large_peat_m2"]
    result = {
        "year": 2023,
        "detections": len(once),
        "large_patch_squares": LARGE_PATCH_SQUARES,
        "peat": _ground(m2["large_peat_m2"], m2["large_burned_peat_m2"]),
        "other": _ground(large_other, m2["large_burned_m2"] - m2["large_burned_peat_m2"]),
        "all": _ground(m2["all_m2"], m2["all_burned_m2"]),
    }
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "2023-check.json").write_text(json.dumps(result, indent=2) + "\n")
    print(
        f"checked year=2023 detections={len(once)} squares_ha={result['all']['ha']}"
        f" burned_ha={result['all']['burned_ha']} peat_share={result['peat']['share']}"
        f" other_share={result['other']['share']} seconds={round(time.perf_counter() - began)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
