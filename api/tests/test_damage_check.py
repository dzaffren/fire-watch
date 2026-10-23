import hashlib
import json
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from firewatch import damage_check, peat
from firewatch.db import connect

ROOT = Path(__file__).parents[2]
# Every 2023 row within 5 km of three concessions, 2023-09-20 to 2023-10-20.
FIRMS_CUT = ROOT / "fixtures" / "backtest" / "2023-cut.csv"
TRASE_CUT = ROOT / "fixtures" / "backtest" / "trase-cut.geojson"
PEAT_CUT = ROOT / "fixtures" / "peat" / "peat-cut.geojson.gz"
ROW = "{},{},330.0,0.4,0.5,2023-09-25,0605,N20,VIIRS,n,2,290.0,5.0,D,0\n"
# Two pieces of squares 300 m apart near ID-WOOD-CONCESSION-0332, on peat and off it: 21 squares
# in 3 rows of 7, and 3.5 km south, 20 squares in 4 rows of 5.
LARGE = [(-2.850 + 0.003 * r, 112.712 + 0.003 * c) for r in range(3) for c in range(7)]
SMALL = [(-2.885 - 0.003 * r, 112.712 + 0.003 * c) for r in range(4) for c in range(5)]
# The test's burn-date grid: 0.001 degree pixels from 112.700 E, 2.830 S, 50 wide and 80 high.
WEST = (112.700, -2.860, 112.721, -2.830)

# Each piece's squares in UTM zone 49S, joined, and clipped by what follows.
AREA = """
WITH squares AS (
    SELECT ST_Union(ST_Transform(ST_Expand(ST_Transform(
        ST_SetSRID(ST_MakePoint(lon, lat), 4326), 32749), 187.5), 4326)) AS geom
    FROM unnest(%(lat)s::float8[], %(lon)s::float8[]) AS u (lat, lon)
), clipped AS (
    SELECT CASE WHEN %(west)s THEN ST_Intersection(geom, ST_MakeEnvelope(%(w)s, %(s)s, %(e)s, %(n)s, 4326))
                ELSE geom END AS geom
    FROM squares
)
SELECT CASE WHEN %(on_peat)s
            THEN ST_Area(ST_Intersection(geom, (SELECT ST_Union(geom) FROM peat))::geography)
            ELSE ST_Area(geom::geography) END AS m2
FROM clipped
"""


def tif(path: Path, data: np.ndarray, west=112.700, north=-2.830, size=0.001) -> bytes:
    with rasterio.open(
        path, "w", driver="GTiff", width=data.shape[1], height=data.shape[0], count=1,
        dtype="int16", crs="EPSG:4326", transform=from_origin(west, north, size, size),
    ) as out:
        out.write(data.astype(np.int16), 1)
    return path.read_bytes()


def months() -> dict[str, np.ndarray]:
    """Two months of burn dates: the west of the large piece on day 250, with water over its
    east, and all of the small piece on day 300 with the large piece's west again."""
    first, second = np.zeros((80, 50)), np.zeros((80, 50))
    first[0:30, 0:21] = 250
    first[0:30, 28:35] = -2
    second[50:80, :] = 300
    second[10:20, 0:11] = 300
    return {"A2023244.tif": first, "A2023274.tif": second}


def pin(monkeypatch, folder: Path, burn_dates: dict[str, np.ndarray], **grid) -> None:
    """Writes the months into folder and pins them, and gives the command the test's peat cut."""
    folder.mkdir(exist_ok=True)
    pinned = {
        name: hashlib.sha256(tif(folder / name, data, **grid)).hexdigest()
        for name, data in burn_dates.items()
    }
    monkeypatch.setattr(damage_check, "MODIS_FILES", pinned)
    monkeypatch.setattr(peat, "committed", PEAT_CUT.read_bytes)


def check(url, monkeypatch, modis: Path, firms: Path, out: Path) -> int:
    monkeypatch.setenv("DATABASE_URL", url)
    return damage_check.main(
        ["--modis", str(modis), "--firms", str(firms), "--map", str(TRASE_CUT), "--out", str(out)]
    )


def firms_file(path: Path, points: list[tuple[float, float]]) -> Path:
    header = FIRMS_CUT.read_text().splitlines(keepends=True)[0]
    path.write_text(header + "".join(ROW.format(f"{lat:.5f}", f"{lon:.5f}") for lat, lon in points))
    return path


def area(conn, points, west=False, on_peat=False) -> float:
    return conn.execute(
        AREA,
        {
            "lat": [lat for lat, _ in points], "lon": [lon for _, lon in points],
            "west": west, **dict(zip("wsen", WEST)), "on_peat": on_peat,
        },
    ).fetchone()["m2"]


