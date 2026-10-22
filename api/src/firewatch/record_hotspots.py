"""record-hotspots: store FIRMS hotspots on or near a pulpwood concession, forecast each fire
near a concession, then seal every record not sealed yet under one Merkle root on FireRuns.

Records and their matches are stored before the chain is touched, and a root and its proofs are
stored before the root is sent, so a crash or an empty wallet leaves records that the next run
seals (D15, D103, D110). Forecasts are made and settled by the chain's clock before the root is
made, so they seal with the run's hotspots (D50, D105).
"""

import os
import secrets
import sys
import time
from datetime import datetime, timezone

from firewatch import fires, firms, forecast
from firewatch.chain import Chain
from firewatch.concessions import MAP_VERSION
from firewatch.db import connect
from firewatch.fingerprint import (
    fingerprint_v2,
    forecast_fields,
    forecast_fingerprint,
    record_fields_v2,
)
from firewatch.merkle import leaf, tree

# Any fixed number, the same for every run, so only one run records at a time.
LOCK_KEY = 4_120_540
REACH_M = 5000
# More than 5 km anywhere in the Indonesia box, so the envelope test drops only concessions
# out of reach.
REACH_DEGREES = 0.05

HAS_RECORDS = "SELECT EXISTS (SELECT 1 FROM hotspots WHERE fingerprint_version = 2) AS found"
# Concession by concession, so PostGIS reuses each boundary's distance tree across hotspots:
# 15 times faster on 5 days of FIRMS rows than hotspot by hotspot. OFFSET 0 keeps the
# planner from turning the loop around.
MATCH = """
WITH points AS MATERIALIZED (
    SELECT u.i, g.geom, g.geom::geography AS point, ST_Expand(g.geom, %(reach_degrees)s) AS reach
    FROM unnest(%(lon_e5)s::integer[], %(lat_e5)s::integer[]) WITH ORDINALITY
        AS u (lon_e5, lat_e5, i)
    CROSS JOIN LATERAL (
        SELECT ST_SetSRID(ST_MakePoint(u.lon_e5 / 1e5, u.lat_e5 / 1e5), 4326) AS geom
    ) AS g
), maps AS MATERIALIZED (
    SELECT id, boundary, ST_Envelope(boundary) AS envelope, boundary::geography AS area,
           ST_Boundary(boundary)::geography AS edge
    FROM concessions
)
SELECT p.i, c.id, ST_Covers(c.boundary, p.geom) AS inside,
       round(ST_Distance(c.edge, p.point))::integer AS edge_m
FROM maps AS c
CROSS JOIN LATERAL (
    SELECT * FROM points
    WHERE c.envelope && points.reach AND ST_DWithin(c.area, points.point, %(reach_m)s)
    OFFSET 0
) AS p
"""
INSERT = """
INSERT INTO hotspots (record_id, source, lat_e5, lon_e5, acquired_at, frp_e2, confidence,
                      fingerprint_version, map_version)
SELECT u.*, 2, %(map_version)s
FROM unnest(%(record_id)s::bytea[], %(source)s::text[], %(lat_e5)s::integer[],
            %(lon_e5)s::integer[], %(acquired_at)s::timestamptz[], %(frp_e2)s::integer[],
            %(confidence)s::text[]) AS u
ON CONFLICT (source, lat_e5, lon_e5, acquired_at) DO NOTHING
RETURNING id, record_id, source, lat_e5, lon_e5, acquired_at
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
WHERE h.fingerprint_version = 2 AND h.tx_hash IS NULL AND h.root_id IS NULL
GROUP BY h.id
ORDER BY h.acquired_at, h.id
"""
UNSEALED_FORECASTS = """
SELECT * FROM forecasts WHERE tx_hash IS NULL AND root_id IS NULL ORDER BY made_at, id
"""
COUNT_UNSEALED = """
SELECT (SELECT count(*) FROM hotspots WHERE fingerprint_version = 2 AND tx_hash IS NULL)
       + (SELECT count(*) FROM forecasts WHERE tx_hash IS NULL) AS unsealed
"""
# The concessions a run's new hotspots matched, and those with a forecast still waiting.
TO_FORECAST = """
SELECT m.concession_id AS id
FROM hotspots h JOIN hotspot_concessions m ON m.hotspot_id = h.id
WHERE h.record_id = ANY(%(record_ids)s::bytea[])
UNION
SELECT concession_id FROM forecasts WHERE outcome = 'waiting'
ORDER BY id
"""
WAITING = "SELECT * FROM forecasts WHERE concession_id = %(id)s AND outcome = 'waiting'"
# The newest pass each fire key was forecast after, once this run's joins are stored.
FORECAST_PASSES = """
SELECT fire_key, max(after_pass_at) AS after_pass_at FROM forecasts
WHERE concession_id = %(id)s AND outcome <> 'joined'
GROUP BY fire_key
"""
STORED_AT = "SELECT created_at FROM hotspots WHERE record_id = %s"
SETTLE = "UPDATE forecasts SET outcome = %(outcome)s, outcome_at = %(at)s WHERE id = %(id)s"
INSERT_FORECAST = """
INSERT INTO forecasts (record_id, concession_id, fire_key, after_pass_at, made_at, until_at,
                       inside_by_at, from_lat_e5, from_lon_e5, crossing_lat_e5, crossing_lon_e5,
                       rule_version)
VALUES (%(record_id)s, %(concession_id)s, %(fire_key)s, %(after_pass_at)s, %(made_at)s,
        %(until_at)s, %(inside_by_at)s, %(from_lat_e5)s, %(from_lon_e5)s, %(crossing_lat_e5)s,
        %(crossing_lon_e5)s, %(rule_version)s)
ON CONFLICT (concession_id, fire_key, after_pass_at) DO NOTHING
"""
# On the full boundary, not the API's simplified one.
CROSSING = """
SELECT round(ST_Y(p) * 1e5)::integer AS lat_e5, round(ST_X(p) * 1e5)::integer AS lon_e5
FROM concessions
CROSS JOIN LATERAL (
    SELECT ST_ClosestPoint(
        ST_Boundary(boundary), ST_SetSRID(ST_MakePoint(%(lon_e5)s / 1e5, %(lat_e5)s / 1e5), 4326)
    ) AS p
) AS c
WHERE id = %(id)s
"""
INSERT_ROOT = "INSERT INTO roots (root) VALUES (%s) RETURNING id"
SEALED_ROOT = """
UPDATE roots SET run = %(run)s, tx_hash = %(tx_hash)s, sealed_at = %(sealed_at)s WHERE id = %(id)s
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
            "reach_degrees": REACH_DEGREES,
        },
    ):
        found.setdefault(m["i"] - 1, []).append(
            {"id": m["id"], "inside": m["inside"], "edge_m": m["edge_m"]}
        )
    return [(hotspots[i], found[i]) for i in sorted(found)]


def store(conn, kept: list[tuple[firms.Hotspot, list[dict]]]) -> list[dict]:
    """Inserts the hotspots not stored yet, and their matches; returns the new rows."""
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
    return new


def _forecast(conn, now, new_ids: list[bytes], counts: dict) -> None:
    """Stores the outcome of each waiting forecast the fire as it now stands decides, then
    forecasts each fire with a new detection, near each concession it matched (D40, D48)."""
    new = set(new_ids)
    # Counted only once committed, so a rolled-back run logs none.
    settled = made = 0

    def stored_at(record_id: bytes) -> datetime:
        return conn.execute(STORED_AT, (record_id,)).fetchone()["created_at"]

    for concession in conn.execute(TO_FORECAST, {"record_ids": new_ids}).fetchall():
        concession_id = concession["id"]
        grouped, _ = fires.stored(conn, concession_id, None)
        fire_of = {d.record_id: fire for fire in grouped for d in fire.detections}
        for row in conn.execute(WAITING, {"id": concession_id}).fetchall():
            decided = forecast.outcome(row, fire_of[bytes(row["fire_key"])], now, stored_at)
            if decided:
                outcome, at = decided
                conn.execute(SETTLE, {"outcome": outcome, "at": at, "id": row["id"]})
                settled += 1

        def crossing(lat_e5: int, lon_e5: int) -> tuple[int, int]:
            params = {"id": concession_id, "lat_e5": lat_e5, "lon_e5": lon_e5}
            point = conn.execute(CROSSING, params).fetchone()
            return point["lat_e5"], point["lon_e5"]

        forecast_after = {
            bytes(f["fire_key"]): f["after_pass_at"]
            for f in conn.execute(FORECAST_PASSES, {"id": concession_id})
        }
        for fire in grouped:
            if new.isdisjoint(d.record_id for d in fire.detections):
                continue
            new_forecast = forecast.make(fire, concession_id, now, crossing)
            # One forecast a pass: a late row of a pass already forecast can move the fire's
            # key and first detection, which the unique key alone would miss.
            done = [forecast_after.get(d.record_id) for d in fire.detections]
            if new_forecast and all(at is None or at < new_forecast.after_pass_at for at in done):
                inserted = conn.execute(
                    INSERT_FORECAST, {**vars(new_forecast), "record_id": secrets.token_bytes(32)}
                )
                made += inserted.rowcount
    conn.commit()
    counts["outcomes"] += settled
    counts["forecasts"] += made


# What each kind of record seals as, and the query for those not in a root yet (D17, D105).
LEAVES = {
    "forecasts": (UNSEALED_FORECASTS, lambda row: forecast_fingerprint(forecast_fields(row))),
    "hotspots": (UNSEALED, lambda row: fingerprint_v2(**record_fields_v2(row, row["concessions"]))),
}


def _sealed(conn, root_id: int, run: int, tx_hash: bytes, sealed_at, counts: dict) -> None:
    """Stores the root's run, and its transaction and block time on it and its records."""
    params = {"id": root_id, "run": run, "tx_hash": tx_hash, "sealed_at": sealed_at}
    conn.execute(SEALED_ROOT, params)
    sealed = {
        table: conn.execute(
            f"UPDATE {table} SET tx_hash = %(tx_hash)s, sealed_at = %(sealed_at)s"
            " WHERE root_id = %(id)s",
            params,
        ).rowcount
        for table in LEAVES
    }
    conn.commit()
    for table, n in sealed.items():
        counts[f"{table}_sealed"] += n
    counts["roots"] += 1
    counts["run"] = run


