import json
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from firewatch.fires import Detection, group
from firewatch.forecast import (
    HORIZON,
    RULE_VERSION,
    SETTLE,
    Forecast,
    _rounded_h,
    make,
    outcome,
)

SCENARIOS = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "fires" / "scenarios.json").read_text()
)
STARTED = datetime.fromisoformat(SCENARIOS["recording_started"])
T0 = datetime(2026, 10, 13, 6, 0, tzinfo=timezone.utc)
C0332 = "ID-WOOD-CONCESSION-0332"
KEY_0332 = bytes.fromhex("48f25fe185b0402018dc6cd3fab3930a760bc0c47bed4d163aa67f678000fbc1")
# One pass, 2 detections 1,054 and 1,365 m outside, first seen 2026-10-13 06:37.
YOUNG_0332 = bytes.fromhex("3c7501379ffeb9b28fe31add8904f261b5d09c139e588327cfa349a04d32a9d7")
# Seen inside since 2026-10-13 06:37; YOUNG_0332 joins it on the 17:37 pass.
OLDER_0332 = bytes.fromhex("2ee3d2538b1fc6ffbe75dd9b8a349bcf454dc7797a7976bff9a545c01c787120")
CROSSING = (-284194, 11271793)
# 899 e5 of latitude is 999.6 m, so a fire that moves it in 10 hours advances 99.96 m an hour.
LAT_E5_999_6_M = 899
# 90 e5 is 100.1 m: 10.01 m an hour over 10 hours.
LAT_E5_100_1_M = 90
# Within the 1,000 m that joins two detections into one fire.
LAT_E5_998_5_M = 898


def utc(text):
    return datetime.fromisoformat(text + "+00:00")


def concession(concession_id):
    return [
        Detection(
            record_id=bytes.fromhex(record_id[2:]),
            lat_e5=lat_e5,
            lon_e5=lon_e5,
            acquired_at=datetime.fromisoformat(acquired_at),
            inside=inside,
            edge_m=edge_m,
        )
        for record_id, lat_e5, lon_e5, acquired_at, _frp, inside, edge_m in SCENARIOS[
            "concessions"
        ][concession_id]
    ]


def fire_holding(key, at, concession_id=C0332):
    fires = group([d for d in concession(concession_id) if d.acquired_at <= at], STARTED)
    (fire,) = [f for f in fires if key in {d.record_id for d in f.detections}]
    return fire


def det(n, lat_e5=0, minutes=0, inside=False, edge_m=5000):
    return Detection(
        record_id=bytes([n]) * 32,
        lat_e5=lat_e5,
        lon_e5=10000000,
        acquired_at=T0 + timedelta(minutes=minutes),
        inside=inside,
        edge_m=edge_m,
    )


def two_passes(advance_e5, edge_m):
    """A fire that moves advance_e5 north in the 10 hours to a pass edge_m outside the edge."""
    (fire,) = group([det(1), det(2, lat_e5=advance_e5, minutes=600, edge_m=edge_m)], None)
    return fire


def no_crossing(lat_e5, lon_e5):
    raise AssertionError("crossing asked for a forecast that says not")


def at_edge(lat_e5, lon_e5):
    return CROSSING


def inside_by_h(fire):
    forecast = make(fire, "C", fire.last_seen_at, at_edge)
    if forecast.inside_by_at is None:
        return None
    return (forecast.inside_by_at - forecast.after_pass_at) / timedelta(hours=1)


def test_rule_version_is_1():
    assert RULE_VERSION == 1
    assert HORIZON == timedelta(hours=48)
    assert SETTLE == timedelta(hours=6)


