"""Read-only API: pulpwood concessions, their hotspot records and fires, and a health check."""

import logging
import math
import os
from dataclasses import asdict
from datetime import date, datetime, time, timezone
from time import perf_counter
from typing import Annotated

import psycopg
from fastapi import FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from firewatch import fires
from firewatch.concessions import MAP_VERSION
from firewatch.db import connect

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(message)s")
log = logging.getLogger("firewatch.app")

MAX_DAYS = 31
# About 50 m: enough to draw the boundary, a fraction of the full file's points.
SIMPLIFY_DEGREES = 0.0005

RECORDING_STARTED = """
SELECT min(acquired_at) AS started FROM hotspots h
WHERE h.fingerprint_version = 2 AND (%(as_of)s::timestamptz IS NULL OR h.created_at <= %(as_of)s)
"""
# Rounded up, so the cut keeps the newest detection whatever its fraction of a second.
LATEST_STORED = """
SELECT ceil(extract(epoch FROM max(created_at)))::bigint AS as_of
FROM hotspots WHERE fingerprint_version = 2
"""
CONCESSION_COUNTS = """
SELECT c.id, c.province, c.area_ha,
       count(*) FILTER (WHERE m.inside) AS inside,
       count(*) FILTER (WHERE NOT m.inside) AS near
FROM hotspots h
JOIN hotspot_concessions m ON m.hotspot_id = h.id
JOIN concessions c ON c.id = m.concession_id
WHERE h.fingerprint_version = 2 AND h.acquired_at >= %(start)s AND h.acquired_at <= %(end)s
GROUP BY c.id
ORDER BY inside DESC, near DESC, c.id
"""
CONCESSION = """
SELECT id, province, area_ha, map_version,
       ST_AsGeoJSON(ST_Multi(ST_SimplifyPreserveTopology(boundary, %(simplify)s)), 5)::json
           AS boundary
FROM concessions WHERE id = %(id)s
"""
CONCESSION_HOTSPOTS = """
SELECT h.*, m.inside AS inside_here,
       (SELECT json_agg(json_build_object('id', a.concession_id, 'inside', a.inside,
                                          'edge_m', a.edge_m)
                        ORDER BY a.inside DESC, a.edge_m, a.concession_id)
        FROM hotspot_concessions a WHERE a.hotspot_id = h.id) AS concessions
FROM hotspots h
JOIN hotspot_concessions m ON m.hotspot_id = h.id AND m.concession_id = %(id)s
WHERE h.fingerprint_version = 2 AND h.acquired_at >= %(start)s AND h.acquired_at <= %(end)s
ORDER BY h.acquired_at DESC, h.frp_e2 DESC, h.lat_e5, h.lon_e5
"""
CONCESSION_DETECTIONS = """
SELECT h.record_id, h.lat_e5, h.lon_e5, h.acquired_at, m.inside, m.edge_m
FROM hotspots h
JOIN hotspot_concessions m ON m.hotspot_id = h.id AND m.concession_id = %(id)s
WHERE h.fingerprint_version = 2
  AND (%(as_of)s::timestamptz IS NULL OR h.created_at <= %(as_of)s)
"""
FIRE_HOTSPOTS = """
SELECT h.*,
       (SELECT json_agg(json_build_object('id', a.concession_id, 'inside', a.inside,
                                          'edge_m', a.edge_m)
                        ORDER BY a.inside DESC, a.edge_m, a.concession_id)
        FROM hotspot_concessions a WHERE a.hotspot_id = h.id) AS concessions
FROM hotspots h
WHERE h.record_id = ANY(%(record_ids)s)
"""
RECORDER = """
SELECT n.finished_at AS last_run_at,
       CASE WHEN n.id IS NOT NULL THEN n.error IS NULL END AS last_run_ok,
       (SELECT max(finished_at) FROM recorder_runs WHERE error IS NULL) AS last_ok_at,
       n.sealed AS last_sealed,
       (SELECT count(*) FROM hotspots WHERE fingerprint_version = 2 AND tx_hash IS NULL)
           AS unsealed
FROM (SELECT) AS one
LEFT JOIN LATERAL (
    SELECT * FROM recorder_runs ORDER BY finished_at DESC, id DESC LIMIT 1
) AS n ON true
"""

