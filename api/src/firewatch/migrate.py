"""Apply or roll back the numbered SQL files in api/migrations (D10).

Usage: python -m firewatch.migrate up|down
"""

import sys
from pathlib import Path

from firewatch.db import connect

MIGRATIONS = Path(__file__).parents[2] / "migrations"
TRACKING = """CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
)"""


def _versions() -> list[str]:
    return sorted(p.name.removesuffix(".up.sql") for p in MIGRATIONS.glob("*.up.sql"))


def up(url: str | None = None) -> list[str]:
    applied_now = []
    with connect(url) as conn:
        conn.execute(TRACKING)
        applied = {r["version"] for r in conn.execute("SELECT version FROM schema_migrations")}
        for version in _versions():
            if version in applied:
                continue
            with conn.transaction():
                conn.execute((MIGRATIONS / f"{version}.up.sql").read_text())
                conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (version,))
            applied_now.append(version)
    return applied_now


def down(url: str | None = None) -> str | None:
    with connect(url) as conn:
        conn.execute(TRACKING)
        newest = conn.execute(
            "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"
        ).fetchone()
        if newest is None:
            return None
        version = newest["version"]
        conn.execute((MIGRATIONS / f"{version}.down.sql").read_text())
        conn.execute("DELETE FROM schema_migrations WHERE version = %s", (version,))
    return version


def main(argv: list[str]) -> int:
    if argv not in (["up"], ["down"]):
        print("usage: python -m firewatch.migrate up|down", file=sys.stderr)
        return 2
    if argv == ["up"]:
        applied = up()
        print("\n".join(f"Applied {v}" for v in applied) or "Nothing to apply")
    else:
        version = down()
        print(f"Rolled back {version}" if version else "Nothing to roll back")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