def test_0332_after_each_pass():
    asked = []

    def crossing(lat_e5, lon_e5):
        asked.append((lat_e5, lon_e5))
        return CROSSING

    made = [utc("2026-10-13T20:00"), utc("2026-10-14T09:00"), utc("2026-10-14T20:00")]
    first, second, third = [make(fire_holding(KEY_0332, at), C0332, at, crossing) for at in made]

    # One pass, 954 m out at the nearest: no rate, and too far for the next pass.
    assert first == Forecast(
        concession_id=C0332,
        fire_key=KEY_0332,
        after_pass_at=utc("2026-10-13T17:37"),
        made_at=utc("2026-10-13T20:00"),
        until_at=utc("2026-10-15T20:00"),
        inside_by_at=None,
        from_lat_e5=None,
        from_lon_e5=None,
        crossing_lat_e5=None,
        crossing_lon_e5=None,
        rule_version=1,
    )
    # 731 m out, advancing 664.8 m in 12 h 41 min: 21.1 hours, rounded to 24.
    assert second == Forecast(
        concession_id=C0332,
        fire_key=KEY_0332,
        after_pass_at=utc("2026-10-14T06:18"),
        made_at=utc("2026-10-14T09:00"),
        until_at=utc("2026-10-16T09:00"),
        inside_by_at=utc("2026-10-15T06:18"),
        from_lat_e5=-284815,
        from_lon_e5=11272031,
        crossing_lat_e5=CROSSING[0],
        crossing_lon_e5=CROSSING[1],
        rule_version=1,
    )
    # 32 m out, advancing 756.0 m in 11 h 2 min: 5.9 hours, rounded up to the least, 12.
    assert third == Forecast(
        concession_id=C0332,
        fire_key=KEY_0332,
        after_pass_at=utc("2026-10-14T17:20"),
        made_at=utc("2026-10-14T20:00"),
        until_at=utc("2026-10-16T20:00"),
        inside_by_at=utc("2026-10-15T05:20"),
        from_lat_e5=-284220,
        from_lon_e5=11271781,
        crossing_lat_e5=-284194,
        crossing_lon_e5=11271793,
        rule_version=1,
    )
    assert asked == [(-284815, 11272031), (-284220, 11271781)]


def test_rate_reads_inside_at_48_hours_not_past():
    # (4,415 + 375) / 99.96 = 47.9 hours; (4,425 + 375) / 99.96 = 48.02.
    assert inside_by_h(two_passes(LAT_E5_999_6_M, 4415)) == 48
    assert make(two_passes(LAT_E5_999_6_M, 4425), "C", T0, no_crossing).inside_by_at is None
    # (100 + 375) / 10.01 = 47.5 hours; (300 + 375) / 10.01 = 67.4, so the next pass instead.
    assert inside_by_h(two_passes(LAT_E5_100_1_M, 100)) == 48
    assert inside_by_h(two_passes(LAT_E5_100_1_M, 300)) == 12


def test_rate_hours_round_to_the_nearest_12():
    # 5.9, 24.1, 29.0 and 31.0 hours.
    assert inside_by_h(two_passes(LAT_E5_999_6_M, 215)) == 12
    assert inside_by_h(two_passes(LAT_E5_999_6_M, 2035)) == 24
    assert inside_by_h(two_passes(LAT_E5_999_6_M, 2525)) == 24
    assert inside_by_h(two_passes(LAT_E5_999_6_M, 2725)) == 36
    # Haversine distances never land on a half exactly, so the halves go straight to the rounding.
    assert [_rounded_h(h) for h in (6, 18, 30, 42)] == [12, 24, 36, 48]


def test_one_pass_within_375_m_reads_the_next_pass():
    for detection in [det(1, edge_m=375), det(1, inside=True, edge_m=375)]:
        (fire,) = group([detection], None)
        assert inside_by_h(fire) == 12
    (fire,) = group([det(1, edge_m=400)], None)
    assert make(fire, "C", T0, no_crossing).inside_by_at is None


def test_nearest_detection_ties_go_to_the_first():
    (fire,) = group([det(1, lat_e5=5, edge_m=200), det(2, lat_e5=10, edge_m=200)], None)
    forecast = make(fire, "C", T0, at_edge)
    assert (forecast.from_lat_e5, forecast.from_lon_e5) == (5, 10000000)


def test_seen_inside_gets_no_forecast():
    at = utc("2026-10-15T21:00")
    assert make(fire_holding(KEY_0332, at), C0332, at, no_crossing) is None


