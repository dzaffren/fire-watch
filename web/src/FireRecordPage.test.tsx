import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { keccak256, toHex, zeroHash, type Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConcessionListing, ConcessionSummary, FireSummary, Forecast, HotspotRecord, Ring } from "./api";
import { fingerprint, forecastFingerprint } from "./fingerprint";
import { FireMap } from "./FireMap";
import { FireRecordPage, type FireRecordSource } from "./FireRecordPage";
import { shortHash } from "./format";
import raw from "./preview/fire-origin.fixture.json";

vi.mock("./FireMap", () => ({ FireMap: vi.fn(() => null) }));

// Real VIIRS NOAA-20 detections from 2026-10-12 to 15, grouped into fires by the spec's rule; see the preview.
type FixtureHotspot = Pick<
  HotspotRecord,
  "lat_e5" | "lon_e5" | "acquired_unix" | "frp_e2" | "confidence" | "concessions" | "fire_key" | "pass"
>;
interface Fixture {
  map_version: string;
  from: string;
  to: string;
  today: string;
  recording_started: string;
  concessions: ConcessionSummary[];
  detail: Record<string, ConcessionSummary & { boundary: Ring[]; hotspots: FixtureHotspot[]; fires: FireSummary[] }>;
}
const fixture = raw as unknown as Fixture;

const ID = "ID-WOOD-CONCESSION-0332";
// Scenario 1's fire, by the record ID of its first detection.
const KEY = "0x48f25fe185b0402018dc6cd3fab3930a760bc0c47bed4d163aa67f678000fbc1";
// One of the fire's first-pass detections, outside 0332 and 954 m from its edge.
const FIRST = { lat_e5: -285057, lon_e5: 11271823 };
const LIST = "4 concessions, ranked by hotspots inside.";
const SLOW_NOTE = "Starting the server after a quiet spell. This can take up to a minute; the list loads on its own.";
const DAY_S = 86400;

const iso = (unix: number) => new Date(unix * 1000).toISOString().replace(".000", "");
const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;
const isAt = (h: { lat_e5: number; lon_e5: number }, at: { lat_e5: number; lon_e5: number }) =>
  h.lat_e5 === at.lat_e5 && h.lon_e5 === at.lon_e5;
const fp = (hash: Hex) => shortHash(hash.slice(2), 10, 6);

function records(id: string): HotspotRecord[] {
  return fixture.detail[id].hotspots.map((h): HotspotRecord => {
    const record_id = keccak256(toHex(`${id},${h.lat_e5},${h.lon_e5},${h.acquired_unix}`));
    return {
      ...h,
      record_id,
      source: "VIIRS_NOAA20_NRT",
      acquired_at: iso(h.acquired_unix),
      tx_hash: keccak256(record_id),
      sealed_at: iso(h.acquired_unix + 2 * 3600 + 47 * 60),
      fingerprint_version: 2,
      map_version: fixture.map_version,
    };
  });
}

/** The fixture as the API would serve it; `edit` changes stored records after they were sealed. */
function fixtureSource(edit: (r: HotspotRecord) => HotspotRecord = (r) => r): FireRecordSource {
  const sealed = new Map<Hex, HotspotRecord>();
  const stored = (id: string) =>
    records(id).map((r) => {
      sealed.set(r.record_id, r);
      return edit(r);
    });
  return {
    concessions: vi.fn(async (from: string, to: string): Promise<ConcessionListing> => ({
      recording_started: fixture.recording_started,
      map_version: fixture.map_version,
      concessions: from <= fixture.to && to >= fixture.from ? fixture.concessions : [],
    })),
    concession: vi.fn(async (id: string, from: string, to: string) => {
      const d = fixture.detail[id];
      const hotspots = stored(id).filter((h) => h.acquired_unix >= day(from) && h.acquired_unix < day(to) + DAY_S);
      const keys = new Set(hotspots.map((h) => h.fire_key));
      const inside = hotspots.filter((h) => h.concessions.find((m) => m.id === id)!.inside).length;
      return { ...d, inside, near: hotspots.length - inside, hotspots, fires: d.fires.filter((f) => keys.has(f.key)) };
    }),
    // Every detection of the fire, oldest first, whatever the dates, as the API answers.
    fire: vi.fn(async (id: string, key: Hex) => ({
      ...fixture.detail[id].fires.find((f) => f.key === key)!,
      hotspots: stored(id)
        .filter((h) => h.fire_key === key)
        .sort((a, b) => a.acquired_unix - b.acquired_unix || a.lat_e5 - b.lat_e5),
      as_of_unix: 1792227600,
    })),
    packHref: vi.fn((id: string, f: { key: Hex; as_of_unix: number }) => `/?pack=${id}&fire=${f.key}&as_of=${f.as_of_unix}`),
    // FireRecords holds each record as first stored, sealed 2 h 47 min after detection by the chain's clock.
    sealOf: vi.fn(async (r: HotspotRecord) => {
      const original = sealed.get(r.record_id)!;
      return { fingerprint: fingerprint(original), sealedAt: Date.parse(original.sealed_at!) / 1000 };
    }),
    fingerprint,
  };
}

