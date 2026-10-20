import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FireGlobe } from "./FireGlobe";
import { Landing } from "./Landing";

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

// The 0332 fire first seen 12 Oct 05:16 UTC outside the concession, cut at 17 Oct 2026 09:00 UTC (D78).
const EXAMPLE_PACK =
  "/?pack=ID-WOOD-CONCESSION-0332&fire=0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7&as_of=1792227600";

describe("Landing", () => {
  it("says what Fire Watch does and for whom, and the problem it answers", () => {
    render(<Landing />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Where did the fire start?");
    expect(
      screen.getByText(/^Fire Watch records every satellite fire detection on or near Indonesia's pulpwood plantations/),
    ).toHaveTextContent("Watchdog investigators use it to show a company's buyers where a fire started and how it spread");
    const problem = screen.getByRole("region", { name: "Two accounts of the same fire" });
    expect(problem).toHaveTextContent(
      "The company often answers that the fire started outside its concession and spread in, or that the complaint has no site, date or basis.",
    );
  });

  it("gives the four steps, the dated facts and the four words", () => {
    render(<Landing />);

    const steps = within(screen.getByRole("region", { name: "How it works" })).getAllByRole("listitem");
    expect(steps.map((s) => s.querySelector("strong")?.textContent)).toEqual([
      "Satellites spot fires.",
      "Each record is sealed.",
      "An investigator finds where it started.",
      "The buyer checks it.",
    ]);
    expect(
      screen.getByText(
        "Every dot is a fire the NOAA-20 satellite saw on 14 Oct 2026: 62,489 worldwide, 9,923 of them in and around Indonesia.",
      ),
    ).toBeInTheDocument();
    const words = within(screen.getByRole("region", { name: "Words used here" }));
    expect(words.getAllByRole("term").map((t) => t.textContent)).toEqual(["Concession", "Hotspot", "Seal", "Peat"]);
  });

  it("names no company", () => {
    const { container } = render(<Landing />);

    expect(container.textContent).not.toMatch(/\bPT\b|\bTbk\b|\bLtd\b|\bGroup\b/);
  });

  it("links to the tool at its own address, and to the example fire's pack", () => {
    render(<Landing />);

    const tool = screen.getAllByRole("link", { name: "Open the tool" });
    expect(tool).toHaveLength(2);
    tool.forEach((link) => expect(link).toHaveAttribute("href", "/?tool"));
    expect(screen.getByRole("link", { name: "See a real example" })).toHaveAttribute("href", EXAMPLE_PACK);
  });

  it("goes to the example fire, then gives its story and its pack", () => {
    render(<Landing />);
    expect(vi.mocked(FireGlobe).mock.lastCall![0].atFire).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Go to the example fire" }));

    expect(vi.mocked(FireGlobe).mock.lastCall![0].atFire).toBe(true);
    expect(
      screen.getByText(
        /^A fire in ID-WOOD-CONCESSION-0332, Central Kalimantan, on 14 Oct 2026\. The satellite first saw it on 12 Oct, outside the concession and 3,100 m from its edge\. By 13 Oct it was inside\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See its complaint pack" })).toHaveAttribute("href", EXAMPLE_PACK);
    expect(screen.queryByRole("button", { name: "Go to the example fire" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Every dot is a fire/)).not.toBeInTheDocument();
  });
});
