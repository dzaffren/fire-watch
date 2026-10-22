import itertools
import json
import logging
import math
from datetime import datetime, timezone
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient

from firewatch import concessions, firms, peat, record_hotspots
from firewatch.app import SIMPLIFY_DEGREES, create_app
from firewatch.concessions import MAP_VERSION
from firewatch.db import connect

SITE = "https://fire-watch.example"
FIXTURES = Path(__file__).parents[2] / "fixtures"
TRASE_CUT = FIXTURES / "concessions" / "trase-cut.geojson"
FIRE_ORIGIN = FIXTURES / "firms" / "fire-origin.csv"
PEAT_CUT = FIXTURES / "peat" / "peat-cut.geojson.gz"
PACK_0332 = FIXTURES.parent / "web" / "public" / "case" / "pack-0332.json"
C0275, C0332, C0377, C0540 = (
    f"ID-WOOD-CONCESSION-{n}" for n in ("0275", "0332", "0377", "0540")
)
RANGE = {"from": "2026-10-11", "to": "2026-10-14"}
DETAIL_ONLY = ("hotspots", "as_of_unix", "forecasts", "forecasts_from_unix", "first_alone_h")
_ids = itertools.count(1)


@pytest.fixture
def db(migrated_db):
    concessions.load(TRASE_CUT.read_bytes(), migrated_db)
    return migrated_db


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", db)
    return TestClient(create_app(SITE))


@pytest.fixture
def peat_db(db):
    peat.load(PEAT_CUT.read_bytes(), db)
    return db


def record(
    url, acquired_at, matches, version=2, lat_e5=-358175, lon_e5=None, frp_e2=520,
    created_at=None, **sealed
):
    """Stores a hotspot with its (concession ID, inside, edge_m) matches; returns its record ID."""
    n = next(_ids)
    record_id = bytes([n]) * 32
    with psycopg.connect(url) as conn:
        (hotspot_id,) = conn.execute(
            "INSERT INTO hotspots (record_id, source, lat_e5, lon_e5, acquired_at, frp_e2,"
            " confidence, fingerprint_version, map_version, tx_hash, sealed_at, root_id, proof)"
            " VALUES (%s, 'VIIRS_NOAA20_NRT', %s, %s, %s, %s, 'n', %s, %s, %s, %s, %s, %s)"
            " RETURNING id",
            (
                record_id, lat_e5, 10571567 + n if lon_e5 is None else lon_e5,
                acquired_at, frp_e2, version,
                MAP_VERSION if version == 2 else None,
                sealed.get("tx_hash"), sealed.get("sealed_at"),
                sealed.get("root_id"), sealed.get("proof"),
            ),
        ).fetchone()
        if created_at is not None:
            conn.execute(
                "UPDATE hotspots SET created_at = %s WHERE id = %s", (created_at, hotspot_id)
            )
        for concession_id, inside, edge_m in matches:
            conn.execute(
                "INSERT INTO hotspot_concessions VALUES (%s, %s, %s, %s)",
                (hotspot_id, concession_id, inside, edge_m),
            )
    return "0x" + record_id.hex()


def forecast(
    url, concession_id, fire_key, after_pass_at, made_at, inside_by_at=None, outcome="waiting",
    **sealed
):
    """Stores a forecast for the fire keyed fire_key, inside by inside_by_at or not; returns its
    record ID."""
    n = next(_ids)
    record_id = bytes([n]) * 32
    points = (-310200, 11281200, -310150, 11281210) if inside_by_at else (None,) * 4
    with psycopg.connect(url) as conn:
        conn.execute(
            "INSERT INTO forecasts (record_id, concession_id, fire_key, after_pass_at, made_at,"
            " until_at, inside_by_at, from_lat_e5, from_lon_e5, crossing_lat_e5, crossing_lon_e5,"
            " rule_version, tx_hash, sealed_at, outcome, outcome_at, root_id, proof)"
            " VALUES (%s, %s, %s, %s, %s, %s::timestamptz + interval '48 hours', %s, %s, %s, %s,"
            " %s, 1, %s, %s, %s, %s, %s, %s)",
            (
                record_id, concession_id, bytes.fromhex(fire_key[2:]), after_pass_at, made_at,
                made_at, inside_by_at, *points, sealed.get("tx_hash"), sealed.get("sealed_at"),
                outcome, sealed.get("outcome_at"), sealed.get("root_id"), sealed.get("proof"),
            ),
        )
    return "0x" + record_id.hex()


