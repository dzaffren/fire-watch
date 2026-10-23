import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { CONTRACT_ADDRESS, E2E_DATABASE_URL, FIRE_RUNS_ADDRESS, RPC_URL, WEB_URL } from "./env";

declare global {
  interface Window {
    __fakeMap: { center: { lat: number; lng: number }; zoom: number };
  }
}

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const MAP_VERSION = "Trase pulpwood concessions 2023–2024, v2026-02-20";
const LIST_NOTE = "4 concessions, ranked by hotspots inside.";

async function sql<Row>(text: string): Promise<Row[]> {
  const db = new pg.Client(E2E_DATABASE_URL);
  await db.connect();
  try {
    return (await db.query(text)).rows;
  } finally {
    await db.end();
  }
}

/** A record's seal time by anvil's clock, as the record panel writes it: "2026-10-13 20:00 UTC". Its run's
 * root on FireRuns for a record in one, else its own seal on FireRecords. */
async function chainSealedAt(recordId: Hex): Promise<string> {
  const [{ run }] = await sql<{ run: string | null }>(
    `SELECT r.run FROM hotspots h LEFT JOIN roots r ON r.id = h.root_id WHERE h.record_id = decode('${recordId.slice(2)}', 'hex')`,
  );
  const client = createPublicClient({ transport: http(RPC_URL) });
  const [, sealedAt] =
    run === null
      ? await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: parseAbi(["function sealOf(bytes32 recordId) view returns (bytes32 fingerprint, uint64 sealedAt)"]),
          functionName: "sealOf",
          args: [recordId],
        })
      : await client.readContract({
          address: FIRE_RUNS_ADDRESS,
          abi: parseAbi(["function runOf(uint256 run) view returns (bytes32 root, uint64 sealedAt)"]),
          functionName: "runOf",
          args: [BigInt(run)],
        });
  expect(sealedAt).toBeGreaterThan(0n);
  return `${new Date(Number(sealedAt) * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

async function fakeMaps(page: Page) {
  await page.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
}

// fire-record.csv holds 2026-10-11 to 14 near 0540, 0377 and 0275; fire-origin.csv adds a fire near 0332.
async function openFixtureDates(page: Page) {
  await page.goto("/?tool");
  await page.getByLabel("From").fill("2026-10-11");
  await page.getByLabel("To").fill("2026-10-14");
  await expect(page.getByText(LIST_NOTE)).toBeVisible();
}

const hotspotRow = (page: Page, fire: string) =>
  page.getByRole("row").filter({ hasText: "14 Oct 06:18" }).filter({ hasText: fire });
// Hotspot A's fire: first seen 12 Oct 06:57, 3.0 km inside 0540, and seen again with A on 14 Oct.
const fireOfA = (page: Page) => page.getByRole("row").filter({ hasText: "12 Oct 06:57" }).filter({ hasText: "Inside, 3.0 km" });
// Hotspot B is a fire of its own on 0377, 371 m from its edge.
const fireOfB = (page: Page) => page.getByRole("row").filter({ hasText: "14 Oct 06:18" }).filter({ hasText: "Too close to tell" });

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await fakeMaps(page);
});

test("investigator lists the concessions", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
  await page.goto("/?tool");
  await expect(page.getByLabel("From")).toHaveValue("2026-10-09");
  await expect(page.getByLabel("To")).toHaveValue("2026-10-15");

  await page.getByLabel("From").fill("2026-10-11");
  await page.getByLabel("To").fill("2026-10-14");

  await expect(page.getByText(LIST_NOTE)).toBeVisible();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(4);
  const cells = (i: number) => rows.nth(i).getByRole("cell");
  await expect(cells(0)).toHaveText(["ID-WOOD-CONCESSION-0540Sumatera Selatan", "14", "9"]);
  await expect(cells(1)).toHaveText([/ID-WOOD-CONCESSION-0332/, "0", "13"]);
  await expect(cells(2)).toHaveText([/ID-WOOD-CONCESSION-0275/, "0", "1"]);
  await expect(cells(3)).toHaveText([/ID-WOOD-CONCESSION-0377/, "0", "1"]);
});

test("opens 0540, then hotspot A's fire, and A matches the chain", async ({ page }) => {
  const [{ tx_hash }] = await sql<{ tx_hash: string }>(
    "SELECT '0x' || encode(tx_hash, 'hex') AS tx_hash FROM hotspots WHERE lat_e5 = -358175 AND lon_e5 = 10571567",
  );
  expect(tx_hash).toMatch(/^0x[0-9a-f]{64}$/);
  const fire = await sql<{ lat_e5: number; lon_e5: number }>(
    "SELECT lat_e5, lon_e5 FROM hotspots WHERE (lat_e5, lon_e5) = (-358175, 10571567) OR acquired_at = '2026-10-12T06:57Z'" +
      " AND abs(lat_e5 + 358175) < 1000 AND abs(lon_e5 - 10571567) < 1000",
  );
  expect(fire).toHaveLength(2);
  const mid = (key: "lat_e5" | "lon_e5") => (Math.min(...fire.map((h) => h[key])) + Math.max(...fire.map((h) => h[key]))) / 2e5;

  await openFixtureDates(page);
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0540/ }).click();

  await expect(page.getByText("14 inside, 9 within 5 km")).toBeVisible();
  await expect(page.getByText(MAP_VERSION)).toBeVisible();
  await expect(page.getByRole("region", { name: "Map of ID-WOOD-CONCESSION-0540 with 23 hotspots" })).toBeVisible();
  await expect(fireOfA(page)).toContainText("2 passes, 2 detections");

  await fireOfA(page).getByRole("button").click();

  await expect(page.getByRole("heading", { name: "First seen inside, 3.0 km from the edge" })).toBeVisible();
  await expect(hotspotRow(page, "5.2 MW")).toContainText("Inside, 3.1 km");

  await hotspotRow(page, "5.2 MW").getByRole("button").click();

  const panel = page.getByRole("article", { name: "Hotspot record" });
  await expect(panel.getByText("Matches the chain")).toBeVisible();
  await expect(panel).toContainText("2026-10-14 06:18 UTC");
  await expect(panel).toContainText("after detection");
  await expect(panel).toContainText("VIIRS NOAA-20");
  await expect(panel).toContainText("5.2 MW");
  await expect(panel).toContainText("Inside, 3.1 km from the edge");
  await expect(panel).toContainText(MAP_VERSION);
  await expect(panel.getByRole("link", { name: /^View transaction/ })).toHaveAttribute(
    "href",
    `https://sepolia.basescan.org/tx/${tx_hash}`,
  );
  // The map stays framed on the fire, with A marked.
  await expect(
    page.getByRole("region", { name: "Map of the fire first seen 12 Oct 06:57 UTC, the detection at 3.58175°S, 105.71567°E marked" }),
  ).toBeVisible();
  const view = await page.evaluate(() => window.__fakeMap);
  expect(view.center.lat).toBeCloseTo(mid("lat_e5"), 6);
  expect(view.center.lng).toBeCloseTo(mid("lon_e5"), 6);
  expect(view.zoom).toBeLessThanOrEqual(14);
});

