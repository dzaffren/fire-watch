import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { toHex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConcessionDetail, FireDetail, HotspotRecord } from "./api";
import { fireDots, FireView, passTimes, Replay, type FireLoad } from "./FireView";
import raw from "./preview/fire-origin.fixture.json";

// Real VIIRS NOAA-20 detections from 2026-10-12 to 15, grouped into fires by the spec's rule; see the preview.
type FixtureHotspot = Omit<HotspotRecord, "record_id" | "acquired_at" | "tx_hash" | "sealed_at" | "source" | "fingerprint_version" | "map_version">;
interface Fixture {
  map_version: string;
  detail: Record<string, Omit<ConcessionDetail, "hotspots"> & { hotspots: FixtureHotspot[] }>;
}
const fixture = raw as unknown as Fixture;

const OUTSIDE = { id: "ID-WOOD-CONCESSION-0332", key: "0x48f25fe185b0402018dc6cd3fab3930a760bc0c47bed4d163aa67f678000fbc1" } as const;
const INSIDE = { id: "ID-WOOD-CONCESSION-0356", key: "0x9b5e7cf66d458017f0d0e7e9fad7dcb2e0ae3e3309ef04e6e5b848be5a7a5547" } as const;
const NEIGHBOUR = { id: "ID-WOOD-CONCESSION-0372", key: INSIDE.key } as const;
const EDGE = { id: "ID-WOOD-CONCESSION-0540", key: "0x3f9765e240f39e98d13e8fe523a4ace4b730b361d34c2d5bda1d00f72e81301f" } as const;
const STILL = { id: "ID-WOOD-CONCESSION-0540", key: "0xceb010accad1087b319b17528fcdf3cfd6d4285a099a88671ae1e9ea9d86fe18" } as const;
const BOTH = { id: "ID-WOOD-CONCESSION-0332", key: "0x2ee3d2538b1fc6ffbe75dd9b8a349bcf454dc7797a7976bff9a545c01c787120" } as const;
const ONE_HOUR = { id: "ID-WOOD-CONCESSION-0332", key: "0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7" } as const;
const ONE_PASS = { id: "ID-WOOD-CONCESSION-0332", key: "0x08fb9ad47abd958004db9297551fe94a158405a81e978620b4ad8a4a67b63c9e" } as const;

const CANT_TELL = "The satellite record can't say which side this fire started on.";
const iso = (unix: number) => new Date(unix * 1000).toISOString().replace(".000", "");

