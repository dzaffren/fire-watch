import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL, RPC_URL } from "./env";

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const READING = "First seen outside, 950 m from the edge";
// Scenario 3's detection: 14 Oct 06:18 UTC at 2.85500°S, 112.72607°E, 14.48 MW.
const CHANGED = "acquired_at = '2026-10-14T06:18Z' AND lat_e5 = -285500 AND lon_e5 = 11272607";

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

// fire-origin.csv holds the 19 detections of the ID-WOOD-CONCESSION-0332 fire, recorded and sealed on anvil.
async function makePack(page: Page): Promise<string> {
  await page.goto("/");
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

// A browser that has never opened Fire Watch, counting its reads of the chain.
async function openAsBuyer(context: BrowserContext, url: string) {
  await fakeMaps(context);
  const page = await context.newPage();
  const chainReads: string[] = [];
  page.on("request", (req) => {
    if (req.url().startsWith(RPC_URL) && req.postData()?.includes("eth_call")) chainReads.push(req.postData()!);
  });
  await page.goto(url);
  return { page, chainReads };
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await fakeMaps(context);
});

test("makes a pack of the 0332 fire and every detection matches the chain", async ({ page, browser }) => {
  const url = await makePack(page);
  expect(url).toMatch(/\/\?pack=ID-WOOD-CONCESSION-0332&fire=0x[0-9a-f]{64}&as_of=\d+$/);

  const buyer = await browser.newContext();
  try {
    const { page: pack, chainReads } = await openAsBuyer(buyer, url);
    await expect(pack.getByRole("heading", { level: 1 })).toHaveText(READING);
    await expect(pack.getByText(/^Complaint pack, as of \d{4}-\d\d-\d\d \d\d:\d\d UTC$/)).toBeVisible();
    await expect(pack.getByText("ID-WOOD-CONCESSION-0332, Kalimantan Tengah")).toBeVisible();

    const site = pack.getByRole("region", { name: "Site" });
    await expect(site.locator("dt:has-text('First detection') + dd")).toHaveText("2.8517°S, 112.72527°E");
    const dates = pack.getByRole("region", { name: "Dates" });
    await expect(dates.locator("dt:has-text('First seen') + dd")).toHaveText("2026-10-13 17:37 UTC");
    await expect(dates.locator("dt:has-text('Seen inside from') + dd")).toHaveText("2026-10-15 18:43 UTC");
    await expect(dates.locator("dt:has-text('Last seen') + dd")).toHaveText("2026-10-15 18:43 UTC");
    const basis = pack.getByRole("region", { name: "Basis" });
    await expect(basis.locator("dt:has-text('Passes') + dd")).toHaveText("4, with 19 detections");

    await expect(pack.getByRole("heading", { name: "19 of 19 detections match the chain" })).toBeVisible();
    // Every seal in one read through Multicall3 (D38).
    expect(chainReads).toHaveLength(1);
  } finally {
    await buyer.close();
  }
});

test("a detection changed after its seal is listed first", async ({ page, browser }) => {
  const url = await makePack(page);
  const [{ frp_e2 }] = await sql<{ frp_e2: number }>(`SELECT frp_e2 FROM hotspots WHERE ${CHANGED}`);
  expect(frp_e2).toBe(1448);

  await sql(`UPDATE hotspots SET frp_e2 = 145 WHERE ${CHANGED}`);
  const buyer = await browser.newContext();
  try {
    const { page: pack } = await openAsBuyer(buyer, url);
    await expect(pack.getByRole("heading", { name: "18 of 19 detections match the chain. 1 does not." })).toBeVisible();
    const firstRow = pack.getByRole("table", { name: /detections, oldest first$/ }).getByRole("row").nth(1);
    await expect(firstRow).toContainText("14 Oct 06:18");
    await expect(firstRow).toContainText("Does not match the chain");
  } finally {
    await sql(`UPDATE hotspots SET frp_e2 = 1448 WHERE ${CHANGED}`);
    await buyer.close();
  }
});