test("every control is at least 44 px to tap on a touch screen", async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
  const page = await phone.newPage();
  await fakeMaps(page);

  const tooSmall = () =>
    page.evaluate(() =>
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

  await page.goto(`${WEB_URL}/?tool`);
  await page.getByLabel("From").fill("2026-10-11");
  await page.getByLabel("To").fill("2026-10-14");
  await expect(page.getByText(LIST_NOTE)).toBeVisible();
  expect(await tooSmall()).toEqual([]);

  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0540/ }).click();
  await expect(page.getByText("14 inside, 9 within 5 km")).toBeVisible();
  expect(await tooSmall()).toEqual([]);

  await fireOfA(page).getByRole("button").click();
  await expect(page.getByRole("heading", { name: "First seen inside, 3.0 km from the edge" })).toBeVisible();
  expect(await tooSmall()).toEqual([]);

  await hotspotRow(page, "5.2 MW").getByRole("button").click();
  await expect(page.getByText("Matches the chain")).toBeVisible();
  expect(await tooSmall()).toEqual([]);
  await phone.close();
});

test("A still matches the chain when the API sends it with no tx_hash", async ({ page }) => {
  const A = "lat_e5 = -358175 AND lon_e5 = 10571567";
  const [stored] = await sql<{ record_id: Hex; tx_hash: string; sealed_at: Date }>(
    `SELECT '0x' || encode(record_id, 'hex') AS record_id, encode(tx_hash, 'hex') AS tx_hash, sealed_at FROM hotspots WHERE ${A}`,
  );
  const sealedAt = await chainSealedAt(stored.record_id);

  await sql(`UPDATE hotspots SET tx_hash = NULL, sealed_at = NULL WHERE ${A}`);
  try {
    await openFixtureDates(page);
    await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0540/ }).click();
    await fireOfA(page).getByRole("button").click();
    await hotspotRow(page, "5.2 MW").getByRole("button").click();

    const panel = page.getByRole("article", { name: "Hotspot record" });
    await expect(panel.getByText("Matches the chain")).toBeVisible();
    await expect(panel.locator("dt:text-is('Sealed') + dd")).toContainText(sealedAt);
    await expect(panel).not.toContainText("Not on chain yet");
  } finally {
    await sql(
      `UPDATE hotspots SET tx_hash = decode('${stored.tx_hash}', 'hex'), sealed_at = '${stored.sealed_at.toISOString()}' WHERE ${A}`,
    );
  }
});

// Last, since it edits the stored record the other tests read. Put back after, since run 2's root holds
// it and a later spec's pack checks that its runs rebuild.
test("an edited match reads Does not match", async ({ page }) => {
  const match = (inside: boolean) =>
    sql(
      `UPDATE hotspot_concessions SET inside = ${inside} WHERE concession_id = 'ID-WOOD-CONCESSION-0377' ` +
        "AND hotspot_id = (SELECT id FROM hotspots WHERE lat_e5 = -367525 AND lon_e5 = 11535328)",
    );
  await match(true);
  try {
    await openFixtureDates(page);
    await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0377/ }).click();
    await fireOfB(page).getByRole("button").click();
    await hotspotRow(page, "3.03 MW").getByRole("button").click();

    const panel = page.getByRole("article", { name: "Hotspot record" });
    await expect(panel.getByText("Does not match the chain")).toBeVisible();
    await expect(panel).toContainText("Inside, 370 m from the edge, within one satellite pixel of it");
  } finally {
    await match(false);
  }
});
