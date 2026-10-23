"""backtest-2023: replay 2023 as the hourly recorder would have run it, with forecast rule version
1 and the guesses below at every forecast moment, and write the totals and every forecast
(D52–D60, D99, D132–D134).

Usage: backtest-2023 [--firms <path>] [--map <path>] [--wind <path>] [--fetch-wind] [--out <dir>]

With no --firms or --map the pinned files are downloaded and their sha256 checked; a path given
is read as is, which is how tests run on a cut. The concession map is loaded into DATABASE_URL.

The replay, so anyone can redo it:

1. Take every row of FIRMS's 2023 VIIRS NOAA-20 file for Indonesia with confidence n, l or h.
   Match each to every concession of the map within 5 km, as the recorder does (D13). A
   detection's record ID is the sha256 of its latitude, longitude and time.
2. Each detection is stored 3 hours after it was taken, by the hourly run on or after then (D57).
3. At each run that stores a detection near a concession, group every detection of that
   concession stored so far (fire rule version 1).
4. Settle each waiting forecast as the recorder does (D50). A replay forecast has no seal, so it
   counts as sealed when it was made. A forecast whose 48 hours and 6 more end between runs
   settles at that time, with the fires as they stood.
5. For each fire with a detection stored in this run and not yet seen inside, make one forecast
   by rule version 1, and skip a pass already forecast after, as the recorder does.
6. At the same moment, make each guess, below.
7. A forecast whose 48 hours and 6 more end after 2023 is listed as "ends after 2023" and not
   counted (D56).

The downwind guess (D60, D99):

1. Only a fire with an advance rate over 0, as in rule version 1 step 3, gets a guess.
   Otherwise the guess says no.
2. Each detection on the newest pass moves with ERA5's 10 m wind, toward the wind's direction
   plus 180 degrees. It uses the nearest 0.25 degree grid point, at the hour nearest the newest
   pass's first detection. It moves at the advance rate for 48 hours.
3. The hours it needs: the first point of any detection's path more than 375 m inside the edge,
   which is the first point inside the concession shrunk by 375 m.
4. When that is 48 hours or fewer, the guess is the newest pass's first detection plus those
   hours, rounded as rule version 1 step 4 rounds them. Otherwise it says no.

The near-edge step, rule version 1 step 5 alone (D99):

1. Take the newest pass's distance as rule version 1 step 2 does: that of its detection nearest
   the edge, 0 when that detection is inside.
2. At 375 m or less, the fire is forecast to be seen inside 12 hours after the newest pass's first
   detection. Otherwise the step says no.

The next-pass guess (D99): every forecast moment says the fire is seen inside 12 hours after the
newest pass's first detection, rule version 1 step 5's lead.

The rule version 2 tried (D132–D134), the near-edge step except for a lone detection:

1. Take the near-edge step's time.
2. Count the detections matched to the concession that were taken in the 48 hours up to and
   including the newest pass's first detection. One taken exactly 48 hours before doesn't count.
3. When that count is 1, the pass is a lone detection, and the candidate says no. Otherwise it
   gives the near-edge step's time.

It was picked on forecasts made before 1 October 2023, and judged once on those made from then
(D133). The totals give both parts for it, the near-edge step and rule version 1.
"""

import argparse
import csv
from bisect import bisect_right
import hashlib
import io
import json
import statistics
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import floor
from pathlib import Path

import httpx

from firewatch import concessions, fires, firms, forecast, migrate, record_hotspots
from firewatch.db import connect

