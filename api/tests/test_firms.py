from datetime import datetime, timezone
from pathlib import Path

import httpx

from firewatch.firms import BACKFILL_DAYS, DAYS, Hotspot, fetch, parse

FIRMS_FIXTURES = Path(__file__).parents[2] / "fixtures" / "firms"
HEADER = (
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,"
    "confidence,version,bright_ti5,frp,daynight\n"
)


def fixture(name):
    return (FIRMS_FIXTURES / name).read_text()


def row(lat="0.4312", lon="101.2154", date="2026-10-12", time="618", conf="n", frp="14.2"):
    return f"{lat},{lon},345.06,0.52,0.5,{date},{time},N20,VIIRS,{conf},2.0NRT,298.4,{frp},D\n"


def test_parse_keeps_every_row():
    hotspots = parse(fixture("fire-record.csv"))
    assert len(hotspots) == 25
    assert hotspots[0] == Hotspot(
        source="VIIRS_NOAA20_NRT",
        lat_e5=-358175,
        lon_e5=10571567,
        acquired_at=datetime(2026, 10, 14, 6, 18, tzinfo=timezone.utc),
        frp_e2=520,
        confidence="n",
    )


def test_short_acq_time_is_zero_padded():
    (hotspot,) = parse(HEADER + row(date="2026-10-09", time="427"))
    assert hotspot.acquired_at == datetime(2026, 10, 9, 4, 27, tzinfo=timezone.utc)


def test_coordinates_and_frp_convert_exactly():
    (hotspot,) = parse(HEADER + row(lat="-8.21427", lon="140.72481", frp="160.77"))
    assert (hotspot.lat_e5, hotspot.lon_e5, hotspot.frp_e2) == (-821427, 14072481, 16077)


def test_bad_rows_are_skipped():
    bad = [
        row(lat="91"),
        row(lon="-180.5"),
        row(lat="abc"),
        row(lat="0.123456"),
        row(frp="-1"),
        row(frp="1.234"),
        row(frp="NaN"),
        row(conf="x"),
        row(time="2460"),
        row(date="2026-13-01"),
        "0.5,101.2\n",
    ]
    good = row()
    assert parse(HEADER + "".join(bad) + good) == parse(HEADER + good)
    assert len(parse(HEADER + good)) == 1


def test_empty_csv_has_no_hotspots():
    assert parse(fixture("empty.csv")) == []


def test_fetch_requests_the_indonesia_box_for_the_given_days():
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(200, text=fixture("fire-record.csv"))

    client = httpx.Client(transport=httpx.MockTransport(handler))
    hotspots = fetch("http://firms.test", "KEY", BACKFILL_DAYS, client=client)
    fetch("http://firms.test", "KEY", DAYS, client=client)
    assert seen == [
        "http://firms.test/api/area/csv/KEY/VIIRS_NOAA20_NRT/95,-11,141,6/5",
        "http://firms.test/api/area/csv/KEY/VIIRS_NOAA20_NRT/95,-11,141,6/2",
    ]
    assert hotspots == parse(fixture("fire-record.csv"))
