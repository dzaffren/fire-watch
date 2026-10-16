import itertools
from datetime import datetime
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient

from firewatch import concessions
from firewatch.app import create_app
from firewatch.concessions import MAP_VERSION

SITE = "https://fire-watch.example"
TRASE_CUT = Path(__file__).parents[2] / "fixtures" / "concessions" / "trase-cut.geojson"
C0275, C0332, C0377, C0540 = (
    f"ID-WOOD-CONCESSION-{n}" for n in ("0275", "0332", "0377", "0540")
)
RANGE = {"from": "2026-10-11", "to": "2026-10-14"}
_ids = itertools.count(1)


@pytest.fixture
def db(migrated_db):
    concessions.load(TRASE_CUT.read_bytes(), migrated_db)
    return migrated_db


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", db)
    return TestClient(create_app(SITE))


def record(
    url, acquired_at, matches, version=2, lat_e5=-358175, lon_e5=None, frp_e2=520, **sealed
):
    """Stores a hotspot with its (concession ID, inside, edge_m) matches; returns its record ID."""
    n = next(_ids)
    record_id = bytes([n]) * 32
    with psycopg.connect(url) as conn:
        (hotspot_id,) = conn.execute(
            "INSERT INTO hotspots (record_id, source, lat_e5, lon_e5, acquired_at, frp_e2,"
            " confidence, fingerprint_version, map_version, tx_hash, sealed_at)"
            " VALUES (%s, 'VIIRS_NOAA20_NRT', %s, %s, %s, %s, 'n', %s, %s, %s, %s) RETURNING id",
            (
                record_id, lat_e5, 10571567 + n if lon_e5 is None else lon_e5,
                acquired_at, frp_e2, version,
                MAP_VERSION if version == 2 else None,
                sealed.get("tx_hash"), sealed.get("sealed_at"),
            ),
        ).fetchone()
        for concession_id, inside, edge_m in matches:
            conn.execute(
                "INSERT INTO hotspot_concessions VALUES (%s, %s, %s, %s)",
                (hotspot_id, concession_id, inside, edge_m),
            )
    return "0x" + record_id.hex()


def unix(at):
    return int(datetime.fromisoformat(at).timestamp())


def test_concessions_ranked_by_inside(client, db):
    with psycopg.connect(db) as conn:
        conn.execute(
            "INSERT INTO concessions VALUES ('ID-WOOD-CONCESSION-0001', 'Riau', 100, %s,"
            " ST_Multi(ST_MakeEnvelope(101, 0, 101.01, 0.01, 4326)))",
            (MAP_VERSION,),
        )
    record(db, "2026-10-01T06:18Z", [], version=1)
    record(db, "2026-10-10T23:59Z", [(C0540, True, 3099)])
    record(db, "2026-10-11T00:00Z", [(C0540, True, 3099)])
    record(db, "2026-10-14T23:59:59Z", [(C0540, True, 2000)])
    record(db, "2026-10-15T00:00Z", [(C0540, True, 3099)])
    record(db, "2026-10-14T06:18Z", [(C0377, False, 371), (C0275, False, 1019)])
    record(db, "2026-10-13T06:18Z", [(C0377, True, 50)])
    record(db, "2026-10-13T06:18Z", [(C0275, True, 60)])
    record(db, "2026-10-12T06:18Z", [("ID-WOOD-CONCESSION-0001", True, 10)])

    response = client.get("/api/concessions", params=RANGE)

    assert response.status_code == 200
    assert response.json() == {
        "recording_started": "2026-10-10",
        "map_version": MAP_VERSION,
        "concessions": [
            {"id": C0540, "province": "Sumatera Selatan", "area_ha": 251385, "inside": 2, "near": 0},
            {"id": C0275, "province": "Kalimantan Selatan", "area_ha": 22131, "inside": 1, "near": 1},
            {"id": C0377, "province": "Kalimantan Selatan", "area_ha": 248719, "inside": 1, "near": 1},
            {"id": "ID-WOOD-CONCESSION-0001", "province": "Riau", "area_ha": 100, "inside": 1, "near": 0},
        ],
    }


@pytest.mark.parametrize("path", ["/api/concessions", f"/api/concessions/{C0540}"])
@pytest.mark.parametrize(
    "params",
    [
        {"from": "2026-10-01", "to": "2026-11-01"},
        {"from": "2026-10-14", "to": "2026-10-11"},
        {"from": "2026-10-11"},
        {"to": "2026-10-14"},
        {"from": "2026-10-1x", "to": "2026-10-14"},
    ],
    ids=["32 days", "to before from", "no to", "no from", "malformed"],
)
def test_range_over_31_days_is_422(client, path, params):
    assert client.get(path, params=params).status_code == 422