def root(url, run=None, tx_hash=None, sealed_at=None):
    """Stores a run's root, sealed as run or not sent yet; returns its row ID."""
    with psycopg.connect(url) as conn:
        (root_id,) = conn.execute(
            "INSERT INTO roots (root, run, tx_hash, sealed_at) VALUES (%s, %s, %s, %s)"
            " RETURNING id",
            (bytes([next(_ids)]) * 32, run, tx_hash, sealed_at),
        ).fetchone()
    return root_id


def unix(at):
    return int(datetime.fromisoformat(at).timestamp())


def fire_origin(url, created_at="2026-10-17T09:00Z"):
    """Stores the 0332 fire of fire-origin scenario 1 as the recorder does; returns its key."""
    with connect(url) as conn:
        hotspots = firms.parse(FIRE_ORIGIN.read_text())
        new = record_hotspots.store(conn, record_hotspots.match(conn, hotspots))
        conn.execute("UPDATE hotspots SET created_at = %s", (created_at,))
    first = min(new, key=lambda h: (h["acquired_at"], h["lat_e5"], h["lon_e5"]))
    return "0x" + bytes(first["record_id"]).hex()


def pack_0332(url):
    """Stores the 283 detections of the landing's example pack, stored by 17 Oct 09:00 UTC and
    matched to 0332 only (0637 is not in the cut); returns the fire's key."""
    pack = json.loads(PACK_0332.read_text())
    with psycopg.connect(url) as conn:
        for h in pack["hotspots"]:
            (hotspot_id,) = conn.execute(
                "INSERT INTO hotspots (record_id, source, lat_e5, lon_e5, acquired_at, frp_e2,"
                " confidence, fingerprint_version, map_version, created_at)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s, 2, %s, '2026-10-17T09:00Z') RETURNING id",
                (
                    bytes.fromhex(h["record_id"][2:]), h["source"], h["lat_e5"], h["lon_e5"],
                    h["acquired_at"], h["frp_e2"], h["confidence"], h["map_version"],
                ),
            ).fetchone()
            for match in h["concessions"]:
                if match["id"] == C0332:
                    conn.execute(
                        "INSERT INTO hotspot_concessions VALUES (%s, %s, %s, %s)",
                        (hotspot_id, C0332, match["inside"], match["edge_m"]),
                    )
    return pack["key"]


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
        "forecast_inside_by_unix": None,
    }
    assert {h["record_id"]: h["fire_key"] for h in body["hotspots"]} == {
        **{r: largest[0] for r in largest},
        **{r: older[0] for r in older},
        **{r: newer[0] for r in newer},
        north: north,
        south: south,
    }


def test_concession_boundary_is_its_simplified_rings_holes_included(client, db):
    with psycopg.connect(db) as conn:
        polygons, rings = conn.execute(
            "SELECT ST_NumGeometries(boundary), ST_NRings(ST_SimplifyPreserveTopology(boundary, %s))"
            " FROM concessions WHERE id = %s",
            (SIMPLIFY_DEGREES, C0377),
        ).fetchone()

    boundary = client.get(f"/api/concessions/{C0377}", params=RANGE).json()["boundary"]

    # The holes too, so the page's inside tint leaves land the record calls outside untinted.
    assert polygons == 21 and rings > polygons
    assert len(boundary) == rings
    for ring in boundary:
        assert ring[0] == ring[-1]
        assert all(114.9 < lon < 116.2 and -4 < lat < -2.3 for lon, lat in ring)


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
    assert concession["fires"] == [
        {
            **{k: v for k, v in fire.items() if k not in DETAIL_ONLY},
            "forecast_inside_by_unix": None,
        }
    ]
    assert (fire["forecasts"], fire["forecasts_from_unix"]) == ([], None)
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
        "run": None,
        "proof": None,
        "pass": 1,
    }


