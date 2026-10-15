import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL, WEB_URL } from "./env";

declare global {
  interface Window {
    __fakeMap: { center: { lat: number; lng: number }; zoom: number };
  }
}

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const MAP_VERSION = "Trase pulpwood concessions 2023–2024, v2026-02-20";
const LIST_NOTE = "3 concessions, ranked by hotspots inside.";

async function sql<Row>(text: string): Promise<Row[]> {
  const db = new pg.Client(E2E_DATABASE_URL);
  await db.connect();
  try {
    return (await db.query(text)).rows;
  } finally {
    await db.end();
  }
}

async function fakeMaps(page: Page) {
  await page.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
}

// The fixture CSV holds 2026-10-11 to 14; the cut-down map holds 0540, 0377 and 0275.
async function openFixtureDates(page: Page) {
  await page.goto("/");
  await page.getByLabel("From").fill("2026-10-11");
  await page.getByLabel("To").fill("2026-10-14");
  await expect(page.getByText(LIST_NOTE)).toBeVisible();
}

const hotspotRow = (page: Page, fire: string) =>
  page.getByRole("row").filter({ hasText: "14 Oct 06:18" }).filter({ hasText: fire });

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await fakeMaps(page);
});

test("investigator lists the concessions", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
  await page.goto("/");
  await expect(page.getByLabel("From")).toHaveValue("2026-10-09");
  await expect(page.getByLabel("To")).toHaveValue("2026-10-15");

  await page.getByLabel("From").fill("2026-10-11");
  await page.getByLabel("To").fill("2026-10-14");

  await expect(page.getByText(LIST_NOTE)).toBeVisible();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  const cells = (i: number) => rows.nth(i).getByRole("cell");
  await expect(cells(0)).toHaveText(["ID-WOOD-CONCESSION-0540Sumatera Selatan", "14", "9"]);
  await expect(cells(1)).toHaveText([/ID-WOOD-CONCESSION-0275/, "0", "1"]);
  await expect(cells(2)).toHaveText([/ID-WOOD-CONCESSION-0377/, "0", "1"]);
});

test("opens 0540 and hotspot A matches the chain", async ({ page }) => {
  const [{ tx_hash }] = await sql<{ tx_hash: string }>(
    "SELECT '0x' || encode(tx_hash, 'hex') AS tx_hash FROM hotspots WHERE lat_e5 = -358175 AND lon_e5 = 10571567",
  );
  expect(tx_hash).toMatch(/^0x[0-9a-f]{64}$/);

  await openFixtureDates(page);
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0540/ }).click();

  await expect(page.getByText("14 inside, 9 within 5 km")).toBeVisible();
  await expect(page.getByText(MAP_VERSION)).toBeVisible();
  await expect(page.getByRole("region", { name: "Map of ID-WOOD-CONCESSION-0540 with 23 hotspots" })).toBeVisible();
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
  expect(await page.evaluate(() => window.__fakeMap)).toMatchObject({ center: { lat: -3.58175, lng: 105.71567 }, zoom: 11 });
});

test("every control is at least 44 px to tap on a touch screen", async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
  const page = await phone.newPage();
  await fakeMaps(page);

  const tooSmall = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("a[href], button, summary")]
        .filter((el) => el.offsetParent)
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

  await page.goto(WEB_URL);
  await page.getByLabel("From").fill("2026-10-11");
  await page.getByLabel("To").fill("2026-10-14");
  await expect(page.getByText(LIST_NOTE)).toBeVisible();
  expect(await tooSmall()).toEqual([]);

  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0540/ }).click();
  await expect(page.getByText("14 inside, 9 within 5 km")).toBeVisible();
  expect(await tooSmall()).toEqual([]);

  await hotspotRow(page, "5.2 MW").getByRole("button").click();
  await expect(page.getByText("Matches the chain")).toBeVisible();
  expect(await tooSmall()).toEqual([]);
  await phone.close();
});

// Last, since it edits the stored record the other tests read.
test("an edited match reads Does not match", async ({ page }) => {
  await sql(
    "UPDATE hotspot_concessions SET inside = true WHERE concession_id = 'ID-WOOD-CONCESSION-0377' " +
      "AND hotspot_id = (SELECT id FROM hotspots WHERE lat_e5 = -367525 AND lon_e5 = 11535328)",
  );

  await openFixtureDates(page);
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0377/ }).click();
  await hotspotRow(page, "3.03 MW").getByRole("button").click();

  const panel = page.getByRole("article", { name: "Hotspot record" });
  await expect(panel.getByText("Does not match the chain")).toBeVisible();
  await expect(panel).toContainText("Inside, 370 m from the edge, within one satellite pixel of it");
});
