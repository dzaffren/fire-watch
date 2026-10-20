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

// Global setup records the 0332 fire's passes in four recorder runs, at chain times 13 Oct 20:00,
// 14 Oct 09:00, 14 Oct 20:00 and 15 Oct 21:00, so each forecast is sealed before the 15 Oct pass.
test("forecasts the 0332 fire inside after its third pass, and the next day's pass sees it inside after the seal", async ({ page }) => {
  const [newest] = await sql<{ tx_hash: string }>(
    "SELECT '0x' || encode(tx_hash, 'hex') AS tx_hash FROM forecasts" +
      " WHERE concession_id = 'ID-WOOD-CONCESSION-0332' AND made_at = '2026-10-14T20:00Z'",
  );
  expect(newest.tx_hash).toMatch(/^0x[0-9a-f]{64}$/);

  await page.goto("/?tool");
  await page.getByLabel("From").fill("2026-10-12");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0332/ }).click();
  await page.getByRole("row").filter({ hasText: "13 Oct 17:37" }).getByRole("button").click();

  const panel = page.getByRole("region", { name: "Forecast to be seen inside by about 15 Oct 05:20 UTC" });
  await expect(panel.getByText("Matches the chain")).toBeVisible();
  await expect(panel).toContainText("Seen inside 15 Oct 18:43 UTC, 13 hours 23 minutes after the forecast time");
  await expect(panel).toContainText(/Sealed 22 hours 4\d minutes before the pass that saw it inside, by Base Sepolia's clock\./);
  await expect(panel.locator("dt:has-text('Crosses the edge') + dd")).toHaveText("2.84194°S, 112.71793°E");
  await expect(panel.getByRole("link", { name: /^View transaction/ })).toHaveAttribute(
    "href",
    `https://sepolia.basescan.org/tx/${newest.tx_hash}`,
  );

  await expect(page.getByText("3 forecasts for this fire, newest first.")).toBeVisible();
  await page.getByRole("button", { name: /^13 Oct 20:00/ }).click();

  const first = page.getByRole("region", { name: "Not forecast to be seen inside by 15 Oct 20:00 UTC" });
  await expect(first.getByText("Matches the chain")).toBeVisible();
  await expect(first).toContainText("Seen inside 15 Oct 18:43 UTC. Not forecast.");
  await expect(page.getByRole("slider", { name: "Satellite pass" })).toHaveAttribute(
    "aria-valuetext",
    "Pass 1 of 4, 2026-10-13 17:37 UTC",
  );
});

test("every forecast control is at least 44 px to tap on a touch screen", async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
  const page = await phone.newPage();
  await page.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );

  await page.goto("/?tool");
  await page.getByLabel("From").fill("2026-10-12");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0332/ }).click();
  await page.getByRole("row").filter({ hasText: "13 Oct 17:37" }).getByRole("button").click();
  const panel = page.getByRole("region", { name: "Forecast to be seen inside by about 15 Oct 05:20 UTC" });
  await expect(panel.getByText("Matches the chain")).toBeVisible();
  await panel.getByText("How this is worked out").click();
  await panel.getByText("Show the raw forecast").click();
  await expect(panel.getByRole("link", { name: /^Forecast rule, version 1, in full/ })).toBeVisible();

  const tooSmall = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("a[href], button, summary")]
      .filter((el) => el.checkVisibility())
      .filter((el) => {
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const hits = (dy: number) => document.elementFromPoint(x, y + dy)?.closest("a[href], button, summary") === el;
        return r.width < 44 || !hits(-21) || !hits(21);
      })
      .map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim()),
  );
  expect(tooSmall).toEqual([]);
  await phone.close();
});