FIRMS_URL = (
    "https://firms.modaps.eosdis.nasa.gov/data/country/viirs-jpss1/2023/"
    "viirs-jpss1_2023_Indonesia.csv"
)
FIRMS_SHA256 = "99969d975480ab57a129b02502b4b968ced195dc2c7fcaf947eb693ef7010fd7"
FIXTURES = Path(__file__).parents[3] / "fixtures" / "backtest"
# FIRMS publishes a pass 2 to 3 hours after it is taken (D57).
LAG = timedelta(hours=3)
HOUR = timedelta(hours=1)
YEAR_END = datetime(2024, 1, 1, tzinfo=timezone.utc)
JUDGED_FROM = datetime(2023, 10, 1, tzinfo=timezone.utc)
LONE = timedelta(hours=48)
MATCH_BATCH = 20_000
GRID_E5 = 25_000
WIND_URL = "https://archive-api.open-meteo.com/v1/archive"
# Open-Meteo refused the 15th request when they came 2 seconds apart (D58).
WIND_POINTS = 100
WIND_PAUSE_S = 35
WIND_TRIES = 3
TIME = "%Y-%m-%dT%H:%MZ"
COLUMNS = [
    "concession_id", "fire_first_seen_at", "fire_latitude", "fire_longitude", "after_pass_at",
    "made_at", "rule_inside_by", "downwind_inside_by", "near_edge_inside_by",
    "next_pass_inside_by", "v2_candidate_inside_by", "outcome", "seen_inside_at",
]
WIND_COLUMNS = ["latitude", "longitude", "hour", "speed_ms", "from_deg"]

# Each path as a straight line from the detection, against each concession shrunk by 375 m.
# Concession by concession, so each shrunk boundary is worked out once.
DOWNWIND = """
WITH deep AS MATERIALIZED (
    SELECT id, ST_Buffer(boundary::geography, -%(edge_doubt_m)s)::geometry AS deep
    FROM concessions WHERE id = ANY(%(ids)s)
), paths AS (
    SELECT u.i, u.concession_id, u.length_m, s.start,
           ST_MakeLine(s.start, ST_Project(s.start::geography, u.length_m,
                                           radians(u.toward))::geometry) AS line
    FROM unnest(%(i)s::integer[], %(concession_id)s::text[], %(lat_e5)s::integer[],
                %(lon_e5)s::integer[], %(toward)s::float8[], %(length_m)s::float8[])
        AS u (i, concession_id, lat_e5, lon_e5, toward, length_m)
    CROSS JOIN LATERAL (
        SELECT ST_SetSRID(ST_MakePoint(u.lon_e5 / 1e5, u.lat_e5 / 1e5), 4326) AS start
    ) AS s
)
SELECT p.i, min(ST_LineLocatePoint(p.line, ST_ClosestPoint(ST_Intersection(p.line, d.deep),
                                                           p.start)) * p.length_m) AS reach_m
FROM paths AS p JOIN deep AS d ON d.id = p.concession_id
WHERE ST_Intersects(p.line, d.deep)
GROUP BY p.i
"""


@dataclass
class Replayed:
    forecast: forecast.Forecast
    # The fire's first detection when the forecast was made: the detection its key names.
    first: fires.Detection
    rate: float | None
    newest: tuple[fires.Detection, ...]
    outcome: str | None = None
    outcome_at: datetime | None = None


def record_id(h: firms.Hotspot) -> bytes:
    return hashlib.sha256(f"{h.lat_e5},{h.lon_e5},{h.acquired_at:{TIME}}".encode()).digest()


def hotspots(text: str) -> list[firms.Hotspot]:
    """Every row the recorder would keep, once each."""
    unique: dict[tuple, firms.Hotspot] = {}
    for h in firms.parse(text):
        unique.setdefault((h.lat_e5, h.lon_e5, h.acquired_at), h)
    return list(unique.values())


def detections(conn, found: list[firms.Hotspot], ids: set[str]) -> dict[str, list[fires.Detection]]:
    """Each concession's detections, matched as the recorder matches them."""
    by_concession: dict[str, list[fires.Detection]] = {}
    for i in range(0, len(found), MATCH_BATCH):
        for h, matches in record_hotspots.match(conn, found[i : i + MATCH_BATCH]):
            for m in matches:
                if m["id"] in ids:
                    by_concession.setdefault(m["id"], []).append(
                        fires.Detection(
                            record_id=record_id(h),
                            lat_e5=h.lat_e5,
                            lon_e5=h.lon_e5,
                            acquired_at=h.acquired_at,
                            inside=m["inside"],
                            edge_m=m["edge_m"],
                        )
                    )
    return by_concession