From = Annotated[date, Query(alias="from")]
To = Annotated[date, Query(alias="to")]
FireKey = Annotated[str, Path(pattern=r"^0x[0-9a-f]{64}$")]


def _iso(at: datetime | None) -> str | None:
    return at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if at else None


def _hex(value: bytes | None) -> str | None:
    return "0x" + bytes(value).hex() if value is not None else None


def _range(start: date, end: date) -> dict:
    """From start 00:00 UTC up to the end of end, as query parameters."""
    if end < start:
        raise HTTPException(status_code=422, detail="to is before from")
    if (end - start).days + 1 > MAX_DAYS:
        raise HTTPException(status_code=422, detail=f"Pick {MAX_DAYS} days or fewer")
    return {
        "start": datetime.combine(start, time.min, timezone.utc),
        "end": datetime.combine(end, time.max, timezone.utc),
    }


def _unix(at: datetime | None) -> int | None:
    return int(at.timestamp()) if at else None


def _record(row) -> dict:
    return {
        "record_id": _hex(row["record_id"]),
        "source": row["source"],
        "lat_e5": row["lat_e5"],
        "lon_e5": row["lon_e5"],
        "acquired_at": _iso(row["acquired_at"]),
        "acquired_unix": int(row["acquired_at"].timestamp()),
        "frp_e2": row["frp_e2"],
        "confidence": row["confidence"],
        "tx_hash": _hex(row["tx_hash"]),
        "sealed_at": _iso(row["sealed_at"]),
        "fingerprint_version": row["fingerprint_version"],
        "map_version": row["map_version"],
        "concessions": row["concessions"],
    }


def _rings(boundary: dict) -> list:
    """A MultiPolygon's rings, holes included, as one list."""
    return [ring for polygon in boundary["coordinates"] for ring in polygon]


def _group(
    conn, concession_id: str, as_of: datetime | None
) -> tuple[list[fires.Fire], int]:
    """Every fire near the concession from the detections stored by as_of (all when None),
    and the milliseconds grouping took."""
    params = {"id": concession_id, "as_of": as_of}
    started = conn.execute(RECORDING_STARTED, params).fetchone()["started"]
    rows = conn.execute(CONCESSION_DETECTIONS, params).fetchall()
    began = perf_counter()
    grouped = fires.group([fires.Detection(**row) for row in rows], started)
    return grouped, round((perf_counter() - began) * 1000)


def _fire(fire: fires.Fire) -> dict:
    return {
        "key": _hex(fire.key),
        "first_seen_unix": _unix(fire.first_seen_at),
        "last_seen_unix": _unix(fire.last_seen_at),
        "passes": fire.passes,
        "detections": len(fire.detections),
        "first_seen": asdict(fire.first_seen),
        "inside_from_unix": _unix(fire.inside_from),
        "outside_from_unix": _unix(fire.outside_from),
        "never_spread": fire.never_spread,
        "recorded_before_h": fire.recorded_before_h,
    }


