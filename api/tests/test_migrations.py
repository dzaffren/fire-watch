import psycopg

from firewatch import migrate

FIRE_RECORD_TABLES = {"concessions", "hotspot_concessions", "recorder_runs"}
READER_TABLES = FIRE_RECORD_TABLES | {"forecasts", "peat"}


def _tables(url):
    with psycopg.connect(url) as conn:
        rows = conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        ).fetchall()
    return {name for (name,) in rows}


def _hotspot_columns(url):
    with psycopg.connect(url) as conn:
        rows = conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'hotspots'"
        ).fetchall()
    return {name for (name,) in rows}


def _postgis(url):
    with psycopg.connect(url) as conn:
        return conn.execute("SELECT 1 FROM pg_extension WHERE extname = 'postgis'").fetchone()


def _applied(url):
    with psycopg.connect(url) as conn:
        return [v for (v,) in conn.execute("SELECT version FROM schema_migrations ORDER BY version")]


def _assert_up(url):
    assert {"hotspots", *READER_TABLES} <= _tables(url)
    assert {"fingerprint_version", "map_version"} <= _hotspot_columns(url)
    assert _postgis(url)
    assert _applied(url) == ["001_hotspots", "002_fire_record", "003_forecasts", "004_peat"]


def test_up_down_up(database_url):
    migrate.up(database_url)
    migrate.up(database_url)
    _assert_up(database_url)

    assert migrate.down(database_url) == "004_peat"
    assert "peat" not in _tables(database_url)
    assert "forecasts" in _tables(database_url)
    assert _applied(database_url) == ["001_hotspots", "002_fire_record", "003_forecasts"]

    assert migrate.down(database_url) == "003_forecasts"
    assert "forecasts" not in _tables(database_url)
    assert FIRE_RECORD_TABLES <= _tables(database_url)
    assert _applied(database_url) == ["001_hotspots", "002_fire_record"]

    assert migrate.down(database_url) == "002_fire_record"
    assert not FIRE_RECORD_TABLES & _tables(database_url)
    assert not {"fingerprint_version", "map_version"} & _hotspot_columns(database_url)
    assert not _postgis(database_url)
    assert _applied(database_url) == ["001_hotspots"]

    assert migrate.down(database_url) == "001_hotspots"
    assert "hotspots" not in _tables(database_url)
    assert _applied(database_url) == []
    assert migrate.down(database_url) is None

    migrate.up(database_url)
    _assert_up(database_url)
    while migrate.down(database_url):
        pass


def test_reader_role_can_read_the_new_tables(database_url):
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("CREATE ROLE firewatch_reader")
    try:
        migrate.up(database_url)
        with psycopg.connect(database_url) as conn:
            for table in READER_TABLES:
                assert conn.execute(
                    "SELECT has_table_privilege('firewatch_reader', %s, 'SELECT')", (table,)
                ).fetchone() == (True,)
    finally:
        while migrate.down(database_url):
            pass
        with psycopg.connect(database_url, autocommit=True) as conn:
            conn.execute("DROP ROLE firewatch_reader")


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


def test_skeleton_rows_stay_version_1(migrated_db):
    with psycopg.connect(migrated_db) as conn:
        conn.execute(
            "INSERT INTO hotspots (record_id, source, lat_e5, lon_e5, acquired_at, frp_e2, confidence)"
            " VALUES (%s, 'VIIRS_NOAA20_NRT', 43120, 10121540, '2026-10-12T06:18Z', 1420, 'n')",
            (b"\x01" * 32,),
        )
        assert conn.execute(
            "SELECT fingerprint_version, map_version FROM hotspots"
        ).fetchone() == (1, None)


def test_matches_go_with_their_hotspot(migrated_db):
    with psycopg.connect(migrated_db) as conn:
        conn.execute(
            "INSERT INTO concessions VALUES ('ID-WOOD-CONCESSION-0540', 'Sumatera Selatan',"
            " 251385, 'map', ST_Multi(ST_MakeEnvelope(105, -4, 106, -3, 4326)))"
        )
        (hotspot_id,) = conn.execute(
            "INSERT INTO hotspots (record_id, source, lat_e5, lon_e5, acquired_at, frp_e2,"
            " confidence, fingerprint_version, map_version)"
            " VALUES (%s, 'VIIRS_NOAA20_NRT', -358175, 10571567, '2026-10-14T06:18Z', 520, 'n',"
            " 2, 'map') RETURNING id",
            (b"\x01" * 32,),
        ).fetchone()
        conn.execute(
            "INSERT INTO hotspot_concessions VALUES (%s, 'ID-WOOD-CONCESSION-0540', true, 3099)",
            (hotspot_id,),
        )
        conn.execute("DELETE FROM hotspots")
        assert conn.execute("SELECT count(*) FROM hotspot_concessions").fetchone() == (0,)