def _stored_at(d: fires.Detection) -> datetime:
    at = d.acquired_at + LAG
    hour = at.replace(minute=0, second=0, microsecond=0)
    return hour if hour == at else hour + HOUR


def _no_crossing(lat_e5: int, lon_e5: int) -> tuple[int, int]:
    # The replay doesn't record where a forecast crosses the edge.
    return lat_e5, lon_e5


def replay(concession_id: str, found: list[fires.Detection]) -> list[Replayed]:
    """Every forecast the recorder would have made near the concession, in the order made, each
    with its outcome as the recorder would have stored it (None while still waiting)."""
    stored_at = {d.record_id: _stored_at(d) for d in found}
    by_run: dict[datetime, list[fires.Detection]] = {}
    for d in found:
        by_run.setdefault(stored_at[d.record_id], []).append(d)
    made: list[Replayed] = []
    made_keys: set[tuple[bytes, datetime]] = set()
    waiting: list[Replayed] = []
    so_far: list[fires.Detection] = []
    fire_of: dict[bytes, fires.Fire] = {}

    def settle(r: Replayed, now: datetime) -> None:
        made_at = r.forecast.made_at
        row = {**vars(r.forecast), "created_at": made_at, "sealed_at": made_at}
        decided = forecast.outcome(row, fire_of[r.forecast.fire_key], now, stored_at.__getitem__)
        if decided:
            r.outcome, r.outcome_at = decided

    for run in sorted(by_run):
        for r in waiting:
            closes = r.forecast.until_at + forecast.SETTLE
            if closes < run:
                settle(r, closes)
        new = by_run[run]
        so_far += new
        grouped = fires.group(so_far, None)
        fire_of = {d.record_id: fire for fire in grouped for d in fire.detections}
        for r in waiting:
            if r.outcome is None:
                settle(r, run)
        waiting = [r for r in waiting if r.outcome is None]

        forecast_after: dict[bytes, datetime] = {}
        for r in made:
            if r.outcome != "joined":
                key, at = r.forecast.fire_key, r.forecast.after_pass_at
                forecast_after[key] = max(at, forecast_after.get(key, at))
        new_ids = {d.record_id for d in new}
        for fire in grouped:
            if new_ids.isdisjoint(d.record_id for d in fire.detections):
                continue
            f = forecast.make(fire, concession_id, run, _no_crossing)
            if f is None or (f.fire_key, f.after_pass_at) in made_keys:
                continue
            done = [forecast_after.get(d.record_id) for d in fire.detections]
            if all(at is None or at < f.after_pass_at for at in done):
                passes = forecast.passes_of(fire)
                rate = forecast.advance_rate(passes)
                r = Replayed(f, fire.detections[0], rate, tuple(passes[-1]))
                made.append(r)
                made_keys.add((f.fire_key, f.after_pass_at))
                waiting.append(r)
    for r in waiting:
        settle(r, r.forecast.until_at + forecast.SETTLE)
    return made


def grid_point(d: fires.Detection) -> tuple[int, int]:
    """The nearest 0.25 degree grid point, halves up, in e5."""
    return tuple(floor(e5 / GRID_E5 + 0.5) * GRID_E5 for e5 in (d.lat_e5, d.lon_e5))


def _nearest_hour(at: datetime) -> datetime:
    return (at + HOUR / 2).replace(minute=0, second=0, microsecond=0)


def wind_needed(made: list[Replayed]) -> set[tuple[int, int, datetime]]:
    return {
        grid_point(d) + (_nearest_hour(r.forecast.after_pass_at),)
        for r in made if r.rate
        for d in r.newest
    }


