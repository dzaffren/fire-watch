import itertools
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient

from firewatch import concessions
from firewatch.app import create_app
from firewatch.concessions import MAP_VERSION

SITE = "https://fire-watch.example"
TRASE_CUT = Path(__file__).parents[2] / "fixtures" / "concessions" / "trase-cut.geojson"
C0275, C0377, C0540 = (f"ID-WOOD-CONCESSION-{n}" for n in ("0275", "0377", "0540"))
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


def record(url, acquired_at, matches, version=2, lat_e5=-358175, frp_e2=520, **sealed):
    """Stores a hotspot with its (concession ID, inside, edge_m) matches; returns its record ID."""
    n = next(_ids)
    record_id = bytes([n]) * 32
    with psycopg.connect(url) as conn:
        (hotspot_id,) = conn.execute(
            "INSERT INTO hotspots (record_id, source, lat_e5, lon_e5, acquired_at, frp_e2,"
            " confidence, fingerprint_version, map_version, tx_hash, sealed_at)"
            " VALUES (%s, 'VIIRS_NOAA20_NRT', %s, %s, %s, %s, 'n', %s, %s, %s, %s) RETURNING id",
            (
                record_id, lat_e5, 10571567 + n, acquired_at, frp_e2, version,
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
    }
    assert body["hotspots"][1]["tx_hash"] is None and body["hotspots"][1]["sealed_at"] is None
    assert body["hotspots"][4]["concessions"] == [
        {"id": C0275, "inside": True, "edge_m": 2000},
        {"id": C0377, "inside": False, "edge_m": 100},
    ]


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

    assert (body["inside"], body["near"], body["hotspots"]) == (0, 0, [])


def test_unknown_concession_is_404(client):
    response = client.get("/api/concessions/ID-WOOD-CONCESSION-9999", params=RANGE)

    assert response.status_code == 404


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
