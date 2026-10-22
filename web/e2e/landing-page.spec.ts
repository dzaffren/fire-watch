import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { API_URL, WEB_URL } from "./env";

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const LIST_NOTE = "4 concessions, ranked by hotspots inside.";
// The e2e's API has no example fire, so the pack link is checked by its address: 0332's fire first seen outside,
// cut at 17 Oct 2026 09:00 UTC (D78).
const EXAMPLE_PACK =
  "/?pack=ID-WOOD-CONCESSION-0332&fire=0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7&as_of=1792227600";

const HEADLINE = "Show where satellites first saw a plantation fire, on records anyone can check.";

// Puts a step of the real case across the reading line, 60% down the screen.
async function toStep(page: Page, step: number) {
  await page.evaluate((n) => {
    const el = document.querySelector(`[data-step="${n}"]`)!;
    scrollTo(0, scrollY + el.getBoundingClientRect().top - innerHeight * 0.45);
  }, step);
  await expect(page.locator(`[data-step="${step}"]`)).toHaveAttribute("aria-current", "step");
}

async function fakeMaps(page: Page) {
  await page.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
}

test("a newcomer reads the landing, walks the real case to its seals, then opens the tool and comes back", async ({
  page,
}) => {
  await fakeMaps(page);
  const asked: string[] = [];
  const chainCode: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(API_URL)) asked.push(request.url());
    if (request.resourceType() === "script" && /\/chain-/.test(request.url())) chainCode.push(request.url());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADLINE);
  await expect(page.getByText(/^Today it watches Indonesia's pulpwood concessions, the first map loaded\./)).toBeVisible();
  await expect(page.getByText(/62,489 worldwide, 9,923 of them in and around Indonesia/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Words used here" }).getByRole("term")).toHaveText([
    "Concession",
    "Hotspot",
    "Seal",
    "Peat",
  ]);

  // Nothing on the page shifts, whether the globe stays or goes back to the flat map.
  const globe = page.locator(".globe");
  const height = (await globe.boundingBox())!.height;
  await page.getByRole("button", { name: "Go to the example fire" }).click();
  await expect(page.getByText(/The satellite first saw it on 12 Oct, outside the concession/)).toBeVisible();
  expect((await globe.boundingBox())!.height).toBe(height);
  await expect(page.locator(".landing-globe").getByRole("link", { name: "See its complaint pack" })).toHaveAttribute(
    "href",
    EXAMPLE_PACK,
  );

  // The real case, one scroll stop at a time, read from the committed copy; its seals are on anvil (D92).
  await page.getByRole("link", { name: "Walk through a real case" }).click();
  await expect(page).toHaveURL(`${WEB_URL}/#case`);
  const steps = page.getByRole("region", { name: "A real case" }).getByRole("listitem");
  // The map comes first in the page, so it sits first on screen too: Tab reaches its zoom buttons before the captions.
  const mapBox = (await page.locator(".case-map").boundingBox())!;
  const stepsBox = (await page.locator(".case-steps").boundingBox())!;
  expect(mapBox.x + mapBox.width).toBeLessThanOrEqual(stepsBox.x);
  await toStep(page, 2);
  await expect(steps.nth(2)).toContainText("outside the concession and 3,100 m from its edge");
  await toStep(page, 3);
  await expect(steps.nth(3)).toContainText("35 detections, 6 inside the concession. The fire has crossed the edge.");
  await expect(page.getByText("Pass 2 of 8 · 13 Oct 06:37 UTC")).toBeVisible();
  // The chain code waits for the seal step (D91).
  expect(chainCode).toEqual([]);
  await toStep(page, 10);
  await expect(steps.nth(10)).toContainText("283 of 283 detections match the chain");
  expect(chainCode).toHaveLength(1);
  await toStep(page, 11);
  await expect(steps.nth(11).getByRole("link", { name: "See its complaint pack" })).toHaveAttribute("href", EXAMPLE_PACK);
  // The landing needs nothing from the API, so it shows while the API wakes from zero.
  expect(asked).toEqual([]);

  await page.getByRole("banner").getByRole("link", { name: "Open the tool" }).click();
  await expect(page).toHaveURL(`${WEB_URL}/?tool`);
  await page.getByLabel("From").fill("2026-10-11");
  await page.getByLabel("To").fill("2026-10-14");
  await expect(page.getByText(LIST_NOTE)).toBeVisible();

  await page.getByRole("link", { name: "About Fire Watch" }).click();
  await expect(page).toHaveURL(`${WEB_URL}/`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADLINE);
});

test("on a phone the flat map shows without the 3D code, and every control is at least 44 px to tap", async ({
  browser,
}) => {
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
  const page = await phone.newPage();
  await fakeMaps(page);
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  const tooSmall = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("a[href], button")]
        .filter((el) => el.checkVisibility())
        .filter((el) => {
          el.scrollIntoView({ block: "center" });
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          const hits = (dy: number) => document.elementFromPoint(x, y + dy)?.closest("a[href], button") === el;
          return r.width < 44 || !hits(-21) || !hits(21);
        })
        .map((el) => el.textContent?.trim()),
    );

  await page.goto(`${WEB_URL}/`);
  const map = page.getByRole("img", { name: /^World map of the 62,489 NOAA-20 fire detections/ });
  await expect(map).toBeVisible();
  await expect(page.locator(".globe")).toHaveAttribute("aria-busy", "false");
  expect(await tooSmall()).toEqual([]);

  await page.getByRole("button", { name: "Go to the example fire" }).click();
  await expect(page.locator(".landing-globe").getByRole("link", { name: "See its complaint pack" })).toBeVisible();
  expect(await tooSmall()).toEqual([]);
  expect(scripts.filter((url) => /globeScene/.test(url))).toEqual([]);
  await phone.close();
});