def test_31_days_is_allowed(client):
    response = client.get("/api/concessions", params={"from": "2026-10-01", "to": "2026-10-31"})
    assert response.status_code == 200


@pytest.mark.parametrize("path", ["/api/concessions", f"/api/concessions/{C0540}"])
def test_last_possible_date_is_allowed(client, path):
    response = client.get(path, params={"from": "9999-12-31", "to": "9999-12-31"})
    assert response.status_code == 200


def test_empty_range_still_gives_recording_started(client, db):
    record(db, "2026-10-11T07:14Z", [(C0540, True, 3099)])

    response = client.get("/api/concessions", params={"from": "2026-10-01", "to": "2026-10-07"})

    assert response.json() == {
        "recording_started": "2026-10-11",
        "map_version": MAP_VERSION,
        "concessions": [],
    }


def test_recording_started_is_null_before_any_record(client):
    assert client.get("/api/concessions", params=RANGE).json()["recording_started"] is None


def test_concession_lists_its_records_newest_first_with_every_match(client, db):
    tx_hash, sealed_at = bytes.fromhex("cd" * 32), "2026-10-14T09:05:12Z"
    b = record(
        db, "2026-10-14T06:18Z", [(C0377, False, 371), (C0275, False, 1019)],
        lat_e5=-367525, frp_e2=303, tx_hash=tx_hash, sealed_at=sealed_at,
    )
    low_frp = record(db, "2026-10-13T06:18Z", [(C0377, True, 50)], frp_e2=100)
    south = record(db, "2026-10-13T06:18Z", [(C0377, True, 70)], lat_e5=-400000, frp_e2=900)
    north = record(db, "2026-10-13T06:18Z", [(C0377, True, 80)], lat_e5=-300000, frp_e2=900)
    both = record(db, "2026-10-12T06:18Z", [(C0377, False, 100), (C0275, True, 2000)])
    record(db, "2026-10-15T00:00Z", [(C0377, True, 50)])
    record(db, "2026-10-12T06:18Z", [(C0540, True, 3099)])

    response = client.get(f"/api/concessions/{C0377}", params=RANGE)

    assert response.status_code == 200
    assert response.headers["content-encoding"] == "gzip"
    body = response.json()
    assert {k: body[k] for k in ("id", "province", "area_ha", "inside", "near")} == {
        "id": C0377, "province": "Kalimantan Selatan", "area_ha": 248719, "inside": 3, "near": 2,
    }
    assert [h["record_id"] for h in body["hotspots"]] == [b, south, north, low_frp, both]
    assert body["hotspots"][0] == {
        "record_id": b,
        "source": "VIIRS_NOAA20_NRT",
        "lat_e5": -367525,
        "lon_e5": int(body["hotspots"][0]["lon_e5"]),
        "acquired_at": "2026-10-14T06:18:00Z",
        "acquired_unix": 1791958680,
        "frp_e2": 303,
        "confidence": "n",
        "tx_hash": "0x" + "cd" * 32,
        "sealed_at": sealed_at,
        "fingerprint_version": 2,
        "map_version": MAP_VERSION,
        "concessions": [
            {"id": C0377, "inside": False, "edge_m": 371},
            {"id": C0275, "inside": False, "edge_m": 1019},
        ],
        "fire_key": b,
    }
    assert body["hotspots"][1]["tx_hash"] is None and body["hotspots"][1]["sealed_at"] is None
    assert body["hotspots"][4]["concessions"] == [
        {"id": C0275, "inside": True, "edge_m": 2000},
        {"id": C0377, "inside": False, "edge_m": 100},
    ]


def test_concession_lists_fires_largest_first_with_fire_keys(client, db):
    record(db, "2026-10-01T06:18Z", [(C0540, True, 3099)], lat_e5=-350000)
    largest = [
        record(db, "2026-10-12T06:18Z", [(C0540, True, 3099)], lat_e5=-300000, lon_e5=10600000),
        record(db, "2026-10-12T06:18Z", [(C0540, True, 2900)], lat_e5=-300000, lon_e5=10600300),
        record(db, "2026-10-12T18:00Z", [(C0540, True, 3000)], lat_e5=-300300, lon_e5=10600000),
    ]
    record(db, "2026-10-13T06:18Z", [(C0377, True, 50)], lat_e5=-300000, lon_e5=10600000)
    older = [
        record(db, "2026-10-13T06:18Z", [(C0540, True, 3099)], lat_e5=-310000, lon_e5=10600000 + i)
        for i in range(2)
    ]
    newer = [
        record(db, "2026-10-14T06:18Z", [(C0540, True, 3099)], lat_e5=-320000, lon_e5=10600000 + i)
        for i in range(2)
    ]
    north = record(db, "2026-10-14T06:18Z", [(C0540, False, 500)], lat_e5=-330000, lon_e5=10600000)
    south = record(db, "2026-10-14T06:18Z", [(C0540, False, 500)], lat_e5=-340000, lon_e5=10600000)

    body = client.get(f"/api/concessions/{C0540}", params=RANGE).json()

    assert [f["key"] for f in body["fires"]] == [largest[0], newer[0], older[0], north, south]
    assert body["fires"][0] == {
        "key": largest[0],
        "first_seen_unix": unix("2026-10-12T06:18Z"),
        "last_seen_unix": unix("2026-10-12T18:00Z"),
        "passes": 2,
        "detections": 3,
        "first_seen": {"reading": "inside", "inside": True, "edge_m": 2900},
        "inside_from_unix": unix("2026-10-12T06:18Z"),
        "outside_from_unix": None,
        "never_spread": False,
        "recorded_before_h": None,
    }
    assert {h["record_id"]: h["fire_key"] for h in body["hotspots"]} == {
        **{r: largest[0] for r in largest},
        **{r: older[0] for r in older},
        **{r: newer[0] for r in newer},
        north: north,
        south: south,
    }


