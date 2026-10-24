import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { API_URL, WEB_URL } from "./env";

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const CASE_COPY = fileURLToPath(new URL("../public/case/pack-0332.json", import.meta.url));
const EXAMPLE_PACK =
  "/?pack=ID-WOOD-CONCESSION-0332&fire=0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7&as_of=1792227600";

const WEAK = "First seen outside, 3.1 km from the edge, as one detection";
const FIRM = "First seen inside, 3.4 km from the edge";
const GAP_NOTE = "The satellite didn't see this fire again for 36 hours, so that detection may be a separate fire.";
const MISSED =
  "The satellite can miss fire under cloud, heavy smoke or thick tree canopy, and peat that smoulders with too little heat to show.";
const MISSED_NOTE = `${MISSED} This fire may have burned unseen before it was first seen, inside or outside the concession.`;

// Puts a step of the real case across the reading line, 60% down the screen.
async function toStep(page: Page, step: number) {
  await page.evaluate((n) => {
    const el = document.querySelector(`[data-step="${n}"]`)!;
    scrollTo(0, scrollY + el.getBoundingClientRect().top - innerHeight * 0.45);
  }, step);
  await expect(page.locator(`[data-step="${step}"]`)).toHaveAttribute("aria-current", "step");
}

/** The 0332 fire's CO₂, peat fuel's 95% interval first and IPCC's average under it. */
async function readCo2(figures: Locator) {
  const co2 = figures.locator('dt:text-is("CO₂ released") + dd');
  await expect(co2.locator(".damage-value")).toHaveText("37,000 to 110,000 t");
  await expect(co2.locator(".sub")).toHaveText(
    "About 76,000 t at IPCC's average. 11,000 to 33,000 t of it inside the concession.",
  );
}

test.beforeEach(async ({ context }) => {
  await context.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
});

// fire-record.csv holds two fires near 0540 first seen on 13 Oct 06:37: one a single detection outside, seen
// again 36 hours later, and one inside, seen again 12.7 hours later. fire-origin.csv holds the 0332 fire.
test("an investigator reads a weak first sighting, what the satellite can miss and the CO₂ range, and a judge reads them on the landing and the example pack", async ({
  page,
}) => {
  await page.goto("/?tool");
  await page.getByLabel("From").fill("2026-10-11");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0540/ }).click();

  const fires = page.getByRole("row").filter({ hasText: "13 Oct 06:37" });
  await fires.filter({ hasText: "Outside, 3.1 km" }).getByRole("button").click();
  const weak = page.getByRole("article", { name: WEAK, exact: true });
  await expect(weak.getByRole("heading", { level: 2 })).toHaveText(WEAK);
  await expect(weak.getByText(GAP_NOTE, { exact: true })).toBeVisible();
  await expect(weak.locator(".fire-notes p").last()).toHaveText(MISSED_NOTE);

  await page.getByRole("button", { name: "Fires in ID-WOOD-CONCESSION-0540" }).click();
  await fires.filter({ hasText: "Inside, 3.4 km" }).getByRole("button").click();
  const firm = page.getByRole("article", { name: FIRM, exact: true });
  await expect(firm.getByRole("heading", { level: 2 })).toHaveText(FIRM);
  await expect(firm.locator(".fire-notes p").last()).toHaveText(MISSED_NOTE);
  await expect(firm.getByText(/didn't see this fire again/)).toHaveCount(0);

  await page.getByRole("button", { name: "Fires in ID-WOOD-CONCESSION-0540" }).click();
  await page.getByRole("button", { name: "All concessions" }).click();
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0332/ }).click();
  await page.getByRole("row").filter({ hasText: "13 Oct 17:37" }).getByRole("button").click();
  await readCo2(page.getByRole("region", { name: "Damage estimate" }).locator("dl").first());

  const [pack] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("link", { name: "Make complaint pack" }).click(),
  ]);
  await readCo2(pack.getByRole("region", { name: "Damage estimate" }).locator("dl").first());
  await expect(pack.locator(".pack-caveats p").last()).toHaveText(MISSED_NOTE);
  await pack.close();

  await page.goto("/");
  const steps = page.getByRole("region", { name: "A real case" }).getByRole("listitem");
  // The steps show once the committed pack loads: the fire, the claim, 8 passes, the seals and the pack.
  await expect(steps).toHaveCount(12);
  await toStep(page, 2);
  await expect(steps.nth(2)).toContainText(
    `The satellite didn't see the fire again for 25 hours, so that detection may be a separate fire. ${MISSED}`,
  );

  // The e2e's API has no example fire, so the pack's API call is answered from the committed copy (D137).
  await page.route(`${API_URL}/api/concessions/ID-WOOD-CONCESSION-0332/fires/**`, (route) =>
    route.fulfill({ path: CASE_COPY, contentType: "application/json" }),
  );
  await toStep(page, 11);
  await steps.nth(11).getByRole("link", { name: "See its complaint pack" }).click();
  await expect(page).toHaveURL(`${WEB_URL}${EXAMPLE_PACK}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "First seen outside, 3.1 km from the edge, as one detection",
  );
});
