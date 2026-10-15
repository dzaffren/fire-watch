"""Time the recorder's match query on the real Trase map and a FIRMS CSV, and project table
sizes after 30 days of records (spec O6, O11).

Usage: uv run python scripts/measure_match.py <trase.geo.json> <firms.csv>

Migrates and fills the database in DATABASE_URL, so point it at a scratch one.
"""

import math
import sys
import time
from dataclasses import replace
from datetime import timedelta
from pathlib import Path

from firewatch import concessions, firms, migrate, record_hotspots
from firewatch.db import connect

SIMULATED_DAYS = 30
SIZES = """
SELECT relname, pg_total_relation_size(oid) AS bytes FROM pg_class
WHERE relname IN ('concessions', 'hotspots', 'hotspot_concessions') ORDER BY relname
"""


def _sizes(conn, label: str) -> None:
    rows = conn.execute(SIZES).fetchall()
    total = sum(r["bytes"] for r in rows)
    counts = conn.execute(
        "SELECT (SELECT count(*) FROM hotspots) AS hotspots,"
        " (SELECT count(*) FROM hotspot_concessions) AS matches"
    ).fetchone()
    print(f"{label}: {counts['hotspots']} records, {counts['matches']} matches")
    for r in rows:
        print(f"  {r['relname']}: {r['bytes'] / 2**20:.1f} MiB")
    print(f"  total: {total / 2**20:.1f} MiB")


def main(trase: str, csv: str) -> int:
    migrate.up()
    loaded = concessions.load(Path(trase).read_bytes())
    hotspots = firms.parse(Path(csv).read_text())
    dates = {h.acquired_at.date() for h in hotspots}
    span = (max(dates) - min(dates)).days + 1
    with connect() as conn:
        conn.execute("ANALYZE concessions")
        for attempt in ("first", "second"):
            started = time.perf_counter()
            kept = record_hotspots.match(conn, hotspots)
            seconds = time.perf_counter() - started
            print(
                f"match, {attempt} run: {len(hotspots)} hotspots over {span} days against"
                f" {loaded} concessions in {seconds:.2f} s; kept {len(kept)}"
            )

        record_hotspots.store(conn, kept)
        conn.commit()
        _sizes(conn, f"now, {span} days")

        copies = math.ceil(SIMULATED_DAYS / span)
        for copy in range(1, copies):
            shift = timedelta(days=span * copy)
            record_hotspots.store(
                conn, [(replace(h, acquired_at=h.acquired_at + shift), ms) for h, ms in kept]
            )
        conn.commit()
        _sizes(conn, f"after {span * copies} simulated days")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
