import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from firewatch.fires import (
    RULE_VERSION,
    Detection,
    FirstSeen,
    Joined,
    distance_m,
    group,
    joined,
)

ROOT = Path(__file__).parents[2]
SCENARIOS = json.loads((ROOT / "fixtures" / "fires" / "scenarios.json").read_text())
# The landing's example fire as its pack stands at 17 Oct 2026 09:00 UTC: 283 detections.
PACK_0332 = json.loads((ROOT / "web" / "public" / "case" / "pack-0332.json").read_text())
STARTED = datetime.fromisoformat(SCENARIOS["recording_started"])
T0 = datetime(2026, 10, 13, 6, 0, tzinfo=timezone.utc)
# One degree of latitude on the 6,371,008.8 m sphere is 111,195.08 m.
LAT_E5_999_M = 898  # 998.5 m
LAT_E5_1001_M = 901  # 1,001.9 m


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


def pack_0332():
    return [
        Detection(
            record_id=bytes.fromhex(h["record_id"][2:]),
            lat_e5=h["lat_e5"],
            lon_e5=h["lon_e5"],
            acquired_at=datetime.fromisoformat(h["acquired_at"]),
            inside=match["inside"],
            edge_m=match["edge_m"],
        )
        for h in PACK_0332["hotspots"]
        for match in h["concessions"]
        if match["id"] == "ID-WOOD-CONCESSION-0332"
    ]


def fire_first_seen(fires, at, size):
    (fire,) = [f for f in fires if f.first_seen_at == utc(at) and len(f.detections) == size]
    return fire


def det(n, lat_e5=0, minutes=0, inside=True, edge_m=1000):
    return Detection(
        record_id=bytes([n]) * 32,
        lat_e5=lat_e5,
        lon_e5=10000000,
        acquired_at=T0 + timedelta(minutes=minutes),
        inside=inside,
        edge_m=edge_m,
    )


def test_rule_version_is_2():
    assert RULE_VERSION == 2


def test_0332_groups_into_34_fires():
    assert len(group(concession("ID-WOOD-CONCESSION-0332"), STARTED)) == 34


def test_0332_first_seen_outside_then_inside():
    fire = fire_first_seen(
        group(concession("ID-WOOD-CONCESSION-0332"), STARTED), "2026-10-13T17:37", 19
    )
    assert fire.passes == 4
    assert [fire.pass_numbers.count(n) for n in (1, 2, 3, 4)] == [3, 6, 4, 6]
    assert fire.first_seen == FirstSeen(reading="outside", inside=False, edge_m=954)
    assert fire.inside_from == utc("2026-10-15T18:43")
    assert fire.outside_from == utc("2026-10-13T17:37")
    assert fire.last_seen_at == utc("2026-10-15T18:43")
    assert fire.recorded_before_h == 38
    assert fire.key == fire.detections[0].record_id
    assert fire.never_spread is False


def test_0356_first_seen_inside_and_0372_outside():
    fire = fire_first_seen(
        group(concession("ID-WOOD-CONCESSION-0356"), STARTED), "2026-10-14T06:20", 4
    )
    assert fire.passes == 2
    assert fire.first_seen == FirstSeen(reading="inside", inside=True, edge_m=409)
    assert fire.inside_from == utc("2026-10-14T06:20")
    assert fire.outside_from is None
    assert fire.recorded_before_h is None
    assert fire.first_alone_h is None
    assert joined(fire) == []

    same = fire_first_seen(
        group(concession("ID-WOOD-CONCESSION-0372"), STARTED), "2026-10-14T06:20", 4
    )
    assert same.key == fire.key
    assert same.first_seen == FirstSeen(reading="outside", inside=False, edge_m=4182)


def test_0540_too_close_to_tell():
    fire = fire_first_seen(
        group(concession("ID-WOOD-CONCESSION-0540"), STARTED), "2026-10-14T06:18", 8
    )
    assert fire.passes == 4
    assert fire.first_seen == FirstSeen(reading="edge", inside=True, edge_m=158)
    assert fire.inside_from == utc("2026-10-15T05:59")
    assert fire.outside_from is None


def test_0540_never_spread():
    # Another 0540 fire is also first seen 2026-10-12 06:57 with 6 detections; it ends on 14 Oct.
    (fire,) = [
        f
        for f in group(concession("ID-WOOD-CONCESSION-0540"), STARTED)
        if f.first_seen_at == utc("2026-10-12T06:57")
        and f.last_seen_at == utc("2026-10-15T18:41")
        and len(f.detections) == 6
    ]
    assert fire.passes == 5
    assert all(d.inside for d in fire.detections)
    assert round(max(distance_m(fire.detections[0], d) for d in fire.detections)) == 483
    assert fire.never_spread is True


def test_joins_at_999_m_not_at_1001_m():
    assert len(group([det(1), det(2, lat_e5=LAT_E5_999_M)], None)) == 1
    assert len(group([det(1), det(2, lat_e5=LAT_E5_1001_M)], None)) == 2


def test_joins_at_47_h_not_at_49_h():
    assert len(group([det(1), det(2, minutes=47 * 60)], None)) == 1
    assert len(group([det(1), det(2, minutes=49 * 60)], None)) == 2