def test_fire_lists_its_forecasts_newest_first(client, db):
    first = record(db, "2026-10-13T17:37Z", [(C0332, False, 954)], lat_e5=-310000, lon_e5=11281000)
    record(db, "2026-10-14T06:18Z", [(C0332, False, 731)], lat_e5=-310100, lon_e5=11281100)
    record(db, "2026-10-14T17:20Z", [(C0332, False, 32)], lat_e5=-310200, lon_e5=11281200)
    elsewhere = record(db, "2026-10-13T06:18Z", [(C0377, False, 500)], lat_e5=-400000)
    forecast(db, C0377, elsewhere, "2026-10-13T06:18Z", "2026-10-13T09:00Z")
    forecast(db, C0377, first, "2026-10-13T17:37Z", "2026-10-13T20:00Z")
    said_no = forecast(db, C0332, first, "2026-10-13T17:37Z", "2026-10-13T20:00Z")
    said_06_18 = forecast(
        db, C0332, first, "2026-10-14T06:18Z", "2026-10-14T09:00Z", "2026-10-15T06:18Z"
    )
    newest = forecast(
        db, C0332, first, "2026-10-14T17:20Z", "2026-10-14T20:00Z", "2026-10-15T05:20Z",
        tx_hash=b"\xef" * 32, sealed_at="2026-10-14T20:02Z",
    )

    fire = client.get(f"/api/concessions/{C0332}/fires/{first}").json()

    assert [f["record_id"] for f in fire["forecasts"]] == [newest, said_06_18, said_no]
    assert fire["forecasts_from_unix"] == unix("2026-10-13T09:00Z")
    assert fire["forecasts"][0] == {
        "record_id": newest,
        "concession_id": C0332,
        "fire_key": first,
        "after_pass_unix": unix("2026-10-14T17:20Z"),
        "made_unix": unix("2026-10-14T20:00Z"),
        "until_unix": unix("2026-10-16T20:00Z"),
        "inside_by_unix": unix("2026-10-15T05:20Z"),
        "from": {"lat_e5": -310200, "lon_e5": 11281200},
        "crossing": {"lat_e5": -310150, "lon_e5": 11281210},
        "rule_version": 1,
        "tx_hash": "0x" + "ef" * 32,
        "sealed_at": "2026-10-14T20:02:00Z",
        "outcome": "waiting",
        "outcome_unix": None,
        "run": None,
        "proof": None,
    }
    assert {k: fire["forecasts"][2][k] for k in ("inside_by_unix", "from", "crossing")} == {
        "inside_by_unix": None, "from": None, "crossing": None,
    }


