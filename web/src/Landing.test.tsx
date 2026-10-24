import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FireGlobe } from "./FireGlobe";
import { Landing } from "./Landing";
import type { CaseSource } from "./RealCase";

// The globe arrives at once; FireGlobe.test.tsx covers the flight.
vi.mock("./FireGlobe", async () => {
  const { useEffect } = await import("react");
  return {
    FireGlobe: vi.fn(({ atFire, onArrive }: { atFire: boolean; onArrive?: () => void }) => {
      useEffect(() => {
        if (atFire) onArrive?.();
      }, [atFire, onArrive]);
      return null;
    }),
  };
});

// The case has its own tests; here it is only placed.
vi.mock("./RealCase", () => ({ RealCase: () => null }));
const caseSource = {} as CaseSource;

// The 0332 fire first seen 12 Oct 05:16 UTC outside the concession, cut at 17 Oct 2026 09:00 UTC (D78).
const EXAMPLE_PACK =
  "/?pack=ID-WOOD-CONCESSION-0332&fire=0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7&as_of=1792227600";

describe("Landing", () => {
  it("says why Fire Watch matters, who it is for, and that Indonesia is the first map", () => {
    render(<Landing caseSource={caseSource} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "When a company says a fire spread in from outside its land, show where the satellite first saw it.",
    );
    expect(document.body.textContent).not.toMatch(/fire started/);
    expect(
      screen.getByText(
        "Fire Watch is built for the watchdog groups that report plantation fires to the companies that buy from the plantation. It reads NOAA's NOAA-20 satellite through NASA's FIRMS service. It shows where the satellite first saw a fire and how it spread, on records the buyer checks in their own browser.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/groups use Fire Watch/);
    expect(screen.getByText(/^Today it watches Indonesia's pulpwood concessions, the first map loaded\./)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "A real case" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Two accounts of the same fire" })).not.toBeInTheDocument();
  });

  it("gives the tool's four steps, the dated facts and the four words", () => {
    render(<Landing caseSource={caseSource} />);

    const steps = within(screen.getByRole("region", { name: "How you use it" })).getAllByRole("listitem");
    expect(steps.map((s) => s.querySelector("strong")?.textContent)).toEqual([
      "Pick dates.",
      "Pick a concession.",
      "Open a fire.",
      "Make a pack and send its link.",
    ]);
    expect(
      screen.getByText(
        "Each dot is a square about 1 km across where the NOAA-20 satellite detected fire on 14 Oct 2026, and near the example fire, one detection. That day it made 62,489 detections worldwide, 9,923 of them in and around Indonesia.",
      ),
    ).toBeInTheDocument();
    const words = within(screen.getByRole("region", { name: "Words used here" }));
    expect(words.getAllByRole("term").map((t) => t.textContent)).toEqual(["Concession", "Hotspot", "Seal", "Peat"]);
  });

  it("names no company", () => {
    const { container } = render(<Landing caseSource={caseSource} />);

    expect(container.textContent).not.toMatch(/\bPT\b|\bTbk\b|\bLtd\b|\bGroup\b/);
  });

  it("links to the tool at its own address, and to the real case", () => {
    render(<Landing caseSource={caseSource} />);

    const tool = screen.getAllByRole("link", { name: "Open the tool" });
    expect(tool).toHaveLength(3);
    tool.forEach((link) => expect(link).toHaveAttribute("href", "/?tool"));
    expect(screen.getByRole("link", { name: "Walk through a real case" })).toHaveAttribute("href", "#case");
  });

  it("goes to the example fire, then gives its story and its pack", () => {
    render(<Landing caseSource={caseSource} />);
    expect(vi.mocked(FireGlobe).mock.lastCall![0].atFire).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Go to the example fire" }));

    expect(vi.mocked(FireGlobe).mock.lastCall![0].atFire).toBe(true);
    expect(
      screen.getByText(
        /^A fire in ID-WOOD-CONCESSION-0332, Central Kalimantan, on 14 Oct 2026\. Fire Watch's records first show it on 12 Oct as one detection, 3,100 m outside the concession\. On 14 Oct it joined a second fire, first recorded the day before on both sides of the edge\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See its complaint pack" })).toHaveAttribute("href", EXAMPLE_PACK);
    expect(screen.queryByRole("button", { name: "Go to the example fire" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Each dot is a square/)).not.toBeInTheDocument();
  });
});