def test_measures_known_burns_and_takes_shares_from_more_than_20_squares(
    migrated_db, tmp_path, monkeypatch, capsys
):
    pin(monkeypatch, tmp_path / "modis", months())
    firms = firms_file(tmp_path / "pieces.csv", LARGE + SMALL)

    assert check(migrated_db, monkeypatch, tmp_path / "modis", firms, tmp_path / "out") == 0

    with connect(migrated_db) as conn:
        large, small = area(conn, LARGE), area(conn, SMALL)
        large_peat = area(conn, LARGE, on_peat=True)
        burned, burned_peat = area(conn, LARGE, west=True), area(conn, LARGE, west=True, on_peat=True)
    assert 0 < large_peat < large and 0 < burned_peat < burned < large
    assert json.loads((tmp_path / "out" / "2023-check.json").read_text()) == {
        "year": 2023,
        "detections": 41,
        "large_patch_squares": 21,
        "peat": {
            "ha": round(large_peat / 1e4), "burned_ha": round(burned_peat / 1e4),
            "share": round(burned_peat / large_peat, 3),
        },
        "other": {
            "ha": round((large - large_peat) / 1e4),
            "burned_ha": round((burned - burned_peat) / 1e4),
            "share": round((burned - burned_peat) / (large - large_peat), 3),
        },
        "all": {
            "ha": round((large + small) / 1e4), "burned_ha": round((burned + small) / 1e4),
            "share": round((burned + small) / (large + small), 3),
        },
    }
    assert capsys.readouterr().out.startswith(
        f"checked year=2023 detections=41 squares_ha={round((large + small) / 1e4)}"
        f" burned_ha={round((burned + small) / 1e4)}"
        f" peat_share={round(burned_peat / large_peat, 3)}"
        f" other_share={round((burned - burned_peat) / (large - large_peat), 3)} seconds="
    )


def test_cut_gives_the_same_bytes_twice(migrated_db, tmp_path, monkeypatch):
    # Every pixel over the cut burned, 0.01 degrees each from 112.5 E to 116.5 E and 2.5 S to 4.2 S.
    burned = {"A2023244.tif": np.full((170, 400), 250)}
    pin(monkeypatch, tmp_path / "modis", burned, west=112.5, north=-2.5, size=0.01)
    outs = []
    for name in ("one", "two"):
        assert check(migrated_db, monkeypatch, tmp_path / "modis", FIRMS_CUT, tmp_path / name) == 0
        outs.append((tmp_path / name / "2023-check.json").read_bytes())

    assert outs[0] == outs[1]
    found = json.loads(outs[0])
    assert found["detections"] == 625
    for ground in ("peat", "other", "all"):
        assert found[ground]["burned_ha"] == found[ground]["ha"] > 0
        assert found[ground]["share"] == 1.0


@pytest.mark.parametrize("change", ["changed", "missing"])
def test_refuses_a_changed_or_missing_modis_file(
    change, migrated_db, tmp_path, monkeypatch, capsys
):
    modis = tmp_path / "modis"
    pin(monkeypatch, modis, months())
    path = modis / "A2023274.tif"
    if change == "changed":
        path.write_bytes(path.read_bytes() + b"\0")
        got = hashlib.sha256(path.read_bytes()).hexdigest()
        expected = damage_check.MODIS_FILES["A2023274.tif"]
        message = f"{path} has changed: sha256 {got}, expected {expected}"
    else:
        path.unlink()
        message = f"{path} is missing; the README's fetch line gets the 12 files"

    assert check(migrated_db, monkeypatch, modis, FIRMS_CUT, tmp_path / "out") == 1
    assert capsys.readouterr().err.strip() == message
    assert not (tmp_path / "out").exists()
    with connect(migrated_db) as conn:
        assert conn.execute("SELECT count(*) AS n FROM concessions").fetchone()["n"] == 0


def test_pins_the_12_files_of_2023():
    days = ["001", "032", "060", "091", "121", "152", "182", "213", "244", "274", "305", "335"]
    assert list(damage_check.MODIS_FILES) == [
        f"MCD64monthly.A2023{d}.Win19.061.burndate.tif" for d in days
    ]
    assert damage_check.MODIS_FILES["MCD64monthly.A2023001.Win19.061.burndate.tif"] == (
        "e6081bd99a37381ca8845fc919f52f312de5ab6c3fea07e47aee770f62eb59c1"
    )
    assert damage_check.MODIS_FILES["MCD64monthly.A2023335.Win19.061.burndate.tif"] == (
        "7d96755ab8922330f8ed10b54887941bc58af831a7105c1aadfab95439b15792"
    )
