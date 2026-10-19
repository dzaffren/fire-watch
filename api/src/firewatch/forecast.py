"""Forecast when a fire outside a concession is seen inside it, rule version 1.

The rule, so anyone can redo it from the stored detections and the concession's edge:

1. Take the fire, by fire rule version 1, from every detection near the concession stored so far.
2. The newest pass is the fire's last pass. Its distance is that of its detection nearest the
   edge: the edge distance when it is outside, 0 when it is inside. On a tie, take the first in
   the fire's order. A fire with a detection inside and more than 375 m from the edge is seen
   inside and gets no forecast.
3. The advance rate: for each newest-pass detection, take the distance to the nearest detection
   on an earlier pass of the fire. Divide the largest of these by the hours from the first
   detection of the pass before to the first detection of the newest pass. A one-pass fire has
   no rate.
4. With a rate over 0, the fire needs (distance + 375 m) / rate hours to be seen inside. When
   that is 48 or fewer, it is forecast to be seen inside by the first detection of the newest
   pass plus those hours. The hours are rounded to the nearest 12, halves up, with 12 at the
   least.
5. Otherwise, a fire at most 375 m from the edge is forecast to be seen inside 12 hours after its
   newest pass.
6. Otherwise, it is not forecast to be seen inside within 48 hours of the forecast.
7. A forecast inside runs from the detection in step 2 to the nearest point on the concession's
   edge. That is where it is forecast to cross.

A forecast is made now and runs 48 hours from then. Its outcome reads the fire, as grouped now,
that holds the forecast's key detection. The first of these that holds decides it (D44):

1. The fire has another key, and that key's detection was stored before the forecast: the
   forecast's fire joined an older fire before it was seen inside. A key that moves to a
   detection stored after the forecast, such as a late row of the fire's own first pass, is
   the same fire.
2. The fire's inside from is at or before the seal, or the forecast is not sealed yet: it was seen
   inside before the seal.
3. The fire's inside from is at or before the forecast's end: it was seen inside.
4. Now is 6 hours or more past the forecast's end: it was not seen inside.
5. Otherwise it is still waiting.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from math import floor

from firewatch import fires

RULE_VERSION = 1
HORIZON = timedelta(hours=48)
# A forecast closes 6 hours after its 48 have ended, because FIRMS rows can arrive late (D50).
SETTLE = timedelta(hours=6)
STEP_H = 12


@dataclass(frozen=True)
class Forecast:
    concession_id: str
    fire_key: bytes
    after_pass_at: datetime
    made_at: datetime
    until_at: datetime
    inside_by_at: datetime | None
    from_lat_e5: int | None
    from_lon_e5: int | None
    crossing_lat_e5: int | None
    crossing_lon_e5: int | None
    rule_version: int


def _rounded_h(hours: float) -> int:
    return max(STEP_H, floor(hours / STEP_H + 0.5) * STEP_H)


def _lead_h(passes: list[list[fires.Detection]], distance: int) -> int | None:
    if len(passes) > 1:
        newest, before = passes[-1], passes[-2]
        earlier = [e for detections in passes[:-1] for e in detections]
        advance = max(min(fires.distance_m(d, e) for e in earlier) for d in newest)
        rate = advance / ((newest[0].acquired_at - before[0].acquired_at) / timedelta(hours=1))
        if rate > 0:
            hours = (distance + fires.EDGE_DOUBT_M) / rate
            if hours <= HORIZON / timedelta(hours=1):
                return _rounded_h(hours)
    if distance <= fires.EDGE_DOUBT_M:
        return STEP_H
    return None


def make(
    fire: fires.Fire,
    concession_id: str,
    now: datetime,
    crossing: Callable[[int, int], tuple[int, int]],
) -> Forecast | None:
    if fire.inside_from is not None:
        return None
    passes: list[list[fires.Detection]] = [[] for _ in range(fire.passes)]
    for d, number in zip(fire.detections, fire.pass_numbers):
        passes[number - 1].append(d)
    nearest = min(passes[-1], key=lambda d: 0 if d.inside else d.edge_m)
    distance = 0 if nearest.inside else nearest.edge_m
    after_pass_at = passes[-1][0].acquired_at
    lead_h = _lead_h(passes, distance)
    if lead_h is None:
        start = end = (None, None)
    else:
        start = (nearest.lat_e5, nearest.lon_e5)
        end = crossing(*start)
    return Forecast(
        concession_id=concession_id,
        fire_key=fire.key,
        after_pass_at=after_pass_at,
        made_at=now,
        until_at=now + HORIZON,
        inside_by_at=None if lead_h is None else after_pass_at + timedelta(hours=lead_h),
        from_lat_e5=start[0],
        from_lon_e5=start[1],
        crossing_lat_e5=end[0],
        crossing_lon_e5=end[1],
        rule_version=RULE_VERSION,
    )


def outcome(
    forecast: Mapping,
    fire: fires.Fire,
    now: datetime,
    stored_at: Callable[[bytes], datetime],
) -> tuple[str, datetime | None] | None:
    if fire.key != forecast["fire_key"] and stored_at(fire.key) <= forecast["created_at"]:
        return ("joined", None)
    seen = fire.inside_from
    sealed_at = forecast["sealed_at"]
    if seen is not None and (sealed_at is None or seen <= sealed_at):
        return ("seen_before_seal", seen)
    if seen is not None and seen <= forecast["until_at"]:
        return ("seen_inside", seen)
    if now >= forecast["until_at"] + SETTLE:
        return ("not_seen_inside", None)
    return None
