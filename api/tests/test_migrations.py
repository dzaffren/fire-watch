import psycopg

from firewatch import migrate


def _tables(url):
    with psycopg.connect(url) as conn:
        rows = conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        ).fetchall()
    return {name for (name,) in rows}


def _applied(url):
    with psycopg.connect(url) as conn:
        return [v for (v,) in conn.execute("SELECT version FROM schema_migrations ORDER BY version")]


def test_up_down_up(database_url):
    migrate.up(database_url)
    migrate.up(database_url)
    assert "hotspots" in _tables(database_url)
    assert _applied(database_url) == ["001_hotspots"]

    assert migrate.down(database_url) == "001_hotspots"
    assert "hotspots" not in _tables(database_url)
    assert _applied(database_url) == []
    assert migrate.down(database_url) is None

    migrate.up(database_url)
    assert "hotspots" in _tables(database_url)
    assert _applied(database_url) == ["001_hotspots"]
    migrate.down(database_url)


def test_hotspots_rejects_a_second_row_for_the_same_hotspot(migrated_db):
    insert = (
        "INSERT INTO hotspots (record_id, source, lat_e5, lon_e5, acquired_at, frp_e2, confidence)"
        " VALUES (%s, 'VIIRS_NOAA20_NRT', 43120, 10121540, '2026-10-12T06:18Z', 1420, 'n')"
        " ON CONFLICT DO NOTHING"
    )
    with psycopg.connect(migrated_db) as conn:
        conn.execute(insert, (b"\x01" * 32,))
        conn.execute(insert, (b"\x02" * 32,))
        assert conn.execute("SELECT count(*) FROM hotspots").fetchone() == (1,)