def test_fire_sends_run_and_proof_only_for_a_record_in_a_sealed_root(client, db):
    tx_hash, sealed_at = b"\xab" * 32, "2026-10-14T20:02:05Z"
    sealed_root = root(db, run=7, tx_hash=tx_hash, sealed_at=sealed_at)
    unsent = root(db)
    in_root = record(
        db, "2026-10-13T17:37Z", [(C0332, False, 954)], lat_e5=-310000, lon_e5=11281000,
        root_id=sealed_root, proof=[b"\x11" * 32, b"\x22" * 32], tx_hash=tx_hash,
        sealed_at=sealed_at,
    )
    on_fire_records = record(
        db, "2026-10-14T06:18Z", [(C0332, False, 731)], lat_e5=-310100, lon_e5=11281100,
        tx_hash=b"\xcd" * 32, sealed_at="2026-10-14T07:00Z",
    )
    in_unsent_root = record(
        db, "2026-10-14T17:20Z", [(C0332, False, 32)], lat_e5=-310200, lon_e5=11281200,
        root_id=unsent, proof=[b"\x33" * 32],
    )
    forecast_in_root = forecast(
        db, C0332, in_root, "2026-10-14T17:20Z", "2026-10-14T20:00Z", root_id=sealed_root,
        proof=[b"\x44" * 32], tx_hash=tx_hash, sealed_at=sealed_at,
    )
    forecast_in_unsent_root = forecast(
        db, C0332, in_root, "2026-10-14T06:18Z", "2026-10-14T09:00Z", root_id=unsent, proof=[],
    )
    forecast_on_fire_records = forecast(
        db, C0332, in_root, "2026-10-13T17:37Z", "2026-10-13T20:00Z",
        tx_hash=b"\xef" * 32, sealed_at="2026-10-13T20:01Z",
    )
    path = f"/api/concessions/{C0332}/fires/{in_root}"
    as_of = math.ceil(datetime.now(timezone.utc).timestamp())

    fire = client.get(path).json()
    pack = client.get(path, params={"as_of": as_of}).json()

    for body in (fire, pack):
        hotspots = {h["record_id"]: h for h in body["hotspots"]}
        assert {k: hotspots[in_root][k] for k in ("run", "proof", "tx_hash", "sealed_at")} == {
            "run": 7,
            "proof": ["0x" + "11" * 32, "0x" + "22" * 32],
            "tx_hash": "0x" + "ab" * 32,
            "sealed_at": sealed_at,
        }
        for record_id in (on_fire_records, in_unsent_root):
            assert (hotspots[record_id]["run"], hotspots[record_id]["proof"]) == (None, None)
    made = {f["record_id"]: f for f in fire["forecasts"]}
    assert (made[forecast_in_root]["run"], made[forecast_in_root]["proof"]) == (
        7, ["0x" + "44" * 32],
    )
    for record_id in (forecast_in_unsent_root, forecast_on_fire_records):
        assert (made[record_id]["run"], made[record_id]["proof"]) == (None, None)


def test_concession_records_have_no_run_or_proof(client, db):
    tx_hash, sealed_at = b"\xab" * 32, "2026-10-14T08:00:05Z"
    sealed_root = root(db, run=3, tx_hash=tx_hash, sealed_at=sealed_at)
    record(
        db, "2026-10-14T06:18Z", [(C0377, True, 50)], root_id=sealed_root,
        proof=[b"\x11" * 32], tx_hash=tx_hash, sealed_at=sealed_at,
    )

    (hotspot,) = client.get(f"/api/concessions/{C0377}", params=RANGE).json()["hotspots"]

    assert hotspot["tx_hash"] == "0x" + "ab" * 32
    assert "run" not in hotspot and "proof" not in hotspot


def test_fire_lists_forecasts_of_fires_that_joined_it(client, db):
    older = record(db, "2026-10-13T06:00Z", [(C0332, False, 900)], lat_e5=-310000, lon_e5=11281000)
    newer = record(db, "2026-10-14T06:00Z", [(C0332, False, 2501)], lat_e5=-311400, lon_e5=11281000)
    joined = forecast(
        db, C0332, newer, "2026-10-14T06:00Z", "2026-10-14T09:00Z", outcome="joined"
    )
    record(db, "2026-10-14T18:00Z", [(C0332, False, 1185)], lat_e5=-310700, lon_e5=11281000)

    fire = client.get(f"/api/concessions/{C0332}/fires/{older}").json()

    assert [(f["record_id"], f["fire_key"], f["outcome"]) for f in fire["forecasts"]] == [
        (joined, newer, "joined"),
    ]


def test_pack_has_no_forecasts(client, db):
    first = record(db, "2026-10-13T17:37Z", [(C0332, False, 954)], created_at="2026-10-14T09:00Z")
    forecast(db, C0332, first, "2026-10-13T17:37Z", "2026-10-13T20:00Z")

    pack = client.get(
        f"/api/concessions/{C0332}/fires/{first}", params={"as_of": unix("2026-10-14T09:00Z")}
    ).json()

    assert "forecasts" not in pack and "forecasts_from_unix" not in pack


