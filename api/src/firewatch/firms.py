"""Fetch and parse the NASA FIRMS area CSV."""

import csv
import io
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import httpx

SOURCE = "VIIRS_NOAA20_NRT"
INDONESIA_BOX = "95,-11,141,6"
DAYS = 2
# The most FIRMS gives; taken on the first run, before any record exists.
BACKFILL_DAYS = 5
CONFIDENCES = {"n", "l", "h"}


@dataclass(frozen=True)
class Hotspot:
    source: str
    lat_e5: int
    lon_e5: int
    acquired_at: datetime
    frp_e2: int
    confidence: str


def _scaled(text: str, places: int, low: Decimal, high: Decimal) -> int:
    value = Decimal(text)
    if not value.is_finite() or not low <= value <= high:
        raise ValueError(text)
    scaled = value.scaleb(places)
    if scaled != scaled.to_integral_value():
        raise ValueError(text)
    return int(scaled)


def _hotspot(row: dict) -> Hotspot:
    if row["confidence"] not in CONFIDENCES:
        raise ValueError(row["confidence"])
    acquired_at = datetime.strptime(
        f"{row['acq_date']} {row['acq_time'].zfill(4)}", "%Y-%m-%d %H%M"
    ).replace(tzinfo=timezone.utc)
    return Hotspot(
        source=SOURCE,
        lat_e5=_scaled(row["latitude"], 5, Decimal(-90), Decimal(90)),
        lon_e5=_scaled(row["longitude"], 5, Decimal(-180), Decimal(180)),
        acquired_at=acquired_at,
        frp_e2=_scaled(row["frp"], 2, Decimal(0), Decimal(2**31 - 1) / 100),
        confidence=row["confidence"],
    )


def parse(text: str) -> list[Hotspot]:
    hotspots = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            hotspots.append(_hotspot(row))
        except (ValueError, TypeError, AttributeError, InvalidOperation):
            continue
    return hotspots


def fetch(
    base_url: str, map_key: str, days: int, client: httpx.Client | None = None
) -> list[Hotspot]:
    client = client or httpx.Client(timeout=60)
    url = f"{base_url}/api/area/csv/{map_key}/{SOURCE}/{INDONESIA_BOX}/{days}"
    response = client.get(url)
    response.raise_for_status()
    return parse(response.text)