/** One fire as the API serves it: every detection, oldest first. */
function fire({ id, key }: { id: string; key: string }): FireDetail {
  const d = fixture.detail[id];
  const summary = d.fires.find((f) => f.key === key)!;
  const hotspots = d.hotspots
    .filter((h) => h.fire_key === summary.key)
    .sort((a, b) => a.acquired_unix - b.acquired_unix || a.lat_e5 - b.lat_e5)
    .map(
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
  return { ...summary, hotspots, as_of_unix: 1792227600 };
}

function show(id: string, load: FireLoad, props: Partial<Parameters<typeof FireView>[0]> = {}) {
  const handlers = { onBack: vi.fn(), onPick: vi.fn(), onRetry: vi.fn() };
  render(<FireView id={id} load={load} packHref={null} picked={null} {...handlers} {...props} />);
  return handlers;
}

const showFire = (at: { id: string; key: string }) => show(at.id, { kind: "ready", fire: fire(at) });

/** The value beside a label in the fire's details. */
const detail = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;

describe("FireView", () => {
  it("reads first seen outside with the recording note", () => {
    showFire(OUTSIDE);

    expect(screen.getByRole("heading", { name: "First seen outside, 950 m from the edge" })).toBeInTheDocument();
    expect(detail("Concession")).toBe("ID-WOOD-CONCESSION-0332");
    expect(detail("First seen")).toBe("2026-10-13 17:37 UTC");
    expect(detail("Seen inside from")).toBe("2026-10-15 18:43 UTC");
    expect(screen.queryByText("Seen outside from")).toBeNull();
    expect(detail("Last seen")).toBe("2026-10-15 18:43 UTC");
    expect(detail("Passes")).toBe("4, with 19 detections");
    expect(
      screen.getByText("Fire Watch's records begin 38 hours before this fire was first seen, so it may have been burning earlier."),
    ).toBeInTheDocument();
    expect(screen.queryByText(CANT_TELL)).toBeNull();
  });

  it("reads first seen inside with no other side and no recording note", () => {
    showFire(INSIDE);

    expect(screen.getByRole("heading", { name: "First seen inside, 410 m from the edge" })).toBeInTheDocument();
    expect(detail("First seen")).toBe("2026-10-14 06:20 UTC");
    expect(screen.queryByText("Seen outside from")).toBeNull();
    expect(screen.queryByText("Seen inside from")).toBeNull();
    expect(screen.queryByText(/records begin/)).toBeNull();
  });

  it("reads the same fire from the neighbouring concession as first seen outside", () => {
    showFire(NEIGHBOUR);

    expect(screen.getByRole("heading", { name: "First seen outside, 4.2 km from the edge" })).toBeInTheDocument();
  });

  it("says the record can't tell", () => {
    showFire(EDGE);

    expect(
      screen.getByRole("heading", { name: "First seen 160 m inside the edge, within one satellite pixel of it" }),
    ).toBeInTheDocument();
    expect(screen.getByText(CANT_TELL)).toBeInTheDocument();
    expect(detail("Seen inside from")).toBe("2026-10-15 05:59 UTC");
  });

  it("says the record can't tell when the first pass saw both sides", () => {
    showFire(BOTH);

    expect(screen.getByRole("heading", { name: "First seen on both sides of the edge" })).toBeInTheDocument();
    expect(screen.getByText(CANT_TELL)).toBeInTheDocument();
  });

  it("flags a fire that never spread", () => {
    showFire(STILL);

    expect(
      screen.getByText(
        "Seen on 5 passes without spreading. This can be a fixed heat source, such as a mill, or peat smouldering in place.",
      ),
    ).toBeInTheDocument();
  });

  it("counts recording hours, and says less than an hour under one", () => {
    showFire(ONE_HOUR);
    expect(
      screen.getByText("Fire Watch's records begin 1 hour before this fire was first seen, so it may have been burning earlier."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Recording had started/)).toBeNull();

    show(ONE_HOUR.id, { kind: "ready", fire: { ...fire(ONE_HOUR), recorded_before_h: 0 } });
    expect(
      screen.getByText("Fire Watch's records begin less than an hour before this fire was first seen, so it may have been burning earlier."),
    ).toBeInTheDocument();
  });

  it("writes out how the reading is worked out behind a disclosure", () => {
    showFire(OUTSIDE);

    const how = screen.getByText("How this is worked out").closest("details")!;
    expect(how).not.toHaveAttribute("open");
    expect(within(how).getByText(/A detection joins a fire when it is within 1 km and 48 hours/)).toBeInTheDocument();
    expect(within(how).getByText(/NOAA-20 passes about twice a day and cloud can hide a fire/)).toBeInTheDocument();
  });

  it("links to a pack in a new tab", () => {
    const href = `/?pack=${OUTSIDE.id}&fire=${OUTSIDE.key}&as_of=1792227600`;
    show(OUTSIDE.id, { kind: "ready", fire: fire(OUTSIDE) }, { packHref: href });

    const make = screen.getByRole("link", { name: "Make complaint pack" });
    expect(make).toHaveAttribute("href", href);
    expect(make).toHaveAttribute("target", "_blank");
    expect(make).toHaveAccessibleDescription(
      "Opens this fire as it stands now on a page with its own link, to put in a grievance. Anyone with the link can check each record against the chain.",
    );
    expect(document.body.textContent).not.toMatch(/never changes/);
  });

  it("lists the detections oldest first and opens the one picked", () => {
    const { onPick } = showFire(OUTSIDE);

    expect(screen.getByText("19 detections, oldest first. Pick one to check it against the chain.")).toBeInTheDocument();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(19);
    expect(within(rows[0]).getByRole("button").textContent).toBe("13 Oct 17:37");
    expect(within(rows[3]).getByRole("button").textContent).toBe("14 Oct 06:18");
    expect(within(rows[18]).getByRole("button").textContent).toBe("15 Oct 18:43");
    expect(rows[0]).toHaveTextContent(/Outside, \d/);

    fireEvent.click(within(rows[3]).getByRole("button"));
    expect(onPick).toHaveBeenCalledWith(3);
  });

  it("marks the picked detection's row", () => {
    show(OUTSIDE.id, { kind: "ready", fire: fire(OUTSIDE) }, { picked: 3 });

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows[3]).toHaveAttribute("aria-selected", "true");
    expect(rows.filter((r) => r.hasAttribute("aria-selected"))).toHaveLength(1);
  });

  it("lists a large fire's detections 100 at a time", () => {
    showFire(ONE_HOUR);
    const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

    expect(rows()).toHaveLength(100);
    fireEvent.click(screen.getByRole("button", { name: /^Show 88 more/ }));
    expect(rows()).toHaveLength(188);
    expect(screen.queryByRole("button", { name: /^Show \d+ more/ })).toBeNull();
  });

  it("opens on the page that holds the picked detection, as when coming back from its record", () => {
    show(ONE_HOUR.id, { kind: "ready", fire: fire(ONE_HOUR) }, { picked: 150 });

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(188);
    expect(rows[150]).toHaveAttribute("aria-selected", "true");
  });

  it("goes back to the concession's fires", () => {
    const { onBack } = showFire(OUTSIDE);

    fireEvent.click(screen.getByRole("button", { name: "Fires in ID-WOOD-CONCESSION-0332" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows the panel's skeleton while the fire loads", () => {
    show(OUTSIDE.id, { kind: "loading" });

    expect(screen.getByLabelText("Loading the fire")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says it couldn't load the fire and tries again", () => {
    const { onRetry } = show(OUTSIDE.id, { kind: "error" });

    expect(screen.getByRole("heading", { name: "Couldn't load this fire" })).toBeInTheDocument();
    expect(screen.getByText("The server didn't answer. Try again in a moment.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("fireDots", () => {
  it("marks the first pass as first seen and fades older passes", () => {
    const { hotspots } = fire(OUTSIDE);
    const { dots, index } = fireDots(hotspots, 4);

    expect(dots).toHaveLength(19);
    expect(index).toEqual(hotspots.map((_, i) => i));
    expect(dots.filter((d) => d.first)).toHaveLength(3);
    expect(dots.map((d) => (d.first ? "first" : d.alpha))).toEqual(
      hotspots.map((h) => (h.pass === 1 ? "first" : { 2: 0.3, 3: 0.65, 4: 1 }[h.pass!])),
    );
  });

  it("draws only the passes up to the replay's", () => {
    const { hotspots } = fire(OUTSIDE);
    const { dots, index } = fireDots(hotspots, 2);

    expect(dots).toHaveLength(9);
    expect(index).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(dots.filter((d) => !d.first).every((d) => d.alpha === 1)).toBe(true);
  });

  it("draws a one-pass fire as first-seen diamonds alone", () => {
    const { hotspots } = fire(ONE_PASS);

    expect(passTimes(hotspots)).toHaveLength(1);
    expect(fireDots(hotspots, 1).dots.every((d) => d.first)).toBe(true);
  });
});

/** The replay as the page holds it: starting on the last pass. */
function ReplayOn({ times }: { times: number[] }) {
  const [at, setAt] = useState(times.length);
  return <Replay times={times} at={at} onChange={setAt} />;
}

describe("Replay", () => {
  const times = passTimes(fire(OUTSIDE).hotspots);
  const slider = () => screen.getByRole("slider", { name: "Satellite pass" });
  const value = () => slider().getAttribute("aria-valuetext");

  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.style.setProperty("--fw-replay-step", "1500ms");
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.style.removeProperty("--fw-replay-step");
  });

  it("names each pass and its time", () => {
    render(<Replay times={times} at={2} onChange={() => {}} />);

    expect(value()).toBe("Pass 2 of 4, 2026-10-14 06:18 UTC");
    expect(screen.getByText("Pass 2 of 4 · 14 Oct 06:18 UTC")).toBeInTheDocument();
  });

  it("keeps the label as wide as its widest pass, so the track holds still while it plays", () => {
    // Ten passes 12 h apart, so the pass number and the day both reach two digits.
    const ten = Array.from({ length: 10 }, (_, i) => Date.parse("2026-10-06T06:00:00Z") / 1000 + i * 43200);
    const label = () => screen.getByText(/^Pass \d+ of 10/);
    const { rerender } = render(<Replay times={ten} at={1} onChange={() => {}} />);

    expect(label()).toHaveTextContent("Pass 1 of 10 · 6 Oct 06:00 UTC");
    expect(label().style.minWidth).toBe("32ch");

    rerender(<Replay times={ten} at={10} onChange={() => {}} />);

    expect(label()).toHaveTextContent("Pass 10 of 10 · 10 Oct 18:00 UTC");
    expect(label().style.minWidth).toBe("32ch");
  });

  it("plays from the first pass, one pass every --fw-replay-step, and stops on the last", () => {
    render(<ReplayOn times={times} />);
    expect(value()).toMatch(/^Pass 4 of 4/);

    fireEvent.click(screen.getByRole("button", { name: "Play the spread, pass by pass" }));
    expect(value()).toMatch(/^Pass 1 of 4/);
    act(() => vi.advanceTimersByTime(1499));
    expect(value()).toMatch(/^Pass 1 of 4/);
    act(() => vi.advanceTimersByTime(1));
    expect(value()).toMatch(/^Pass 2 of 4/);
    act(() => vi.advanceTimersByTime(1500));
    act(() => vi.advanceTimersByTime(1500));
    expect(value()).toBe("Pass 4 of 4, 2026-10-15 18:43 UTC");

    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole("button", { name: "Play the spread, pass by pass" })).toBeInTheDocument();
  });

  it("reads the step in seconds, as the build's minifier writes 1500ms", () => {
    document.documentElement.style.setProperty("--fw-replay-step", "1.5s");
    render(<ReplayOn times={times} />);

    fireEvent.click(screen.getByRole("button", { name: "Play the spread, pass by pass" }));
    act(() => vi.advanceTimersByTime(1499));
    expect(value()).toMatch(/^Pass 1 of 4/);
    act(() => vi.advanceTimersByTime(1));
    expect(value()).toMatch(/^Pass 2 of 4/);
  });

  it("pauses when asked", () => {
    render(<ReplayOn times={times} />);
    fireEvent.click(screen.getByRole("button", { name: "Play the spread, pass by pass" }));

    fireEvent.click(screen.getByRole("button", { name: "Pause the spread" }));
    act(() => vi.advanceTimersByTime(4500));
    expect(value()).toMatch(/^Pass 1 of 4/);
  });

  it("moves to the pass dragged to and stops playing", () => {
    render(<ReplayOn times={times} />);
    fireEvent.click(screen.getByRole("button", { name: "Play the spread, pass by pass" }));

    // The arrow keys move a native range input through the same change event.
    fireEvent.change(slider(), { target: { value: "3" } });
    expect(value()).toBe("Pass 3 of 4, 2026-10-14 17:20 UTC");
    expect(screen.getByRole("button", { name: "Play the spread, pass by pass" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4500));
    expect(value()).toMatch(/^Pass 3 of 4/);
  });

  it("draws nothing for a one-pass fire", () => {
    const { container } = render(<Replay times={passTimes(fire(ONE_PASS).hotspots)} at={1} onChange={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });
});