def forecast_0332(made):
    return make(fire_holding(KEY_0332, utc(made)), C0332, utc(made), at_edge)


def sealed(forecast, sealed_at):
    return {**asdict(forecast), "sealed_at": sealed_at}


def test_seen_inside_after_the_seal():
    forecast = sealed(forecast_0332("2026-10-14T20:00"), utc("2026-10-14T20:02"))
    now = utc("2026-10-15T21:00")
    assert outcome(forecast, fire_holding(KEY_0332, now), now) == (
        "seen_inside",
        utc("2026-10-15T18:43"),
    )


def test_not_forecast_but_seen_inside():
    forecast = forecast_0332("2026-10-13T20:00")
    assert forecast.inside_by_at is None
    now = utc("2026-10-15T21:00")
    fire = fire_holding(KEY_0332, now)
    assert outcome(sealed(forecast, utc("2026-10-13T20:02")), fire, now) == (
        "seen_inside",
        utc("2026-10-15T18:43"),
    )


def test_forecast_inside_but_not_seen():
    forecast = forecast_0332("2026-10-14T20:00")
    assert forecast.inside_by_at == utc("2026-10-15T05:20")
    # The fire as it stood after its third pass, before anything saw it inside.
    fire = fire_holding(KEY_0332, utc("2026-10-14T20:00"))
    waiting = sealed(forecast, utc("2026-10-14T20:02"))
    assert outcome(waiting, fire, utc("2026-10-17T01:59")) is None
    assert outcome(waiting, fire, utc("2026-10-17T02:00")) == ("not_seen_inside", None)
    # Seen inside 15 Oct 18:43, after a forecast that ended at 18:00.
    ended = {**waiting, "until_at": utc("2026-10-15T18:00")}
    came_in = fire_holding(KEY_0332, utc("2026-10-15T21:00"))
    assert outcome(ended, came_in, utc("2026-10-15T23:59")) is None
    assert outcome(ended, came_in, utc("2026-10-16T00:00")) == ("not_seen_inside", None)


def test_seen_before_the_seal():
    forecast = forecast_0332("2026-10-14T20:00")
    now = utc("2026-10-15T21:00")
    fire = fire_holding(KEY_0332, now)
    for sealed_at in [utc("2026-10-15T18:43"), None]:
        assert outcome(sealed(forecast, sealed_at), fire, now) == (
            "seen_before_seal",
            utc("2026-10-15T18:43"),
        )
    assert outcome(sealed(forecast, utc("2026-10-15T18:42")), fire, now) == (
        "seen_inside",
        utc("2026-10-15T18:43"),
    )


def test_joined_before_seen_inside():
    made = utc("2026-10-13T09:00")
    forecast = make(fire_holding(YOUNG_0332, made), C0332, made, no_crossing)
    assert forecast.fire_key == YOUNG_0332
    assert forecast.inside_by_at is None
    now = utc("2026-10-13T20:00")
    joined = fire_holding(YOUNG_0332, now)
    assert joined.key == OLDER_0332
    assert joined.inside_from == utc("2026-10-13T06:37")
    assert outcome(sealed(forecast, utc("2026-10-13T09:02")), joined, now) == ("joined", None)


def test_join_and_arrival_in_one_run_reads_joined():
    older = det(1, edge_m=2000)
    young = det(2, lat_e5=2 * LAT_E5_998_5_M, minutes=60, edge_m=300)
    fires = group([older, young], None)
    assert [f.key for f in fires] == [older.record_id, young.record_id]
    forecast = make(fires[1], "C", T0 + timedelta(hours=2), at_edge)
    # One pass links the two fires and sees the young one inside, 400 m from the edge.
    link = det(3, lat_e5=LAT_E5_998_5_M, minutes=600)
    arrival = det(4, lat_e5=2 * LAT_E5_998_5_M + 300, minutes=600, inside=True, edge_m=400)
    (fire,) = group([older, young, link, arrival], None)
    assert fire.inside_from == arrival.acquired_at
    now = T0 + timedelta(hours=12)
    assert outcome(sealed(forecast, T0 + timedelta(hours=2)), fire, now) == ("joined", None)