def test_new_pass_after_more_than_30_minutes():
    (together,) = group([det(1), det(2, minutes=30)], None)
    assert together.pass_numbers == (1, 1)
    (split,) = group([det(1), det(2, minutes=31)], None)
    assert split.pass_numbers == (1, 2)
    assert split.passes == 2


def test_chain_merging_two_fires_keeps_the_earlier_key():
    older = det(1, minutes=0)
    newer = det(2, lat_e5=2 * LAT_E5_999_M, minutes=60)
    assert {f.key for f in group([newer, older], None)} == {older.record_id, newer.record_id}
    link = det(3, lat_e5=LAT_E5_999_M, minutes=120)
    (fire,) = group([newer, link, older], None)
    assert fire.key == older.record_id
    assert fire.detections == (older, newer, link)


def test_order_breaks_ties_by_lowest_lat_then_lon():
    north = det(1, lat_e5=10)
    south = det(2, lat_e5=5)
    (fire,) = group([north, south], None)
    assert fire.detections == (south, north)
    assert fire.key == south.record_id


def test_recorded_before_h_only_under_48():
    (fire,) = group([det(1)], T0 - timedelta(hours=38, minutes=59))
    assert fire.recorded_before_h == 38
    (fire,) = group([det(1)], T0 - timedelta(hours=48))
    assert fire.recorded_before_h is None
    (fire,) = group([det(1)], None)
    assert fire.recorded_before_h is None


def test_never_spread_at_4_passes_not_at_3():
    four = [det(n, minutes=n * 600) for n in range(4)]
    (fire,) = group(four, None)
    assert fire.passes == 4
    assert fire.never_spread is True
    (fire,) = group(four[:3], None)
    assert fire.never_spread is False


def test_reading_both_wins_over_edge():
    (fire,) = group([det(1, inside=True, edge_m=100), det(2, inside=False, edge_m=500)], None)
    assert fire.first_seen == FirstSeen(reading="both", inside=True, edge_m=100)


def test_0332_first_seen_alone_for_25_hours():
    (fire,) = group(pack_0332(), None)
    assert (len(fire.detections), fire.passes) == (283, 8)
    assert fire.first_seen == FirstSeen(reading="outside", inside=False, edge_m=3100)
    assert fire.first_alone_h == 25


def test_first_alone_only_after_more_than_14_h():
    (fire,) = group([det(1), det(2, minutes=14 * 60)], None)
    assert fire.first_alone_h is None
    (fire,) = group([det(1), det(2, minutes=14 * 60 + 1)], None)
    assert fire.first_alone_h == 14
    (fire,) = group([det(1), det(2, lat_e5=10), det(3, minutes=20 * 60)], None)
    assert fire.first_alone_h is None


def test_one_pass_fire_is_never_first_alone():
    (fire,) = group([det(1)], None)
    assert fire.first_alone_h is None


def test_0332_joined_a_fire_first_seen_on_both_sides():
    (fire,) = group(pack_0332(), None)
    (other,) = joined(fire)
    assert other.at == utc("2026-10-14T17:20")
    assert other.first_seen_at == utc("2026-10-13T06:37")
    assert other.first_seen == FirstSeen(reading="both", inside=False, edge_m=2)


def test_fires_that_joined_each_other_first_are_listed_once():
    first = det(1)
    # Two fires 2 km apart and 2 km from the first, joined to each other on pass 2.
    north = det(2, lat_e5=2 * LAT_E5_999_M, inside=True, edge_m=500)
    farther = det(3, lat_e5=4 * LAT_E5_999_M, inside=False, edge_m=800)
    between = det(4, lat_e5=3 * LAT_E5_999_M, minutes=600)
    link = det(5, lat_e5=LAT_E5_999_M, minutes=1200)
    (fire,) = group([first, north, farther, between, link], None)
    assert joined(fire) == [
        Joined(
            at=T0 + timedelta(minutes=1200),
            first_seen_at=T0,
            first_seen=FirstSeen(reading="both", inside=True, edge_m=500),
        )
    ]


def test_two_fires_joined_on_one_pass_are_both_listed():
    first = det(1)
    north = det(2, lat_e5=2 * LAT_E5_999_M, minutes=600, inside=True, edge_m=400)
    farther = det(3, lat_e5=4 * LAT_E5_999_M, minutes=600, inside=False, edge_m=2000)
    links = [
        det(4, lat_e5=LAT_E5_999_M, minutes=1200),
        det(5, lat_e5=3 * LAT_E5_999_M, minutes=1200),
    ]
    (fire,) = group([first, north, farther, *links], None)
    assert joined(fire) == [
        Joined(
            at=T0 + timedelta(minutes=1200),
            first_seen_at=T0 + timedelta(minutes=600),
            first_seen=FirstSeen(reading="inside", inside=True, edge_m=400),
        ),
        Joined(
            at=T0 + timedelta(minutes=1200),
            first_seen_at=T0 + timedelta(minutes=600),
            first_seen=FirstSeen(reading="outside", inside=False, edge_m=2000),
        ),
    ]


def test_a_fire_joined_on_the_pass_it_appears_is_not_listed():
    appears = det(2, lat_e5=2 * LAT_E5_999_M, minutes=600)
    link = det(3, lat_e5=LAT_E5_999_M, minutes=600)
    (fire,) = group([det(1), appears, link], None)
    assert joined(fire) == []
