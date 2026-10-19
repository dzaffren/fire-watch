import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import vectors from "../../fixtures/fingerprint-vectors.json";
import type { FireDetail, FireSummary, Forecast, HotspotRecord } from "./api";
import { ForecastPanel, type ForecastCheck } from "./ForecastPanel";
import { shortHash } from "./format";
import raw from "./preview/fire-origin.fixture.json";

// Real VIIRS NOAA-20 detections from 2026-10-12 to 15, grouped into fires; see the preview.
const fixture = raw as unknown as {
  detail: Record<string, { hotspots: (HotspotRecord & { fire_key: Hex })[]; fires: FireSummary[] }>;
};

const ID = "ID-WOOD-CONCESSION-0332";
// Scenario 1's fire, by the record ID of its first detection.
const KEY = "0x48f25fe185b0402018dc6cd3fab3930a760bc0c47bed4d163aa67f678000fbc1";
const OTHER_KEY = "0x2ee3d2538b1fc6ffbe75dd9b8a349bcf454dc7797a7976bff9a545c01c787120";
// The 0356 fire, seen inside on its first pass.
const INSIDE_ID = "ID-WOOD-CONCESSION-0356";
const INSIDE_KEY = "0x9b5e7cf66d458017f0d0e7e9fad7dcb2e0ae3e3309ef04e6e5b848be5a7a5547";

const at = (text: string) => Date.parse(`${text}Z`) / 1000;
const SEALED = at("2026-10-14T20:02:00");
const SEEN_INSIDE = at("2026-10-15T18:43:00");
const fp = (hash: string) => shortHash(hash.slice(2), 10, 6);
const vector = (name: string) => vectors.find((v) => v.name.startsWith(name))!.fingerprint as Hex;
// Scenario 1's forecast as sealed, and as it reads after scenario 4 moved its time to 18:40.
const SEALED_FP = vector("0332 fire after its 14 Oct 17:20 pass");
const CHANGED_FP = vector("the scenario 1 forecast with its time changed");

/** Scenario 1's forecast: made 14 Oct 20:00 after the 17:20 pass, inside by about 15 Oct 05:20. */
const scenario1: Forecast = {
  record_id: `0x${"a1".repeat(32)}`,
  concession_id: ID,
  fire_key: KEY,
  after_pass_unix: at("2026-10-14T17:20:00"),
  made_unix: at("2026-10-14T20:00:00"),
  until_unix: at("2026-10-16T20:00:00"),
  inside_by_unix: at("2026-10-15T05:20:00"),
  from: { lat_e5: -284220, lon_e5: 11271781 },
  crossing: { lat_e5: -284194, lon_e5: 11271793 },
  rule_version: 1,
  tx_hash: `0x${"b1".repeat(32)}`,
  sealed_at: "2026-10-14T20:02:00Z",
  outcome: "waiting",
  outcome_unix: null,
};

/** The forecast after the 13 Oct 17:37 pass: not inside by 15 Oct 20:00. */
const saidNo: Forecast = {
  ...scenario1,
  record_id: `0x${"a3".repeat(32)}`,
  after_pass_unix: at("2026-10-13T17:37:00"),
  made_unix: at("2026-10-13T20:00:00"),
  until_unix: at("2026-10-15T20:00:00"),
  inside_by_unix: null,
  from: null,
  crossing: null,
  tx_hash: `0x${"b3".repeat(32)}`,
  sealed_at: "2026-10-13T20:02:00Z",
};

/** The forecast after the 14 Oct 06:18 pass: inside by about 15 Oct 06:18. */
const second: Forecast = {
  ...scenario1,
  record_id: `0x${"a2".repeat(32)}`,
  after_pass_unix: at("2026-10-14T06:18:00"),
  made_unix: at("2026-10-14T09:00:00"),
  until_unix: at("2026-10-16T09:00:00"),
  inside_by_unix: at("2026-10-15T06:18:00"),
  tx_hash: `0x${"b2".repeat(32)}`,
  sealed_at: "2026-10-14T09:02:00Z",
};

function fireOf(id: string, key: Hex, forecasts: Forecast[], forecasts_from_unix: number | null = at("2026-10-13T09:00:00")): FireDetail {
  return {
    ...fixture.detail[id].fires.find((f) => f.key === key)!,
    hotspots: fixture.detail[id].hotspots.filter((h) => h.fire_key === key).sort((a, b) => a.acquired_unix - b.acquired_unix),
    as_of_unix: at("2026-10-16T00:00:00"),
    forecasts,
    forecasts_from_unix,
  };
}

const matches = (sealedAt = SEALED): ForecastCheck => ({ check: { state: "matches" }, sealedAt });

