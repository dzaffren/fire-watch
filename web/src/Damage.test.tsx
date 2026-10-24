import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Damage, FireDetail, FireSummary } from "./api";
import { amount, DamagePanel, estimate, twoFigures } from "./Damage";
import { FIRES, fixture } from "./preview/fixture";

// Each fire's four parts, as the damage query works them out on the compose PostGIS from its real
// detections, Trase's map v2026-02-20 and WRI's peat map v20230315; see the preview.
const PEAT_FIRE: Damage = { inside_peat_ha: 59.21, inside_other_ha: 0, outside_peat_ha: 144.31, outside_other_ha: 6.3 };
const OFF_PEAT: Damage = { inside_peat_ha: 0, inside_other_ha: 0, outside_peat_ha: 0, outside_other_ha: 14.06 };
const STILL: Damage = { inside_peat_ha: 58.25, inside_other_ha: 0, outside_peat_ha: 0, outside_other_ha: 0 };

const NOT_MEASURED =
  "An estimate, not a measurement. A detection means fire somewhere in its 375 m pixel, not that the whole pixel burned.";
const NEVER_SPREAD = "This fire never spread. If it is a fixed heat source, such as a mill, little or nothing here burned.";
const SHARES = "At NASA's 2023 shares: 62% of peat, 42% of other ground.";

// Hotspot B of fire-record scenario 1: one detection, 371 m outside ID-WOOD-CONCESSION-0377.
const B: FireSummary = {
  key: "0x5c1f0b3c6b4e4d1f8e0c2a7d9b3e6f1a2c4d5e6f708192a3b4c5d6e7f8091a2b",
  first_seen_unix: Date.parse("2026-10-14T06:18:00Z") / 1000,
  last_seen_unix: Date.parse("2026-10-14T06:18:00Z") / 1000,
  passes: 1,
  detections: 1,
  first_seen: { reading: "edge", inside: false, edge_m: 371 },
  inside_from_unix: null,
  outside_from_unix: null,
  never_spread: false,
  recorded_before_h: null,
};

const summaryOf = ({ id, key }: { id: string; key: string }) => fixture.detail[id].fires.find((f) => f.key === key)!;
const fireOf = (summary: FireSummary, damage?: Damage): FireDetail => ({ ...summary, hotspots: [], damage, as_of_unix: 1792227600 });

const panel = () => screen.getByRole("region", { name: "Damage estimate" });
/** A figure's value and the grey line under it, with spaces as a reader sees them. */
const figure = (label: string) => {
  const dd = within(panel().querySelector("dl")!).getByText(label, { selector: "dt" }).nextElementSibling!;
  return [...dd.children].map((c) => c.textContent!.replace(/\s/g, " "));
};

describe("twoFigures", () => {
  it("rounds to two significant figures", () => {
    expect(twoFigures(209.82)).toBe(210);
    expect(twoFigures(122648)).toBe(120000);
    expect(twoFigures(6.31)).toBe(6.3);
    expect(twoFigures(0)).toBe(0);
  });
});

describe("amount", () => {
  it("writes thousands with commas and millions as a word", () => {
    expect(amount(122648)).toBe("120,000");
    expect(amount(1299264)).toBe("1.3 million");
    expect(amount(14.06)).toBe("14");
  });
});

describe("estimate", () => {
  it("works out the 0332 fire's ground, what likely burned at the 2023 shares, and its CO2 and cost", () => {
    const e = estimate(PEAT_FIRE);
    expect(e.ha).toBeCloseTo(209.82, 2);
    expect(e.haInside).toBeCloseTo(59.21, 2);
    // 203.52 ha of peat at 61.8% and 6.30 ha of other ground at 42.2%.
    expect(e.burned).toBeCloseTo(128.43, 2);
    expect(e.burnedInside).toBeCloseTo(36.59, 2);
    expect(Math.round(e.co2)).toBe(75714);
    expect(Math.round(e.co2Low)).toBe(36555);
    expect(Math.round(e.co2High)).toBe(114874);
    expect(Math.round(e.co2Inside)).toBe(21976);
    expect(Math.round(e.co2InsideLow)).toBe(10583);
    expect(Math.round(e.co2InsideHigh)).toBe(33369);
    expect(Math.round(e.cost)).toBe(795303);
    expect(Math.round(e.costInside)).toBe(226588);
  });
});