def test_concession_ranks_forecast_inside_fires_first(client, db):
    def fire(at, lat_e5, size=1):
        return [
            record(db, at, [(C0540, False, 1500)], lat_e5=lat_e5, lon_e5=10600000 + i)
            for i in range(size)
        ][0]

    biggest = fire("2026-10-12T06:18Z", -300000, size=3)
    in_small = fire("2026-10-13T06:18Z", -310000)
    in_big = fire("2026-10-12T18:00Z", -320000, size=2)
    said_no = fire("2026-10-13T18:00Z", -330000)
    decided = fire("2026-10-14T06:18Z", -340000)
    # A late row of its pass sorted first and became the fire's key after its forecast was made.
    keyed = fire("2026-10-14T18:00Z", -350000)
    moved = record(db, "2026-10-14T18:00Z", [(C0540, False, 1500)], lat_e5=-350100, lon_e5=10600000)
    forecast(db, C0540, in_small, "2026-10-13T06:18Z", "2026-10-13T09:00Z", "2026-10-14T06:00Z")
    forecast(db, C0540, in_big, "2026-10-12T18:00Z", "2026-10-12T20:00Z", "2026-10-13T18:00Z")
    forecast(db, C0540, said_no, "2026-10-13T06:18Z", "2026-10-13T09:00Z", "2026-10-14T06:00Z")
    forecast(db, C0540, said_no, "2026-10-13T18:00Z", "2026-10-13T20:00Z")
    forecast(
        db, C0540, decided, "2026-10-14T06:18Z", "2026-10-14T09:00Z", "2026-10-14T18:00Z",
        outcome="not_seen_inside",
    )
    forecast(db, C0540, keyed, "2026-10-14T18:00Z", "2026-10-14T20:00Z", "2026-10-15T06:00Z")

    fires = client.get(f"/api/concessions/{C0540}", params=RANGE).json()["fires"]

    assert [(f["key"], f["forecast_inside_by_unix"]) for f in fires] == [
        (moved, unix("2026-10-15T06:00Z")),
        (in_big, unix("2026-10-13T18:00Z")),
        (in_small, unix("2026-10-14T06:00Z")),
        (biggest, None),
        (decided, None),
        (said_no, None),
    ]


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
    "newest, as_of",
    [("2026-10-17T09:00:01.4Z", "2026-10-17T09:00:02Z"), ("2026-10-17T09:00:01Z", "2026-10-17T09:00:01Z")],
    ids=["part second rounds up", "whole second stays"],
)
def test_fire_answers_as_of_the_newest_stored_detection(client, db, newest, as_of):
    first = record(db, "2026-10-13T17:37Z", [(C0332, False, 954)], created_at="2026-10-14T09:00Z")
    record(db, "2026-10-16T18:00Z", [(C0540, True, 3099)], created_at=newest)
    record(db, "2026-10-16T18:00Z", [], version=1, created_at="2026-10-17T10:00Z")

    response = client.get(f"/api/concessions/{C0332}/fires/{first}")

    assert response.status_code == 200
    assert response.json()["as_of_unix"] == unix(as_of)
    assert "province" not in response.json()


def test_pack_leaves_out_detections_stored_after_it(client, db):
    first = record(
        db, "2026-10-13T17:37Z", [(C0332, False, 954)],
        lat_e5=-310000, lon_e5=11281000, created_at="2026-10-14T09:00Z",
    )
    record(
        db, "2026-10-14T06:18Z", [(C0332, False, 731)],
        lat_e5=-310100, lon_e5=11281100, created_at="2026-10-14T09:00Z",
    )
    record(
        db, "2026-10-15T18:43Z", [(C0332, True, 804)],
        lat_e5=-310300, lon_e5=11281700, created_at="2026-10-16T09:00Z",
    )
    made = client.get(f"/api/concessions/{C0332}/fires/{first}").json()
    record(
        db, "2026-10-16T10:00Z", [(C0332, True, 500)],
        lat_e5=-310200, lon_e5=11281200, created_at="2026-10-16T11:00Z",
    )

    live = client.get(f"/api/concessions/{C0332}/fires/{first}").json()
    pack = client.get(
        f"/api/concessions/{C0332}/fires/{first}", params={"as_of": made["as_of_unix"]}
    ).json()

    assert made["as_of_unix"] == unix("2026-10-16T09:00Z")
    assert (live["passes"], live["detections"]) == (4, 4)
    assert {k: pack[k] for k in made if k not in DETAIL_ONLY[2:4]} == {
        k: v for k, v in made.items() if k not in DETAIL_ONLY[2:4]
    }


