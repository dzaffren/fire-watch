import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { API_URL, WEB_URL } from "./env";

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const CASE_COPY = fileURLToPath(new URL("../public/case/pack-0332.json", import.meta.url));
const EXAMPLE_PACK =
  "/?pack=ID-WOOD-CONCESSION-0332&fire=0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7&as_of=1792227600";
const EXAMPLE_FIRES = `${API_URL}/api/concessions/ID-WOOD-CONCESSION-0332/fires/**`;

const LEDE =
  "It reads NOAA's NOAA-20 satellite through NASA's FIRMS service. It shows where its records first place a fire and how it spread";
const FIRST_STEP =
  "From 12 Oct to 17 Oct 2026, Fire Watch's records hold this fire on 8 passes of the NOAA-20 satellite, 283 detections in all";
const RECORDS_HOLD = "Fire Watch's records begin 1 hour before this detection and hold only the NOAA-20 satellite's detections.";
const BEFORE_RECORDS =
  "In NASA's FIRMS archive, NOAA-20 saw fire under 1 km from here on 11 Oct, before the records begin, also outside the concession.";
const SECOND_BEFORE =
  "In NASA's FIRMS archive, other satellites saw fire on that ground on 10 Oct, also on both sides of the edge.";
const PACK_RECORDS_BEGIN =
  "Fire Watch's records begin 1 hour before this fire was first seen, so it may have been burning earlier. NASA's archive may hold detections from before then. In NASA's FIRMS archive, NOAA-20 saw fire under 1 km from this fire's first detection on 11 Oct, also outside the concession.";
const FIRST_PASS =
  "The first pass is the earliest NOAA-20 pass in Fire Watch's records that saw the fire. Other satellites, or NOAA-20 before the records begin, may have seen it earlier.";
const POSITION =
  "NOAA-20 places almost every pixel within 400 m of where it belongs, and most within 200 m (Blonski and others, 2023, doi 10.1117/1.JRS.17.034506). A fire can also sit anywhere in its 375 m pixel. The 375 m margin allows for neither.";
const CHECKS =
  "Each detection is sealed: your browser checks each record Fire Watch sends against the chain, and a record matches a row of NASA FIRMS's public archive by its time and place.";

// Puts a step of the real case across the reading line, 60% down the screen.
async function toStep(page: Page, step: number) {
  await page.evaluate((n) => {
    const el = document.querySelector(`[data-step="${n}"]`)!;
    scrollTo(0, scrollY + el.getBoundingClientRect().top - innerHeight * 0.45);
  }, step);
  await expect(page.locator(`[data-step="${step}"]`)).toHaveAttribute("aria-current", "step");
}

/** The method's first-pass, position and chain lines, and neither old claim. */
async function readMethod(method: Locator) {
  for (const line of [FIRST_PASS, POSITION, CHECKS]) await expect(method).toContainText(line);
  await expect(method).not.toContainText("earliest satellite pass");
  await expect(method).not.toContainText("anyone can redo");
}

test.beforeEach(async ({ context }) => {
  await context.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
});

// The landing and the example pack read the committed copy of 0332's fire, cut at 17 Oct 2026 09:00 UTC (D137).
// fire-origin.csv holds the e2e's own 0332 fire, first seen on 13 Oct 17:37 (D118).
test("a judge reads what Fire Watch's records hold and what the chain checks, on the landing and the example pack; an investigator reads the method and the 2023 count in the tool", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".landing-lede")).toContainText(LEDE);

  const steps = page.getByRole("region", { name: "A real case" }).getByRole("listitem");
  // The steps show once the committed pack loads: the fire, the claim, 8 passes, the seals and the pack.
  await expect(steps).toHaveCount(12);
  await expect(steps.nth(0)).toContainText(FIRST_STEP);
  await toStep(page, 2);
  for (const line of [RECORDS_HOLD, BEFORE_RECORDS]) await expect(steps.nth(2)).toContainText(line);
  await toStep(page, 3);
  await expect(steps.nth(3)).toContainText(SECOND_BEFORE);

  await page.route(EXAMPLE_FIRES, (route) => route.fulfill({ path: CASE_COPY, contentType: "application/json" }));
  await toStep(page, 11);
  await steps.nth(11).getByRole("link", { name: "See its complaint pack" }).click();
  await expect(page).toHaveURL(`${WEB_URL}${EXAMPLE_PACK}`);
  await expect(page.locator(".pack-caveats")).toContainText(PACK_RECORDS_BEGIN);
  await readMethod(page.getByRole("region", { name: "Basis" }));
  await page.unroute(EXAMPLE_FIRES);

  await page.goto("/?tool");
  await page.getByLabel("From").fill("2026-10-12");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0332/ }).click();
  await page.getByRole("row").filter({ hasText: "13 Oct 17:37" }).getByRole("button").click();
  const reading = page.getByRole("article", { name: "First seen outside, 950 m from the edge" });
  const method = reading.locator("details", { hasText: "A detection joins a fire" });
  await method.locator("summary").click();
  await readMethod(method);

  const panel = page.getByRole("region", { name: "Forecast to be seen inside by about 15 Oct 05:20 UTC" });
  await expect(panel.getByRole("table", { name: "How this rule did on 2023, replayed" }).locator("thead th")).toHaveText([
    "In 2023",
    "Warned of, out of 135 forecasts that came in",
    "Warnings that didn't come in",
  ]);
});