def test_concession_boundary_is_its_simplified_outer_rings(client, db):
    with psycopg.connect(db) as conn:
        (polygons,) = conn.execute(
            "SELECT ST_NumGeometries(boundary) FROM concessions WHERE id = %s", (C0540,)
        ).fetchone()

    boundary = client.get(f"/api/concessions/{C0540}", params=RANGE).json()["boundary"]

    assert len(boundary) == polygons == 2
    for ring in boundary:
        assert ring[0] == ring[-1]
        assert all(105 < lon < 107 and -4.5 < lat < -2.5 for lon, lat in ring)


def test_concession_with_no_records_in_range_has_zero_counts(client):
    body = client.get(f"/api/concessions/{C0540}", params=RANGE).json()

    assert (body["inside"], body["near"], body["hotspots"], body["fires"]) == (0, 0, [], [])


def test_unknown_concession_is_404(client):
    response = client.get("/api/concessions/ID-WOOD-CONCESSION-9999", params=RANGE)

    assert response.status_code == 404


def test_fire_has_every_detection_whatever_the_dates(client, db):
    record(db, "2026-10-12T03:32Z", [(C0540, True, 3099)])
    detections = [
        record(db, "2026-10-13T17:37Z", [(C0332, False, 954)], lat_e5=-310000, lon_e5=11281000),
        record(db, "2026-10-13T17:37Z", [(C0332, False, 1258)], lat_e5=-310000, lon_e5=11281300),
        record(db, "2026-10-14T06:18Z", [(C0332, False, 731)], lat_e5=-310100, lon_e5=11281100),
        record(db, "2026-10-14T17:20Z", [(C0332, False, 32)], lat_e5=-310200, lon_e5=11281200),
        record(db, "2026-10-15T18:43Z", [(C0332, False, 7)], lat_e5=-310300, lon_e5=11281000),
        record(db, "2026-10-15T18:43Z", [(C0332, True, 804)], lat_e5=-310300, lon_e5=11281700),
    ]

    concession = client.get(
        f"/api/concessions/{C0332}", params={"from": "2026-10-15", "to": "2026-10-15"}
    ).json()
    fire = client.get(f"/api/concessions/{C0332}/fires/{detections[0]}").json()

    assert {h["record_id"]: h["fire_key"] for h in concession["hotspots"]} == {
        detections[4]: detections[0],
        detections[5]: detections[0],
    }
    assert concession["fires"] == [{k: v for k, v in fire.items() if k != "hotspots"}]
    assert fire["first_seen"] == {"reading": "outside", "inside": False, "edge_m": 954}
    assert fire["first_seen_unix"] == unix("2026-10-13T17:37Z")
    assert fire["inside_from_unix"] == unix("2026-10-15T18:43Z")
    assert (fire["passes"], fire["detections"], fire["recorded_before_h"]) == (4, 6, 38)
    assert fire["never_spread"] is False
    assert [h["record_id"] for h in fire["hotspots"]] == detections
    assert [h["pass"] for h in fire["hotspots"]] == [1, 1, 2, 3, 4, 4]