const at = (text: string) => Date.parse(`${text}Z`) / 1000;
const SEEN_INSIDE = at("2026-10-15T18:43:00");

/** The fire's three forecasts of scenario 1, newest first, as seen inside on its 15 Oct 18:43 pass. */
function scenario1Forecasts(): Forecast[] {
  const made = (pass: string, madeAt: string, insideBy: string | null, i: number): Forecast => {
    const record_id = keccak256(toHex(`forecast:${ID}:${KEY}:${madeAt}`));
    const point = (lat_e5: number, lon_e5: number) => (insideBy ? { lat_e5, lon_e5 } : null);
    return {
      record_id,
      concession_id: ID,
      fire_key: KEY,
      after_pass_unix: at(pass),
      made_unix: at(madeAt),
      until_unix: at(madeAt) + 2 * DAY_S,
      inside_by_unix: insideBy ? at(insideBy) : null,
      from: point(-284220 - i, 11271781),
      crossing: point(-284194 - i, 11271793),
      rule_version: 1,
      tx_hash: keccak256(record_id),
      sealed_at: iso(at(madeAt) + 120),
      outcome: "seen_inside",
      outcome_unix: SEEN_INSIDE,
    };
  };
  return [
    made("2026-10-14T17:20:00", "2026-10-14T20:00:00", "2026-10-15T05:20:00", 0),
    made("2026-10-14T06:18:00", "2026-10-14T09:00:00", "2026-10-15T06:18:00", 1),
    made("2026-10-13T17:37:00", "2026-10-13T20:00:00", null, 2),
  ];
}

/** The fixture with scenario 1's forecasts on its fire; `edit` changes a stored forecast after its seal. */
function forecastSource(edit: (f: Forecast, i: number) => Forecast = (f) => f): FireRecordSource {
  const source = fixtureSource();
  const sealed = scenario1Forecasts();
  const fire = source.fire;
  return {
    ...source,
    fire: vi.fn(async (id: string, key: Hex) => ({
      ...(await fire(id, key)),
      forecasts: sealed.map(edit),
      forecasts_from_unix: at("2026-10-13T09:00:00"),
    })),
    forecastSeals: vi.fn(async (forecasts: Forecast[]) =>
      forecasts.map((f) => {
        const original = sealed.find((s) => s.record_id === f.record_id)!;
        return { fingerprint: forecastFingerprint(original), sealedAt: original.made_unix + 120 };
      }),
    ),
    forecastFingerprint,
  };
}

const from = () => screen.getByLabelText("From") as HTMLInputElement;
const to = () => screen.getByLabelText("To") as HTMLInputElement;
const pick = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });
const map = () => vi.mocked(FireMap).mock.lastCall![0];

function rowWith(...texts: string[]): HTMLElement {
  const rows = screen.getAllByRole("row").filter((r) => texts.every((t) => r.textContent?.includes(t)));
  expect(rows).toHaveLength(1);
  return rows[0];
}