def create_app(allowed_origin: str) -> FastAPI:
    app = FastAPI(title="Fire Watch API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[allowed_origin] if allowed_origin else [],
        allow_methods=["GET"],
    )
    app.add_middleware(GZipMiddleware)

    @app.get("/api/concessions")
    def list_concessions(start: From, end: To):
        params = _range(start, end)
        with connect() as conn:
            started = conn.execute(RECORDING_STARTED, {"as_of": None}).fetchone()["started"]
            rows = conn.execute(CONCESSION_COUNTS, params).fetchall()
        log.info("served concessions from=%s to=%s count=%d", start, end, len(rows))
        return {
            "recording_started": started.astimezone(timezone.utc).date().isoformat()
            if started
            else None,
            "map_version": MAP_VERSION,
            "concessions": rows,
        }

    @app.get("/api/concessions/{concession_id}")
    def concession(concession_id: str, start: From, end: To):
        params = {**_range(start, end), "id": concession_id, "simplify": SIMPLIFY_DEGREES}
        with connect() as conn:
            found = conn.execute(CONCESSION, params).fetchone()
            if found is None:
                raise HTTPException(status_code=404, detail="No such concession")
            # Records first: a detection stored between the two reads is then in the grouping.
            rows = conn.execute(CONCESSION_HOTSPOTS, params).fetchall()
            grouped, group_ms = _group(conn, concession_id, None)
        fire_of = {d.record_id: fire for fire in grouped for d in fire.detections}
        shown = {fire_of[row["record_id"]].key for row in rows}
        listed = sorted(
            (fire for fire in grouped if fire.key in shown),
            key=lambda f: (-len(f.detections), -f.first_seen_at.timestamp(), f.key),
        )
        inside = sum(1 for row in rows if row["inside_here"])
        log.info(
            "served concession id=%s hotspots=%d fires=%d group_ms=%d",
            concession_id, len(rows), len(listed), group_ms,
        )
        return {
            "id": found["id"],
            "province": found["province"],
            "area_ha": found["area_ha"],
            "inside": inside,
            "near": len(rows) - inside,
            "boundary": _rings(found["boundary"]),
            "hotspots": [
                {**_record(row), "fire_key": _hex(fire_of[row["record_id"]].key)} for row in rows
            ],
            "fires": [_fire(fire) for fire in listed],
        }

    @app.get("/api/concessions/{concession_id}/fires/{key}")
    def fire(concession_id: str, key: FireKey, as_of: int | None = Query(None, ge=1)):
        # Rounded up as LATEST_STORED is, so a cut read this second is never in the future.
        if as_of is not None and as_of > math.ceil(datetime.now(timezone.utc).timestamp()):
            raise HTTPException(status_code=422, detail="as_of is in the future")
        wanted = bytes.fromhex(key[2:])
        site = None
        with connect() as conn:
            if as_of is None:
                # The cut first: a detection stored after it is then left out of the grouping.
                as_of = conn.execute(LATEST_STORED).fetchone()["as_of"]
                if as_of is None:
                    raise HTTPException(status_code=404, detail="No such fire")
            else:
                params = {"id": concession_id, "simplify": SIMPLIFY_DEGREES}
                site = conn.execute(CONCESSION, params).fetchone()
                if site is None:
                    raise HTTPException(status_code=404, detail="No such concession")
            # An unknown concession has no detections, so no fire.
            grouped, group_ms = _group(
                conn, concession_id, datetime.fromtimestamp(as_of, timezone.utc)
            )
            found = next((fire for fire in grouped if fire.key == wanted), None)
            if found is None:
                raise HTTPException(status_code=404, detail="No such fire")
            ids = [d.record_id for d in found.detections]
            rows = conn.execute(FIRE_HOTSPOTS, {"record_ids": ids}).fetchall()
        by_id = {row["record_id"]: row for row in rows}
        log.info(
            "served fire id=%s key=%s as_of=%d detections=%d passes=%d group_ms=%d",
            concession_id, key, as_of, len(ids), found.passes, group_ms,
        )
        pack = {} if site is None else {
            "concession_id": site["id"],
            "province": site["province"],
            "boundary": _rings(site["boundary"]),
            "map_version": site["map_version"],
            "rule_version": fires.RULE_VERSION,
        }
        return {
            **_fire(found),
            "as_of_unix": as_of,
            **pack,
            "hotspots": [
                {**_record(by_id[record_id]), "pass": number}
                for record_id, number in zip(ids, found.pass_numbers)
            ],
        }

    @app.get("/api/health")
    def health():
        try:
            with connect() as conn:
                recorder = conn.execute(RECORDER).fetchone()
        except psycopg.Error:
            return JSONResponse({"status": "error", "database": "down"}, status_code=503)
        return {
            "status": "ok",
            "database": "ok",
            "recorder": {
                **recorder,
                "last_run_at": _iso(recorder["last_run_at"]),
                "last_ok_at": _iso(recorder["last_ok_at"]),
            },
        }

    return app


app = create_app(os.environ.get("ALLOWED_ORIGIN", ""))