interface Show {
  forecasts?: Forecast[];
  checks?: ForecastCheck[];
  fingerprints?: Hex[];
  now?: number;
  fire?: FireDetail;
}

function show({ forecasts = [scenario1], checks, fingerprints, now = at("2026-10-14T20:30:00"), fire }: Show = {}) {
  const handlers = { onPick: vi.fn(), onCheckAgain: vi.fn() };
  render(
    <ForecastPanel
      fire={fire ?? fireOf(ID, KEY, forecasts)}
      checks={checks ?? forecasts.map(() => matches())}
      fingerprints={fingerprints ?? forecasts.map(() => SEALED_FP)}
      picked={0}
      now={now}
      {...handlers}
    />,
  );
  return handlers;
}

const panel = () => screen.getByRole("region");
const outcome = () => panel().querySelector(".forecast-outcome");

function kv(name: string) {
  return within(panel()).getByText(name, { selector: "dt" }).nextElementSibling as HTMLElement;
}

describe("ForecastPanel", () => {
  it("reads a waiting forecast in full, with its seal by the chain's clock", () => {
    show();

    expect(screen.getByRole("heading", { name: "Forecast to be seen inside by about 15 Oct 05:20 UTC" })).toBeInTheDocument();
    expect(within(panel()).getByText("Matches the chain")).toBeInTheDocument();
    expect(outcome()).toHaveTextContent(/^Waiting until 16 Oct 20:00 UTC$/);
    expect(screen.getByText("Sealed 2 minutes after it was made, by Base Sepolia's clock.")).toBeInTheDocument();
    expect(kv("Made")).toHaveTextContent(/^2026-10-14 20:00 UTCAfter the pass at 14 Oct 17:20 UTC$/);
    expect(kv("Checked against")).toHaveTextContent("Passes from its seal to 2026-10-16 20:00 UTC");
    expect(kv("Crosses the edge")).toHaveTextContent("2.84194°S, 112.71793°E");
    expect(kv("Fingerprint")).toHaveTextContent(fp(SEALED_FP));
    expect(within(panel()).getByRole("link", { name: /^View transaction/ })).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/tx/${scenario1.tx_hash}`,
    );
  });

  it("waits for the last passes once its 48 hours end, until the recorder closes it", () => {
    show({ now: at("2026-10-16T21:00:00") });

    expect(outcome()).toHaveTextContent(/^Waiting for the last passes before 16 Oct 20:00 UTC$/);
  });

  it("still waits until its end at the moment before it", () => {
    show({ now: at("2026-10-16T19:59:00") });

    expect(outcome()).toHaveTextContent(/^Waiting until 16 Oct 20:00 UTC$/);
  });

  it("reads seen inside and how long before it was sealed", () => {
    show({ forecasts: [{ ...scenario1, outcome: "seen_inside", outcome_unix: SEEN_INSIDE }] });

    expect(outcome()).toHaveTextContent(/^Seen inside 15 Oct 18:43 UTC, 13 hours 23 minutes after the forecast time$/);
    expect(
      screen.getByText("Sealed 22 hours 41 minutes before the pass that saw it inside, by Base Sepolia's clock."),
    ).toBeInTheDocument();
  });

  it("reads a fire that came in when the forecast said not", () => {
    show({ forecasts: [{ ...saidNo, outcome: "seen_inside", outcome_unix: SEEN_INSIDE }] });

    expect(screen.getByRole("heading", { name: "Not forecast to be seen inside by 15 Oct 20:00 UTC" })).toBeInTheDocument();
    expect(outcome()).toHaveTextContent(/^Seen inside 15 Oct 18:43 UTC\. Not forecast\.$/);
    expect(within(panel()).queryByText("Crosses the edge")).toBeNull();
  });

  it("reads a forecast inside that stayed out", () => {
    show({ forecasts: [{ ...scenario1, outcome: "not_seen_inside", outcome_unix: null }] });

    expect(outcome()).toHaveTextContent(/^Not seen inside within 48 hours$/);
  });

  it("reads a forecast of not that stayed out", () => {
    show({ forecasts: [{ ...saidNo, outcome: "not_seen_inside", outcome_unix: null }] });

    expect(outcome()).toHaveTextContent(/^Not seen inside, as forecast$/);
  });

  it("reads a forecast for a fire that joined this one, not checked", () => {
    show({ forecasts: [{ ...scenario1, fire_key: OTHER_KEY, outcome: "joined", outcome_unix: SEEN_INSIDE }] });

    expect(outcome()).toHaveTextContent(/^Joined another fire before it was seen inside\. Not checked\.$/);
    expect(kv("Made")).toHaveTextContent(
      /^2026-10-14 20:00 UTCAfter the pass at 14 Oct 17:20 UTC, for a fire that later joined this one$/,
    );
  });

  it("reads a forecast seen inside on a pass before its seal, not checked", () => {
    show({ forecasts: [{ ...scenario1, outcome: "seen_before_seal", outcome_unix: at("2026-10-14T19:00:00") }] });

    expect(outcome()).toHaveTextContent(/^Seen inside on a pass before this forecast was sealed\. Not checked\.$/);
  });

  it("hides a changed forecast's outcome, and shows both fingerprints", () => {
    show({
      forecasts: [{ ...scenario1, inside_by_unix: at("2026-10-15T18:40:00"), outcome: "seen_inside", outcome_unix: SEEN_INSIDE }],
      checks: [{ check: { state: "mismatch", sealed: SEALED_FP }, sealedAt: SEALED }],
      fingerprints: [CHANGED_FP],
    });

    expect(within(panel()).getByText("Does not match the chain")).toBeInTheDocument();
    expect(outcome()).toHaveTextContent(/^Changed after its seal, so its outcome isn't shown\.$/);
    expect(kv("Sealed fingerprint")).toHaveTextContent(fp(SEALED_FP));
    expect(kv("Fingerprint now")).toHaveTextContent(fp(CHANGED_FP));
    expect(within(panel()).queryByText("Fingerprint")).toBeNull();
  });

  it("says a forecast not on the chain yet is sealed in the run that makes it", () => {
    show({
      forecasts: [{ ...scenario1, tx_hash: null, sealed_at: null }],
      checks: [{ check: { state: "pending" }, sealedAt: null }],
    });

    expect(within(panel()).getByText("Not on chain yet")).toBeInTheDocument();
    expect(
      screen.getByText("Not on the chain yet. The recorder seals each forecast in the run that makes it."),
    ).toBeInTheDocument();
    expect(kv("Transaction")).toHaveTextContent("Not sent yet");
  });

  it("says it is reading the seal while it checks", () => {
    show({ checks: [{ check: { state: "checking" }, sealedAt: null }] });

    expect(within(panel()).getByText("Checking")).toBeInTheDocument();
    expect(screen.getByText("Reading its seal from Base Sepolia.")).toBeInTheDocument();
  });

  it("offers Check again when it couldn't reach the chain", () => {
    const { onCheckAgain } = show({ checks: [{ check: { state: "error" }, sealedAt: null }] });

    expect(screen.getByText("Couldn't reach Base Sepolia to check the forecasts.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(onCheckAgain).toHaveBeenCalledOnce();
  });

  it("says a fire seen inside on its first pass had nothing to forecast", () => {
    show({ fire: fireOf(INSIDE_ID, INSIDE_KEY, []) });

    expect(
      screen.getByText("No forecasts. This fire was seen inside on its first pass, so there was nothing to forecast."),
    ).toBeInTheDocument();
  });

  it("says when forecasting began for a fire with none", () => {
    show({ fire: fireOf(ID, KEY, []) });

    expect(
      screen.getByText(
        "No forecasts. Fire Watch began forecasting on 2026-10-13 09:00 UTC, and makes one only after a pass that leaves a fire not yet seen inside.",
      ),
    ).toBeInTheDocument();
  });

  it("lists scenario 1's three forecasts newest first, each with its check and outcome, and picks one", () => {
    const { onPick } = show({ forecasts: [scenario1, second, saidNo] });

    expect(
      screen.getByText("3 forecasts for this fire, newest first. Pick one to see the fire as it stood then."),
    ).toBeInTheDocument();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["14 Oct 20:00Matches the chain", "Inside by about 15 Oct 05:20Waiting until 16 Oct 20:00"],
      ["14 Oct 09:00Matches the chain", "Inside by about 15 Oct 06:18Waiting until 16 Oct 09:00"],
      ["13 Oct 20:00Matches the chain", "Not inside by 15 Oct 20:00Waiting until 15 Oct 20:00"],
    ]);
    expect(rows[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.click(within(rows[2]).getByRole("button", { name: /^13 Oct 20:00/ }));
    expect(onPick).toHaveBeenCalledWith(2);
  });

  it("shortens each outcome for the table", () => {
    show({
      forecasts: [
        { ...scenario1, outcome: "seen_inside", outcome_unix: SEEN_INSIDE },
        { ...second, outcome: "waiting" },
        { ...saidNo, outcome: "seen_inside", outcome_unix: SEEN_INSIDE },
      ],
      now: at("2026-10-16T10:00:00"),
    });

    const outcomes = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.querySelector("td:last-child .sub")?.textContent);
    expect(outcomes).toEqual([
      "Seen inside 15 Oct 18:43, 13 h 23 min after",
      "Waiting for the last passes before 16 Oct 09:00",
      "Seen inside 15 Oct 18:43. Not forecast.",
    ]);
  });
});
