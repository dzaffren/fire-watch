import csv
import hashlib
import io
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from firewatch import backtest, concessions, fires, forecast, migrate
from firewatch.db import connect

ROOT = Path(__file__).parents[2]
CUT = ROOT / "fixtures" / "backtest"
# Every 2023 row within 5 km of these three concessions, 2023-09-20 to 2023-10-20.
FIRMS_CUT = CUT / "2023-cut.csv"
TRASE_CUT = CUT / "trase-cut.geojson"
WIND_CUT = CUT / "2023-wind-cut.csv"
FIRE_ORIGIN = (ROOT / "fixtures" / "firms" / "fire-origin.csv").read_text()
BACKTEST = Path(sys.executable).parent / "backtest-2023"
C0263 = "ID-WOOD-CONCESSION-0263"
C0264 = "ID-WOOD-CONCESSION-0264"
C0332 = "ID-WOOD-CONCESSION-0332"


def utc(text):
    return datetime.fromisoformat(text + "+00:00")


def run_backtest(url, out, firms=FIRMS_CUT):
    return subprocess.run(
        [BACKTEST, "--firms", firms, "--map", TRASE_CUT, "--wind", WIND_CUT, "--out", out],
        env={**os.environ, "DATABASE_URL": url},
        capture_output=True,
        text=True,
        timeout=300,
    )


def rows_of(out):
    return list(csv.DictReader(io.StringIO((out / "2023-forecasts.csv").read_text())))


def row(rows, concession_id, after_pass_at, **fields):
    (found,) = [
        r for r in rows
        if r["concession_id"] == concession_id and r["after_pass_at"] == after_pass_at
        and all(r[k] == v for k, v in fields.items())
    ]
    return found


@pytest.fixture(scope="module")
def cut(database_url, tmp_path_factory):
    """The command run once on the cut: its output folder and what it printed."""
    migrate.up(database_url)
    out = tmp_path_factory.mktemp("cut")
    result = run_backtest(database_url, out)
    assert result.returncode == 0, result.stderr
    yield out, result.stdout
    while migrate.down(database_url):
        pass


@pytest.fixture(scope="module")
def found(cut, database_url):
    """The cut's detections by concession."""
    with connect(database_url) as conn:
        return backtest.detections(
            conn, backtest.hotspots(FIRMS_CUT.read_text()), {C0263, C0264, C0332}
        )


@pytest.fixture(scope="module")
def replayed(found):
    """The cut's forecasts by concession, in the order the replay made them."""
    return {cid: backtest.replay(cid, detections) for cid, detections in found.items()}


def made_after(replayed, concession_id, after_pass_at, inside_by_at):
    (found,) = [
        r for r in replayed[concession_id]
        if r.forecast.after_pass_at == after_pass_at and r.forecast.inside_by_at == inside_by_at
    ]
    return found


def seen_0332(replayed):
    """The forecast after the 0332 fire's one pass, which a later pass saw inside."""
    (found,) = [
        r for r in replayed[C0332]
        if r.forecast.after_pass_at == utc("2023-10-14T05:46") and r.outcome == "seen_inside"
    ]
    return found


def test_0263_warned_19_minutes_off(cut, found, replayed):
    out, _ = cut
    r = row(rows_of(out), C0263, "2023-09-27T06:05Z", rule_inside_by="2023-09-28T06:05Z")
    assert (r["fire_first_seen_at"], r["fire_latitude"], r["fire_longitude"]) == (
        "2023-09-26T06:24Z", "-2.99651", "115.32928",
    )
    assert (r["outcome"], r["seen_inside_at"]) == ("seen_inside", "2023-09-28T05:46Z")

    made = made_after(replayed, C0263, utc("2023-09-27T06:05"), utc("2023-09-28T06:05"))
    assert min(d.edge_m for d in made.newest) == 539
    assert not any(d.inside for d in made.newest)
    (fire,) = [
        f for f in fires.group(found[C0263], None)
        if made.forecast.fire_key in {d.record_id for d in f.detections}
    ]
    assert [(d.inside, d.edge_m) for d in fire.detections if d.acquired_at == made.outcome_at] == [
        (True, 523)
    ]
    assert abs(made.outcome_at - made.forecast.inside_by_at).total_seconds() == 19 * 60


