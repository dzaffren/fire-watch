import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "./env";

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const READING = "First seen outside, 950 m from the edge";
const WHOLE = "No detection of this fire is left out of runs 1 to 4";
const RUNS = "**/api/runs**";
// A detection of the fire's second pass, in run 2's root: 14 Oct 06:18 UTC at 2.85426°S, 112.73068°E. Its nearest
// neighbours in the fire are 426 m away, so the fire stays whole without it.
const LATE = "acquired_at = '2026-10-14T06:18Z' AND lat_e5 = -285426 AND lon_e5 = 11273068";
// A detection of the fire's third pass, in run 3's root: 14 Oct 17:20 UTC at 2.84280°S, 112.72150°E, 200 m outside
// 0332. Its nearest neighbour in the fire is 190 m away.
const GONE = "acquired_at = '2026-10-14T17:20Z' AND lat_e5 = -284280 AND lon_e5 = 11272150";
// A detection's run and its match to 0332.
const IN_0332 =
  "SELECT r.run, h.created_at::text AS created_at FROM hotspots h JOIN roots r ON r.id = h.root_id" +
  " JOIN hotspot_concessions m ON m.hotspot_id = h.id AND m.concession_id = 'ID-WOOD-CONCESSION-0332' WHERE ";

async function sql<Row>(text: string): Promise<Row[]> {
  const db = new pg.Client(E2E_DATABASE_URL);
  await db.connect();
  try {
    return (await db.query(text)).rows;
  } finally {
    await db.end();
  }
}

async function fakeMaps(context: BrowserContext) {
  await context.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
}

async function makePack(page: Page): Promise<string> {
  await page.goto("/?tool");
  await page.getByLabel("From").fill("2026-10-12");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0332/ }).click();
  await page.getByRole("row").filter({ hasText: "13 Oct 17:37" }).getByRole("button").click();
  const [pack] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("link", { name: "Make complaint pack" }).click(),
  ]);
  await expect(pack.getByRole("heading", { level: 1 })).toHaveText(READING);
  return pack.url();
}

// A browser that has never opened Fire Watch.
async function openAsBuyer(context: BrowserContext, url: string) {
  await fakeMaps(context);
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

/** A run's seal time by anvil's clock, as the panel writes it: "2026-10-13 20:00 UTC". */
async function runSealedAt(run: number): Promise<string> {
  const [{ at }] = await sql<{ at: string }>(`SELECT extract(epoch FROM sealed_at)::integer AS at FROM roots WHERE run = ${run}`);
  return `${new Date(Number(at) * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const kv = (page: Page, label: string) => page.getByRole("region", { name: WHOLE }).locator(`dt:text-is('${label}') + dd`);

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await fakeMaps(context);
});

test("a pack reads that no detection of its fire is left out of runs 1 to 4, also in print", async ({ page, browser }) => {
  const url = await makePack(page);
  const [first, last] = await Promise.all([runSealedAt(1), runSealedAt(4)]);
  const buyer = await browser.newContext();
  try {
    const pack = await openAsBuyer(buyer, url);
    const panel = pack.getByRole("region", { name: WHOLE });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Nothing left out")).toBeVisible();
    await expect(panel).toContainText(
      `Detections sealed before ${first} each have a seal of their own on FireRecords. The chain holds no list of them, so NASA FIRMS's public archive is the way to find one left out.`,
    );
    await expect(kv(pack, "Runs checked")).toHaveText(/^1 to 4, with [\d,]+ records$/);
    await expect(kv(pack, "First run sealed")).toHaveText(first);
    await expect(kv(pack, "Last run sealed")).toHaveText(last);

    await pack.emulateMedia({ media: "print" });
    await expect(panel).toBeVisible();
  } finally {
    await buyer.close();
  }
});

test("a detection of run 2 stored after the cut is listed as left out", async ({ page, browser }) => {
  const url = await makePack(page);
  const asOf = Number(new URL(url).searchParams.get("as_of"));
  const [late] = await sql<{ run: string; created_at: string }>(IN_0332 + LATE);
  expect(Number(late.run)).toBe(2);

  await sql(`UPDATE hotspots SET created_at = to_timestamp(${asOf + 3600}) WHERE ${LATE}`);
  const buyer = await browser.newContext();
  try {
    const pack = await openAsBuyer(buyer, url);
    // Without it the fire is still whole: the same first sighting, and 18 detections that match.
    await expect(pack.getByRole("heading", { level: 1 })).toHaveText(READING);
    await expect(pack.getByRole("heading", { name: "18 of 18 detections match the chain" })).toBeVisible();

    const panel = pack.getByRole("region", { name: "1 detection of this fire is left out of this pack" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Left out", { exact: true })).toBeVisible();
    const rows = panel.getByRole("row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText("14 Oct 06:18");
    await expect(rows.nth(1)).toContainText("2.85426°S, 112.73068°E");
    await expect(rows.nth(1)).toContainText("Run 2");
  } finally {
    await sql(`UPDATE hotspots SET created_at = '${late.created_at}' WHERE ${LATE}`);
    await buyer.close();
  }
});

test("a detection deleted from run 3 stops the claim", async ({ page, browser }) => {
  const url = await makePack(page);
  const [gone] = await sql<{ run: string }>(IN_0332 + GONE);
  expect(Number(gone.run)).toBe(3);

  // One session holds the deleted rows, so the finally can put them back as they were.
  const db = new pg.Client(E2E_DATABASE_URL);
  await db.connect();
  await db.query(`CREATE TEMP TABLE gone_hotspots AS SELECT * FROM hotspots WHERE ${GONE}`);
  await db.query("CREATE TEMP TABLE gone_matches AS SELECT * FROM hotspot_concessions WHERE hotspot_id IN (SELECT id FROM gone_hotspots)");
  await db.query("DELETE FROM hotspots WHERE id IN (SELECT id FROM gone_hotspots)");
  const buyer = await browser.newContext();
  try {
    const pack = await openAsBuyer(buyer, url);
    const panel = pack.getByRole("region", { name: "Can't show that nothing is left out of runs 1 to 4" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Does not match the chain")).toBeVisible();
    await expect(panel.locator("dt:text-is('Not matching') + dd")).toHaveText("3");
  } finally {
    await db.query("INSERT INTO hotspots SELECT * FROM gone_hotspots");
    await db.query("INSERT INTO hotspot_concessions SELECT * FROM gone_matches");
    await db.end();
    await buyer.close();
  }
});

test("a pack that couldn't read the runs checks again from a tap on a 390 px phone", async ({ page, browser }) => {
  const url = await makePack(page);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    await phone.route(RUNS, (route) => route.abort());
    const pack = await openAsBuyer(phone, url);
    const panel = pack.getByRole("region", { name: "Couldn't check runs 1 to 4 for a detection left out" });
    await expect(panel).toBeVisible();
    const again = panel.getByRole("button", { name: "Check again" });
    await expect(again).toBeVisible();
    const box = await again.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await phone.unroute(RUNS);
    await again.tap();
    await expect(pack.getByRole("heading", { name: WHOLE })).toBeVisible();
  } finally {
    await phone.close();
  }
});
