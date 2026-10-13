import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { latestHotspot, type HotspotRecord } from "./api";
import { sealOf } from "./chain";
import { HomePage } from "./HomePage";

vi.mock("./api", () => ({ latestHotspot: vi.fn() }));
vi.mock("./chain", () => ({ sealOf: vi.fn() }));
vi.mock("./HotspotMap", () => ({ HotspotMap: () => null }));

const FP = "0x5c16e53d7df3be615bca703d8580e3fec0fbd86d85da8dac6265a6ec08d1b6bc";
const EDITED_FP = "0x155522dd8dee890ce0882285555c34e12f59b3203ac84cdfc25cb832f93f15a4";
const ZERO = `0x${"0".repeat(64)}` as const;

const riau: HotspotRecord = {
  record_id: `0x${"ab".repeat(32)}`,
  source: "VIIRS_NOAA20_NRT",
  lat_e5: 43120,
  lon_e5: 10121540,
  acquired_at: "2026-10-12T06:18:00Z",
  acquired_unix: 1791785880,
  frp_e2: 1420,
  confidence: "n",
  tx_hash: "0xa640d742935c462c6260e88d431b895f58cb0a0837eb57ecc207cb5242591401",
  sealed_at: "2026-10-12T07:02:11Z",
};

const SLOW_NOTE = "Starting the server after a quiet spell. This can take up to a minute; the record loads on its own.";

function row(name: string) {
  return screen.getByText(name, { selector: "dt" }).nextElementSibling as HTMLElement;
}

beforeEach(() => {
  vi.mocked(latestHotspot).mockReset();
  vi.mocked(sealOf).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HomePage", () => {
  it("shows the fixed copy and a skeleton while loading", () => {
    vi.mocked(latestHotspot).mockReturnValue(new Promise(() => {}));
    render(<HomePage />);

    expect(screen.getByText("Fire Watch")).toBeInTheDocument();
    expect(screen.getByText("Records are sealed on Base Sepolia, a test network")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Latest recorded hotspot" })).toBeInTheDocument();
    expect(screen.getByLabelText("Loading the record")).toHaveAttribute("aria-busy", "true");
  });

  it("says the server is starting after 3 s of loading", async () => {
    vi.useFakeTimers();
    let answer: (r: HotspotRecord | null) => void = () => {};
    vi.mocked(latestHotspot).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<HomePage />);

    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByText(SLOW_NOTE)).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(SLOW_NOTE)).toBeInTheDocument();

    await act(async () => answer(null));
    expect(screen.queryByText(SLOW_NOTE)).toBeNull();
    expect(screen.getByText("No hotspot recorded yet")).toBeInTheDocument();
  });

  it("offers Try again when the server fails, and loads on retry", async () => {
    vi.mocked(latestHotspot).mockRejectedValueOnce(new Error("API answered 503")).mockResolvedValueOnce(riau);
    vi.mocked(sealOf).mockResolvedValue({ fingerprint: FP, sealedAt: 1791788531n });
    render(<HomePage />);

    expect(await screen.findByText("Couldn't load the record")).toBeInTheDocument();
    expect(screen.getByText("The server didn't answer. Try again in a moment.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Matches the chain")).toBeInTheDocument();
    expect(latestHotspot).toHaveBeenCalledTimes(2);
  });

  it("shows No hotspot recorded yet when there is no record", async () => {
    vi.mocked(latestHotspot).mockResolvedValue(null);
    render(<HomePage />);

    expect(await screen.findByText("No hotspot recorded yet")).toBeInTheDocument();
  });

  it("does not ask the chain about a record with no transaction", async () => {
    vi.mocked(latestHotspot).mockResolvedValue({ ...riau, tx_hash: null, sealed_at: null });
    render(<HomePage />);

    expect(await screen.findByText("Not on chain yet")).toBeInTheDocument();
    expect(sealOf).not.toHaveBeenCalled();
  });

  it("shows Checking while the chain answers", async () => {
    vi.mocked(latestHotspot).mockResolvedValue(riau);
    vi.mocked(sealOf).mockReturnValue(new Promise(() => {}));
    render(<HomePage />);

    expect(await screen.findByText("Checking")).toBeInTheDocument();
    expect(screen.getByText("Comparing the stored record with the chain.")).toBeInTheDocument();
    expect(sealOf).toHaveBeenCalledWith(riau.record_id);
  });

  it("says Matches the chain when the sealed fingerprint equals the record's", async () => {
    vi.mocked(latestHotspot).mockResolvedValue(riau);
    vi.mocked(sealOf).mockResolvedValue({ fingerprint: FP, sealedAt: 1791788531n });
    render(<HomePage />);

    expect(await screen.findByText("Matches the chain")).toBeInTheDocument();
    expect(row("Fingerprint")).toHaveTextContent("5c16e53d7d…d1b6bc");
  });

  it("says Does not match the chain when the stored record changed", async () => {
    vi.mocked(latestHotspot).mockResolvedValue({ ...riau, lon_e5: 10131540 });
    vi.mocked(sealOf).mockResolvedValue({ fingerprint: FP, sealedAt: 1791788531n });
    render(<HomePage />);

    expect(await screen.findByText("Does not match the chain")).toBeInTheDocument();
    expect(
      screen.getByText("The stored record has changed since it was sealed. The chain still holds the original fingerprint."),
    ).toBeInTheDocument();
    expect(row("Sealed fingerprint")).toHaveTextContent(`${FP.slice(2, 12)}…${FP.slice(-6)}`);
    expect(row("Fingerprint now")).toHaveTextContent(`${EDITED_FP.slice(2, 12)}…${EDITED_FP.slice(-6)}`);
    expect(screen.queryByText("Fingerprint", { selector: "dt" })).toBeNull();
  });

  it("treats an empty seal as Does not match the chain", async () => {
    vi.mocked(latestHotspot).mockResolvedValue(riau);
    vi.mocked(sealOf).mockResolvedValue({ fingerprint: ZERO, sealedAt: 0n });
    render(<HomePage />);

    expect(await screen.findByText("Does not match the chain")).toBeInTheDocument();
  });

  it("offers Check again when the chain can't be reached, and re-runs only the chain check", async () => {
    vi.mocked(latestHotspot).mockResolvedValue(riau);
    vi.mocked(sealOf)
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({ fingerprint: FP, sealedAt: 1791788531n });
    render(<HomePage />);

    expect(await screen.findByText("Couldn't reach Base Sepolia to check this record.")).toBeInTheDocument();
    expect(screen.queryByText("Checking")).toBeNull();
    expect(screen.queryByText("Matches the chain")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    expect(await screen.findByText("Matches the chain")).toBeInTheDocument();
    expect(sealOf).toHaveBeenCalledTimes(2);
    expect(latestHotspot).toHaveBeenCalledTimes(1);
  });
});
