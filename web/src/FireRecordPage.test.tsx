import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { toHex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConcessionDetail, ConcessionListing, ConcessionSummary, HotspotRecord } from "./api";
import { fingerprint, type MatchedDetection } from "./fingerprint";
import { FireMap } from "./FireMap";
import { FireRecordPage, type FireRecordSource } from "./FireRecordPage";
import raw from "./preview/fire-record.fixture.json";

vi.mock("./FireMap", () => ({ FireMap: vi.fn(() => null) }));

// Real VIIRS NOAA-20 detections from 2026-10-11 to 14 matched to the Trase map; see the preview.
interface Fixture {
  map_version: string;
  from: string;
  to: string;
  recording_started: string;
  concessions: ConcessionSummary[];
  detail: Record<string, Omit<ConcessionDetail, "hotspots"> & { hotspots: Omit<MatchedDetection, "source" | "fingerprint_version" | "map_version">[] }>;
}
const fixture = raw as unknown as Fixture;

const A = { lat_e5: -358175, lon_e5: 10571567 };
const B = { lat_e5: -367525, lon_e5: 11535328 };
const SLOW_NOTE = "Starting the server after a quiet spell. This can take up to a minute; the list loads on its own.";

const iso = (unix: number) => new Date(unix * 1000).toISOString().replace(".000", "");
const isAt = (h: { lat_e5: number; lon_e5: number }, at: { lat_e5: number; lon_e5: number }) =>
  h.lat_e5 === at.lat_e5 && h.lon_e5 === at.lon_e5;

function detail(id: string): ConcessionDetail {
  const d = fixture.detail[id];
  const hotspots = d.hotspots.map(
    (h, i): HotspotRecord => ({
      ...h,
      record_id: toHex(i + 1, { size: 32 }),
      source: "VIIRS_NOAA20_NRT",
      acquired_at: iso(h.acquired_unix),
      tx_hash: toHex(i + 1001, { size: 32 }),
      sealed_at: iso(h.acquired_unix + 2 * 3600 + 47 * 60),
      fingerprint_version: 2,
      map_version: fixture.map_version,
    }),
  );
  return { ...d, hotspots };
}

/** The fixture as the API would serve it; `edit` changes stored records after they were sealed. */
function fixtureSource(edit: (r: HotspotRecord) => HotspotRecord = (r) => r): FireRecordSource {
  const sealed = new Map<string, HotspotRecord>();
  return {
    concessions: vi.fn(async (from: string, to: string): Promise<ConcessionListing> => ({
      recording_started: fixture.recording_started,
      map_version: fixture.map_version,
      concessions: from <= fixture.to && to >= fixture.from ? fixture.concessions : [],
    })),
    concession: vi.fn(async (id: string) => {
      const d = detail(id);
      d.hotspots.forEach((h) => sealed.set(h.record_id, h));
      return { ...d, hotspots: d.hotspots.map(edit) };
    }),
    sealOf: vi.fn(async (r: HotspotRecord) => fingerprint(sealed.get(r.record_id)!)),
    fingerprint,
  };
}

const from = () => screen.getByLabelText("From") as HTMLInputElement;
const to = () => screen.getByLabelText("To") as HTMLInputElement;
const pick = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });

function rowWith(...texts: string[]): HTMLElement {
  const rows = screen.getAllByRole("row").filter((r) => texts.every((t) => r.textContent?.includes(t)));
  expect(rows).toHaveLength(1);
  return rows[0];
}

