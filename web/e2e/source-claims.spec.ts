import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { API_URL, WEB_URL } from "./env";

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const CASE_COPY = fileURLToPath(new URL("../public/case/pack-0332.json", import.meta.url));
const EXAMPLE_PACK =
  "/?pack=ID-WOOD-CONCESSION-0332&fire=0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7&as_of=1792227600";
const EXAMPLE_FIRES = `${API_URL}/api/concessions/ID-WOOD-CONCESSION-0332/fires/**`;

const FIRST_SHOWN = "Fire Watch's records first show it on 12 Oct 05:16 UTC as one detection";
const RECORDS_BEGIN = "Fire Watch's records begin 1 hour before this detection and read only NASA's NOAA-20 satellite.";
const BEFORE_RECORDS =
  "In NASA's archive, NOAA-20 saw fire under 1 km from here on 11 Oct, before recording began, also outside the concession.";
const SECOND_BEFORE = "In NASA's archive, other satellites saw fire on that ground on 10 Oct, also on both sides of the edge.";
const SHARES =
  "At the shares Fire Watch measured on NASA's 2023 burned-area map, in large patches: 62% of peat, 42% of other ground.";
const DRAINED =
  "Fire Watch treats all peat as drained, since WRI's map doesn't say which is, and IPCC gives no figure for a wildfire on undrained tropical peat.";

// Puts a step of the real case across the reading line, 60% down the screen.
async function toStep(page: Page, step: number) {
  await page.evaluate((n) => {
    const el = document.querySelector(`[data-step="${n}"]`)!;
    scrollTo(0, scrollY + el.getBoundingClientRect().top - innerHeight * 0.45);
  }, step);
  await expect(page.locator(`[data-step="${step}"]`)).toHaveAttribute("aria-current", "step");
}

/** "Likely burned" credits its shares to Fire Watch's own measure, and the method says all peat is treated as drained. */
async function readShares(damage: Locator) {
  await expect(damage.locator("dl").first().locator('dt:text-is("Likely burned") + dd .sub')).toContainText(SHARES);
  await expect(damage.getByText(DRAINED, { exact: false })).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
});

// The landing and the example pack read the committed copy of 0332's fire, cut at 17 Oct 2026 09:00 UTC (D137).
// fire-origin.csv holds the e2e's own 0332 fire, first seen on 13 Oct 17:37 and with no join (D118).
test("a judge reads which satellite and when the records begin, and the joined fire's inside time; an investigator reads whose shares the damage uses", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".landing-lede")).toContainText("It shows where NASA's NOAA-20 satellite first saw a fire");
  await expect(page.locator(".landing-globe figcaption p")).toHaveText(/^Each dot is a square about 1 km across/);

  const steps = page.getByRole("region", { name: "A real case" }).getByRole("listitem");
  // The steps show once the committed pack loads: the fire, the claim, 8 passes, the seals and the pack.
  await expect(steps).toHaveCount(12);
  await toStep(page, 2);
  await expect(steps.nth(2).getByRole("heading")).toHaveText("Where it was first seen");
  for (const line of [FIRST_SHOWN, RECORDS_BEGIN, BEFORE_RECORDS]) await expect(steps.nth(2)).toContainText(line);
  await toStep(page, 3);
  await expect(page.getByText("Pass 2 of 8 · 13 Oct 06:37 UTC")).toBeVisible();
  await expect(steps.nth(3)).toContainText(SECOND_BEFORE);

  await page.route(EXAMPLE_FIRES, (route) => route.fulfill({ path: CASE_COPY, contentType: "application/json" }));
  await toStep(page, 11);
  await steps.nth(11).getByRole("link", { name: "See its complaint pack" }).click();
  await expect(page).toHaveURL(`${WEB_URL}${EXAMPLE_PACK}`);
  const dates = page.getByRole("region", { name: "Dates" });
  await expect(dates.locator("dt:has-text('Seen inside from') + dd")).toHaveText(
    "2026-10-13 06:37 UTC, by the fire joined to this one on 14 Oct 17:20 UTC",
  );
  await page.unroute(EXAMPLE_FIRES);

  await page.goto("/?tool");
  await page.getByLabel("From").fill("2026-10-12");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0332/ }).click();
  await page.getByRole("row").filter({ hasText: "13 Oct 17:37" }).getByRole("button").click();
  const reading = page.getByRole("article", { name: "First seen outside, 950 m from the edge" });
  await expect(reading.locator("dt:has-text('Seen inside from') + dd")).toHaveText("2026-10-15 18:43 UTC");

  const damage = page.getByRole("region", { name: "Damage estimate" });
  await damage.getByText("How this is worked out").click();
  await readShares(damage);

  const [pack] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("link", { name: "Make complaint pack" }).click(),
  ]);
  await readShares(pack.getByRole("region", { name: "Damage estimate" }));
  await pack.close();
});
