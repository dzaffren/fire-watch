import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import vectors from "../../fixtures/fingerprint-vectors.json";
import type { Backtest, FireDetail, FireSummary, Forecast, HotspotRecord } from "./api";
import { ForecastPanel, type ForecastCheck } from "./ForecastPanel";
import { shortHash } from "./format";
import { leaf, rootFrom } from "./merkle";
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

/** A 2023 replay of rule version 1, next to three guesses. */
const REPLAY: Backtest = {
  rule_version: 1,
  forecasts: 20277,
  joined: 246,
  seen_before_made: 21,
  ends_after_2023: 15,
  rule: { warned: 123, missed: 12, did_not_come_in: 3751, stayed_out: 16109, median_hours_off: 11.7 },
  downwind: { warned: 19, missed: 116, did_not_come_in: 256, stayed_out: 19604, median_hours_off: 9 },
  near_edge: { warned: 117, missed: 18, did_not_come_in: 3193, stayed_out: 16667, median_hours_off: 11.7 },
  next_pass: { warned: 135, missed: 0, did_not_come_in: 19860, stayed_out: 0, median_hours_off: 11.7 },
  picked_on: {
    v2_candidate: { warned: 52, missed: 4, did_not_come_in: 1871, stayed_out: 11278 },
    near_edge: { warned: 52, missed: 4, did_not_come_in: 2091, stayed_out: 11058 },
    rule: { warned: 53, missed: 3, did_not_come_in: 2395, stayed_out: 10754 },
  },
  judged_on: {
    v2_candidate: { warned: 63, missed: 16, did_not_come_in: 1022, stayed_out: 5689 },
    near_edge: { warned: 65, missed: 14, did_not_come_in: 1102, stayed_out: 5609 },
    rule: { warned: 70, missed: 9, did_not_come_in: 1356, stayed_out: 5355 },
  },
};

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
  run: null,
  proof: null,
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

const OWN = { contract: "FireRecords" } as const;
const matches = (sealedAt = SEALED): ForecastCheck => ({ check: { state: "matches" }, sealedAt, sealedIn: OWN });

interface Show {
  forecasts?: Forecast[];
  checks?: ForecastCheck[];
  fingerprints?: Hex[];
  now?: number;
  fire?: FireDetail;
  backtest?: Backtest;
}