def read_wind(path: Path) -> dict[tuple[int, int, datetime], tuple[float, float]]:
    """Speed in m/s and the direction the wind comes from, by grid point and hour."""
    if not path.exists():
        return {}
    return {
        (round(float(w["latitude"]) * 1e5), round(float(w["longitude"]) * 1e5),
         datetime.strptime(w["hour"], TIME).replace(tzinfo=timezone.utc)):
        (float(w["speed_ms"]), float(w["from_deg"]))
        for w in csv.DictReader(io.StringIO(path.read_text()))
    }


def _ask_wind(client: httpx.Client, params: dict) -> list[dict]:
    for attempt in range(1, WIND_TRIES + 1):
        try:
            response = client.get(WIND_URL, params=params)
            response.raise_for_status()
            body = response.json()
            return body if isinstance(body, list) else [body]
        # A JSON error too: Open-Meteo once ended a 2 MB answer at 83 KB.
        except (httpx.HTTPError, ValueError) as e:
            if attempt == WIND_TRIES:
                raise
            print(f"wind request {attempt} failed, trying again: {e}", file=sys.stderr, flush=True)
            time.sleep(WIND_PAUSE_S)


def fetch_wind(needed: set[tuple[int, int, datetime]], client: httpx.Client, path: Path) -> dict:
    """ERA5's wind at each needed grid point and hour, from Open-Meteo, a month at a time. Each
    answer is saved to path at once, and the hours path already holds aren't asked again."""
    wind = {key: w for key, w in read_wind(path).items() if key in needed}
    by_month: dict[str, set] = {}
    for key in needed - wind.keys():
        by_month.setdefault(f"{key[2]:%Y-%m}", set()).add(key)
    asked = 0
    for month in sorted(by_month):
        keys = by_month[month]
        points = sorted({(lat, lon) for lat, lon, _ in keys})
        hours = [hour for *_, hour in keys]
        for i in range(0, len(points), WIND_POINTS):
            part = points[i : i + WIND_POINTS]
            if asked:
                time.sleep(WIND_PAUSE_S)
            asked += 1
            places = _ask_wind(
                client,
                {
                    "latitude": ",".join(f"{lat / 1e5:.2f}" for lat, _ in part),
                    "longitude": ",".join(f"{lon / 1e5:.2f}" for _, lon in part),
                    "start_date": f"{min(hours):%Y-%m-%d}",
                    "end_date": f"{max(hours):%Y-%m-%d}",
                    "hourly": "wind_speed_10m,wind_direction_10m",
                    "wind_speed_unit": "ms",
                    "timezone": "GMT",
                    "models": "era5",
                },
            )
            for (lat, lon), place in zip(part, places):
                h = place["hourly"]
                for t, speed, from_deg in zip(
                    h["time"], h["wind_speed_10m"], h["wind_direction_10m"]
                ):
                    key = (lat, lon, datetime.fromisoformat(t).replace(tzinfo=timezone.utc))
                    if key in keys and speed is not None and from_deg is not None:
                        wind[key] = (speed, from_deg)
            write_wind(path, wind)
            print(f"wind {month} points={len(part)} requests={asked}", file=sys.stderr, flush=True)
    return wind


def write_wind(path: Path, wind: dict) -> None:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(WIND_COLUMNS)
    for (lat, lon, hour), (speed, from_deg) in sorted(wind.items()):
        writer.writerow([f"{lat / 1e5:.2f}", f"{lon / 1e5:.2f}", f"{hour:{TIME}}", speed, from_deg])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(out.getvalue())


def downwind(conn, made: list[Replayed], wind: dict) -> list[datetime | None]:
    """The downwind guess's inside-by time for each forecast, or None where it says no."""
    paths = [
        (i, r.forecast.concession_id, d.lat_e5, d.lon_e5,
         (wind[grid_point(d) + (_nearest_hour(r.forecast.after_pass_at),)][1] + 180) % 360,
         r.rate * (forecast.HORIZON / HOUR))
        for i, r in enumerate(made) if r.rate
        for d in r.newest
    ]
    reach = {
        row["i"]: row["reach_m"]
        for row in conn.execute(
            DOWNWIND,
            {
                "edge_doubt_m": fires.EDGE_DOUBT_M,
                "ids": sorted({p[1] for p in paths}),
                **{
                    column: [p[n] for p in paths]
                    for n, column in enumerate(
                        ["i", "concession_id", "lat_e5", "lon_e5", "toward", "length_m"]
                    )
                },
            },
        )
    }
    return [
        r.forecast.after_pass_at + timedelta(hours=forecast.rounded_h(reach[i] / r.rate))
        if i in reach else None
        for i, r in enumerate(made)
    ]


