"""record-hotspots: store FIRMS hotspots on or near a pulpwood concession, then seal each.

Records and their matches are stored before the chain is touched, and each seal is committed
on its own, so a crash or an empty wallet leaves records with no tx_hash that the next run
seals (D15, D19).
"""

import os
import secrets
import sys
import time
from datetime import datetime, timezone

from firewatch import firms
from firewatch.chain import Chain
from firewatch.concessions import MAP_VERSION
from firewatch.db import connect
from firewatch.fingerprint import fingerprint_v2, record_fields_v2

# Any fixed number, the same for every run, so only one run records at a time.
LOCK_KEY = 4_120_540
# A run started on the hour must finish before the next one starts (D19).
SEAL_BUDGET_SECONDS = 40 * 60
REACH_M = 5000

HAS_RECORDS = "SELECT EXISTS (SELECT 1 FROM hotspots WHERE fingerprint_version = 2) AS found"
MATCH = """
SELECT p.i, c.id, ST_Covers(c.boundary, p.geom) AS inside,
       round(ST_Distance(ST_Boundary(c.boundary)::geography, p.geom::geography))::integer
           AS edge_m
FROM (
    SELECT u.i, ST_SetSRID(ST_MakePoint(u.lon_e5 / 1e5, u.lat_e5 / 1e5), 4326) AS geom
    FROM unnest(%(lon_e5)s::integer[], %(lat_e5)s::integer[]) WITH ORDINALITY
        AS u (lon_e5, lat_e5, i)
) p
JOIN concessions c ON ST_DWithin(c.boundary::geography, p.geom::geography, %(reach_m)s)
"""
INSERT = """
INSERT INTO hotspots (record_id, source, lat_e5, lon_e5, acquired_at, frp_e2, confidence,
                      fingerprint_version, map_version)
SELECT u.*, 2, %(map_version)s
FROM unnest(%(record_id)s::bytea[], %(source)s::text[], %(lat_e5)s::integer[],
            %(lon_e5)s::integer[], %(acquired_at)s::timestamptz[], %(frp_e2)s::integer[],
            %(confidence)s::text[]) AS u
ON CONFLICT (source, lat_e5, lon_e5, acquired_at) DO NOTHING
RETURNING id, source, lat_e5, lon_e5, acquired_at
"""
INSERT_MATCHES = """
INSERT INTO hotspot_concessions (hotspot_id, concession_id, inside, edge_m)
SELECT * FROM unnest(%(hotspot_id)s::bigint[], %(concession_id)s::text[],
                     %(inside)s::boolean[], %(edge_m)s::integer[])
"""
UNSEALED = """
SELECT h.*, json_agg(json_build_object('id', m.concession_id, 'inside', m.inside,
                                       'edge_m', m.edge_m)) AS concessions
FROM hotspots h JOIN hotspot_concessions m ON m.hotspot_id = h.id
WHERE h.fingerprint_version = 2 AND h.tx_hash IS NULL
GROUP BY h.id
ORDER BY h.acquired_at, h.id
"""
COUNT_UNSEALED = """
SELECT count(*) AS unsealed FROM hotspots WHERE fingerprint_version = 2 AND tx_hash IS NULL
"""
INSERT_RUN = """
INSERT INTO recorder_runs (started_at, finished_at, kept, sealed, unsealed, error)
VALUES (%(started_at)s, %(finished_at)s, %(kept)s, %(sealed)s, %(unsealed)s, %(error)s)
"""


def _key(h) -> tuple:
    return (h["source"], h["lat_e5"], h["lon_e5"], h["acquired_at"])


def match(conn, hotspots: list[firms.Hotspot]) -> list[tuple[firms.Hotspot, list[dict]]]:
    """Each hotspot within REACH_M of a concession, with every concession in reach."""
    found: dict[int, list[dict]] = {}
    for m in conn.execute(
        MATCH,
        {
            "lon_e5": [h.lon_e5 for h in hotspots],
            "lat_e5": [h.lat_e5 for h in hotspots],
            "reach_m": REACH_M,
        },
    ):
        found.setdefault(m["i"] - 1, []).append(
            {"id": m["id"], "inside": m["inside"], "edge_m": m["edge_m"]}
        )
    return [(hotspots[i], found[i]) for i in sorted(found)]


