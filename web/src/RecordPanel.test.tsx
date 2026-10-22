import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import type { HotspotRecord } from "./api";
import { checkOf, checkSeal, RecordPanel } from "./RecordPanel";

const MAP = "Trase pulpwood concessions 2023–2024, v2026-02-20";
const A_FP = "0x86a47945c682c15fb86471df99c10a3fe1d8fc4ba7f39f87e70b46703b85f051";
const B_FP = "0x5ac17c85b7568f7dc2f85a77b55418ca98bc0b32122e3eb4e1a226bd4dd2b3c9";
const B_EDITED_FP = "0xaea5b4e67c112b9e21b79692df111a59ebfdc9fbd290d51e4287110112bcfe5c";
const TX = "0xa640d742935c462c6260e88d431b895f58cb0a0837eb57ecc207cb5242591401";
// 2026-10-14 09:05 UTC by the chain's clock, 2 h 47 min after hotspot A was detected.
const SEALED_AT = 1791968700;
const OWN = { contract: "FireRecords" } as const;
// Hotspots A and B as the only two leaves of run 412, sealed 2026-10-14 08:03:12 UTC by the chain's clock.
const RUN = { contract: "FireRuns", run: 412 } as const;
const RUN_SEALED_AT = 1791964992;
const RUN_TX = "0x3b1f0c27a6e8d4f95b2c7e1a0d9f8e6c5b4a39281706f5e4d3c2b1a098f7e6d5";
const A_LEAF = "0x80f45cb1a19941b1b7d3c74f282e51ed36df829aea2d7708adf14a9571a9b11c";
const B_LEAF = "0x00be3acc420ecd8f82f3f55d3369ea4ae3fc13dfd7e3e3b95714238f401503a2";
const RUN_ROOT = "0x5e11c4070cf64b7a13a2533fbf4ab6c17cfa8065e0446c079070a2cbd0a5a71d";

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
    render(
      <RecordPanel record={hotspotA} fingerprint={A_FP} check={{ state: "matches" }} sealedAt={SEALED_AT} sealedIn={OWN} onCheckAgain={() => {}} />,
    );

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
    expect(row("Sealed in")).toHaveTextContent("FireRecords, in a seal of its own");

    const link = within(row("Transaction")).getByRole("link");
    expect(link).toHaveTextContent("0xa640d742…591401");
    expect(link).toHaveAttribute("href", `https://sepolia.basescan.org/tx/${TX}`);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("lists every concession within 5 km, with the one-pixel note near an edge", () => {
    render(
      <RecordPanel record={hotspotB} fingerprint={B_FP} check={{ state: "matches" }} sealedAt={SEALED_AT} sealedIn={OWN} onCheckAgain={() => {}} />,
    );

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
      <RecordPanel
        record={edited}
        fingerprint={B_EDITED_FP}
        check={{ state: "mismatch", sealed: B_FP }}
        sealedAt={SEALED_AT}
        sealedIn={OWN}
        onCheckAgain={() => {}}
      />,
    );

    expect(screen.getByText("Does not match the chain")).toBeInTheDocument();
    expect(
      screen.getByText("The stored record has changed since it was sealed. The chain still holds the original fingerprint."),
    ).toBeInTheDocument();
    expect(row("Sealed fingerprint")).toHaveTextContent("5ac17c85b7…d2b3c9");
    expect(row("Fingerprint now")).toHaveTextContent("aea5b4e67c…bcfe5c");
    expect(screen.queryByText("Fingerprint", { selector: "dt" })).toBeNull();
    expect(row("Sealed")).toHaveTextContent("2026-10-14 09:05 UTC2 h 47 min after detection");
    expect(row("Sealed in")).toHaveTextContent("FireRecords, in a seal of its own");
  });

  it("takes the Sealed time from the chain, not the API's sealed_at", () => {
    // The API says 17 Oct 00:00; the chain sealed it 16 Oct 02:37:38.
    const record = { ...hotspotA, sealed_at: "2026-10-17T00:00:00Z" };
    render(
      <RecordPanel record={record} fingerprint={A_FP} check={{ state: "matches" }} sealedAt={1792118258} sealedIn={OWN} onCheckAgain={() => {}} />,
    );

    expect(row("Sealed")).toHaveTextContent("2026-10-16 02:37 UTC1 d 20 h after detection");
  });

  it("Not on chain yet", () => {
    render(
      <RecordPanel
        record={{ ...hotspotA, tx_hash: null, sealed_at: null }}
        fingerprint={A_FP}
        check={{ state: "pending" }}
        sealedAt={null}
        sealedIn={null}
        onCheckAgain={() => {}}
      />,
    );

    expect(screen.getByText("Not on chain yet")).toBeInTheDocument();
    expect(
      screen.getByText("This record is stored but not sealed on the chain yet, so it can't be checked."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sealed", { selector: "dt" })).toBeNull();
    expect(screen.queryByText("Sealed in", { selector: "dt" })).toBeNull();
    expect(row("Transaction")).toHaveTextContent("Not sent yet");
    expect(within(row("Transaction")).queryByRole("link")).toBeNull();
  });

  it("Checking", () => {
    render(<RecordPanel record={hotspotA} fingerprint={A_FP} check={{ state: "checking" }} sealedAt={null} sealedIn={null} onCheckAgain={() => {}} />);

    expect(screen.getByText("Checking")).toBeInTheDocument();
    expect(screen.getByText("Comparing the stored record with the chain.")).toBeInTheDocument();
    expect(screen.queryByText("Sealed", { selector: "dt" })).toBeNull();
    expect(screen.queryByText("Sealed in", { selector: "dt" })).toBeNull();
  });

  it("offers Check again when the chain can't be reached", () => {
    const again = vi.fn();
    render(<RecordPanel record={hotspotA} fingerprint={A_FP} check={{ state: "error" }} sealedAt={null} sealedIn={null} onCheckAgain={again} />);

    expect(screen.getByText("Couldn't reach Base Sepolia to check this record.")).toBeInTheDocument();
    expect(screen.queryByText("Sealed", { selector: "dt" })).toBeNull();
    expect(screen.queryByText("Sealed in", { selector: "dt" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(again).toHaveBeenCalledOnce();
  });

  it("opens the raw record with the full fingerprint", () => {
    render(
      <RecordPanel record={hotspotA} fingerprint={A_FP} check={{ state: "matches" }} sealedAt={SEALED_AT} sealedIn={OWN} onCheckAgain={() => {}} />,
    );

    const raw = screen.getByText("Show the raw record").closest("details") as HTMLElement;
    expect(within(raw).getByText(/"lon_e5": 10571567/)).toBeInTheDocument();
    expect(within(raw).getByText(A_FP.slice(2))).toBeInTheDocument();
  });
});

describe("RecordPanel, a record in a run's root", () => {
  const inRun: HotspotRecord = { ...hotspotA, tx_hash: RUN_TX, run: 412, proof: [B_LEAF] };

  it("matches, sealed at run 412's time, in run 412's root", () => {
    render(
      <RecordPanel record={inRun} fingerprint={A_FP} check={{ state: "matches" }} sealedAt={RUN_SEALED_AT} sealedIn={RUN} onCheckAgain={() => {}} />,
    );

    expect(screen.getByText("Matches the chain")).toBeInTheDocument();
    expect(row("Sealed")).toHaveTextContent("2026-10-14 08:03 UTC1 h 45 min after detection");
    expect(row("Fingerprint")).toHaveTextContent("86a47945c6…85f051");
    expect(row("Sealed in")).toHaveTextContent("FireRuns, run 412's root");
    const labels = [...document.querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(labels.slice(labels.indexOf("Fingerprint"))).toEqual(["Fingerprint", "Sealed in", "Transaction"]);
    expect(within(row("Transaction")).getByRole("link")).toHaveAttribute("href", `https://sepolia.basescan.org/tx/${RUN_TX}`);
  });

  it("names run 412's root, worked out from the fingerprint and the proof, under the raw record", () => {
    render(
      <RecordPanel record={inRun} fingerprint={A_FP} check={{ state: "matches" }} sealedAt={RUN_SEALED_AT} sealedIn={RUN} onCheckAgain={() => {}} />,
    );

    const raw = screen.getByText("Show the raw record").closest("details") as HTMLElement;
    expect(within(raw).getByText(new RegExp(`"${B_LEAF}"`))).toBeInTheDocument();
    expect(raw.querySelector("p")).toHaveTextContent(
      `Fingerprint of this record: ${A_FP.slice(2)}. Run 412's root, worked out from it and the 1 proof hash above: ${RUN_ROOT.slice(2)}`,
    );
  });

  it("leaves out Sealed and Sealed in while run 412 is not sealed yet", () => {
    render(<RecordPanel record={inRun} fingerprint={A_FP} check={{ state: "pending" }} sealedAt={null} sealedIn={null} onCheckAgain={() => {}} />);

    expect(screen.getByText("Not on chain yet")).toBeInTheDocument();
    expect(screen.queryByText("Sealed", { selector: "dt" })).toBeNull();
    expect(screen.queryByText("Sealed in", { selector: "dt" })).toBeNull();
  });
});

describe("checkSeal", () => {
  const inRun: HotspotRecord = { ...hotspotA, run: 412, proof: [B_LEAF] };
  const ZERO = `0x${"00".repeat(32)}` as const;

  it("checks a record with no run against its own seal on FireRecords", () => {
    const own = (fingerprint: Hex, sealedAt: number) => ({ contract: "FireRecords", fingerprint, sealedAt }) as const;
    expect(checkSeal(own(A_FP, SEALED_AT), hotspotA, A_FP)).toEqual({ check: { state: "matches" }, sealedAt: SEALED_AT, sealedIn: OWN });
    expect(checkSeal(own(B_FP, SEALED_AT), hotspotB, B_EDITED_FP)).toEqual({
      check: { state: "mismatch", sealed: B_FP },
      sealedAt: SEALED_AT,
      sealedIn: OWN,
    });
    expect(checkSeal(own(ZERO, 0), hotspotA, A_FP)).toEqual({ check: { state: "pending" }, sealedAt: null, sealedIn: null });
  });

  it("checks a record with a run by leading its fingerprint and proof to the run's root on FireRuns", () => {
    const root = (r: Hex, sealedAt: number) => ({ contract: "FireRuns", run: 412, root: r, sealedAt }) as const;
    expect(checkSeal(root(RUN_ROOT, RUN_SEALED_AT), inRun, A_FP)).toEqual({
      check: { state: "matches" },
      sealedAt: RUN_SEALED_AT,
      sealedIn: RUN,
    });
    // Hotspot B, the run's other leaf, with hotspot A's leaf as its proof.
    expect(checkSeal(root(RUN_ROOT, RUN_SEALED_AT), { ...hotspotB, run: 412, proof: [A_LEAF] }, B_FP).check).toEqual({ state: "matches" });
    expect(checkSeal(root(RUN_ROOT, RUN_SEALED_AT), inRun, B_EDITED_FP)).toEqual({
      check: { state: "mismatch", sealed: RUN_ROOT },
      sealedAt: RUN_SEALED_AT,
      sealedIn: RUN,
    });
  });

  it("reads a run not sealed yet as not on chain yet", () => {
    expect(checkSeal({ contract: "FireRuns", run: 413, root: ZERO, sealedAt: 0 }, inRun, A_FP)).toEqual({
      check: { state: "pending" },
      sealedAt: null,
      sealedIn: null,
    });
  });
});

describe("checkOf", () => {
  it("reads a zero seal as not on chain yet, the same fingerprint as a match, and another as a change", () => {
    expect(checkOf(`0x${"00".repeat(32)}`, A_FP)).toEqual({ state: "pending" });
    expect(checkOf(A_FP, A_FP)).toEqual({ state: "matches" });
    expect(checkOf(B_FP, B_EDITED_FP)).toEqual({ state: "mismatch", sealed: B_FP });
  });
});
