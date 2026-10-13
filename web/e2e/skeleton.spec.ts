import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL, WEB_URL } from "./env";

declare global {
  interface Window {
    __fakeMap: { center: { lat: number; lng: number }; zoom: number };
  }
}

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

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
});

test("visitor sees the hotspot and its proof", async ({ page }) => {
  const [{ tx_hash }] = await sql<{ tx_hash: string }>(
    "SELECT '0x' || encode(tx_hash, 'hex') AS tx_hash FROM hotspots",
  );
  expect(tx_hash).toMatch(/^0x[0-9a-f]{64}$/);

  await page.goto("/");

  const panel = page.getByRole("article", { name: "Hotspot record" });
  await expect(panel.getByText("Matches the chain")).toBeVisible();
  await expect(panel).toContainText("2026-10-12 06:18 UTC");
  await expect(panel).toContainText("VIIRS NOAA-20");
  await expect(panel).toContainText("14.2 MW");
  await expect(panel.getByRole("link", { name: /^View transaction/ })).toHaveAttribute(
    "href",
    `https://sepolia.basescan.org/tx/${tx_hash}`,
  );

  await expect(
    page.getByRole("region", { name: "Map centred on 0.4312°N, 101.2154°E, with the hotspot marked" }),
  ).toBeVisible();
  await expect(page.locator(".hs")).toHaveCount(1);
  expect(await page.evaluate(() => window.__fakeMap.center)).toEqual({ lat: 0.4312, lng: 101.2154 });
});

test("every control is at least 44 px to tap on a touch screen", async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
  const page = await phone.newPage();
  await page.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
  await page.goto(WEB_URL);
  await expect(page.getByText("Matches the chain")).toBeVisible();

  const tooSmall = await page.evaluate(() =>
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
  expect(tooSmall).toEqual([]);
  await phone.close();
});

test("edited longitude reads Does not match", async ({ page }) => {
  await sql("UPDATE hotspots SET lon_e5 = 10131540");

  await page.goto("/");

  const panel = page.getByRole("article", { name: "Hotspot record" });
  await expect(panel.getByText("Does not match the chain")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Map centred on 0.4312°N, 101.3154°E, with the hotspot marked" }),
  ).toBeVisible();
});