function kv(name: string) {
  return screen.getByText(name, { selector: "dt" }).nextElementSibling as HTMLElement;
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
    expect(await screen.findByText("174 concessions, ranked by hotspots inside.")).toBeInTheDocument();
  });

  it("lists the concessions with hotspots in the dates, ranked by hotspots inside", async () => {
    const source = fixtureSource();
    render(<FireRecordPage source={source} today="2026-10-15" />);
    await screen.findByText("174 concessions, ranked by hotspots inside.");

    pick(from(), "2026-10-11");
    pick(to(), "2026-10-14");

    expect(source.concessions).toHaveBeenLastCalledWith("2026-10-11", "2026-10-14");
    expect(await screen.findByText("174 concessions, ranked by hotspots inside.")).toBeInTheDocument();
    const [, first] = screen.getAllByRole("row");
    const cells = within(first).getAllByRole("cell");
    expect(within(cells[0]).getByRole("button")).toHaveTextContent("ID-WOOD-CONCESSION-0345Kalimantan Barat");
    expect(cells[1]).toHaveTextContent("1,015");
    expect(cells[2]).toHaveTextContent("254");
    expect(screen.getByRole("columnheader", { name: "Inside" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Within 5 km" })).toBeInTheDocument();
  });

  it("says when there are no hotspots in the dates and when recording started", async () => {
    render(<FireRecordPage source={fixtureSource()} today="2026-10-15" />);
    await screen.findByText("174 concessions, ranked by hotspots inside.");

    pick(from(), "2026-10-01");
    pick(to(), "2026-10-07");

    expect(await screen.findByText("No hotspots in these dates")).toBeInTheDocument();
    expect(
      screen.getByText("No hotspots on or near a pulpwood concession between 2026-10-01 and 2026-10-07."),
    ).toBeInTheDocument();
    expect(screen.getByText("Recording started 2026-10-11.")).toBeInTheDocument();
  });

  it("offers Try again when the list couldn't load, and loads on retry", async () => {
    const source = fixtureSource();
    vi.mocked(source.concessions).mockRejectedValueOnce(new Error("API answered 503"));
    render(<FireRecordPage source={source} today="2026-10-15" />);

    expect(await screen.findByText("Couldn't load the concessions")).toBeInTheDocument();
    expect(screen.getByText("The server didn't answer. Try again in a moment.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("174 concessions, ranked by hotspots inside.")).toBeInTheDocument();
    expect(source.concessions).toHaveBeenCalledTimes(2);
  });

  it("shows skeleton rows, then says the server is starting after 3 s", async () => {
    vi.useFakeTimers();
    let answer: (l: ConcessionListing) => void = () => {};
    const source = fixtureSource();
    vi.mocked(source.concessions).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<FireRecordPage source={source} today="2026-10-15" />);

    expect(screen.getByLabelText("Loading the concessions")).toHaveAttribute("aria-busy", "true");
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByText(SLOW_NOTE)).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(SLOW_NOTE)).toBeInTheDocument();

    await act(async () =>
      answer({ recording_started: fixture.recording_started, map_version: fixture.map_version, concessions: fixture.concessions }),
    );
    expect(screen.queryByText(SLOW_NOTE)).toBeNull();
    expect(screen.getByText("174 concessions, ranked by hotspots inside.")).toBeInTheDocument();
  });

  it.each([
    ["Pick both dates.", to, ""],
    ["The end date is before the start date.", to, "2026-10-08"],
    ["Pick 31 days or fewer. This range is 76 days.", from, "2026-08-01"],
  ])("says %s and keeps the last valid list", async (message, input, value) => {
    const source = fixtureSource();
    render(<FireRecordPage source={source} today="2026-10-15" />);
    await screen.findByText("174 concessions, ranked by hotspots inside.");

    pick(input(), value);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(from()).toHaveAttribute("aria-invalid", "true");
    expect(to()).toHaveAttribute("aria-invalid", "true");
    expect(source.concessions).toHaveBeenCalledTimes(1);
    expect(screen.getByText("174 concessions, ranked by hotspots inside.")).toBeInTheDocument();
  });

  it("opens ID-WOOD-CONCESSION-0540 and hotspot A matches the chain", async () => {
    const source = fixtureSource();
    render(<FireRecordPage source={source} today="2026-10-15" />);
    await screen.findByText("174 concessions, ranked by hotspots inside.");
    pick(from(), "2026-10-11");
    pick(to(), "2026-10-14");

    fireEvent.click(await screen.findByRole("button", { name: /^ID-WOOD-CONCESSION-0540/ }));

    expect(source.concession).toHaveBeenLastCalledWith("ID-WOOD-CONCESSION-0540", "2026-10-11", "2026-10-14");
    expect(await screen.findByText("930 inside, 334 within 5 km")).toBeInTheDocument();
    const map = vi.mocked(FireMap).mock.lastCall![0];
    expect(map.boundary).toEqual(fixture.detail["ID-WOOD-CONCESSION-0540"].boundary);
    expect(map.dots).toHaveLength(1264);

    // Hotspot A is the 218th newest, so it is on the third page of rows.
    fireEvent.click(screen.getByRole("button", { name: /^Show 100 more/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Show 100 more/ }));
    fireEvent.click(within(rowWith("14 Oct 06:18", "5.2 MW")).getByRole("button"));

    const panel = screen.getByRole("article", { name: "Hotspot record" });
    expect(await within(panel).findByText("Matches the chain")).toBeInTheDocument();
    expect(kv("Detected")).toHaveTextContent("2026-10-14 06:18 UTC");
    expect(kv("Satellite")).toHaveTextContent("VIIRS NOAA-20");
    expect(kv("Fire power")).toHaveTextContent("5.2 MW");
    expect(kv("Concession")).toHaveTextContent("ID-WOOD-CONCESSION-0540Inside, 3.1 km from the edge");
    expect(kv("Boundaries")).toHaveTextContent("Trase pulpwood concessions 2023–2024, v2026-02-20");
    expect(kv("Sealed")).toHaveTextContent("2026-10-14 09:05 UTC2 h 47 min after detection");
    const picked = vi.mocked(FireMap).mock.lastCall![0];
    expect(isAt(picked.dots![picked.selected!], A)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Hotspots in ID-WOOD-CONCESSION-0540" }));
    expect(rowWith("14 Oct 06:18", "5.2 MW")).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "All concessions" }));
    expect(screen.getByText("174 concessions, ranked by hotspots inside.")).toBeInTheDocument();
  });

  it("says Does not match the chain when B's stored match was edited after sealing", async () => {
    const source = fixtureSource((r) =>
      isAt(r, B)
        ? { ...r, concessions: r.concessions.map((m) => (m.id === "ID-WOOD-CONCESSION-0377" ? { ...m, inside: true } : m)) }
        : r,
    );
    render(<FireRecordPage source={source} today="2026-10-15" initialDates={{ from: "2026-10-11", to: "2026-10-14" }} />);

    fireEvent.click(await screen.findByRole("button", { name: /^ID-WOOD-CONCESSION-0377/ }));
    await screen.findByText("88 inside, 169 within 5 km");
    fireEvent.click(within(rowWith("14 Oct 06:18", "3.03 MW")).getByRole("button"));

    const panel = screen.getByRole("article", { name: "Hotspot record" });
    expect(await within(panel).findByText("Does not match the chain")).toBeInTheDocument();
    expect(kv("Sealed fingerprint")).toHaveTextContent("5ac17c85b7…d2b3c9");
    expect(kv("Fingerprint now")).toHaveTextContent("aea5b4e67c…bcfe5c");
  });
});
