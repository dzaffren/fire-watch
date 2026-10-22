import { fileURLToPath } from "node:url";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { createPublicClient, http, type Hex } from "viem";
import { CONTRACT_ADDRESS, E2E_DATABASE_URL, FIRE_RUNS_ADDRESS, NEW_RECORDER_ADDRESS, RECORDER_ADDRESS, RPC_URL } from "./env";

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const READING = "First seen outside, 950 m from the edge";
const ALL_MATCH = "19 of 19 detections match the chain";
// A detection of the fire's first pass, sealed on FireRecords as before the switch: 13 Oct 17:37 UTC at
// 2.85057°S, 112.71823°E, outside 0332 and 954 m from its edge.
const OLD = "acquired_at = '2026-10-13T17:37Z' AND lat_e5 = -285057 AND lon_e5 = 11271823";
// A detection in run 2's root, from the first recorder key: 14 Oct 06:18 UTC at 2.85500°S, 112.72607°E, 14.48 MW,
// outside 0332 and 1.6 km from its edge.
const NEW = "acquired_at = '2026-10-14T06:18Z' AND lat_e5 = -285500 AND lon_e5 = 11272607";
const NEW_ROW = { date: "14 Oct 06:18", where: "Outside, 1.6 km" };

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

async function openFire(page: Page) {
  await page.goto("/?tool");
  await page.getByLabel("From").fill("2026-10-12");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0332/ }).click();
  await page.getByRole("row").filter({ hasText: "13 Oct 17:37" }).getByRole("button").click();
}

async function makePack(page: Page): Promise<string> {
  await openFire(page);
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

const basescan = (address: string) => new RegExp(`^https://sepolia\\.basescan\\.org/address/${address}#code$`, "i");
const sealedIn = (page: Page) => page.getByRole("article", { name: "Hotspot record" }).locator("dt:text-is('Sealed in') + dd");

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await fakeMaps(context);
});

test("each run sealed its records under one root in one transaction, from the key FireRuns held then", async () => {
  const roots = await sql<{ run: string; tx_hash: Hex; records: string; transactions: string }>(
    "SELECT r.run, '0x' || encode(r.tx_hash, 'hex') AS tx_hash," +
      " (SELECT count(*) FROM hotspots h WHERE h.root_id = r.id) + (SELECT count(*) FROM forecasts f WHERE f.root_id = r.id) AS records," +
      " (SELECT count(DISTINCT t) FROM (SELECT tx_hash AS t FROM hotspots WHERE root_id = r.id" +
      "  UNION ALL SELECT tx_hash FROM forecasts WHERE root_id = r.id) AS x WHERE t = r.tx_hash) AS transactions" +
      " FROM roots r ORDER BY r.run",
  );
  expect(roots.map((r) => Number(r.run))).toEqual([1, 2, 3, 4]);
  for (const r of roots) {
    expect(Number(r.records)).toBeGreaterThan(0);
    expect(Number(r.transactions)).toBe(1);
  }

  const chain = createPublicClient({ transport: http(RPC_URL) });
  const senders = await Promise.all(roots.map(async (r) => (await chain.getTransaction({ hash: r.tx_hash })).from.toLowerCase()));
  expect(senders).toEqual([RECORDER_ADDRESS, RECORDER_ADDRESS, NEW_RECORDER_ADDRESS, NEW_RECORDER_ADDRESS].map((a) => a.toLowerCase()));
  const to = await Promise.all(roots.map(async (r) => (await chain.getTransaction({ hash: r.tx_hash })).to?.toLowerCase()));
  expect(to).toEqual(roots.map(() => FIRE_RUNS_ADDRESS.toLowerCase()));
});

test("a pack checks old seals and run roots in one read, and names both contracts", async ({ page, browser }) => {
  const url = await makePack(page);
  const buyer = await browser.newContext();
  try {
    const { page: pack, chainReads } = await openAsBuyer(buyer, url);
    await expect(pack.getByRole("heading", { name: ALL_MATCH })).toBeVisible();
    expect(chainReads).toHaveLength(1);

    const check = pack.getByRole("region", { name: ALL_MATCH });
    await expect(check).toContainText("An older detection has a seal of its own on FireRecords.");
    await expect(check).toContainText("A newer one is under its recorder run's root on FireRuns.");
    await expect(check.getByRole("link", { name: /^View FireRecords / })).toHaveAttribute("href", basescan(CONTRACT_ADDRESS));
    await expect(check.getByRole("link", { name: /^View FireRuns / })).toHaveAttribute("href", basescan(FIRE_RUNS_ADDRESS));

    const [old] = await sql<{ tx_hash: Hex }>(`SELECT '0x' || encode(tx_hash, 'hex') AS tx_hash FROM hotspots WHERE ${OLD}`);
    await pack.getByRole("row").filter({ hasText: "Outside, 950 m" }).getByRole("button").click();
    await expect(sealedIn(pack)).toHaveText("FireRecords, in a seal of its own");
    await expect(pack.getByRole("article", { name: "Hotspot record" }).getByRole("link", { name: /^View transaction/ })).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/tx/${old.tx_hash}`,
    );

    const [run2] = await sql<{ tx_hash: Hex }>("SELECT '0x' || encode(tx_hash, 'hex') AS tx_hash FROM roots WHERE run = 2");
    await pack.getByRole("row").filter({ hasText: NEW_ROW.date }).filter({ hasText: NEW_ROW.where }).getByRole("button").click();
    await expect(sealedIn(pack)).toHaveText("FireRuns, run 2's root");
    await expect(pack.getByRole("article", { name: "Hotspot record" }).getByRole("link", { name: /^View transaction/ })).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/tx/${run2.tx_hash}`,
    );
  } finally {
    await buyer.close();
  }
});