function show({ forecasts = [scenario1], checks, fingerprints, now = at("2026-10-14T20:30:00"), fire, backtest }: Show = {}) {
  const handlers = { onPick: vi.fn(), onCheckAgain: vi.fn() };
  render(
    <ForecastPanel
      fire={fire ?? fireOf(ID, KEY, forecasts)}
      checks={checks ?? forecasts.map(() => matches())}
      fingerprints={fingerprints ?? forecasts.map(() => SEALED_FP)}
      picked={0}
      now={now}
      backtest={backtest}
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
    expect(kv("Sealed in")).toHaveTextContent("FireRecords, in a seal of its own");
    expect(within(panel()).getByRole("link", { name: /^View transaction/ })).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/tx/${scenario1.tx_hash}`,
    );
  });

  it("reads a forecast in run 412's root as sealed in FireRuns, after its fingerprint", () => {
    // Run 412's one transaction, sealed 14 Oct 20:03 by the chain's clock.
    const RUN_TX = `0x${"c4".repeat(32)}` as const;
    show({
      forecasts: [{ ...scenario1, tx_hash: RUN_TX, run: 412, proof: [`0x${"d4".repeat(32)}`] }],
      checks: [{ check: { state: "matches" }, sealedAt: at("2026-10-14T20:03:00"), sealedIn: { contract: "FireRuns", run: 412 } }],
    });

    expect(within(panel()).getByText("Matches the chain")).toBeInTheDocument();
    expect(screen.getByText("Sealed 3 minutes after it was made, by Base Sepolia's clock.")).toBeInTheDocument();
    expect(kv("Sealed in")).toHaveTextContent("FireRuns, run 412's root");
    const labels = [...panel().querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(labels.slice(labels.indexOf("Fingerprint"))).toEqual(["Fingerprint", "Sealed in", "Transaction"]);
    expect(within(kv("Transaction")).getByRole("link")).toHaveAttribute("href", `https://sepolia.basescan.org/tx/${RUN_TX}`);
  });

  it("shows the fingerprint now and both roots when a forecast in run 412 changed", () => {
    // Run 412's root on the chain, and the root the changed forecast and its proof lead to.
    const RUN_ROOT = `0x${"e5".repeat(32)}` as const;
    const SIBLING = `0x${"d4".repeat(32)}` as const;
    show({
      forecasts: [{ ...scenario1, inside_by_unix: at("2026-10-15T18:40:00"), run: 412, proof: [SIBLING] }],
      checks: [{ check: { state: "mismatch", sealed: RUN_ROOT }, sealedAt: SEALED, sealedIn: { contract: "FireRuns", run: 412 } }],
      fingerprints: [CHANGED_FP],
    });

    expect(within(panel()).getByText("Does not match the chain")).toBeInTheDocument();
    expect(
      screen.getByText("This forecast has changed since its run was sealed. The chain still holds the run's original root."),
    ).toBeInTheDocument();
    expect(kv("Fingerprint now")).toHaveTextContent(fp(CHANGED_FP));
    expect(kv("Run root on chain")).toHaveTextContent(fp(RUN_ROOT));
    expect(kv("Run root now")).toHaveTextContent(fp(rootFrom(leaf(scenario1.record_id, CHANGED_FP), [SIBLING])));
    expect(within(panel()).queryByText("Sealed fingerprint", { selector: "dt" })).toBeNull();
    expect(kv("Sealed in")).toHaveTextContent("FireRuns, run 412's root");
  });

  it("leaves out Sealed in until the chain answers with a seal", () => {
    show({ checks: [{ check: { state: "pending" }, sealedAt: null, sealedIn: null }] });

    expect(within(panel()).queryByText("Sealed in", { selector: "dt" })).toBeNull();
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
    show({ forecasts: [{ ...scenario1, fire_key: OTHER_KEY, outcome: "joined", outcome_unix: null }] });

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
      checks: [{ check: { state: "mismatch", sealed: SEALED_FP }, sealedAt: SEALED, sealedIn: OWN }],
      fingerprints: [CHANGED_FP],
    });

    expect(within(panel()).getByText("Does not match the chain")).toBeInTheDocument();
    expect(outcome()).toHaveTextContent(/^Changed after its seal, so its outcome isn't shown\.$/);
    expect(kv("Sealed fingerprint")).toHaveTextContent(fp(SEALED_FP));
    expect(kv("Fingerprint now")).toHaveTextContent(fp(CHANGED_FP));
    expect(within(panel()).queryByText("Fingerprint")).toBeNull();
  });

  it("says a forecast not on the chain yet is sealed in the run that makes it, or a later one", () => {
    show({
      forecasts: [{ ...scenario1, tx_hash: null, sealed_at: null }],
      checks: [{ check: { state: "pending" }, sealedAt: null, sealedIn: null }],
    });

    expect(within(panel()).getByText("Not on chain yet")).toBeInTheDocument();
    expect(
      screen.getByText("Not on the chain yet. The recorder seals each forecast in the run that makes it, or a later one."),
    ).toBeInTheDocument();
    expect(kv("Transaction")).toHaveTextContent("Not sent yet");
  });

  it("says it is reading the seal while it checks", () => {
    show({ checks: [{ check: { state: "checking" }, sealedAt: null, sealedIn: null }] });

    expect(within(panel()).getByText("Checking")).toBeInTheDocument();
    expect(screen.getByText("Reading its seal from Base Sepolia.")).toBeInTheDocument();
  });

  it("offers Check again when it couldn't reach the chain", () => {
    const { onCheckAgain } = show({ checks: [{ check: { state: "error" }, sealedAt: null, sealedIn: null }] });

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

  describe("the 2023 replay", () => {
    const cells = (table: HTMLElement) =>
      within(table).getAllByRole("row").map((r) => Array.from(r.children).map((c) => c.textContent));

    it("shows how rule version 1 did on 2023, next to three guesses", () => {
      show({ backtest: REPLAY });

      const block = screen.getByRole("heading", { name: "How this rule did on 2023, replayed" }).parentElement!;
      expect(cells(within(block).getByRole("table", { name: "How this rule did on 2023, replayed" }))).toEqual([
        ["In 2023", "Arrivals warned of, out of 135", "Warnings that didn't come in"],
        ["Rule version 1", "123", "3,751 of 3,874"],
        ["Near-edge step", "117", "3,193 of 3,310"],
        ["Downwind guess", "19", "256 of 275"],
        ["Next-pass guess", "135", "19,860 of 19,995"],
      ]);
      expect(
        within(block).getByText(
          "Rule version 1's advance step warned of 6 arrivals the near-edge step missed, and added 558 warnings that didn't come in.",
        ),
      ).toBeInTheDocument();
      expect(within(block).getByText("A replay of 2023, run in 2026. Nothing in it was sealed in 2023.")).toBeInTheDocument();
    });

    it("says one arrival and one warning when the advance step adds one of each", () => {
      show({ backtest: { ...REPLAY, near_edge: { ...REPLAY.near_edge, warned: 122, did_not_come_in: 3750 } } });

      expect(
        screen.getByText(
          "Rule version 1's advance step warned of 1 arrival the near-edge step missed, and added 1 warning that didn't come in.",
        ),
      ).toBeInTheDocument();
    });

    it("says the rule version 2 tried missed the bar on the months that judged it", () => {
      show({ backtest: REPLAY });

      const block = screen.getByRole("heading", { name: "How this rule did on 2023, replayed" }).parentElement!;
      expect(
        within(block).getByText(
          "Fire Watch tried one rule version 2, picked on January to September 2023. On October to December it warned " +
            "of 63 of 79 arrivals, 2 fewer than the near-edge step, so rule version 1 stays.",
        ),
      ).toBeInTheDocument();
    });

    it("works the tried rule's sentence out from the totals", () => {
      const judged_on = { ...REPLAY.judged_on, near_edge: { ...REPLAY.judged_on.near_edge, warned: 66, missed: 13 } };
      show({ backtest: { ...REPLAY, judged_on } });

      expect(screen.getByText(/On October to December it warned of 63 of 79 arrivals, 3 fewer than the near-edge step,/)).toBeInTheDocument();
    });

    it("gives the rule version 2 tried, and both parts of 2023, under How this is worked out", () => {
      show({ backtest: REPLAY });

      expect(cells(screen.getByRole("table", { name: "Picked on: January to September 2023" }))).toEqual([
        ["Picked on, Jan to Sep", "Arrivals warned of, out of 56", "Warnings that didn't come in"],
        ["Rule version 2, tried", "52", "1,871 of 1,923"],
        ["Near-edge step", "52", "2,091 of 2,143"],
        ["Rule version 1", "53", "2,395 of 2,448"],
      ]);
      expect(cells(screen.getByRole("table", { name: "Judged on: October to December 2023" }))).toEqual([
        ["Judged on, Oct to Dec", "Arrivals warned of, out of 79", "Warnings that didn't come in"],
        ["Rule version 2, tried", "63", "1,022 of 1,085"],
        ["Near-edge step", "65", "1,102 of 1,167"],
        ["Rule version 1", "70", "1,356 of 1,426"],
      ]);
      expect(
        screen.getByText(/^The rule version 2 tried is the near-edge step, except that a lone detection gets no warning\. A lone detection is the only detection within 5 km of the concession in the 48 hours to its pass\./),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/^Fire Watch picked it from more than 3,400 variants, tried on forecasts made January to September 2023 only\. Fire Watch then judged it once on forecasts made October to December\./),
      ).toBeInTheDocument();
    });

    it("gives every other count, each guess and both links under How this is worked out", () => {
      show({ backtest: REPLAY });

      expect(cells(screen.getByRole("table", { name: "The rest of the 2023 replay" }))).toEqual([
        ["Forecasts", "Arrivals missed", "Said no, stayed out", "Median hours off"],
        ["Rule version 1", "12", "16,109", "11.7 h"],
        ["Near-edge step", "18", "16,667", "11.7 h"],
        ["Downwind guess", "116", "19,604", "9.0 h"],
        ["Next-pass guess", "0", "0", "11.7 h"],
      ]);
      expect(cells(screen.getByRole("table", { name: "The same for all four" }))).toEqual([
        ["Not checked: joined another fire first", "246"],
        ["Not checked: seen inside before it was made", "21"],
        ["Not counted: its 48 hours end after 2023", "15"],
        ["Forecasts made", "20,277"],
      ]);
      expect(screen.getByText(/^The near-edge step is this rule's step 5 alone: a fire at most 375 m from the edge/)).toBeInTheDocument();
      expect(screen.getByText(/moves the fire with ERA5's hourly wind, from Open-Meteo, at the rate it advanced/)).toBeInTheDocument();
      expect(screen.getByText(/in 2023 the downwind guess said yes only where this rule did\. So neither warned of an arrival/)).toBeInTheDocument();
      expect(
        screen.getByText(
          /^Each forecast is sealed in the run that makes it, or a later run if that one fails to seal\. Every one stays listed here, right or wrong\./,
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Every 2023 forecast, as CSV" })).toHaveAttribute(
        "href",
        "https://github.com/dzaffren/fire-watch/blob/main/fixtures/backtest/2023-forecasts.csv",
      );
      expect(screen.getByRole("link", { name: "Redo the 2023 replay" })).toHaveAttribute(
        "href",
        "https://github.com/dzaffren/fire-watch/blob/main/README.md#redo-the-2023-replay",
      );
    });

    it("reads None warned of for a method that warned of none", () => {
      show({ backtest: { ...REPLAY, downwind: { ...REPLAY.downwind, warned: 0, median_hours_off: null } } });

      const table = screen.getByRole("table", { name: "The rest of the 2023 replay" });
      expect(cells(table)[3]).toEqual(["Downwind guess", "116", "19,604", "None warned of"]);
    });

    it("shows no replay for a forecast by a rule version with none", () => {
      show({ backtest: { ...REPLAY, rule_version: 2 } });

      expect(screen.queryByText("How this rule did on 2023, replayed")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Redo the 2023 replay" })).not.toBeInTheDocument();
    });

    it("shows no replay for a fire with no forecasts", () => {
      show({ fire: fireOf(ID, KEY, []), backtest: REPLAY });

      expect(screen.queryByText("How this rule did on 2023, replayed")).not.toBeInTheDocument();
    });
  });
});
