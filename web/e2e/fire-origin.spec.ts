import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "./env";

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));

async function sql<Row>(text: string): Promise<Row[]> {
  const db = new pg.Client(E2E_DATABASE_URL);
  await db.connect();
  try {
    return (await db.query(text)).rows;
  } finally {
    await db.end();
  }
}

test.beforeEach(async ({ page }) => {
  await page.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
});

// fire-origin.csv holds the 19 detections of the ID-WOOD-CONCESSION-0332 fire in scenario 1.
test("opens the 0332 fire first seen outside and its first detection matches the chain", async ({ page }) => {
  // The fire's first detection: its first pass, then lowest latitude, then lowest longitude.
  const [first] = await sql<{ tx_hash: string }>(
    "SELECT '0x' || encode(tx_hash, 'hex') AS tx_hash FROM hotspots" +
      " WHERE acquired_at = '2026-10-13T17:37Z' AND lon_e5 BETWEEN 11270000 AND 11275000 ORDER BY lat_e5, lon_e5 LIMIT 1",
  );
  expect(first.tx_hash).toMatch(/^0x[0-9a-f]{64}$/);

  await page.goto("/");
  await page.getByLabel("From").fill("2026-10-12");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0332/ }).click();

  const fireRow = page.getByRole("row").filter({ hasText: "13 Oct 17:37" });
  await expect(fireRow).toContainText("4 passes, 19 detections");
  await expect(fireRow).toContainText("Outside, 950 m");
  await expect(fireRow).toContainText("Inside from 15 Oct 18:43");
  await fireRow.getByRole("button").click();

  const reading = page.getByRole("article", { name: "First seen outside, 950 m from the edge" });
  await expect(reading.locator("dt:has-text('First seen') + dd")).toHaveText("2026-10-13 17:37 UTC");
  await expect(reading.locator("dt:has-text('Seen inside from') + dd")).toHaveText("2026-10-15 18:43 UTC");
  await expect(reading.locator("dt:has-text('Passes') + dd")).toHaveText("4, with 19 detections");

  const replay = page.getByRole("slider", { name: "Satellite pass" });
  await expect(replay).toHaveAttribute("aria-valuetext", "Pass 4 of 4, 2026-10-15 18:43 UTC");
  await replay.press("Home");
  await expect(replay).toHaveAttribute("aria-valuetext", "Pass 1 of 4, 2026-10-13 17:37 UTC");
  await expect(page.getByText("Pass 1 of 4")).toBeVisible();

  await page.getByRole("row").filter({ hasText: "13 Oct 17:37" }).first().getByRole("button").click();

  const panel = page.getByRole("article", { name: "Hotspot record" });
  await expect(panel.getByText("Matches the chain")).toBeVisible();
  await expect(panel).toContainText("2026-10-13 17:37 UTC");
  await expect(panel.getByRole("link", { name: /^View transaction/ })).toHaveAttribute(
    "href",
    `https://sepolia.basescan.org/tx/${first.tx_hash}`,
  );
  await expect(page.getByRole("button", { name: "Fire first seen 13 Oct 17:37" })).toBeVisible();
});