def test_pack_keeps_its_key_after_a_join_to_an_older_fire(client, db):
    record(
        db, "2026-10-13T06:00Z", [(C0332, False, 900)],
        lat_e5=-310000, lon_e5=11281000, created_at="2026-10-13T09:00Z",
    )
    newer = record(
        db, "2026-10-14T06:00Z", [(C0332, False, 700)],
        lat_e5=-311400, lon_e5=11281000, created_at="2026-10-15T09:00Z",
    )
    made = client.get(f"/api/concessions/{C0332}/fires/{newer}").json()
    record(
        db, "2026-10-14T18:00Z", [(C0332, False, 800)],
        lat_e5=-310700, lon_e5=11281000, created_at="2026-10-16T10:00Z",
    )

    live = client.get(f"/api/concessions/{C0332}/fires/{newer}")
    pack = client.get(
        f"/api/concessions/{C0332}/fires/{newer}", params={"as_of": made["as_of_unix"]}
    )

    assert live.status_code == 404
    assert pack.status_code == 200
    assert {k: pack.json()[k] for k in made if k not in DETAIL_ONLY[2:4]} == {
        k: v for k, v in made.items() if k not in DETAIL_ONLY[2:4]
    }


def test_pack_has_its_concession_map_and_rule(client, db):
    first = record(db, "2026-10-13T17:37Z", [(C0332, False, 954)], created_at="2026-10-14T09:00Z")
    as_of = unix("2026-10-14T09:00Z")

    pack = client.get(f"/api/concessions/{C0332}/fires/{first}", params={"as_of": as_of}).json()
    concession = client.get(f"/api/concessions/{C0332}", params=RANGE).json()

    assert {k: pack[k] for k in ("concession_id", "province", "map_version", "rule_version")} == {
        "concession_id": C0332,
        "province": "Kalimantan Tengah",
        "map_version": MAP_VERSION,
        "rule_version": 2,
    }
    assert pack["boundary"] == concession["boundary"] and len(pack["boundary"]) > 0
    assert (pack["key"], pack["as_of_unix"], pack["detections"]) == (first, as_of, 1)


def test_future_as_of_is_422(client, db):
    first = record(db, "2026-10-13T17:37Z", [(C0332, False, 954)], created_at="2026-10-14T09:00Z")
    url = f"/api/concessions/{C0332}/fires/{first}"
    now = int(datetime.now(timezone.utc).timestamp())

    assert client.get(url, params={"as_of": now}).status_code == 200
    for as_of in (now + 60, 0, "1792227602.5"):
        assert client.get(url, params={"as_of": as_of}).status_code == 422


def test_as_of_before_any_record_is_404(client, db):
    key = "0x" + "ab" * 32
    assert client.get(f"/api/concessions/{C0332}/fires/{key}").status_code == 404

    first = record(db, "2026-10-13T17:37Z", [(C0332, False, 954)], created_at="2026-10-14T09:00Z")
    url = f"/api/concessions/{C0332}/fires/{first}"

    assert client.get(url, params={"as_of": unix("2026-10-14T08:59:59Z")}).status_code == 404
    assert client.get(url, params={"as_of": unix("2026-10-14T09:00Z")}).status_code == 200
    unknown = f"/api/concessions/ID-WOOD-CONCESSION-9999/fires/{first}"
    assert client.get(unknown, params={"as_of": unix("2026-10-14T09:00Z")}).status_code == 404


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
    key = record(db, "2026-10-14T06:18Z", [(C0540, False, 300)], lat_e5=-300000)
    forecast(db, C0540, key, "2026-10-14T06:18Z", "2026-10-14T09:00Z")
    forecast(
        db, C0540, key, "2026-10-14T05:00Z", "2026-10-14T08:00Z",
        tx_hash=b"\x02" * 32, sealed_at="2026-10-14T08:02Z",
    )
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
            "unsealed": 4,
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


