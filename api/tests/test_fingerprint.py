import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from firewatch.fingerprint import fingerprint, record_fields

VECTORS = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "fingerprint-vectors.json").read_text()
)


@pytest.mark.parametrize("vector", VECTORS, ids=[v["name"] for v in VECTORS])
def test_matches_shared_vector(vector):
    assert "0x" + fingerprint(**vector["fields"]).hex() == vector["fingerprint"]


def test_record_fields_from_stored_row():
    row = {
        "source": "VIIRS_NOAA20_NRT",
        "lat_e5": 43120,
        "lon_e5": 10121540,
        "acquired_at": datetime(2026, 10, 12, 6, 18, tzinfo=timezone.utc),
        "frp_e2": 1420,
        "confidence": "n",
    }
    assert record_fields(row) == VECTORS[0]["fields"]