def test_fire_detections_oldest_first_with_pass(client, db):
    tx_hash, sealed_at = bytes.fromhex("cd" * 32), "2026-10-13T07:05:12Z"
    first = record(
        db, "2026-10-13T06:18Z", [(C0540, True, 3099), (C0377, False, 900)],
        lat_e5=-300000, lon_e5=10600000, frp_e2=303, tx_hash=tx_hash, sealed_at=sealed_at,
    )
    north = record(db, "2026-10-13T07:19Z", [(C0540, True, 3000)], lat_e5=-300050, lon_e5=10600000)
    south = record(db, "2026-10-13T07:19Z", [(C0540, True, 3000)], lat_e5=-300200, lon_e5=10600000)
    same_pass = record(
        db, "2026-10-13T06:48Z", [(C0540, True, 3000)], lat_e5=-300100, lon_e5=10600000
    )
    later = record(db, "2026-10-14T06:18Z", [(C0540, True, 2000)], lat_e5=-300000, lon_e5=10600100)

    response = client.get(f"/api/concessions/{C0540}/fires/{first}")

    assert response.status_code == 200
    hotspots = response.json()["hotspots"]
    assert [(h["record_id"], h["pass"]) for h in hotspots] == [
        (first, 1), (same_pass, 1), (south, 2), (north, 2), (later, 3),
    ]
    assert hotspots[0] == {
        "record_id": first,
        "source": "VIIRS_NOAA20_NRT",
        "lat_e5": -300000,
        "lon_e5": 10600000,
        "acquired_at": "2026-10-13T06:18:00Z",
        "acquired_unix": unix("2026-10-13T06:18Z"),
        "frp_e2": 303,
        "confidence": "n",
        "tx_hash": "0x" + "cd" * 32,
        "sealed_at": sealed_at,
        "fingerprint_version": 2,
        "map_version": MAP_VERSION,
        "concessions": [
            {"id": C0540, "inside": True, "edge_m": 3099},
            {"id": C0377, "inside": False, "edge_m": 900},
        ],
        "pass": 1,
    }


def test_unknown_fire_is_404(client, db):
    later = record(db, "2026-10-13T08:00Z", [(C0540, True, 3099)])
    elsewhere = record(db, "2026-10-13T08:00Z", [(C0377, True, 50)], lat_e5=-400000)
    assert client.get(f"/api/concessions/{C0540}/fires/{later}").status_code == 200

    older = record(db, "2026-10-13T06:18Z", [(C0540, True, 3099)])

    for concession_id, key in [
        (C0540, later),
        (C0540, elsewhere),
        (C0540, "0x" + "ab" * 32),
        ("ID-WOOD-CONCESSION-9999", older),
    ]:
        assert client.get(f"/api/concessions/{concession_id}/fires/{key}").status_code == 404
    assert client.get(f"/api/concessions/{C0540}/fires/{older}").status_code == 200


@pytest.mark.parametrize(
    "key",
    ["0x" + "ab" * 31, "0x" + "ab" * 33, "0x" + "AB" * 32, "ab" * 33, "0x" + "zz" * 32],
    ids=["short", "long", "upper case", "no 0x", "not hex"],
)
def test_malformed_fire_key_is_422(client, key):
    assert client.get(f"/api/concessions/{C0540}/fires/{key}").status_code == 422


def test_health_reports_last_run(client, db):
    record(db, "2026-10-14T06:18Z", [(C0540, True, 3099)], tx_hash=b"\x01" * 32, sealed_at="2026-10-14T07:00Z")
    record(db, "2026-10-14T06:18Z", [(C0540, True, 3099)])
    record(db, "2026-10-14T06:18Z", [(C0540, True, 3099)])
    record(db, "2026-10-12T06:18Z", [], version=1)
    with psycopg.connect(db) as conn:
        for started, finished, sealed, error in [
            ("2026-10-14T07:00Z", "2026-10-14T07:03:10Z", 71, None),
            ("2026-10-14T08:00Z", "2026-10-14T08:02:00Z", 0, "ChainError: insufficient funds"),
        ]:
            conn.execute(
                "INSERT INTO recorder_runs (started_at, finished_at, kept, sealed, unsealed, error)"
                " VALUES (%s, %s, 1612, %s, 2, %s)",
                (started, finished, sealed, error),
            )

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "ok",
        "recorder": {
            "last_run_at": "2026-10-14T08:02:00Z",
            "last_run_ok": False,
            "last_ok_at": "2026-10-14T07:03:10Z",
            "last_sealed": 0,
            "unsealed": 2,
        },
    }


def test_health_before_any_run(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "ok",
        "recorder": {
            "last_run_at": None,
            "last_run_ok": None,
            "last_ok_at": None,
            "last_sealed": None,
            "unsealed": 0,
        },
    }


def test_health_reports_database_down(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://firewatch:firewatch@127.0.0.1:1/firewatch")

    response = TestClient(create_app(SITE)).get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"status": "error", "database": "down"}


def test_cors_allows_only_the_site_and_only_get(client):
    allowed = client.get("/api/health", headers={"Origin": SITE})
    other = client.get("/api/health", headers={"Origin": "https://elsewhere.example"})
    preflight_post = client.options(
        "/api/concessions",
        headers={"Origin": SITE, "Access-Control-Request-Method": "POST"},
    )

    assert allowed.headers["access-control-allow-origin"] == SITE
    assert "access-control-allow-origin" not in other.headers
    assert preflight_post.status_code == 400
