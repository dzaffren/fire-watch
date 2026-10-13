import psycopg
import pytest

from firewatch import migrate

SERVER_URL = "postgresql://firewatch:firewatch@127.0.0.1:55432"
TEST_DB = "firewatch_test"


def _admin(sql):
    with psycopg.connect(f"{SERVER_URL}/firewatch", autocommit=True) as conn:
        conn.execute(sql)


@pytest.fixture(scope="session")
def database_url():
    _admin(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
    _admin(f"CREATE DATABASE {TEST_DB}")
    yield f"{SERVER_URL}/{TEST_DB}"
    _admin(f"DROP DATABASE {TEST_DB} WITH (FORCE)")


@pytest.fixture
def migrated_db(database_url):
    migrate.up(database_url)
    yield database_url
    while migrate.down(database_url):
        pass
