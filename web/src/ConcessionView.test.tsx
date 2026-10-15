import { fireEvent, render, screen, within } from "@testing-library/react";
import { toHex } from "viem";
import { describe, expect, it, vi } from "vitest";
import type { ConcessionDetail, HotspotRecord } from "./api";
import { ConcessionView, type DetailLoad } from "./ConcessionView";
import raw from "./preview/fire-record.fixture.json";

const MAP = "Trase pulpwood concessions 2023–2024, v2026-02-20";
const ID = "ID-WOOD-CONCESSION-0540";
const A_INDEX = 217;

// ID-WOOD-CONCESSION-0540's real detections from 2026-10-11 to 14, newest first.
const fixture = raw as unknown as { detail: Record<string, ConcessionDetail> };
const detail: ConcessionDetail = {
  ...fixture.detail[ID],
  hotspots: fixture.detail[ID].hotspots.map(
    (h, i): HotspotRecord => ({ ...h, record_id: toHex(i + 1, { size: 32 }), fingerprint_version: 2, map_version: MAP }),
  ),
};

function show(load: DetailLoad, picked: number | null = null) {
  const handlers = { onBack: vi.fn(), onPick: vi.fn(), onRetry: vi.fn() };
  render(<ConcessionView id={ID} load={load} mapVersion={MAP} picked={picked} {...handlers} />);
  return handlers;
}

function kv(name: string) {
  return screen.getByText(name, { selector: "dt" }).nextElementSibling as HTMLElement;
}

const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

describe("ConcessionView", () => {
  it("names the concession, its hotspots in the dates and the map", () => {
    show({ kind: "ready", detail });

    expect(screen.getByRole("heading", { name: ID })).toBeInTheDocument();
    expect(kv("Province")).toHaveTextContent("Sumatera Selatan");
    expect(kv("Area")).toHaveTextContent("251,385 ha");
    expect(kv("Hotspots")).toHaveTextContent("930 inside, 334 within 5 km");
    expect(kv("Boundaries")).toHaveTextContent(MAP);
  });

  it("lists hotspots newest first, 100 at a time", () => {
    show({ kind: "ready", detail });

    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Detected (UTC)", "Fire power", "Where"]);
    expect(bodyRows()).toHaveLength(100);
    expect(bodyRows()[0]).toHaveTextContent("14 Oct 19:02");
    expect(screen.getByRole("button", { name: /^Show 100 more/ })).toHaveTextContent("1,164 not shown");

    // Text queries, since role queries over a thousand rows are slow.
    for (let i = 0; i < 11; i++) fireEvent.click(screen.getByText("Show 100 more"));
    expect(screen.getByText("Show 64 more")).toHaveTextContent("64 not shown");
    fireEvent.click(screen.getByText("Show 64 more"));

    expect(document.querySelectorAll("tbody tr")).toHaveLength(1264);
    expect(screen.queryByText(/^Show \d+ more/)).toBeNull();
  });

  it("says where each hotspot is from this concession's edge", () => {
    show({ kind: "ready", detail }, A_INDEX);

    const a = bodyRows()[A_INDEX];
    expect(a).toHaveTextContent("14 Oct 06:18");
    expect(a).toHaveTextContent("5.2 MW");
    expect(a).toHaveTextContent("Inside, 3.1 km");
    const outside = bodyRows().find((r) => r.textContent?.includes("Outside, "));
    expect(outside).toBeDefined();
  });

  it("reads the match for this concession when a hotspot is near several", () => {
    const shared: HotspotRecord = {
      ...detail.hotspots[0],
      concessions: [
        { id: "ID-WOOD-CONCESSION-0541", inside: true, edge_m: 1200 },
        { id: ID, inside: false, edge_m: 371 },
      ],
    };
    show({ kind: "ready", detail: { ...detail, hotspots: [shared] } });

    expect(bodyRows()[0]).toHaveTextContent("Outside, 370 m");
  });

  it("opens a hotspot from its row, and keeps the picked one marked and on screen", () => {
    const { onPick } = show({ kind: "ready", detail }, A_INDEX);

    expect(bodyRows()).toHaveLength(300);
    expect(bodyRows()[A_INDEX]).toHaveAttribute("aria-selected", "true");

    fireEvent.click(within(bodyRows()[3]).getByRole("button"));
    expect(onPick).toHaveBeenCalledWith(3);
  });

  it("goes back to all concessions", () => {
    const { onBack } = show({ kind: "ready", detail });

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
