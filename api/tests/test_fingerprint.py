import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from firewatch.fingerprint import fingerprint, fingerprint_v2, record_fields, record_fields_v2

VECTORS = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "fingerprint-vectors.json").read_text()
)
V1 = [v for v in VECTORS if "version" not in v]
V2 = [v for v in VECTORS if v.get("version") == 2]
ROW = {
    "source": "VIIRS_NOAA20_NRT",
    "lat_e5": 43120,
    "lon_e5": 10121540,
    "acquired_at": datetime(2026, 10, 12, 6, 18, tzinfo=timezone.utc),
    "frp_e2": 1420,
    "confidence": "n",
}


@pytest.mark.parametrize("vector", V1, ids=[v["name"] for v in V1])
def test_matches_shared_vector(vector):
    assert "0x" + fingerprint(**vector["fields"]).hex() == vector["fingerprint"]


@pytest.mark.parametrize("vector", V2, ids=[v["name"] for v in V2])
def test_matches_shared_vector_v2(vector):
    assert "0x" + fingerprint_v2(**vector["fields"]).hex() == vector["fingerprint"]


def test_record_fields_from_stored_row():
    assert record_fields(ROW) == V1[0]["fields"]


def test_record_fields_v2_from_stored_row_and_matches():
    b = V2[1]["fields"]
    row = {
        **ROW,
        "lat_e5": b["lat_e5"],
        "lon_e5": b["lon_e5"],
        "acquired_at": datetime(2026, 10, 14, 6, 18, tzinfo=timezone.utc),
        "frp_e2": b["frp_e2"],
        "map_version": b["map_version"],
    }
    assert record_fields_v2(row, b["concessions"]) == b
