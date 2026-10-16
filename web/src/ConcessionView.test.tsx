import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConcessionDetail } from "./api";
import { ConcessionView, type DetailLoad } from "./ConcessionView";
import raw from "./preview/fire-origin.fixture.json";

const MAP = "Trase pulpwood concessions 2023–2024, v2026-02-20";
const ID = "ID-WOOD-CONCESSION-0332";
const BIG = "ID-WOOD-CONCESSION-0540";
// The 0540 fire of scenario 4, 28th largest of its 120.
const STILL_INDEX = 27;

// Real VIIRS NOAA-20 detections from 2026-10-12 to 15, grouped into fires, largest first; see the preview.
const fixture = raw as unknown as { detail: Record<string, ConcessionDetail> };

function show(load: DetailLoad, picked: number | null = null, id = ID) {
  const handlers = { onBack: vi.fn(), onPick: vi.fn(), onRetry: vi.fn() };
  render(<ConcessionView id={id} load={load} mapVersion={MAP} picked={picked} {...handlers} />);
  return handlers;
}

const ready = (id = ID): DetailLoad => ({ kind: "ready", detail: fixture.detail[id] });

function kv(name: string) {
  return screen.getByText(name, { selector: "dt" }).nextElementSibling as HTMLElement;
}

const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");
const cells = (row: HTMLElement) => within(row).getAllByRole("cell");

describe("ConcessionView", () => {
  it("names the concession, its hotspots and fires in the dates, and the map", () => {
    show(ready());

    expect(screen.getByRole("heading", { name: ID })).toBeInTheDocument();
    expect(kv("Province")).toHaveTextContent("Kalimantan Tengah");
    expect(kv("Area")).toHaveTextContent("36,199 ha");
    expect(kv("Hotspots")).toHaveTextContent("176 inside, 326 within 5 km");
    expect(kv("Fires")).toHaveTextContent("34");
    expect(kv("Boundaries")).toHaveTextContent(MAP);
  });

  it("lists the fires most detections first, then newest first seen", () => {
    show(ready());

    expect(
      screen.getByText("Detections within 1 km and 48 hours of each other count as one fire. Largest first."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["First seen (UTC)", "Where first seen"]);
    expect(bodyRows()).toHaveLength(34);
    expect(cells(bodyRows()[0])[0]).toHaveTextContent("12 Oct 05:166 passes, 188 detections");
    // Two fires of 19 detections: the one first seen 13 Oct 17:37 is newer, so it comes first.
    expect(cells(bodyRows()[4])[0]).toHaveTextContent("13 Oct 17:374 passes, 19 detections");
    expect(cells(bodyRows()[5])[0]).toHaveTextContent("13 Oct 06:374 passes, 19 detections");
    expect(cells(bodyRows()[33])[0]).toHaveTextContent("12 Oct 05:161 pass, 1 detection");
  });

  it("says where each fire was first seen, and what it did next", () => {
    show(ready());

    expect(cells(bodyRows()[4])[1]).toHaveTextContent(/^Outside, 950 mInside from 15 Oct 18:43$/);
    expect(cells(bodyRows()[5])[1]).toHaveTextContent(/^Too close to tell30 m outside the edge$/);
    expect(cells(bodyRows()[1])[1]).toHaveTextContent(/^Both sides of the edge$/);
  });

  it("marks a fire that never spread", () => {
    show(ready(BIG), null, BIG);

    expect(cells(bodyRows()[STILL_INDEX])[0]).toHaveTextContent("12 Oct 06:575 passes, 6 detections");
    expect(cells(bodyRows()[STILL_INDEX])[1]).toHaveTextContent(/^Inside, 1.1 kmNever spread$/);
  });

  it("lists fires 100 at a time", () => {
    show(ready(BIG), null, BIG);

    expect(bodyRows()).toHaveLength(100);
    expect(screen.getByRole("button", { name: /^Show 20 more/ })).toHaveTextContent("20 not shown");

    fireEvent.click(screen.getByRole("button", { name: /^Show 20 more/ }));

    expect(bodyRows()).toHaveLength(120);
    expect(screen.queryByRole("button", { name: /^Show \d+ more/ })).toBeNull();
  });

  it("opens a fire from its row, and keeps the picked one marked and on screen", () => {
    const { onPick } = show(ready(BIG), 104, BIG);

    expect(bodyRows()).toHaveLength(120);
    expect(bodyRows()[104]).toHaveAttribute("aria-selected", "true");

    fireEvent.click(within(bodyRows()[3]).getByRole("button"));
    expect(onPick).toHaveBeenCalledWith(3);
  });

  it("goes back to all concessions", () => {
    const { onBack } = show(ready());

    fireEvent.click(screen.getByRole("button", { name: "All concessions" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows a skeleton of the detail rows while loading", () => {
    show({ kind: "loading" });

    expect(screen.getByLabelText("Loading the concession")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers Try again when the concession couldn't load", () => {
    const { onRetry } = show({ kind: "error" });

    expect(screen.getByText("Couldn't load this concession")).toBeInTheDocument();
    expect(screen.getByText("The server didn't answer. Try again in a moment.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