# The parts the plan's query gives for the 0332 fire on the compose database (scenario 4).
DAMAGE_0332 = {
    "inside_peat_ha": 59.21, "inside_other_ha": 0.0,
    "outside_peat_ha": 144.31, "outside_other_ha": 6.3,
}


def test_fire_damage_splits_at_the_edge(client, peat_db, caplog):
    key = fire_origin(peat_db)

    with caplog.at_level(logging.INFO, logger="firewatch.app"):
        fire = client.get(f"/api/concessions/{C0332}/fires/{key}").json()

    assert (fire["detections"], fire["passes"]) == (19, 4)
    assert fire["damage"] == DAMAGE_0332
    assert "detections=19" in caplog.text and "damage_ms=" in caplog.text


def test_fire_damage_off_peat(client, peat_db):
    b = record(
        peat_db, "2026-10-14T06:18Z", [(C0377, False, 371), (C0275, False, 1019)],
        lat_e5=-367525, lon_e5=11535328,
    )

    fire = client.get(f"/api/concessions/{C0377}/fires/{b}").json()

    assert fire["damage"] == {
        "inside_peat_ha": 0.0, "inside_other_ha": 0.0,
        "outside_peat_ha": 0.0, "outside_other_ha": 14.06,
    }


def test_pack_damage_holds_at_its_cut(client, peat_db):
    key = fire_origin(peat_db, created_at="2026-10-17T09:00Z")
    made = client.get(f"/api/concessions/{C0332}/fires/{key}").json()
    for lat_e5, lon_e5 in [(-283100, 11271900), (-283050, 11272250), (-282800, 11271700)]:
        record(
            peat_db, "2026-10-17T18:20Z", [(C0332, True, 900)],
            lat_e5=lat_e5, lon_e5=lon_e5, created_at="2026-10-17T21:00Z",
        )

    pack = client.get(
        f"/api/concessions/{C0332}/fires/{key}", params={"as_of": made["as_of_unix"]}
    ).json()
    live = client.get(f"/api/concessions/{C0332}/fires/{key}").json()

    assert made["as_of_unix"] == unix("2026-10-17T09:00Z")
    assert made["damage"] == pack["damage"] == DAMAGE_0332
    assert live["detections"] == 22
    assert sum(live["damage"].values()) > sum(DAMAGE_0332.values())


def test_no_damage_without_peat(client, db):
    key = fire_origin(db)

    fire = client.get(f"/api/concessions/{C0332}/fires/{key}").json()
    pack = client.get(
        f"/api/concessions/{C0332}/fires/{key}", params={"as_of": fire["as_of_unix"]}
    ).json()

    assert fire["detections"] == 19
    assert "damage" not in fire and "damage" not in pack


def test_fire_says_its_first_sighting_was_one_detection_alone(client, db, caplog):
    key = pack_0332(db)

    with caplog.at_level(logging.INFO, logger="firewatch.app"):
        pack = client.get(
            f"/api/concessions/{C0332}/fires/{key}", params={"as_of": unix("2026-10-17T09:00Z")}
        ).json()
    concession = client.get(
        f"/api/concessions/{C0332}", params={"from": "2026-10-12", "to": "2026-10-17"}
    ).json()

    assert (pack["detections"], pack["passes"], pack["first_alone_h"]) == (283, 8, 25)
    assert "first_alone_h=25" in caplog.text
    (listed,) = concession["fires"]
    assert listed["key"] == key
    assert "first_alone_h" not in listed and "joined" not in listed
