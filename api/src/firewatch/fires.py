"""Group one concession's detections into fires, rule version 2.

The rule, so anyone can redo it from the stored detections:

1. Take every detection matched to the concession. Order them by acquired time, then lowest
   latitude, then lowest longitude. "First" always means first in this order.
2. Two detections are in the same fire when they are at most 1,000 m apart and at most 48 hours
   apart. Distance is haversine on a sphere of radius 6,371,008.8 m. A fire is every detection
   linked to another by a chain of such pairs.
3. A fire's key is the record ID of its first detection. When a chain joins two fires, the
   joined fire keeps the older key.
4. Within a fire, a detection more than 30 minutes after the one before it starts a new pass.
   Passes number from 1.
5. First seen reads the first pass. Detections on both sides of the edge read "both". Otherwise,
   any detection at most 375 m from the edge reads "edge". Otherwise the pass reads "inside" or
   "outside". The side and distance given are those of the first-pass detection nearest the edge.
6. Inside from is the time of the first pass with a detection inside and more than 375 m from
   the edge. Outside from is the same for outside. Either can be missing.
7. A fire never spread when it has 4 or more passes and no detection is more than 750 m from its
   first detection.
8. When the fire was first seen less than 48 hours after recording started, recorded before
   gives the whole hours between, rounded down.
9. When the first pass is one detection and the next pass came more than 14 hours after it,
   first alone gives the whole hours between, rounded down.

Steps 1 to 8 are version 1's, so every reading is the same as in version 1.

`stored()` groups the detections stored by a given time, as the API and the recorder both need.

Candidate pairs come from a 0.01 degree grid: a detection is checked against the 3 by 3 cells
around its own. Across Indonesia a cell is at least 1.09 km wide, so no pair within 1 km is
missed.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from math import asin, cos, radians, sin, sqrt
from time import perf_counter

RULE_VERSION = 2
EARTH_RADIUS_M = 6_371_008.8
JOIN_M = 1000
JOIN_TIME = timedelta(hours=48)
PASS_GAP = timedelta(minutes=30)
# Half the widest VIIRS pixel: farther than this, the whole pixel is on one side.
EDGE_DOUBT_M = 375
NEVER_SPREAD_PASSES = 4
NEVER_SPREAD_M = 750
RECORDED_BEFORE = timedelta(hours=48)
# NOAA-20 passes about every 12 hours, so a longer gap means it missed the fire at least once.
FIRST_ALONE = timedelta(hours=14)
CELL_E5 = 1000

RECORDING_STARTED = """
SELECT min(acquired_at) AS started FROM hotspots h
WHERE h.fingerprint_version = 2 AND (%(as_of)s::timestamptz IS NULL OR h.created_at <= %(as_of)s)
"""
CONCESSION_DETECTIONS = """
SELECT h.record_id, h.lat_e5, h.lon_e5, h.acquired_at, m.inside, m.edge_m
FROM hotspots h
JOIN hotspot_concessions m ON m.hotspot_id = h.id AND m.concession_id = %(id)s
WHERE h.fingerprint_version = 2
  AND (%(as_of)s::timestamptz IS NULL OR h.created_at <= %(as_of)s)
