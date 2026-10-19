import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from firewatch.fingerprint import (
    fingerprint,
    fingerprint_v2,
    forecast_fields,
    forecast_fingerprint,
    record_fields,
    record_fields_v2,
)

VECTORS = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "fingerprint-vectors.json").read_text()
)
V1 = [v for v in VECTORS if "version" not in v]
V2 = [v for v in VECTORS if v.get("version") == 2]
V3 = [v for v in VECTORS if v.get("version") == 3]
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


@pytest.mark.parametrize("vector", V3, ids=[v["name"] for v in V3])
def test_matches_shared_vector_v3(vector):
    assert "0x" + forecast_fingerprint(vector["fields"]).hex() == vector["fingerprint"]


def test_a_changed_forecast_time_changes_the_fingerprint():
    sealed, changed = V3[0], V3[2]
    assert sealed["fields"]["inside_by_unix"] != changed["fields"]["inside_by_unix"]
    assert sealed["fingerprint"] != changed["fingerprint"]


def utc(text):
    return datetime.fromisoformat(text + "+00:00")


def test_forecast_fields_from_stored_row():
    row = {
        "concession_id": "ID-WOOD-CONCESSION-0332",
        "fire_key": bytes.fromhex(V3[0]["fields"]["fire_key"][2:]),
        "after_pass_at": utc("2026-10-14T17:20"),
        "made_at": utc("2026-10-14T20:00"),
        "until_at": utc("2026-10-16T20:00"),
        "inside_by_at": utc("2026-10-15T05:20"),
        "from_lat_e5": -284220,
        "from_lon_e5": 11271781,
        "crossing_lat_e5": -284194,
        "crossing_lon_e5": 11271793,
        "rule_version": 1,
    }
    assert forecast_fields(row) == V3[0]["fields"]
    not_inside = {
        **row,
        "after_pass_at": utc("2026-10-13T17:37"),
        "made_at": utc("2026-10-13T20:00"),
        "until_at": utc("2026-10-15T20:00"),
        "inside_by_at": None,
        **{c: None for c in ("from_lat_e5", "from_lon_e5", "crossing_lat_e5", "crossing_lon_e5")},
    }
    assert forecast_fields(not_inside) == V3[1]["fields"]


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
