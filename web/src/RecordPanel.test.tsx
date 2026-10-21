import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HotspotRecord } from "./api";
import { checkOf, RecordPanel } from "./RecordPanel";

const MAP = "Trase pulpwood concessions 2023–2024, v2026-02-20";
const A_FP = "0x86a47945c682c15fb86471df99c10a3fe1d8fc4ba7f39f87e70b46703b85f051";
const B_FP = "0x5ac17c85b7568f7dc2f85a77b55418ca98bc0b32122e3eb4e1a226bd4dd2b3c9";
const B_EDITED_FP = "0xaea5b4e67c112b9e21b79692df111a59ebfdc9fbd290d51e4287110112bcfe5c";
const TX = "0xa640d742935c462c6260e88d431b895f58cb0a0837eb57ecc207cb5242591401";

const hotspotA: HotspotRecord = {
  record_id: `0x${"ab".repeat(32)}`,
  source: "VIIRS_NOAA20_NRT",
  lat_e5: -358175,
  lon_e5: 10571567,
  acquired_at: "2026-10-14T06:18:00Z",
  acquired_unix: 1791958680,
  frp_e2: 520,
  confidence: "n",
  tx_hash: TX,
  sealed_at: "2026-10-14T09:05:00Z",
  fingerprint_version: 2,
  map_version: MAP,
  concessions: [{ id: "ID-WOOD-CONCESSION-0540", inside: true, edge_m: 3099 }],
};

const hotspotB: HotspotRecord = {
  ...hotspotA,
  record_id: `0x${"cd".repeat(32)}`,
  lat_e5: -367525,
  lon_e5: 11535328,
  frp_e2: 303,
  concessions: [
    { id: "ID-WOOD-CONCESSION-0377", inside: false, edge_m: 371 },
    { id: "ID-WOOD-CONCESSION-0275", inside: false, edge_m: 1019 },
  ],
};

function row(name: string) {
  return screen.getByText(name, { selector: "dt" }).nextElementSibling as HTMLElement;
}

describe("RecordPanel", () => {
  it("shows hotspot A's record and its match", () => {
    render(<RecordPanel record={hotspotA} fingerprint={A_FP} check={{ state: "matches" }} onCheckAgain={() => {}} />);

    expect(screen.getByRole("heading", { name: "Hotspot record" })).toBeInTheDocument();
    expect(screen.getByText("Matches the chain")).toBeInTheDocument();
    expect(screen.getByText("The stored record is exactly what was sealed on Base Sepolia.")).toBeInTheDocument();
    expect(row("Detected")).toHaveTextContent("2026-10-14 06:18 UTC");
    expect(row("Sealed")).toHaveTextContent("2026-10-14 09:05 UTC");
    expect(row("Sealed")).toHaveTextContent("2 h 47 min after detection");
    expect(row("Satellite")).toHaveTextContent("VIIRS NOAA-20");
    expect(row("Location")).toHaveTextContent("3.58175°S, 105.71567°E");
    expect(row("Fire power")).toHaveTextContent("5.2 MW");
    expect(row("Confidence")).toHaveTextContent("Nominal");
    expect(row("Concession")).toHaveTextContent("ID-WOOD-CONCESSION-0540");
    expect(row("Concession")).toHaveTextContent("Inside, 3.1 km from the edge");
    expect(row("Boundaries")).toHaveTextContent(MAP);
    expect(row("Fingerprint")).toHaveTextContent("86a47945c6…85f051");

    const link = within(row("Transaction")).getByRole("link");
    expect(link).toHaveTextContent("0xa640d742…591401");
    expect(link).toHaveAttribute("href", `https://sepolia.basescan.org/tx/${TX}`);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("lists every concession within 5 km, with the one-pixel note near an edge", () => {
    render(<RecordPanel record={hotspotB} fingerprint={B_FP} check={{ state: "matches" }} onCheckAgain={() => {}} />);

    expect(screen.queryByText("Concession", { selector: "dt" })).toBeNull();
    const items = within(row("Concessions")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "ID-WOOD-CONCESSION-0377Outside, 370 m from the edge, within one satellite pixel of it",
      "ID-WOOD-CONCESSION-0275Outside, 1.0 km from the edge",
    ]);
  });

  it("shows both fingerprints when the record changed after sealing", () => {
    const edited = { ...hotspotB, concessions: [{ ...hotspotB.concessions[0], inside: true }, hotspotB.concessions[1]] };
    render(
      <RecordPanel record={edited} fingerprint={B_EDITED_FP} check={{ state: "mismatch", sealed: B_FP }} onCheckAgain={() => {}} />,
    );

    expect(screen.getByText("Does not match the chain")).toBeInTheDocument();
    expect(
      screen.getByText("The stored record has changed since it was sealed. The chain still holds the original fingerprint."),
    ).toBeInTheDocument();
    expect(row("Sealed fingerprint")).toHaveTextContent("5ac17c85b7…d2b3c9");
    expect(row("Fingerprint now")).toHaveTextContent("aea5b4e67c…bcfe5c");
    expect(screen.queryByText("Fingerprint", { selector: "dt" })).toBeNull();
  });

  it("Not on chain yet", () => {
    render(
      <RecordPanel
        record={{ ...hotspotA, tx_hash: null, sealed_at: null }}
        fingerprint={A_FP}
        check={{ state: "pending" }}
        onCheckAgain={() => {}}
      />,
    );

    expect(screen.getByText("Not on chain yet")).toBeInTheDocument();
    expect(
      screen.getByText("This record is stored but not sealed on the chain yet, so it can't be checked."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sealed", { selector: "dt" })).toBeNull();
    expect(row("Transaction")).toHaveTextContent("Not sent yet");
    expect(within(row("Transaction")).queryByRole("link")).toBeNull();
  });

  it("Checking", () => {
    render(<RecordPanel record={hotspotA} fingerprint={A_FP} check={{ state: "checking" }} onCheckAgain={() => {}} />);

    expect(screen.getByText("Checking")).toBeInTheDocument();
    expect(screen.getByText("Comparing the stored record with the chain.")).toBeInTheDocument();
  });

  it("offers Check again when the chain can't be reached", () => {
    const again = vi.fn();
    render(<RecordPanel record={hotspotA} fingerprint={A_FP} check={{ state: "error" }} onCheckAgain={again} />);

    expect(screen.getByText("Couldn't reach Base Sepolia to check this record.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(again).toHaveBeenCalledOnce();
  });

  it("opens the raw record with the full fingerprint", () => {
    render(<RecordPanel record={hotspotA} fingerprint={A_FP} check={{ state: "matches" }} onCheckAgain={() => {}} />);

    const raw = screen.getByText("Show the raw record").closest("details") as HTMLElement;
    expect(within(raw).getByText(/"lon_e5": 10571567/)).toBeInTheDocument();
    expect(within(raw).getByText(A_FP.slice(2))).toBeInTheDocument();
  });
});

describe("checkOf", () => {
  it("reads a zero seal as not on chain yet, the same fingerprint as a match, and another as a change", () => {
    expect(checkOf(`0x${"00".repeat(32)}`, A_FP)).toEqual({ state: "pending" });
    expect(checkOf(A_FP, A_FP)).toEqual({ state: "matches" });
    expect(checkOf(B_FP, B_EDITED_FP)).toEqual({ state: "mismatch", sealed: B_FP });
  });
});