"""


@dataclass(frozen=True)
class Detection:
    record_id: bytes
    lat_e5: int
    lon_e5: int
    acquired_at: datetime
    inside: bool
    edge_m: int


@dataclass(frozen=True)
class FirstSeen:
    reading: str
    inside: bool
    edge_m: int


@dataclass(frozen=True)
class Fire:
    key: bytes
    detections: tuple[Detection, ...]
    pass_numbers: tuple[int, ...]
    first_seen_at: datetime
    last_seen_at: datetime
    passes: int
    first_seen: FirstSeen
    inside_from: datetime | None
    outside_from: datetime | None
    never_spread: bool
    recorded_before_h: int | None
    first_alone_h: int | None


def distance_m(a: Detection, b: Detection) -> float:
    lat_a, lat_b = radians(a.lat_e5 / 1e5), radians(b.lat_e5 / 1e5)
    d_lat = lat_b - lat_a
    d_lon = radians((b.lon_e5 - a.lon_e5) / 1e5)
    h = sin(d_lat / 2) ** 2 + cos(lat_a) * cos(lat_b) * sin(d_lon / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(h))


def _components(ordered: list[Detection]) -> list[list[int]]:
    parent = list(range(len(ordered)))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    cells: dict[tuple[int, int], list[int]] = {}
    for i, d in enumerate(ordered):
        cells.setdefault((d.lat_e5 // CELL_E5, d.lon_e5 // CELL_E5), []).append(i)
    for (row, col), members in cells.items():
        for d_row in (-1, 0, 1):
            for d_col in (-1, 0, 1):
                for j in cells.get((row + d_row, col + d_col), ()):
                    for i in members:
                        a, b = ordered[i], ordered[j]
                        if (
                            i < j
                            and abs(b.acquired_at - a.acquired_at) <= JOIN_TIME
                            and distance_m(a, b) <= JOIN_M
                        ):
                            # The lower index is the older detection, so it stays the root.
                            low, high = sorted((root(i), root(j)))
                            parent[high] = low
    groups: dict[int, list[int]] = {}
    for i in range(len(ordered)):
        groups.setdefault(root(i), []).append(i)
    return list(groups.values())


def _side_from(passes: list[list[Detection]], inside: bool) -> datetime | None:
    for detections in passes:
        if any(d.inside == inside and d.edge_m > EDGE_DOUBT_M for d in detections):
            return detections[0].acquired_at
    return None


def _first_seen(detections: list[Detection]) -> FirstSeen:
    nearest = min(detections, key=lambda d: d.edge_m)
    if len({d.inside for d in detections}) == 2:
        reading = "both"
    elif nearest.edge_m <= EDGE_DOUBT_M:
        reading = "edge"
    else:
        reading = "inside" if nearest.inside else "outside"
    return FirstSeen(reading=reading, inside=nearest.inside, edge_m=nearest.edge_m)


def _fire(detections: list[Detection], recording_started: datetime | None) -> Fire:
    pass_numbers = [1]
    for before, after in zip(detections, detections[1:]):
        gap = after.acquired_at - before.acquired_at
        pass_numbers.append(pass_numbers[-1] + (gap > PASS_GAP))
    passes: list[list[Detection]] = [[] for _ in range(pass_numbers[-1])]
    for d, number in zip(detections, pass_numbers):
        passes[number - 1].append(d)

    first = detections[0]
    since_start = first.acquired_at - recording_started if recording_started else None
    alone = (
        passes[1][0].acquired_at - first.acquired_at
        if len(passes) > 1 and len(passes[0]) == 1
        else None
    )
    return Fire(
        key=first.record_id,
        detections=tuple(detections),
        pass_numbers=tuple(pass_numbers),
        first_seen_at=first.acquired_at,
        last_seen_at=detections[-1].acquired_at,
        passes=len(passes),
        first_seen=_first_seen(passes[0]),
        inside_from=_side_from(passes, True),
        outside_from=_side_from(passes, False),
        never_spread=len(passes) >= NEVER_SPREAD_PASSES
        and all(distance_m(first, d) <= NEVER_SPREAD_M for d in detections),
        recorded_before_h=int(since_start // timedelta(hours=1))
        if since_start is not None and since_start < RECORDED_BEFORE
        else None,
        first_alone_h=int(alone // timedelta(hours=1))
        if alone is not None and alone > FIRST_ALONE
        else None,
    )


def group(detections, recording_started: datetime | None) -> list[Fire]:
    """Fires in the order of their first detection."""
    ordered = sorted(detections, key=lambda d: (d.acquired_at, d.lat_e5, d.lon_e5))
    return [
        _fire([ordered[i] for i in members], recording_started)
        for members in sorted(_components(ordered))
    ]


def stored(conn, concession_id: str, as_of: datetime | None) -> tuple[list[Fire], int]:
    """Every fire near the concession from the detections stored by as_of (all when None),
    and the milliseconds grouping took."""
    params = {"id": concession_id, "as_of": as_of}
    started = conn.execute(RECORDING_STARTED, params).fetchone()["started"]
    rows = conn.execute(CONCESSION_DETECTIONS, params).fetchall()
    began = perf_counter()
    grouped = group([Detection(**row) for row in rows], started)
    return grouped, round((perf_counter() - began) * 1000)