def test_0332_missed(cut, replayed):
    out, _ = cut
    r = row(rows_of(out), C0332, "2023-10-14T05:46Z", outcome="seen_inside")
    assert (r["fire_first_seen_at"], r["rule_inside_by"], r["seen_inside_at"]) == (
        "2023-10-14T05:46Z", "", "2023-10-16T05:08Z",
    )
    assert min(d.edge_m for d in seen_0332(replayed).newest) == 2168


def test_0264_did_not_come_in(cut, replayed):
    out, _ = cut
    r = row(rows_of(out), C0264, "2023-09-28T18:28Z")
    assert (r["fire_first_seen_at"], r["rule_inside_by"], r["outcome"], r["seen_inside_at"]) == (
        "2023-09-28T05:46Z", "2023-09-29T06:28Z", "not_seen_inside", "",
    )
    made = made_after(replayed, C0264, utc("2023-09-28T18:28"), utc("2023-09-29T06:28"))
    assert min(d.edge_m for d in made.newest) == 1334


def test_totals_count_every_forecast_in_the_csv(cut):
    out, stdout = cut
    rows = rows_of(out)
    totals = json.loads((out / "2023.json").read_text())

    def counted(said):
        return {
            "warned": sum(r["outcome"] == "seen_inside" and r[said] != "" for r in rows),
            "missed": sum(r["outcome"] == "seen_inside" and r[said] == "" for r in rows),
            "did_not_come_in": sum(
                r["outcome"] == "not_seen_inside" and r[said] != "" for r in rows
            ),
            "stayed_out": sum(r["outcome"] == "not_seen_inside" and r[said] == "" for r in rows),
        }

    assert totals["rule_version"] == 1
    assert totals["forecasts"] == len(rows)
    for outcome, total in [
        ("joined", "joined"), ("seen_before_made", "seen_before_made"),
        ("ends_after_2023", "ends_after_2023"),
    ]:
        assert totals[total] == sum(r["outcome"] == outcome for r in rows)
    for method in ("rule", "downwind", "near_edge", "next_pass"):
        assert {
            k: v for k, v in totals[method].items() if k != "median_hours_off"
        } == counted(f"{method}_inside_by")
    assert totals["rule"]["missed"] >= 1 and totals["rule"]["did_not_come_in"] >= 1
    assert totals["rule"]["median_hours_off"] is not None
    assert stdout.startswith(
        f"replayed year=2023 detections=625 forecasts={len(rows)}"
        f" arrivals={totals['rule']['warned'] + totals['rule']['missed']}"
        f" rule_warned={totals['rule']['warned']} downwind_warned={totals['downwind']['warned']}"
        f" near_edge_warned={totals['near_edge']['warned']}"
        f" next_pass_warned={totals['next_pass']['warned']} seconds="
    )


def test_downwind_misses_0263(cut, replayed):
    out, _ = cut
    made = made_after(replayed, C0263, utc("2023-09-27T06:05"), utc("2023-09-28T06:05"))
    assert round(made.rate) == 44
    wind = backtest.read_wind(WIND_CUT)
    hour = utc("2023-09-27T06:00")
    assert {wind[backtest.grid_point(d) + (hour,)] for d in made.newest} == {(3.5, 127.0)}

    r = row(rows_of(out), C0263, "2023-09-27T06:05Z", rule_inside_by="2023-09-28T06:05Z")
    assert r["downwind_inside_by"] == ""


def test_one_pass_fire_gets_no_guess(cut, replayed):
    out, _ = cut
    assert seen_0332(replayed).rate is None
    r = row(rows_of(out), C0332, "2023-10-14T05:46Z", outcome="seen_inside")
    assert r["downwind_inside_by"] == ""