describe("DamagePanel", () => {
  it("gives a peat fire's damage, split at the edge", () => {
    render(<DamagePanel fire={fireOf(summaryOf(FIRES.outside), PEAT_FIRE)} />);

    expect(figure("Ground in its pixels")).toEqual(["About 210 ha", "59 ha of it inside the concession."]);
    expect(figure("Likely burned")).toEqual(["About 130 ha", `${SHARES} 37 ha of it inside the concession.`]);
    expect(figure("CO₂ released")).toEqual([
      "37,000 to 110,000 t",
      "About 76,000 t at IPCC's average. 11,000 to 33,000 t of it inside the concession.",
    ]);
    expect(figure("Cost")).toEqual([
      "About US$800,000",
      "At Indonesia's 2015 average of US$6,192 a hectare. US$230,000 of it inside the concession.",
    ]);
    // A number keeps its unit on its line.
    expect(panel().textContent).toContain("About 210 ha");
    expect(panel().textContent).toContain("About 130 ha");
    expect(within(panel()).getByText(NOT_MEASURED)).toBeInTheDocument();
    expect(within(panel()).queryByText(/of this ground is inside the concession\.$/)).toBeNull();
    expect(within(panel()).queryByText(NEVER_SPREAD)).toBeNull();
  });

  it("scales a fire off peat by the other-ground share, with no range", () => {
    render(<DamagePanel fire={fireOf(B, OFF_PEAT)} />);

    expect(figure("Ground in its pixels")).toEqual(["About 14 ha"]);
    expect(figure("Likely burned")).toEqual(["About 5.9 ha", SHARES]);
    expect(figure("CO₂ released")).toEqual(["About 400 t"]);
    expect(figure("Cost")).toEqual(["About US$37,000", "At Indonesia's 2015 average of US$6,192 a hectare."]);
    expect(within(panel()).getByText("None of this ground is inside the concession.")).toBeInTheDocument();
    expect(panel().querySelector("dl")!.textContent).not.toMatch(/\d to \d|IPCC's average|of it inside/);
  });

  it("puts the never-spread caveat above a fire's figures", () => {
    render(<DamagePanel fire={fireOf(summaryOf(FIRES.still), STILL)} />);

    expect(figure("Ground in its pixels")).toEqual(["About 58 ha"]);
    expect(figure("Likely burned")).toEqual(["About 36 ha", SHARES]);
    expect(figure("CO₂ released")).toEqual(["10,000 to 33,000 t", "About 22,000 t at IPCC's average."]);
    expect(within(panel()).getByText("All of this ground is inside the concession.")).toBeInTheDocument();
    const caveat = within(panel()).getByText(NEVER_SPREAD);
    expect(caveat.compareDocumentPosition(panel().querySelector("dl")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows how the estimate is worked out, so anyone can redo it", () => {
    render(<DamagePanel fire={fireOf(summaryOf(FIRES.outside), PEAT_FIRE)} />);
    fireEvent.click(within(panel()).getByText("How this is worked out"));

    const parts = within(panel()).getByRole("table", { name: "How this is worked out" });
    expect(within(parts).getAllByRole("row").map((r) => [...r.children].map((c) => c.textContent))).toEqual([
      ["", "On peat", "Other ground"],
      ["Inside the concession", "59.21 ha", "0.00 ha"],
      ["Outside", "144.31 ha", "6.30 ha"],
    ]);
    expect(
      within(panel()).getByText(/The ground that likely burned is each part at the share NASA found burned in 2023, below\.$/),
    ).toBeInTheDocument();

    const check = within(panel()).getByRole("table", { name: /^In 2023, NASA's MODIS burned-area map checked the squares/ });
    expect(within(check).getAllByRole("row").map((r) => [...r.children].map((c) => c.textContent))).toEqual([
      ["", "Ground in its pixels", "Found burned"],
      ["Peat, in large patches", "31,915 ha", "61.8%"],
      ["Other ground, in large patches", "25,536 ha", "42.2%"],
      ["All ground", "456,345 ha", "15.1%"],
    ]);
    expect(
      within(panel()).getByText(
        "A large patch is more than 20 squares that touch. MODIS's 500 m pixels miss small burns, so the shares come from large patches, which it can see. A small fire may have burned less than these shares.",
      ),
    ).toBeInTheDocument();
    const factors = within(panel()).getAllByText("Likely burned", { selector: "dt" })[1];
    expect(factors.nextElementSibling?.textContent).toBe("61.8% of the peat and 42.2% of the other ground in its pixels.");
    expect(within(panel()).getByText("CO₂ on peat", { selector: "dt" }).nextElementSibling?.textContent).toMatch(
      /^600\.6 t a hectare, likely 289\.2 to 911\.9\./,
    );
    expect(within(panel()).getByText("CO₂ on other ground", { selector: "dt" }).nextElementSibling?.textContent).toMatch(
      /^66\.7 t a hectare/,
    );
    expect(
      within(panel()).getByText(
        "The CO₂ range is IPCC's 95% interval for the peat a fire burns. Other ground is at IPCC's average, since its interval reaches zero. IPCC gives no interval for peat's 464 g, which comes from one study.",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel()).getByText(
        "Methane and carbon monoxide are left out. This estimate is not sealed. Its detections are sealed, and the maps, the 2023 check and the factors are pinned, so anyone can redo it.",
      ),
    ).toBeInTheDocument();
    expect(within(panel()).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      [
        "IPCC 2013 Wetlands Supplement, Tables 2.6 and 2.7",
        "https://www.ipcc-nggip.iges.or.jp/public/wetlands/pdf/Wetlands_separate_files/WS_Chp2_Drained_Inland_Organic_Soils.pdf",
      ],
      [
        "IPCC 2006 Guidelines, Volume 4, Tables 2.4 and 2.5",
        "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/4_Volume4/V4_02_Ch2_Generic.pdf",
      ],
      ["World Bank, The Cost of Fire (2016)", "https://openknowledge.worldbank.org/entities/publication/391e19f4-18f7-56c2-8c28-bb89cc9e7d6f"],
      ["WRI Global Peatlands, v20230315, CC BY 4.0", "https://data.globalforestwatch.org/datasets/gfw::global-peatlands/about"],
      ["The peat map's tiles and their sha256", "https://github.com/dzaffren/fire-watch/blob/main/api/src/firewatch/peat.py"],
      ["NASA MODIS Burned Area, MCD64A1 Collection 6.1", "https://lpdaac.usgs.gov/products/mcd64a1v061/"],
      [
        "The 2023 check, its files and their sha256",
        "https://github.com/dzaffren/fire-watch/blob/main/api/src/firewatch/damage_check.py",
      ],
    ]);
  });

  it("shows no panel for a fire without damage", () => {
    const { container } = render(<DamagePanel fire={fireOf(summaryOf(FIRES.outside))} />);

    expect(container).toBeEmptyDOMElement();
  });
});
