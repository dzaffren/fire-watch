"""globe-day: make the landing globe's three files from pinned sources (D75, D79).

Usage: globe-day [--out <dir>]

Downloads FIRMS's NOAA-20 detections of 14 Oct 2026 worldwide with FIRMS_MAP_KEY, Natural
Earth's 110m and 10m land, and Trase's concession map, each checked by its sha256. Writes
land-110m.bin, fires-2026-10-14.bin and near-0332.bin to web/public/globe, or to --out, each
gzipped with mtime 0 so the same sources give the same bytes.

The method, so anyone can redo it:

1. Land: every ring of Natural Earth 110m land, in tenths of a degree as int16, with repeated
   points dropped. A uint16 ring count, then each ring as an int16 point count and its points.
2. Fires outside the box: one per 0.01° cell, sorted by latitude, then longitude. A uint32 cell
   count, the latitudes in hundredths as int16 steps from the one before, then the longitudes.
3. Near the fire, as JSON: the box; every detection inside it to 5 places; 0332's edge to 4
   places; and Natural Earth 10m land clipped 0.1° beyond the box, so no cut edge reads as coast.
"""

import argparse
import csv
import gzip
import hashlib
import io
import json
import os
import struct
import sys
from pathlib import Path

import httpx

from firewatch import concessions, firms

FIRMS_URL = (
    "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/"
    f"{firms.SOURCE}/world/1/2026-10-14"
)
FIRMS_SHA256 = "c5af605a6a7ae1d6b877e69ec320deef6a8fdf226e31591c2715d7e863a15d60"
NATURAL_EARTH = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/"
LAND_110M_URL = NATURAL_EARTH + "ne_110m_land.geojson"
LAND_110M_SHA256 = "9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9"
LAND_10M_URL = NATURAL_EARTH + "ne_10m_land.geojson"
LAND_10M_SHA256 = "1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416"
OUT = Path(__file__).parents[3] / "web" / "public" / "globe"
CONCESSION = "ID-WOOD-CONCESSION-0332"
# West, south, east and north: the view over the example fire, and a margin.
BOX = (112.08, -3.59, 113.54, -2.59)
NEAR_LAND_MARGIN = 0.1


def _gzipped(raw: bytes) -> bytes:
    # GzipFile, not gzip.compress, which writes a different OS byte in the header.
    out = io.BytesIO()
    with gzip.GzipFile(fileobj=out, mode="wb", compresslevel=9, mtime=0) as f:
        f.write(raw)
    return out.getvalue()


def _rings(geojson: bytes):
    for feature in json.loads(geojson)["features"]:
        g = feature["geometry"]
        for polygon in [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]:
            yield from polygon


def _deduped(ring: list) -> list:
    return [p for i, p in enumerate(ring) if i == 0 or p != ring[i - 1]]


def _in_box(x: float, y: float) -> bool:
    return BOX[0] <= x <= BOX[2] and BOX[1] <= y <= BOX[3]


def _clip(ring: list, w: float, s: float, e: float, n: float) -> list:
    """Sutherland–Hodgman, one side of the box at a time."""
    for inside, cut in (
        (lambda p: p[0] >= w, lambda a, b: (w, a[1] + (b[1] - a[1]) * (w - a[0]) / (b[0] - a[0]))),
        (lambda p: p[0] <= e, lambda a, b: (e, a[1] + (b[1] - a[1]) * (e - a[0]) / (b[0] - a[0]))),
        (lambda p: p[1] >= s, lambda a, b: (a[0] + (b[0] - a[0]) * (s - a[1]) / (b[1] - a[1]), s)),
        (lambda p: p[1] <= n, lambda a, b: (a[0] + (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]), n)),
    ):
        clipped = []
        for i, b in enumerate(ring):
            a = ring[i - 1]
            if inside(b):
                if not inside(a):
                    clipped.append(cut(a, b))
                clipped.append(b)
            elif inside(a):
                clipped.append(cut(a, b))
        ring = clipped
        if not ring:
            break
    return ring


def make(firms_csv: bytes, land_110m: bytes, land_10m: bytes, trase: bytes) -> dict[str, bytes]:
    rings = [_deduped([(round(x * 10), round(y * 10)) for x, y in r]) for r in _rings(land_110m)]
    values = [v for r in rings for v in [len(r)] + [c for p in r for c in p]]
    land = struct.pack(f"<H{len(values)}h", len(rings), *values)

    rows = csv.DictReader(io.StringIO(firms_csv.decode()))
    points = [(float(r["longitude"]), float(r["latitude"])) for r in rows]
    cells = sorted({(round(y * 100), round(x * 100)) for x, y in points if not _in_box(x, y)})
    lats = [y for y, _ in cells]
    steps = [lats[0]] + [lats[i] - lats[i - 1] for i in range(1, len(lats))]
    fires = struct.pack(
        f"<I{len(cells)}h{len(cells)}h", len(cells), *steps, *[x for _, x in cells]
    )

    near_fires = sorted(
        {(round(x, 5), round(y, 5)) for x, y in points if _in_box(x, y)},
        key=lambda p: (p[1], p[0]),
    )
    (edge,) = [
        f["geometry"] for f in json.loads(trase)["features"]
        if f["properties"]["wood_supplier_trase_id"] == CONCESSION
    ]
    polygons = edge["coordinates"] if edge["type"] == "MultiPolygon" else [edge["coordinates"]]
    concession = [[[round(x, 4), round(y, 4)] for x, y in r] for p in polygons for r in p]
    w, s, e, n = BOX
    m = NEAR_LAND_MARGIN
    near_land = []
    for r in _rings(land_10m):
        clipped = _clip([tuple(p) for p in r], w - m, s - m, e + m, n + m)
        if len(clipped) >= 3:
            near_land.append(_deduped([[round(x, 4), round(y, 4)] for x, y in clipped]))
    near = json.dumps(
        {"box": BOX, "fires": [list(p) for p in near_fires], "concession": concession,
         "land": near_land},
        separators=(",", ":"),
    ).encode()

    return {
        "land-110m.bin": _gzipped(land),
        "fires-2026-10-14.bin": _gzipped(fires),
        "near-0332.bin": _gzipped(near),
    }


def main(argv: list[str] | None = None, client: httpx.Client | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="globe-day", description="Make the landing globe's files from pinned sources."
    )
    parser.add_argument("--out", type=Path, default=OUT, help=f"where to write (default {OUT})")
    args = parser.parse_args(argv)
    key = os.environ["FIRMS_MAP_KEY"]
    client = client or httpx.Client(timeout=300, follow_redirects=True)
    try:
        sources = [
            concessions.download(FIRMS_URL.format(key=key), FIRMS_SHA256, client),
            concessions.download(LAND_110M_URL, LAND_110M_SHA256, client),
            concessions.download(LAND_10M_URL, LAND_10M_SHA256, client),
            concessions.download(concessions.URL, concessions.SHA256, client),
        ]
    except ValueError as e:
        print(str(e).replace(key, "<FIRMS_MAP_KEY>"), file=sys.stderr)
        return 1
    args.out.mkdir(parents=True, exist_ok=True)
    for name, data in make(*sources).items():
        (args.out / name).write_bytes(data)
        digest = hashlib.sha256(data).hexdigest()
        print(f"Wrote {args.out / name}: {len(data):,} bytes, sha256 {digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
