import gzip
import hashlib
import json
import struct
from pathlib import Path

import httpx

from firewatch import globe_day

TRASE_CUT = Path(__file__).parents[2] / "fixtures" / "concessions" / "trase-cut.geojson"
KEY = "test-firms-key"

# One detection inside the box around the 0332 fire, and two outside that share a 0.01° cell.
FIRMS_CSV = b"""latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
-3.09876,112.81234,340.1,0.4,0.6,2026-10-14,618,N20,VIIRS,n,2.0NRT,290.2,5.31,D
1.23456,100.12345,330.5,0.4,0.6,2026-10-14,618,N20,VIIRS,n,2.0NRT,290.2,2.10,D
1.23449,100.12349,331.0,0.4,0.6,2026-10-14,618,N20,VIIRS,l,2.0NRT,290.2,1.50,D
"""


def _land(*rings: list) -> bytes:
    features = [
        {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [r]}}
        for r in rings
    ]
    return json.dumps({"type": "FeatureCollection", "features": features}).encode()


# A square of 110m land with a repeated point, and 10m land reaching well past the box all round.
LAND_110M = _land([[100, 0], [100, 0], [101, 0], [101, 1], [100, 1], [100, 0]])
LAND_10M = _land([[110, -5], [115, -5], [115, 0], [110, 0], [110, -5]])


def _sources(firms: bytes = FIRMS_CSV) -> dict[str, bytes]:
    return {
        globe_day.FIRMS_URL.format(key=KEY): firms,
        globe_day.LAND_110M_URL: LAND_110M,
        globe_day.LAND_10M_URL: LAND_10M,
        globe_day.concessions.URL: TRASE_CUT.read_bytes(),
    }


def _pinned(monkeypatch):
    sha = lambda data: hashlib.sha256(data).hexdigest()
    monkeypatch.setattr(globe_day, "FIRMS_SHA256", sha(FIRMS_CSV))
    monkeypatch.setattr(globe_day, "LAND_110M_SHA256", sha(LAND_110M))
    monkeypatch.setattr(globe_day, "LAND_10M_SHA256", sha(LAND_10M))
    monkeypatch.setattr(globe_day.concessions, "SHA256", sha(TRASE_CUT.read_bytes()))
    monkeypatch.setenv("FIRMS_MAP_KEY", KEY)


def _client(sources: dict[str, bytes], asked: list[str]) -> httpx.Client:
    def handler(request):
        asked.append(str(request.url))
        return httpx.Response(200, content=sources[str(request.url)])

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_gives_the_same_bytes_twice(monkeypatch, tmp_path):
    _pinned(monkeypatch)
    asked = []
    client = _client(_sources(), asked)

    for run in ("one", "two"):
        assert globe_day.main(["--out", str(tmp_path / run)], client) == 0

    names = sorted(p.name for p in (tmp_path / "one").iterdir())
    assert names == ["fires-2026-10-14.bin", "land-110m.bin", "near-0332.bin"]
    for name in names:
        assert (tmp_path / "one" / name).read_bytes() == (tmp_path / "two" / name).read_bytes()
    assert sorted(set(asked)) == sorted(_sources())


def test_keeps_a_detection_in_the_box_in_full_and_one_outside_as_its_cell(
    monkeypatch, tmp_path
):
    _pinned(monkeypatch)
    assert globe_day.main(["--out", str(tmp_path)], _client(_sources(), [])) == 0

    fires = gzip.decompress((tmp_path / "fires-2026-10-14.bin").read_bytes())
    assert struct.unpack("<Ihh", fires) == (1, 123, 10012)
    near = json.loads(gzip.decompress((tmp_path / "near-0332.bin").read_bytes()))
    assert near["box"] == [112.08, -3.59, 113.54, -2.59]
    assert near["fires"] == [[112.81234, -3.09876]]
    assert len(near["concession"]) == 2


def test_writes_land_in_tenths_of_a_degree_and_clips_the_near_land_beyond_the_box(
    monkeypatch, tmp_path
):
    _pinned(monkeypatch)
    assert globe_day.main(["--out", str(tmp_path)], _client(_sources(), [])) == 0

    land = gzip.decompress((tmp_path / "land-110m.bin").read_bytes())
    assert struct.unpack("<Hh10h", land) == (
        1, 5, 1000, 0, 1010, 0, 1010, 10, 1000, 10, 1000, 0
    )
    (ring,) = json.loads(gzip.decompress((tmp_path / "near-0332.bin").read_bytes()))["land"]
    xs = [x for x, _ in ring]
    ys = [y for _, y in ring]
    assert (min(xs), min(ys), max(xs), max(ys)) == (111.98, -3.69, 113.64, -2.49)


def test_refuses_a_changed_firms_file_without_printing_the_key(monkeypatch, tmp_path, capsys):
    _pinned(monkeypatch)
    extra = b"0.1,0.1,300,0.4,0.6,2026-10-14,618,N20,VIIRS,n,2.0NRT,290,1,D\n"
    changed = _sources(FIRMS_CSV + extra)

    assert globe_day.main(["--out", str(tmp_path)], _client(changed, [])) == 1

    err = capsys.readouterr().err
    assert "has changed: sha256" in err
    assert KEY not in err
    assert list(tmp_path.iterdir()) == []
