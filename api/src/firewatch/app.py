"""Read-only API: the newest stored hotspot and a health check."""

import logging
import os
from datetime import datetime, timezone

import psycopg
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from firewatch.db import connect

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(message)s")
log = logging.getLogger("firewatch.app")


def _iso(at: datetime | None) -> str | None:
    return at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if at else None


def _hex(value: bytes | None) -> str | None:
    return "0x" + bytes(value).hex() if value is not None else None


def create_app(allowed_origin: str) -> FastAPI:
    app = FastAPI(title="Fire Watch API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[allowed_origin] if allowed_origin else [],
        allow_methods=["GET"],
    )

    @app.get("/api/hotspots/latest")
    def latest_hotspot():
        with connect() as conn:
            row = conn.execute(
                "SELECT * FROM hotspots ORDER BY acquired_at DESC, id DESC LIMIT 1"
            ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="No hotspot recorded yet")
        record_id = _hex(row["record_id"])
        log.info(
            "served hotspot record_id=%s sealed=%s",
            record_id,
            "yes" if row["tx_hash"] is not None else "no",
        )
        return {
            "record_id": record_id,
            "source": row["source"],
            "lat_e5": row["lat_e5"],
            "lon_e5": row["lon_e5"],
            "acquired_at": _iso(row["acquired_at"]),
            "acquired_unix": int(row["acquired_at"].timestamp()),
            "frp_e2": row["frp_e2"],
            "confidence": row["confidence"],
            "tx_hash": _hex(row["tx_hash"]),
            "sealed_at": _iso(row["sealed_at"]),
        }

    @app.get("/api/health")
    def health():
        try:
            with connect() as conn:
                conn.execute("SELECT 1")
        except psycopg.Error:
            return JSONResponse({"status": "error", "database": "down"}, status_code=503)
        return {"status": "ok", "database": "ok"}

    return app


app = create_app(os.environ.get("ALLOWED_ORIGIN", ""))