def near_edge(made: list[Replayed]) -> list[datetime | None]:
    """The near-edge step's inside-by time for each forecast, or None where it says no."""
    return [
        r.forecast.after_pass_at + timedelta(hours=forecast.STEP_H)
        if forecast.nearest(r.newest)[1] <= fires.EDGE_DOUBT_M else None
        for r in made
    ]


def next_pass(made: list[Replayed]) -> list[datetime]:
    """The next-pass guess's inside-by time for each forecast."""
    return [r.forecast.after_pass_at + timedelta(hours=forecast.STEP_H) for r in made]


def v2_candidate(
    made: list[Replayed], found: dict[str, list[fires.Detection]]
) -> list[datetime | None]:
    """The rule version 2 tried's inside-by time for each forecast, or None where it says no."""
    times = {cid: sorted(d.acquired_at for d in ds) for cid, ds in found.items()}

    def lone(r: Replayed) -> bool:
        seen, at = times[r.forecast.concession_id], r.forecast.after_pass_at
        return bisect_right(seen, at) - bisect_right(seen, at - LONE) == 1

    return [None if lone(r) else at for r, at in zip(made, near_edge(made))]


def outcome_of(r: Replayed) -> str:
    if r.forecast.until_at + forecast.SETTLE > YEAR_END:
        return "ends_after_2023"
    return {"seen_before_seal": "seen_before_made", None: "waiting"}.get(r.outcome, r.outcome)


def _method(made: list[Replayed], outcomes: list[str], said: list[datetime | None]) -> dict:
    counts = {"warned": 0, "missed": 0, "did_not_come_in": 0, "stayed_out": 0}
    off = []
    for r, outcome, inside_by in zip(made, outcomes, said):
        if outcome == "seen_inside" and inside_by:
            counts["warned"] += 1
            off.append(abs(r.outcome_at - inside_by) / HOUR)
        elif outcome == "seen_inside":
            counts["missed"] += 1
        elif outcome == "not_seen_inside":
            counts["did_not_come_in" if inside_by else "stayed_out"] += 1
    return {**counts, "median_hours_off": round(statistics.median(off), 1) if off else None}


def _part(
    made: list[Replayed], outcomes: list[str], said: list[datetime | None], judged: bool
) -> dict:
    """A method's counts on the forecasts made before JUDGED_FROM, or from it, with no hours off."""
    kept = [i for i, r in enumerate(made) if (r.forecast.made_at >= JUDGED_FROM) == judged]
    counts = _method([made[i] for i in kept], [outcomes[i] for i in kept], [said[i] for i in kept])
    del counts["median_hours_off"]
    return counts


def totals(made: list[Replayed], guesses: dict[str, list[datetime | None]]) -> dict:
    outcomes = [outcome_of(r) for r in made]
    rule = [r.forecast.inside_by_at for r in made]
    split = {
        "v2_candidate": guesses["v2_candidate"], "near_edge": guesses["near_edge"], "rule": rule,
    }
    return {
        "rule_version": forecast.RULE_VERSION,
        "forecasts": len(made),
        "joined": outcomes.count("joined"),
        "seen_before_made": outcomes.count("seen_before_made"),
        "ends_after_2023": outcomes.count("ends_after_2023"),
        "rule": _method(made, outcomes, rule),
        **{name: _method(made, outcomes, said) for name, said in guesses.items()},
        **{
            part: {name: _part(made, outcomes, said, judged) for name, said in split.items()}
            for part, judged in (("picked_on", False), ("judged_on", True))
        },
    }