def store(conn, kept: list[tuple[firms.Hotspot, list[dict]]]) -> int:
    """Inserts the hotspots not stored yet, and their matches; returns how many were new."""
    hotspots = [vars(h) for h, _ in kept]
    columns = ["source", "lat_e5", "lon_e5", "acquired_at", "frp_e2", "confidence"]
    new = conn.execute(
        INSERT,
        {
            **{c: [h[c] for h in hotspots] for c in columns},
            "record_id": [secrets.token_bytes(32) for _ in hotspots],
            "map_version": MAP_VERSION,
        },
    ).fetchall()
    matches = {_key(vars(h)): ms for h, ms in kept}
    rows = [(row["id"], m) for row in new for m in matches[_key(row)]]
    conn.execute(
        INSERT_MATCHES,
        {
            "hotspot_id": [hotspot_id for hotspot_id, _ in rows],
            "concession_id": [m["id"] for _, m in rows],
            "inside": [m["inside"] for _, m in rows],
            "edge_m": [m["edge_m"] for _, m in rows],
        },
    )
    return len(new)


def _seal(conn, chain: Chain, counts: dict, clock, deadline: float) -> None:
    for row in conn.execute(UNSEALED).fetchall():
        if clock() >= deadline:
            return
        record_id = bytes(row["record_id"])
        sealed_at = chain.sealed(record_id)
        if sealed_at is None:
            fingerprint = fingerprint_v2(**record_fields_v2(row, row["concessions"]))
            tx_hash, sealed_at = chain.seal(record_id, fingerprint)
        else:
            tx_hash = chain.seal_tx_hash(record_id)
        conn.execute(
            "UPDATE hotspots SET tx_hash = %s, sealed_at = %s WHERE id = %s",
            (tx_hash, sealed_at, row["id"]),
        )
        conn.commit()
        counts["sealed"] += 1


def main(clock=time.monotonic) -> int:
    started_at = datetime.now(timezone.utc)
    deadline = clock() + SEAL_BUDGET_SECONDS
    counts = {"fetched": 0, "kept": 0, "new": 0, "sealed": 0}
    balance = None
    error = None
    with connect() as conn:
        locked = conn.execute("SELECT pg_try_advisory_lock(%s) AS locked", (LOCK_KEY,))
        if not locked.fetchone()["locked"]:
            print("Another run is active")
            return 0
        try:
            first_run = not conn.execute(HAS_RECORDS).fetchone()["found"]
            fetched = firms.fetch(
                os.environ.get("FIRMS_BASE_URL", "https://firms.modaps.eosdis.nasa.gov"),
                os.environ["FIRMS_MAP_KEY"],
                firms.BACKFILL_DAYS if first_run else firms.DAYS,
            )
            # A hotspot listed twice would otherwise get its matches inserted twice.
            unique = {}
            for h in fetched:
                unique.setdefault(_key(vars(h)), h)
            kept = match(conn, list(unique.values()))
            counts.update(fetched=len(fetched), kept=len(kept), new=store(conn, kept))
            conn.commit()

            chain = Chain(
                os.environ["RPC_URL"],
                os.environ["CONTRACT_ADDRESS"],
                os.environ["RECORDER_PRIVATE_KEY"],
            )
            balance = chain.balance_eth()
            _seal(conn, chain, counts, clock, deadline)
        except Exception as e:
            conn.rollback()
            error = f"{type(e).__name__}: {e}"
        unsealed = conn.execute(COUNT_UNSEALED).fetchone()["unsealed"]
        conn.execute(
            INSERT_RUN,
            {
                "started_at": started_at,
                "finished_at": datetime.now(timezone.utc),
                "kept": counts["kept"],
                "sealed": counts["sealed"],
                "unsealed": unsealed,
                "error": error,
            },
        )
    print(
        f"recorded fetched={counts['fetched']} kept={counts['kept']} new={counts['new']}"
        f" sealed={counts['sealed']} unsealed={unsealed}"
        f" balance_eth={'unknown' if balance is None else f'{balance:.4f}'}"
    )
    if error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
