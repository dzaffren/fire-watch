import logging

import psycopg
import pytest
from fastapi.testclient import TestClient

from firewatch.app import create_app

SITE = "https://fire-watch.example"
RECORD_ID = bytes.fromhex("ab" * 32)
TX_HASH = bytes.fromhex("cd" * 32)


@pytest.fixture
def client(migrated_db, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", migrated_db)
    return TestClient(create_app(SITE))


def insert(url, record_id, acquired_at, lon_e5=10121540, tx_hash=None, sealed_at=None):
    with psycopg.connect(url) as conn:
        conn.execute(
            "INSERT INTO hotspots"
            " (record_id, source, lat_e5, lon_e5, acquired_at, frp_e2, confidence, tx_hash, sealed_at)"
            " VALUES (%s, 'VIIRS_NOAA20_NRT', 43120, %s, %s, 1420, 'n', %s, %s)",
            (record_id, lon_e5, acquired_at, tx_hash, sealed_at),
        )


def test_latest_returns_the_newest_sealed_record(client, migrated_db, caplog):
    insert(migrated_db, b"\x01" * 32, "2026-10-11T23:59Z")
    insert(migrated_db, RECORD_ID, "2026-10-12T06:18Z", tx_hash=TX_HASH, sealed_at="2026-10-12T07:00:05Z")

    with caplog.at_level(logging.INFO):
        response = client.get("/api/hotspots/latest")

    assert response.status_code == 200
    assert response.json() == {
        "record_id": "0x" + "ab" * 32,
        "source": "VIIRS_NOAA20_NRT",
        "lat_e5": 43120,
        "lon_e5": 10121540,
        "acquired_at": "2026-10-12T06:18:00Z",
        "acquired_unix": 1791785880,
        "frp_e2": 1420,
        "confidence": "n",
        "tx_hash": "0x" + "cd" * 32,
        "sealed_at": "2026-10-12T07:00:05Z",
    }
    assert f"served hotspot record_id=0x{'ab' * 32} sealed=yes" in caplog.messages


def test_latest_unsealed_record_has_null_tx_hash(client, migrated_db, caplog):
    insert(migrated_db, RECORD_ID, "2026-10-12T06:18Z")

    with caplog.at_level(logging.INFO):
        body = client.get("/api/hotspots/latest").json()

    assert (body["tx_hash"], body["sealed_at"]) == (None, None)
    assert f"served hotspot record_id=0x{'ab' * 32} sealed=no" in caplog.messages


def test_latest_breaks_a_time_tie_by_newest_id(client, migrated_db):
    insert(migrated_db, b"\x01" * 32, "2026-10-12T06:18Z", lon_e5=10121540)
    insert(migrated_db, RECORD_ID, "2026-10-12T06:18Z", lon_e5=10123090)

    assert client.get("/api/hotspots/latest").json()["record_id"] == "0x" + "ab" * 32


def test_latest_is_404_when_nothing_is_recorded(client):
    response = client.get("/api/hotspots/latest")

    assert response.status_code == 404
    assert response.json() == {"detail": "No hotspot recorded yet"}


def test_health_reports_database_ok(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_reports_database_down(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://firewatch:firewatch@127.0.0.1:1/firewatch")

    response = TestClient(create_app(SITE)).get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"status": "error", "database": "down"}


def test_cors_allows_only_the_site_and_only_get(client):
    allowed = client.get("/api/health", headers={"Origin": SITE})
    other = client.get("/api/health", headers={"Origin": "https://elsewhere.example"})
    preflight_post = client.options(
        "/api/hotspots/latest",
        headers={"Origin": SITE, "Access-Control-Request-Method": "POST"},
    )

    assert allowed.headers["access-control-allow-origin"] == SITE
    assert "access-control-allow-origin" not in other.headers
    assert preflight_post.status_code == 400