def test_near_edge_misses_0263(cut, replayed):
    out, _ = cut
    made = made_after(replayed, C0263, utc("2023-09-27T06:05"), utc("2023-09-28T06:05"))
    assert forecast.nearest(made.newest)[1] == 539

    r = row(rows_of(out), C0263, "2023-09-27T06:05Z", rule_inside_by="2023-09-28T06:05Z")
    assert (r["near_edge_inside_by"], r["outcome"], r["seen_inside_at"]) == (
        "", "seen_inside", "2023-09-28T05:46Z",
    )


def test_near_edge_says_no_to_0264_and_it_stays_out(cut, replayed):
    out, _ = cut
    made = made_after(replayed, C0264, utc("2023-09-28T18:28"), utc("2023-09-29T06:28"))
    assert forecast.nearest(made.newest)[1] == 1334

    r = row(rows_of(out), C0264, "2023-09-28T18:28Z")
    assert (r["near_edge_inside_by"], r["outcome"]) == ("", "not_seen_inside")


def test_near_edge_says_12_hours_within_375_m(cut, replayed):
    out, _ = cut
    # Rule version 1 step 4 gives this one 24 hours, from its advance rate.
    made = made_after(replayed, C0332, utc("2023-10-14T05:46"), utc("2023-10-15T05:46"))
    assert forecast.nearest(made.newest)[1] == 105

    r = row(rows_of(out), C0332, "2023-10-14T05:46Z", rule_inside_by="2023-10-15T05:46Z")
    assert r["near_edge_inside_by"] == "2023-10-14T17:46Z"


def test_next_pass_warns_of_0332_35_hours_off(cut):
    out, _ = cut
    r = row(rows_of(out), C0332, "2023-10-14T05:46Z", outcome="seen_inside")
    assert (r["rule_inside_by"], r["near_edge_inside_by"], r["next_pass_inside_by"]) == (
        "", "", "2023-10-14T17:46Z",
    )
    seen, said = (utc(r[k].rstrip("Z")) for k in ("seen_inside_at", "next_pass_inside_by"))
    assert round((seen - said) / timedelta(hours=1), 1) == 35.4


def test_next_pass_warning_on_0264_did_not_come_in(cut):
    out, _ = cut
    r = row(rows_of(out), C0264, "2023-09-28T18:28Z")
    assert (r["next_pass_inside_by"], r["outcome"]) == ("2023-09-29T06:28Z", "not_seen_inside")


def test_committed_guesses_say_yes_only_where_the_rule_does():
    # The forecast panel says so of the committed 2023 result.
    rows = rows_of(CUT)
    for said in ("downwind_inside_by", "near_edge_inside_by"):
        assert [r for r in rows if r[said] and not r["rule_inside_by"]] == []


def test_two_runs_write_the_same_bytes(cut, database_url, tmp_path):
    out, _ = cut
    result = run_backtest(database_url, tmp_path)

    assert result.returncode == 0, result.stderr
    for name in ("2023.json", "2023-forecasts.csv"):
        assert (tmp_path / name).read_bytes() == (out / name).read_bytes()


