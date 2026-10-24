/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PackDetail } from "./api";
import { FireMap } from "./FireMap";
import { detected, location } from "./format";
import { RealCase, type CaseSource } from "./RealCase";
import type { Check } from "./RecordPanel";

vi.mock("./FireMap", () => ({
  FireMap: vi.fn(({ children }: { children?: unknown }) => <div>{children as never}</div>),
}));

const PACK_HREF = "/?pack=ID-WOOD-CONCESSION-0332&fire=0x13b4&as_of=1792227600";
const pack = JSON.parse(readFileSync(resolve("public/case/pack-0332.json"), "utf8")) as PackDetail;
const matches = (): Check[] => pack.hotspots.map(() => ({ state: "matches" }));
// The fire, the claim, passes 1 to 8, the seals, the pack.
const SEALS = 10;

// The reading line, stood in for: the test says which step crosses it.
let observers: { callback: IntersectionObserverCallback; elements: HTMLElement[] }[] = [];
class FakeObserver {
  callback: IntersectionObserverCallback;
  elements: HTMLElement[] = [];
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }
  observe(el: HTMLElement) {
    this.elements.push(el);
  }
  disconnect() {}
}

function reach(step: number) {
  const o = observers[observers.length - 1];
  const target = o.elements.find((el) => el.dataset.step === String(step))!;
  act(() => o.callback([{ isIntersecting: true, target } as unknown as IntersectionObserverEntry], o as never));
}

// The steps commit before the effect that watches them runs, so wait for the watcher, not only the list.
async function watching() {
  await waitFor(() => expect(observers[observers.length - 1]?.elements.length).toBeGreaterThan(0));
}

const lastMap = () => vi.mocked(FireMap).mock.lastCall![0];

function show(check: CaseSource["check"] = async () => matches()) {
  const source: CaseSource = { pack: async () => pack, check: vi.fn(check) };
  render(<RealCase source={source} packHref={PACK_HREF} />);
  return source;
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  // Unmount before the fake goes: unmounting runs an effect still pending, and that effect makes its observer.
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(FireMap).mockClear();
});

describe("RealCase", () => {
  it("tells the fire, the claim, where it was first seen, each pass, the seals and the pack, in order", async () => {
    show();

    const steps = await screen.findAllByRole("listitem");
    expect(steps.map((s) => s.querySelector("h3")?.textContent)).toEqual([
      "A fire near a pulpwood plantation",
      "Two accounts of one fire",
      "Where it was first seen",
      ...[2, 3, 4, 5, 6, 7, 8].map((p) => `Pass ${p} of 8`),
      "Every record is sealed",
      "What the buyer gets",
    ]);
    expect(steps[0]).toHaveTextContent(
      "From 12 Oct to 17 Oct 2026, the NOAA-20 satellite saw this fire on 8 passes, 283 detections in all, near ID-WOOD-CONCESSION-0332, in Central Kalimantan.",
    );
    expect(steps[1]).toHaveTextContent("The company that holds it can answer that the fire started outside its land and spread in.");
    expect(steps[2]).toHaveTextContent(
      "The satellite first saw it on 12 Oct 05:16 UTC as one detection, outside the concession and 3,100 m from its edge. It didn't see the fire again for 25 hours, so that detection may be a separate fire. The satellite can miss fire under cloud or thick tree canopy, and peat that smoulders below the surface. Scroll on to see what came next, one satellite pass at a time.",
    );
    expect(steps[3]).toHaveTextContent(
      "13 Oct 06:37 UTC · 35 detections, 6 inside the concession. These include another fire, first seen on this pass more than 1 km from the first, on both sides of the edge.",
    );
    expect(steps[6]).toHaveTextContent(
      "14 Oct 17:20 UTC · 66 detections, 43 inside the concession. On this pass the fires came within 1 km of each other, so Fire Watch counts them as one.",
    );
    for (const step of steps) {
      expect(step).not.toHaveTextContent("On this point the record agrees with the company");
      expect(step).not.toHaveTextContent("The fire has crossed the edge");
    }
    expect(steps[7]).toHaveTextContent("6 detections, all outside.");
    expect(steps[9]).toHaveTextContent("33 detections, 26 inside the concession. In all, 164 of the 283 detections were inside.");
    expect(steps[SEALS]).toHaveTextContent("Passes 1 to 6 were sealed on 16 Oct, when recording began");
    expect(within(steps[11]).getByRole("link", { name: "See its complaint pack" })).toHaveAttribute("href", PACK_HREF);
  });

  it("shows the whole concession first, then the passes up to each scroll stop, newest in full", async () => {
    show();
    await watching();

    expect(lastMap().dots).toHaveLength(283);
    expect(lastMap().area).toBeUndefined();
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step");

    reach(3);
    expect(lastMap().dots).toHaveLength(36);
    expect(lastMap().dots!.map((d) => d.alpha)).toEqual([0.65, ...Array(35).fill(1)]);
    expect(lastMap().area).toBeDefined();
    expect(screen.getByText("Pass 2 of 8 · 13 Oct 06:37 UTC")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[3]).toHaveAttribute("aria-current", "step");

    reach(9);
    expect(lastMap().dots).toHaveLength(283);
    reach(6);
    expect(lastMap().dots).toHaveLength(182);
  });

  it("checks the seals once, from the seal step on", async () => {
    const source = show();
    await watching();
    reach(9);
    expect(source.check).not.toHaveBeenCalled();

    reach(SEALS);
    expect(await screen.findByText("283 of 283 detections match the chain")).toBeInTheDocument();
    expect(source.check).toHaveBeenCalledWith(pack.hotspots);
    reach(9);
    reach(SEALS);
    expect(source.check).toHaveBeenCalledTimes(1);
  });

  it("names a detection that changed after its seal", async () => {
    show(async () => matches().map((c, i) => (i === 1 ? { state: "mismatch", sealed: `0x${"11".repeat(32)}` } : c)));
    await watching();

    reach(SEALS);

    expect(await screen.findByText("282 of 283 detections match the chain. 1 does not.")).toBeInTheDocument();
    const changed = pack.hotspots[1];
    expect(screen.getByText(`${detected(changed.acquired_unix)}, ${location(changed.lat_e5, changed.lon_e5)}`)).toBeInTheDocument();
  });

  it("offers Check again when Base Sepolia doesn't answer", async () => {
    const source = show(vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(matches()));
    await watching();

    reach(SEALS);
    expect(await screen.findByText("Couldn't reach Base Sepolia to check the 283 detections.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    expect(await screen.findByText("283 of 283 detections match the chain")).toBeInTheDocument();
    expect(source.check).toHaveBeenCalledTimes(2);
  });

  it("points to the pack when the copy doesn't load", async () => {
    render(<RealCase source={{ pack: async () => Promise.reject(new Error("404")), check: vi.fn() }} packHref={PACK_HREF} />);

    expect(await screen.findByText(/^The example fire didn't load\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Its complaint pack" })).toHaveAttribute("href", PACK_HREF);
  });
});
