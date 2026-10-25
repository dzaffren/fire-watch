import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { API_URL, WEB_URL } from "./env";

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const CASE_COPY = fileURLToPath(new URL("../public/case/pack-0332.json", import.meta.url));
const EXAMPLE_PACK =
  "/?pack=ID-WOOD-CONCESSION-0332&fire=0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7&as_of=1792227600";
const EXAMPLE_FIRES = `${API_URL}/api/concessions/ID-WOOD-CONCESSION-0332/fires/**`;

const HEADLINE =
  "When a company says a fire spread in from outside its land, show where the record first places it, and how it spread.";
const OPEN_A_FIRE =
  "See where its records first place it against the concession's edge, and step through how it spread, pass by pass.";
const SEND_A_PACK = "The buyer opens it in their own browser, which checks each record Fire Watch sends against the blockchain.";
const PACK_STEP = "The buyer's browser checks each of them, the same way yours does on this page.";
const GAP = (art: string) =>
  `NOAA-20 didn't see ${art} fire again for 25 hours. Fire Watch reads only NOAA-20, so it can't tell whether that detection belongs to ${art} fire.`;
// The e2e seals the copy's records on anvil, so the delay is the e2e's, not the live hours.
const LAG =
  /^Fire Watch sealed them (\S+ \S+( \S+ \S+)?)( to \S+ \S+( \S+ \S+)?)? after the satellite saw them\. A seal shows a record is unchanged since it was sealed, not since it was seen\.$/;
const RULE_URL = "https://github.com/dzaffren/fire-watch/blob/71ebcf6/api/src/firewatch/fires.py";

// Puts a step of the real case across the reading line, 60% down the screen.
async function toStep(page: Page, step: number) {
  await page.evaluate((n) => {
    const el = document.querySelector(`[data-step="${n}"]`)!;
    scrollTo(0, scrollY + el.getBoundingClientRect().top - innerHeight * 0.45);
  }, step);
  await expect(page.locator(`[data-step="${step}"]`)).toHaveAttribute("aria-current", "step");
}

test.beforeEach(async ({ context }) => {
  await context.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
});

// The landing and the example pack read the committed copy of 0332's fire, cut at 17 Oct 2026 09:00 UTC (D137).
test("a judge reads the record's first place, the one satellite, each record sent and how late it was sealed, then the pack's pinned rule", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADLINE);
  const use = page.getByRole("region", { name: "How you use it" }).getByRole("listitem");
  await expect(use.nth(2)).toContainText(OPEN_A_FIRE);
  await expect(use.nth(3)).toContainText(SEND_A_PACK);
  await expect(page.getByText(/satellite first saw/)).toHaveCount(0);

  const steps = page.getByRole("region", { name: "A real case" }).getByRole("listitem");
  await expect(steps).toHaveCount(12);
  await toStep(page, 2);
  await expect(steps.nth(2)).toContainText(GAP("the"));
  await toStep(page, 10);
  await expect(steps.nth(10).getByRole("heading", { name: "Each record is sealed" })).toBeVisible();
  await expect(steps.nth(10)).toContainText("283 of 283 detections match the chain");
  await expect(steps.nth(10)).toContainText("Passes 1 to 6 were sealed on 16 Oct");
  await toStep(page, 11);
  await expect(steps.nth(11)).toContainText(PACK_STEP);
  await expect(page.getByText(/every record/i)).toHaveCount(0);

  await page.route(EXAMPLE_FIRES, (route) => route.fulfill({ path: CASE_COPY, contentType: "application/json" }));
  await steps.nth(11).getByRole("link", { name: "See its complaint pack" }).click();
  await expect(page).toHaveURL(`${WEB_URL}${EXAMPLE_PACK}`);
  const check = page.getByRole("region", { name: "283 of 283 detections match the chain" });
  await expect(check).toBeVisible();
  await expect(check.getByText(LAG)).toBeVisible();
  await expect(page.getByText(GAP("this"))).toBeVisible();
  await expect(page.getByRole("region", { name: "Basis" }).getByRole("link", { name: "Version 2, in full" })).toHaveAttribute(
    "href",
    RULE_URL,
  );
  await page.unroute(EXAMPLE_FIRES);
});