def test_changed_firms_file_stops_it(migrated_db, tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", migrated_db)
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(200, content=FIRMS_CUT.read_bytes())

    out = tmp_path / "out"
    code = backtest.main(
        ["--map", str(TRASE_CUT), "--wind", str(WIND_CUT), "--out", str(out)],
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    got = hashlib.sha256(FIRMS_CUT.read_bytes()).hexdigest()
    assert code == 1
    assert seen == [backtest.FIRMS_URL]
    assert capsys.readouterr().err.strip() == (
        f"{backtest.FIRMS_URL} has changed: sha256 {got}, expected {backtest.FIRMS_SHA256}"
    )
    assert backtest.FIRMS_SHA256.startswith("99969d97")
    assert not out.exists()


def test_forecast_ending_in_2024_is_not_counted(migrated_db, tmp_path):
    header = FIRMS_CUT.read_text().splitlines(keepends=True)[0]
    # One pass 539 m outside 0263 each time: no rate, so "not forecast". The 30 Dec forecast's
    # 48 hours and 6 more end on 1 Jan 2024 at 16:00.
    one_pass = "-2.98744,115.33713,330.0,0.4,0.5,{},0605,N20,VIIRS,n,2,290.0,5.0,D,0\n"
    firms = tmp_path / "year-end.csv"
    firms.write_text(header + one_pass.format("2023-12-27") + one_pass.format("2023-12-30"))
    out = tmp_path / "out"

    result = run_backtest(migrated_db, out, firms)

    assert result.returncode == 0, result.stderr
    assert [(r["made_at"], r["outcome"]) for r in rows_of(out)] == [
        ("2023-12-27T10:00Z", "not_seen_inside"),
        ("2023-12-30T10:00Z", "ends_after_2023"),
    ]
    totals = json.loads((out / "2023.json").read_text())
    assert totals["ends_after_2023"] == 1
    assert totals["rule"] == totals["downwind"] == {
        "warned": 0, "missed": 0, "did_not_come_in": 0, "stayed_out": 1, "median_hours_off": None,
    }


def test_replay_of_fire_origin_matches_the_recorder(migrated_db):
    concessions.load(
        (ROOT / "fixtures" / "concessions" / "trase-cut.geojson").read_bytes(), migrated_db
    )
    with connect(migrated_db) as conn:
        found = backtest.detections(conn, backtest.hotspots(FIRE_ORIGIN), {C0332})

    made = backtest.replay(C0332, found[C0332])

    # The forecasts test_forecast.py and test_record_hotspots.py have, each made by the first
    # hourly run 3 hours after its pass. The 15 Oct 18:43 pass sees the fire inside.
    seen = utc("2026-10-15T18:43")
    assert [
        (r.forecast.after_pass_at, r.forecast.made_at, r.forecast.inside_by_at,
         r.forecast.from_lat_e5, r.forecast.from_lon_e5, r.outcome, r.outcome_at)
        for r in made
    ] == [
        (utc("2026-10-13T17:37"), utc("2026-10-13T21:00"), None, None, None, "seen_inside", seen),
        (utc("2026-10-14T06:18"), utc("2026-10-14T10:00"), utc("2026-10-15T06:18"),
         -284815, 11272031, "seen_inside", seen),
        (utc("2026-10-14T17:20"), utc("2026-10-14T21:00"), utc("2026-10-15T05:20"),
         -284220, 11271781, "seen_inside", seen),
    ]


def test_fetch_wind_asks_again_after_a_cut_answer_and_keeps_what_it_has(tmp_path, monkeypatch):
    monkeypatch.setattr(backtest, "WIND_PAUSE_S", 0)
    hour = utc("2023-09-27T06:00")
    kept, wanted = (-300000, 11525000, hour), (-375000, 11625000, hour)
    path = tmp_path / "wind.csv"
    backtest.write_wind(path, {kept: (3.5, 127)})
    asked = []

    def handler(request):
        asked.append(dict(request.url.params))
        if len(asked) == 1:
            return httpx.Response(200, content=b'[{"hourly": {"time": ["2023-09-27T00:00"')
        times = [f"2023-09-27T{h:02d}:00" for h in range(24)]
        hourly = {"time": times, "wind_speed_10m": [2.25] * 24, "wind_direction_10m": [90] * 24}
        return httpx.Response(200, json=[{"hourly": hourly}])

    wind = backtest.fetch_wind(
        {kept, wanted}, httpx.Client(transport=httpx.MockTransport(handler)), path
    )

    assert wind == {kept: (3.5, 127.0), wanted: (2.25, 90)}
    assert [(a["latitude"], a["longitude"], a["models"]) for a in asked] == [
        ("-3.75", "116.25", "era5"), ("-3.75", "116.25", "era5"),
    ]
    assert backtest.read_wind(path) == wind