def _at(at: datetime | None) -> str:
    return "" if at is None else f"{at:{TIME}}"


def forecasts_csv(made: list[Replayed], guesses: dict[str, list[datetime | None]]) -> str:
    rows = []
    for r, *said in zip(made, *guesses.values()):
        outcome = outcome_of(r)
        rows.append(
            [
                r.forecast.concession_id, _at(r.first.acquired_at), f"{r.first.lat_e5 / 1e5:.5f}",
                f"{r.first.lon_e5 / 1e5:.5f}", _at(r.forecast.after_pass_at),
                _at(r.forecast.made_at), _at(r.forecast.inside_by_at), *map(_at, said), outcome,
                _at(r.outcome_at) if outcome in ("seen_inside", "seen_before_made") else "",
            ]
        )
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(COLUMNS)
    writer.writerows(sorted(rows, key=lambda row: (row[0], row[5], row[1], row[2], row[3])))
    return out.getvalue()


def main(argv: list[str] | None = None, client: httpx.Client | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="backtest-2023",
        description=(
            "Replay 2023 with forecast rule version 1, three guesses and the rule version 2 tried."
        ),
    )
    parser.add_argument("--firms", type=Path, help="a FIRMS CSV, read as is")
    parser.add_argument("--map", type=Path, help="a Trase GeoJSON map, read as is")
    parser.add_argument("--wind", type=Path, default=FIXTURES / "2023-wind.csv")
    parser.add_argument("--fetch-wind", action="store_true", help="fetch the wind into --wind")
    parser.add_argument("--out", type=Path, default=FIXTURES)
    args = parser.parse_args(argv)
    began = time.perf_counter()
    try:
        firms_data = (
            args.firms.read_bytes() if args.firms
            else concessions.download(FIRMS_URL, FIRMS_SHA256, client)
        )
        map_data = args.map.read_bytes() if args.map else concessions.download(client=client)
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1

    migrate.up()
    concessions.load(map_data)
    ids = {row["id"] for row in concessions._rows(json.loads(map_data))}
    with connect() as conn:
        found = detections(conn, hotspots(firms_data.decode()), ids)
        made = [r for cid in sorted(found) for r in replay(cid, found[cid])]
        needed = wind_needed(made)
        if args.fetch_wind:
            wind = fetch_wind(needed, client or httpx.Client(timeout=120), args.wind)
        else:
            wind = read_wind(args.wind)
        missing = sorted(needed - wind.keys())
        if missing:
            lat, lon, hour = missing[0]
            print(
                f"{args.wind} has no wind at {lat / 1e5:.2f}, {lon / 1e5:.2f} for {hour:{TIME}};"
                " run with --fetch-wind",
                file=sys.stderr,
            )
            return 1
        guesses = {
            "downwind": downwind(conn, made, wind),
            "near_edge": near_edge(made),
            "next_pass": next_pass(made),
            "v2_candidate": v2_candidate(made, found),
        }

    result = totals(made, guesses)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "2023.json").write_text(json.dumps(result, indent=2) + "\n")
    (args.out / "2023-forecasts.csv").write_text(forecasts_csv(made, guesses))
    rule, judged = result["rule"], result["judged_on"]
    print(
        f"replayed year=2023 detections={len({d.record_id for ds in found.values() for d in ds})}"
        f" forecasts={len(made)} arrivals={rule['warned'] + rule['missed']}"
        f" rule_warned={rule['warned']} downwind_warned={result['downwind']['warned']}"
        f" near_edge_warned={result['near_edge']['warned']}"
        f" next_pass_warned={result['next_pass']['warned']}"
        f" v2_candidate_warned={result['v2_candidate']['warned']}"
        f" judged_v2_candidate={judged['v2_candidate']['warned']}"
        f" judged_near_edge={judged['near_edge']['warned']}"
        f" seconds={round(time.perf_counter() - began)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
