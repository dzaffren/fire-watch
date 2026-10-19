import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { ADMIN_DATABASE_URL } from "./env";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const API = resolve(ROOT, "api");
const BACKTEST = resolve(ROOT, "fixtures/backtest");
const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
// Its own database, so loading the cut's map leaves global setup's concessions alone.
const BACKTEST_DATABASE = "firewatch_e2e_backtest";
const BACKTEST_DATABASE_URL = `postgresql://firewatch:firewatch@127.0.0.1:55432/${BACKTEST_DATABASE}`;
interface Totals {
  warned: number;
  missed: number;
  did_not_come_in: number;
  median_hours_off: number | null;
}
// The page bundles the committed totals, not the cut's (D59).
const committed: { forecasts: number; rule: Totals; downwind: Totals } = JSON.parse(
  readFileSync(resolve(BACKTEST, "2023.json"), "utf8"),
);

const count = (n: number) => n.toLocaleString("en-GB");
const hoursOff = (h: number | null) => (h === null ? "None warned of" : `${h.toFixed(1)} h`);

async function resetDatabase() {
  const admin = new pg.Client(ADMIN_DATABASE_URL);
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${BACKTEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${BACKTEST_DATABASE}`);
  } finally {
    await admin.end();
  }
}

/** Runs backtest-2023 on the cut of 2023 and returns its CSV's rows. */
async function replayCut(): Promise<Record<string, string>[]> {
  await resetDatabase();
  const out = await mkdtemp(join(tmpdir(), "backtest-"));
  await promisify(execFile)(
    "uv",
    [
      "run", "backtest-2023",
      "--firms", resolve(BACKTEST, "2023-cut.csv"),
      "--map", resolve(BACKTEST, "trase-cut.geojson"),
      "--wind", resolve(BACKTEST, "2023-wind-cut.csv"),
      "--out", out,
    ],
    { cwd: API, env: { ...process.env, DATABASE_URL: BACKTEST_DATABASE_URL } },
  );
  const [header, ...lines] = (await readFile(join(out, "2023-forecasts.csv"), "utf8")).trimEnd().split("\n");
  const columns = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, i) => [columns[i], value])));
}

test("replays a cut of 2023 and shows the committed result on the 0332 fire", async ({ page }) => {
  test.setTimeout(120_000);
  const rows = await replayCut();
  // A fire by its concession and its first detection's time and place, and the pass it was forecast after.
  const forecast = (concession: string, fire: string, afterPass: string) => {
    const [at, lat, lon] = fire.split(" ");
    const found = rows.filter(
      (r) =>
        r.concession_id === `ID-WOOD-CONCESSION-${concession}` && r.fire_first_seen_at === at &&
        r.fire_latitude === lat && r.fire_longitude === lon && r.after_pass_at === afterPass,
    );
    expect(found).toHaveLength(1);
    return found[0];
  };

  expect(forecast("0263", "2023-09-26T06:24Z -2.99651 115.32928", "2023-09-27T06:05Z")).toMatchObject({
    rule_inside_by: "2023-09-28T06:05Z",
    downwind_inside_by: "",
    outcome: "seen_inside",
    seen_inside_at: "2023-09-28T05:46Z",
  });
  expect(forecast("0332", "2023-10-14T05:46Z -3.04503 112.84000", "2023-10-14T05:46Z")).toMatchObject({
    rule_inside_by: "",
    outcome: "seen_inside",
    seen_inside_at: "2023-10-16T05:08Z",
  });
  expect(forecast("0264", "2023-09-28T05:46Z -3.75798 116.28809", "2023-09-28T18:28Z")).toMatchObject({
    rule_inside_by: "2023-09-29T06:28Z",
    outcome: "not_seen_inside",
    seen_inside_at: "",
  });

  await page.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
  await page.goto("/");
  await page.getByLabel("From").fill("2026-10-12");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0332/ }).click();
  await page.getByRole("row").filter({ hasText: "13 Oct 17:37" }).getByRole("button").click();

  const panel = page.getByRole("region", { name: "Forecast to be seen inside by about 15 Oct 05:20 UTC" });
  const { rule, downwind } = committed;
  const arrivals = count(rule.warned + rule.missed);
  await expect(panel.getByRole("table", { name: "How this rule did on 2023, replayed" }).locator("tbody tr")).toHaveText([
    `Arrivals warned of${count(rule.warned)} of ${arrivals}${count(downwind.warned)} of ${arrivals}`,
    `Warnings that didn't come in${count(rule.did_not_come_in)} of ${count(rule.warned + rule.did_not_come_in)}` +
      `${count(downwind.did_not_come_in)} of ${count(downwind.warned + downwind.did_not_come_in)}`,
    `Median hours off${hoursOff(rule.median_hours_off)}${hoursOff(downwind.median_hours_off)}`,
  ]);
  await expect(panel).toContainText("A replay of 2023, run in 2026. Nothing in it was sealed in 2023.");

  await panel.getByText("How this is worked out").click();
  const counts = panel.getByRole("table", { name: "Every count of the 2023 replay" });
  await expect(counts.getByRole("row", { name: /^Forecasts made/ })).toHaveText(
    `Forecasts made${count(committed.forecasts)}, the same for both`,
  );
  await expect(panel.getByRole("link", { name: "Every 2023 forecast, as CSV" })).toHaveAttribute(
    "href",
    "https://github.com/dzaffren/fire-watch/blob/main/fixtures/backtest/2023-forecasts.csv",
  );
  await expect(panel.getByRole("link", { name: "Redo the 2023 replay" })).toHaveAttribute(
    "href",
    "https://github.com/dzaffren/fire-watch/blob/main/README.md#redo-the-2023-replay",
  );
});
