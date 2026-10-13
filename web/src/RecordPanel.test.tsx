import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HotspotRecord } from "./api";
import { EmptyPanel, RecordPanel } from "./RecordPanel";

const FP = "0x5c16e53d7df3be615bca703d8580e3fec0fbd86d85da8dac6265a6ec08d1b6bc";
const TX = "0xa640d742935c462c6260e88d431b895f58cb0a0837eb57ecc207cb5242591401";

const riau: HotspotRecord = {
  record_id: `0x${"ab".repeat(32)}`,
  source: "VIIRS_NOAA20_NRT",
  lat_e5: 43120,
  lon_e5: 10121540,
  acquired_at: "2026-10-12T06:18:00Z",
  acquired_unix: 1791785880,
  frp_e2: 1420,
  confidence: "n",
  tx_hash: TX,
  sealed_at: "2026-10-12T07:02:11Z",
};

function row(name: string) {
  return screen.getByText(name, { selector: "dt" }).nextElementSibling as HTMLElement;
}

describe("RecordPanel", () => {
  it("Not on chain yet", () => {
    render(<RecordPanel record={{ ...riau, tx_hash: null, sealed_at: null }} fingerprint={FP} check={{ state: "pending" }} onCheckAgain={() => {}} />);

    expect(screen.getByText("Not on chain yet")).toBeInTheDocument();
    expect(
      screen.getByText("This record is stored but not sealed on the chain yet, so it can't be checked."),
    ).toBeInTheDocument();
    expect(row("Transaction")).toHaveTextContent("Not sent yet");
    expect(within(row("Transaction")).queryByRole("link")).toBeNull();
  });

  it("shows the record in display form", () => {
    render(<RecordPanel record={riau} fingerprint={FP} check={{ state: "matches" }} onCheckAgain={() => {}} />);

    expect(screen.getByRole("heading", { name: "Hotspot record" })).toBeInTheDocument();
    expect(screen.getByText("Matches the chain")).toBeInTheDocument();
    expect(screen.getByText("The stored record is exactly what was sealed on Base Sepolia.")).toBeInTheDocument();
    expect(row("Detected")).toHaveTextContent("2026-10-12 06:18 UTC");
    expect(row("Satellite")).toHaveTextContent("VIIRS NOAA-20");
    expect(row("Location")).toHaveTextContent("0.4312°N, 101.2154°E");
    expect(row("Fire power")).toHaveTextContent("14.2 MW");
    expect(row("Confidence")).toHaveTextContent("Nominal");
    expect(row("Fingerprint")).toHaveTextContent("5c16e53d7d…d1b6bc");

    const link = within(row("Transaction")).getByRole("link");
    expect(link).toHaveTextContent("0xa640d742…591401");
    expect(link).toHaveAttribute("href", `https://sepolia.basescan.org/tx/${TX}`);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("formats southern, low-confidence records", () => {
    const papua = { ...riau, lat_e5: -821427, lon_e5: 14072481, frp_e2: 16077, confidence: "l" };
    render(<RecordPanel record={papua} fingerprint={FP} check={{ state: "matches" }} onCheckAgain={() => {}} />);

    expect(row("Location")).toHaveTextContent("8.21427°S, 140.72481°E");
    expect(row("Fire power")).toHaveTextContent("160.77 MW");
    expect(row("Confidence")).toHaveTextContent("Low");
  });

  it("opens the raw record with the full fingerprint", () => {
    render(<RecordPanel record={riau} fingerprint={FP} check={{ state: "matches" }} onCheckAgain={() => {}} />);

    const raw = screen.getByText("Show the raw record").closest("details") as HTMLElement;
    expect(within(raw).getByText(/"lon_e5": 10121540/)).toBeInTheDocument();
    expect(within(raw).getByText(FP.slice(2))).toBeInTheDocument();
  });
});

describe("EmptyPanel", () => {
  it("No hotspot recorded yet", () => {
    render(<EmptyPanel />);

    expect(screen.getByRole("heading", { name: "No hotspot recorded yet" })).toBeInTheDocument();
    expect(screen.getByText("The newest hotspot appears here once it is recorded and sealed.")).toBeInTheDocument();
  });
});