test("a detection changed after its run was sealed reads Does not match; the rest of its run still match", async ({ page, browser }) => {
  const url = await makePack(page);
  const [{ frp_e2, run }] = await sql<{ frp_e2: number; run: string }>(
    `SELECT h.frp_e2, r.run FROM hotspots h JOIN roots r ON r.id = h.root_id WHERE ${NEW}`,
  );
  expect([frp_e2, Number(run)]).toEqual([1448, 2]);

  await sql(`UPDATE hotspots SET frp_e2 = 410 WHERE ${NEW}`);
  const buyer = await browser.newContext();
  try {
    const { page: pack } = await openAsBuyer(buyer, url);
    await expect(pack.getByRole("heading", { name: "18 of 19 detections match the chain. 1 does not." })).toBeVisible();
    const rows = pack.getByRole("table", { name: /detections, oldest first$/ }).getByRole("row");
    await expect(rows.nth(1)).toContainText(NEW_ROW.date);
    await expect(rows.nth(1)).toContainText(NEW_ROW.where);
    await expect(rows.nth(1)).toContainText("Does not match the chain");
    // The other five detections of the 14 Oct 06:18 pass are in the same root.
    await expect(rows.filter({ hasText: NEW_ROW.date }).filter({ hasText: "Matches the chain" })).toHaveCount(5);

    await rows.nth(1).getByRole("button").click();
    const panel = pack.getByRole("article", { name: "Hotspot record" });
    await expect(panel.getByText("Does not match the chain")).toBeVisible();
    await expect(panel).toContainText("4.1 MW");
    await expect(panel).toContainText("The stored record has changed since its run was sealed. The chain still holds the run's original root.");
    await expect(panel.locator("dt:text-is('Run root on chain') + dd")).toBeVisible();
    await expect(panel.locator("dt:text-is('Run root now') + dd")).toBeVisible();
    await expect(sealedIn(pack)).toHaveText("FireRuns, run 2's root");
  } finally {
    await sql(`UPDATE hotspots SET frp_e2 = 1448 WHERE ${NEW}`);
    await buyer.close();
  }
});

test("a forecast sealed in run 3's root matches, sealed in FireRuns", async ({ page }) => {
  await openFire(page);
  const panel = page.getByRole("region", { name: "Forecast to be seen inside by about 15 Oct 05:20 UTC" });
  await expect(panel.getByText("Matches the chain")).toBeVisible();
  await expect(panel.locator("dt:text-is('Sealed in') + dd")).toHaveText("FireRuns, run 3's root");
});

test("the pack's FireRuns link opens Basescan from a tap on a 390 px phone", async ({ page, browser }) => {
  const url = await makePack(page);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const { page: pack } = await openAsBuyer(phone, url);
    await expect(pack.getByRole("heading", { name: ALL_MATCH })).toBeVisible();
    const link = pack.getByRole("region", { name: ALL_MATCH }).getByRole("link", { name: /^View FireRuns / });
    // As the other tap checks: 44 px wide, and a tap 21 px above or below the middle still lands on it.
    const tooSmall = await link.evaluate((el) => {
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const hits = (dy: number) => document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2 + dy)?.closest("a[href]") === el;
      return r.width < 44 || !hits(-21) || !hits(21);
    });
    expect(tooSmall).toBe(false);

    await phone.route("https://sepolia.basescan.org/**", (route) => route.fulfill({ body: "Basescan" }));
    const [opened] = await Promise.all([phone.waitForEvent("page"), link.tap()]);
    await opened.waitForLoadState();
    expect(opened.url()).toMatch(basescan(FIRE_RUNS_ADDRESS));
  } finally {
    await phone.close();
  }
});