const fireRow = () => rowWith("13 Oct 17:37", "4 passes, 19 detections");
const firstRow = () => rowWith("13 Oct 17:37", "2.76 MW");
const selectedRows = () => screen.getAllByRole("row").filter((r) => r.getAttribute("aria-selected") === "true");

function kv(name: string) {
  return screen.getByText(name, { selector: "dt" }).nextElementSibling as HTMLElement;
}

/** Opens 0332 from the list and then scenario 1's fire. */
async function openFire(source: FireRecordSource, dates = { from: "2026-10-12", to: "2026-10-15" }) {
  render(<FireRecordPage source={source} today={fixture.today} initialDates={dates} />);
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${ID}`) }));
  await screen.findByText("Fires", { selector: "dt" });
  fireEvent.click(within(fireRow()).getByRole("button"));
  await screen.findByRole("heading", { name: "First seen outside, 950 m from the edge" });
}

beforeEach(() => {
  vi.mocked(FireMap).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FireRecordPage", () => {
  it("links back to the landing as About Fire Watch, when given its address", async () => {
    render(<FireRecordPage source={fixtureSource()} today={fixture.today} aboutHref="/" />);
    await screen.findByText(LIST);

    expect(screen.getByRole("banner")).toHaveTextContent("Records are sealed on Base Sepolia, a test network");
    expect(screen.getByRole("link", { name: "About Fire Watch" })).toHaveAttribute("href", "/");
  });

  it("has no About Fire Watch link without the landing's address", async () => {
    render(<FireRecordPage source={fixtureSource()} today={fixture.today} />);
    await screen.findByText(LIST);

    expect(screen.queryByRole("link", { name: "About Fire Watch" })).not.toBeInTheDocument();
  });

  it("defaults to the last 7 days", async () => {
    const source = fixtureSource();
    render(<FireRecordPage source={source} today="2026-10-15" />);

    expect(from()).toHaveValue("2026-10-09");
    expect(to()).toHaveValue("2026-10-15");
    expect(source.concessions).toHaveBeenCalledWith("2026-10-09", "2026-10-15");
    expect(await screen.findByText(LIST)).toBeInTheDocument();
  });

  it("lists the concessions with hotspots in the dates, ranked by hotspots inside", async () => {
    const source = fixtureSource();
    render(<FireRecordPage source={source} today={fixture.today} />);
    await screen.findByText(LIST);

    pick(from(), "2026-10-12");
    pick(to(), "2026-10-15");

    expect(source.concessions).toHaveBeenLastCalledWith("2026-10-12", "2026-10-15");
    expect(await screen.findByText(LIST)).toBeInTheDocument();
    const [, first] = screen.getAllByRole("row");
    const cells = within(first).getAllByRole("cell");
    expect(within(cells[0]).getByRole("button")).toHaveTextContent("ID-WOOD-CONCESSION-0540Sumatera Selatan");
    expect(cells[1]).toHaveTextContent("769");
    expect(cells[2]).toHaveTextContent("331");
    expect(screen.getByRole("columnheader", { name: "Inside" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Within 5 km" })).toBeInTheDocument();
  });

  it("says when there are no hotspots in the dates and when recording started", async () => {
    render(<FireRecordPage source={fixtureSource()} today={fixture.today} />);
    await screen.findByText(LIST);

    pick(from(), "2026-10-01");
    pick(to(), "2026-10-07");

    expect(await screen.findByText("No hotspots in these dates")).toBeInTheDocument();
    expect(
      screen.getByText("No hotspots on or near a pulpwood concession between 2026-10-01 and 2026-10-07."),
    ).toBeInTheDocument();
    expect(screen.getByText("Detections from 2026-10-12.")).toBeInTheDocument();
    expect(screen.queryByText(/Recording started/)).toBeNull();
  });

  it("offers Try again when the list couldn't load, and loads on retry", async () => {
    const source = fixtureSource();
    vi.mocked(source.concessions).mockRejectedValueOnce(new Error("API answered 503"));
    render(<FireRecordPage source={source} today={fixture.today} />);

    expect(await screen.findByText("Couldn't load the concessions")).toBeInTheDocument();
    expect(screen.getByText("The server didn't answer. Try again in a moment.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText(LIST)).toBeInTheDocument();
    expect(source.concessions).toHaveBeenCalledTimes(2);
  });

  it("shows skeleton rows, then says the server is starting after 3 s", async () => {
    vi.useFakeTimers();
    let answer: (l: ConcessionListing) => void = () => {};
    const source = fixtureSource();
    vi.mocked(source.concessions).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<FireRecordPage source={source} today={fixture.today} />);

    expect(screen.getByLabelText("Loading the concessions")).toHaveAttribute("aria-busy", "true");
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByText(SLOW_NOTE)).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(SLOW_NOTE)).toBeInTheDocument();

    await act(async () =>
      answer({ recording_started: fixture.recording_started, map_version: fixture.map_version, concessions: fixture.concessions }),
    );
    expect(screen.queryByText(SLOW_NOTE)).toBeNull();
    expect(screen.getByText(LIST)).toBeInTheDocument();
  });

  it.each([
    ["Pick both dates.", to, ""],
    ["The end date is before the start date.", to, "2026-10-08"],
    ["Pick 31 days or fewer. This range is 77 days.", from, "2026-08-01"],
  ])("says %s and keeps the last valid list", async (message, input, value) => {
    const source = fixtureSource();
    render(<FireRecordPage source={source} today={fixture.today} />);
    await screen.findByText(LIST);

    pick(input(), value);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(from()).toHaveAttribute("aria-invalid", "true");
    expect(to()).toHaveAttribute("aria-invalid", "true");
    expect(source.concessions).toHaveBeenCalledTimes(1);
    expect(screen.getByText(LIST)).toBeInTheDocument();
  });

  it("opens the 0332 fire first seen 13 Oct 17:37 and its detection matches the chain", async () => {
    const source = fixtureSource();
    await openFire(source);

    expect(source.concession).toHaveBeenLastCalledWith(ID, "2026-10-12", "2026-10-15");
    expect(source.fire).toHaveBeenLastCalledWith(ID, KEY);
    expect(kv("First seen")).toHaveTextContent("2026-10-13 17:37 UTC");
    expect(kv("Seen inside from")).toHaveTextContent("2026-10-15 18:43 UTC");
    expect(
      screen.getByText("Fire Watch's records begin 38 hours before this fire was first seen, so it may have been burning earlier."),
    ).toBeInTheDocument();
    expect(screen.getByText("19 detections, oldest first. Pick one to check it against the chain.")).toBeInTheDocument();
    expect(map().dots).toHaveLength(19);
    expect(map().fire).toBe(true);

    fireEvent.click(within(firstRow()).getByRole("button"));

    const panel = screen.getByRole("article", { name: "Hotspot record" });
    expect(await within(panel).findByText("Matches the chain")).toBeInTheDocument();
    expect(kv("Detected")).toHaveTextContent("2026-10-13 17:37 UTC");
    expect(kv("Satellite")).toHaveTextContent("VIIRS NOAA-20");
    expect(kv("Fire power")).toHaveTextContent("2.76 MW");
    expect(kv("Concession")).toHaveTextContent(`${ID}Outside, 950 m from the edge`);
    expect(kv("Sealed")).toHaveTextContent("2026-10-13 20:24 UTC2 h 47 min after detection");
    expect(isAt(map().dots![map().selected!], FIRST)).toBe(true);
  });

  it("offers a complaint pack of the open fire, as of the API's answer", async () => {
    const source = fixtureSource();
    await openFire(source);

    expect(source.packHref).toHaveBeenLastCalledWith(ID, expect.objectContaining({ key: KEY, as_of_unix: 1792227600 }));
    expect(screen.getByRole("link", { name: "Make complaint pack" })).toHaveAttribute(
      "href",
      `/?pack=${ID}&fire=${KEY}&as_of=1792227600`,
    );
  });

  it("steps back out to the fire, its concession and the list", async () => {
    await openFire(fixtureSource());
    fireEvent.click(within(firstRow()).getByRole("button"));
    await screen.findByText("Matches the chain");

    fireEvent.click(screen.getByRole("button", { name: "Fire first seen 13 Oct 17:37" }));
    expect(screen.getByRole("heading", { name: "First seen outside, 950 m from the edge" })).toBeInTheDocument();
    expect(firstRow()).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: `Fires in ${ID}` }));
    expect(fireRow()).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "All concessions" }));
    expect(screen.getByText(LIST)).toBeInTheDocument();
  });

  it("opens a fire from a dot on the concession map, and a detection from a dot on the fire map", async () => {
    render(<FireRecordPage source={fixtureSource()} today={fixture.today} initialDates={{ from: "2026-10-12", to: "2026-10-15" }} />);
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${ID}`) }));
    await screen.findByText("176 inside, 326 within 5 km");
    expect(map().boundary).toEqual(fixture.detail[ID].boundary);
    expect(map().dots).toHaveLength(502);

    act(() => map().onSelect!(map().dots!.findIndex((d) => isAt(d, FIRST))));

    expect(await screen.findByRole("heading", { name: "First seen outside, 950 m from the edge" })).toBeInTheDocument();

    act(() => map().onSelect!(map().dots!.findIndex((d) => isAt(d, FIRST))));

    expect(await screen.findByText("Matches the chain")).toBeInTheDocument();
    expect(kv("Fire power")).toHaveTextContent("2.76 MW");
  });

  it("takes a detection's Sealed time from the chain, not the API's sealed_at", async () => {
    // The API says 17 Oct 00:00; the chain sealed it 16 Oct 02:37:38.
    const source = fixtureSource((r) => ({ ...r, sealed_at: "2026-10-17T00:00:00Z" }));
    vi.mocked(source.sealOf).mockImplementation(async (r) => ({ fingerprint: fingerprint(r), sealedAt: 1792118258 }));
    await openFire(source);

    fireEvent.click(within(firstRow()).getByRole("button"));

    const panel = screen.getByRole("article", { name: "Hotspot record" });
    expect(within(panel).queryByText("Sealed", { selector: "dt" })).toBeNull();
    expect(await within(panel).findByText("Matches the chain")).toBeInTheDocument();
    expect(kv("Sealed")).toHaveTextContent("2026-10-16 02:37 UTC2 d 9 h after detection");
  });

  it("asks the chain even when the API sends a detection with no tx_hash", async () => {
    const source = fixtureSource((r) => (isAt(r, FIRST) ? { ...r, tx_hash: null, sealed_at: null } : r));
    await openFire(source);

    fireEvent.click(within(firstRow()).getByRole("button"));

    const panel = screen.getByRole("article", { name: "Hotspot record" });
    expect(await within(panel).findByText("Matches the chain")).toBeInTheDocument();
    expect(kv("Sealed")).toHaveTextContent("2026-10-13 20:24 UTC2 h 47 min after detection");
    expect(source.sealOf).toHaveBeenCalledWith(expect.objectContaining({ tx_hash: null }));
  });

  it("says Not on chain yet only when the chain holds no seal for the record ID", async () => {
    const source = fixtureSource((r) => (isAt(r, FIRST) ? { ...r, tx_hash: null, sealed_at: null } : r));
    vi.mocked(source.sealOf).mockResolvedValue({ fingerprint: zeroHash, sealedAt: 0 });
    await openFire(source);

    fireEvent.click(within(firstRow()).getByRole("button"));

    const panel = screen.getByRole("article", { name: "Hotspot record" });
    expect(await within(panel).findByText("Not on chain yet")).toBeInTheDocument();
    expect(within(panel).queryByText("Sealed", { selector: "dt" })).toBeNull();
    expect(source.sealOf).toHaveBeenCalledOnce();
  });

  it("offers Check again with no Sealed row when the chain can't be reached, and checks again", async () => {
    const source = fixtureSource();
    vi.mocked(source.sealOf).mockRejectedValueOnce(new Error("Base Sepolia unreachable"));
    await openFire(source);

    fireEvent.click(within(firstRow()).getByRole("button"));

    const panel = screen.getByRole("article", { name: "Hotspot record" });
    expect(await within(panel).findByText("Couldn't reach Base Sepolia to check this record.")).toBeInTheDocument();
    expect(within(panel).queryByText("Sealed", { selector: "dt" })).toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "Check again" }));

    expect(await within(panel).findByText("Matches the chain")).toBeInTheDocument();
    expect(kv("Sealed")).toHaveTextContent("2026-10-13 20:24 UTC2 h 47 min after detection");
    expect(source.sealOf).toHaveBeenCalledTimes(2);
  });

  it("says Does not match the chain when a detection's stored match was edited after sealing", async () => {
    const edited = (r: HotspotRecord) => ({ ...r, concessions: r.concessions.map((m) => ({ ...m, inside: true })) });
    const source = fixtureSource((r) => (isAt(r, FIRST) ? edited(r) : r));
    await openFire(source);

    fireEvent.click(within(firstRow()).getByRole("button"));

    const panel = screen.getByRole("article", { name: "Hotspot record" });
    expect(await within(panel).findByText("Does not match the chain")).toBeInTheDocument();
    const original = records(ID).find((r) => isAt(r, FIRST))!;
    expect(kv("Sealed fingerprint")).toHaveTextContent(fp(fingerprint(original)));
    expect(kv("Fingerprint now")).toHaveTextContent(fp(fingerprint(edited(original))));
  });

  it("a fire from 15 Oct still reads first seen 13 Oct", async () => {
    const source = fixtureSource();
    await openFire(source, { from: "2026-10-15", to: "2026-10-15" });

    expect(source.concession).toHaveBeenLastCalledWith(ID, "2026-10-15", "2026-10-15");
    expect(kv("First seen")).toHaveTextContent("2026-10-13 17:37 UTC");
    expect(kv("Passes")).toHaveTextContent("4, with 19 detections");
    expect(screen.getAllByRole("row")).toHaveLength(20);
    expect(map().dots).toHaveLength(19);
    const replay = map().children as ReactElement<{ times: number[] }>;
    expect(replay.props.times).toHaveLength(4);
  });

  it("opens a fire on its last pass, framed on its detections plus about 1 km", async () => {
    await openFire(fixtureSource());

    expect((map().children as ReactElement<{ at: number }>).props.at).toBe(4);
    // The fire's detections span 112.71672 to 112.73068°E and 2.855 to 2.83405°S.
    const area = map().area!;
    expect(area.west).toBeCloseTo(112.70672, 6);
    expect(area.east).toBeCloseTo(112.74068, 6);
    expect(area.south).toBeCloseTo(-2.865, 6);
    expect(area.north).toBeCloseTo(-2.82405, 6);
  });

  it("offers Try again when the fire couldn't load, and loads on retry", async () => {
    const source = fixtureSource();
    vi.mocked(source.fire).mockRejectedValueOnce(new Error("API answered 404"));
    render(<FireRecordPage source={source} today={fixture.today} initialDates={{ from: "2026-10-12", to: "2026-10-15" }} />);
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${ID}`) }));
    await screen.findByText("176 inside, 326 within 5 km");
    fireEvent.click(within(fireRow()).getByRole("button"));

    expect(await screen.findByText("Couldn't load this fire")).toBeInTheDocument();
    expect(screen.getByText("The server didn't answer. Try again in a moment.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "First seen outside, 950 m from the edge" })).toBeInTheDocument();
    expect(source.fire).toHaveBeenCalledTimes(2);
  });

  it("reads every forecast's seal in one chain read, and each matches the chain", async () => {
    const source = forecastSource();
    await openFire(source);

    const panel = screen.getByRole("region", { name: "Forecast to be seen inside by about 15 Oct 05:20 UTC" });
    expect(await within(panel).findByText("Matches the chain")).toBeInTheDocument();
    expect(source.forecastSeals).toHaveBeenCalledOnce();
    expect(source.forecastSeals).toHaveBeenCalledWith(scenario1Forecasts());
    expect(
      screen.getByText("Sealed 22 hours 41 minutes before the pass that saw it inside, by Base Sepolia's clock."),
    ).toBeInTheDocument();
    const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual([
      "14 Oct 20:00Matches the chain",
      "14 Oct 09:00Matches the chain",
      "13 Oct 20:00Matches the chain",
    ]);
  });

  it("says a forecast changed after its seal does not match the chain, and the others still do", async () => {
    // Scenario 4: the newest forecast's time moved from 15 Oct 05:20 to 18:40 in the database.
    const source = forecastSource((f, i) => (i === 0 ? { ...f, inside_by_unix: at("2026-10-15T18:40:00") } : f));
    await openFire(source);

    const panel = screen.getByRole("region", { name: "Forecast to be seen inside by about 15 Oct 18:40 UTC" });
    expect(await within(panel).findByText("Does not match the chain")).toBeInTheDocument();
    expect(within(panel).getByText("Changed after its seal, so its outcome isn't shown.")).toBeInTheDocument();
    expect(kv("Sealed fingerprint")).toHaveTextContent(fp(forecastFingerprint(scenario1Forecasts()[0])));
    const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual([
      "14 Oct 20:00Does not match the chain",
      "14 Oct 09:00Matches the chain",
      "13 Oct 20:00Matches the chain",
    ]);
  });

  it("draws the picked forecast's line only while the replay is at or after the pass it followed", async () => {
    const [newest] = scenario1Forecasts();
    await openFire(forecastSource());
    const replay = () => map().children as ReactElement<{ at: number; onChange(at: number): void }>;

    // The newest forecast followed pass 3; the fire opens on pass 4.
    expect(replay().props.at).toBe(4);
    expect(map().forecast).toEqual({ from: newest.from, to: newest.crossing });
    expect(map().label).toMatch(/, with the picked forecast's line to where it crosses the edge$/);

    act(() => replay().props.onChange(3));
    expect(map().forecast).toEqual({ from: newest.from, to: newest.crossing });

    act(() => replay().props.onChange(2));
    expect(map().forecast).toBeNull();
  });

  it("moves the replay to a forecast's pass when its row is picked", async () => {
    const [, second] = scenario1Forecasts();
    await openFire(forecastSource());
    const replay = () => map().children as ReactElement<{ at: number }>;

    fireEvent.click(screen.getByRole("button", { name: /^14 Oct 09:00/ }));

    expect(screen.getByRole("heading", { name: "Forecast to be seen inside by about 15 Oct 06:18 UTC" })).toBeInTheDocument();
    expect(replay().props.at).toBe(2);
    expect(map().forecast).toEqual({ from: second.from, to: second.crossing });

    // The forecast after the first pass said not, so it has no line.
    fireEvent.click(screen.getByRole("button", { name: /^13 Oct 20:00/ }));

    expect(replay().props.at).toBe(1);
    expect(map().forecast).toBeNull();
  });

  it("goes back to the concession when the dates change, keeping the fire marked while it is in them", async () => {
    const source = fixtureSource();
    await openFire(source);

    pick(from(), "2026-10-15");

    expect(source.concession).toHaveBeenLastCalledWith(ID, "2026-10-15", "2026-10-15");
    await screen.findByText("Fires", { selector: "dt" });
    expect(fireRow()).toHaveAttribute("aria-selected", "true");

    // A second change, now from the concession view, to dates that still hold the fire.
    pick(from(), "2026-10-13");

    expect(source.concession).toHaveBeenLastCalledWith(ID, "2026-10-13", "2026-10-15");
    await waitFor(() => expect(fireRow()).toHaveAttribute("aria-selected", "true"));

    pick(from(), "2026-10-12");
    pick(to(), "2026-10-12");

    expect(source.concession).toHaveBeenLastCalledWith(ID, "2026-10-12", "2026-10-12");
    await screen.findByText("Fires", { selector: "dt" });
    expect(selectedRows()).toHaveLength(0);
  });
});
