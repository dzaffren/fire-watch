import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { keccak256, toHex, type Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConcessionListing, ConcessionSummary, FireSummary, HotspotRecord, Ring } from "./api";
import { fingerprint } from "./fingerprint";
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
    })),
    sealOf: vi.fn(async (r: HotspotRecord) => fingerprint(sealed.get(r.record_id)!)),
    fingerprint,
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
    expect(screen.getByText("Recording started 2026-10-12.")).toBeInTheDocument();
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
      screen.getByText("Recording had started 38 hours before this fire was first seen, so it may have been burning earlier."),
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

  it("goes back to the concession when the dates change, keeping the fire marked while it is in them", async () => {
    const source = fixtureSource();
    await openFire(source);

    pick(from(), "2026-10-15");

    expect(source.concession).toHaveBeenLastCalledWith(ID, "2026-10-15", "2026-10-15");
    await screen.findByText("Fires", { selector: "dt" });
    expect(fireRow()).toHaveAttribute("aria-selected", "true");

    pick(from(), "2026-10-12");
    pick(to(), "2026-10-12");

    expect(source.concession).toHaveBeenLastCalledWith(ID, "2026-10-12", "2026-10-12");
    await screen.findByText("Fires", { selector: "dt" });
    expect(selectedRows()).toHaveLength(0);
  });
});