def _seal_root(conn, chain: Chain, counts: dict) -> None:
    """Seals one root over every record not in a root yet; with none, sends nothing (D103)."""
    leaves = [
        (table, row["id"], leaf(bytes(row["record_id"]), fingerprint_of(row)))
        for table, (unsealed, fingerprint_of) in LEAVES.items()
        for row in conn.execute(unsealed).fetchall()
    ]
    if not leaves:
        return
    root, proofs = tree([leaf_hash for _, _, leaf_hash in leaves])
    root_id = conn.execute(INSERT_ROOT, (root,)).fetchone()["id"]
    with conn.cursor() as cur:
        for table in LEAVES:
            cur.executemany(
                f"UPDATE {table} SET root_id = %s, proof = %s WHERE id = %s",
                [
                    (root_id, proof, row_id)
                    for (kind, row_id, _), proof in zip(leaves, proofs)
                    if kind == table
                ],
            )
    # Stored before it is sent, so a root sealed by a run that then crashes has its list (D110).
    conn.commit()
    _sealed(conn, root_id, *chain.seal_root(root), counts)


def main() -> int:
    started_at = datetime.now(timezone.utc)
    counts = {
        "fetched": 0, "kept": 0, "new": 0, "hotspots_sealed": 0,
        "forecasts": 0, "forecasts_sealed": 0, "outcomes": 0, "roots": 0, "run": None,
    }
    forecast_ms = 0
    balance = None
    errors = []
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
            new = store(conn, kept)
            counts.update(fetched=len(fetched), kept=len(kept), new=len(new))
            conn.commit()

            chain = Chain(
                os.environ["RPC_URL"],
                os.environ["FIRE_RUNS_ADDRESS"],
                os.environ["RECORDER_PRIVATE_KEY"],
            )
            began = time.perf_counter()
            # A forecast that fails loses only this run's forecasts; the hotspots still seal.
            try:
                _forecast(conn, chain.now(), [bytes(r["record_id"]) for r in new], counts)
            except Exception as e:
                conn.rollback()
                errors.append(f"{type(e).__name__}: {e}")
            forecast_ms = round((time.perf_counter() - began) * 1000)
            balance = chain.balance_eth()
            _seal_root(conn, chain, counts)
        except Exception as e:
            conn.rollback()
            errors.append(f"{type(e).__name__}: {e}")
        error = "; ".join(errors) or None
        # Both kinds, so the recorder check compares like with like (D20).
        sealed = counts["hotspots_sealed"] + counts["forecasts_sealed"]
        unsealed = conn.execute(COUNT_UNSEALED).fetchone()["unsealed"]
        conn.execute(
            INSERT_RUN,
            {
                "started_at": started_at,
                "finished_at": datetime.now(timezone.utc),
                "kept": counts["kept"],
                "sealed": sealed,
                "unsealed": unsealed,
                "error": error,
            },
        )
    print(
        f"recorded fetched={counts['fetched']} kept={counts['kept']} new={counts['new']}"
        f" sealed={sealed} unsealed={unsealed}"
        f" balance_eth={'unknown' if balance is None else f'{balance:.4f}'}"
        f" forecasts={counts['forecasts']} forecasts_sealed={counts['forecasts_sealed']}"
        f" outcomes={counts['outcomes']} forecast_ms={forecast_ms}"
        f" roots={counts['roots']} run={'none' if counts['run'] is None else counts['run']}"
    )
    if error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
