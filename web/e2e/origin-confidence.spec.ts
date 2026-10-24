import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const WEAK = "First seen outside, 3.1 km from the edge";
const WEAK_NOTE = "The satellite didn't see this fire again for 36 hours, so that detection may be a separate fire.";

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

// fire-record.csv holds two fires near 0540 first seen on 13 Oct 06:37: one a single detection outside, seen
// again 36 hours later, and one inside, seen again 12.7 hours later. The e2e's records hold no joined fire, so
// the join is read from the landing's committed copy of 0332's pack (D118).
test("an investigator reads a weak first sighting and its pack, and a judge reads the example fire's join", async ({
  page,
}) => {
  await page.goto("/?tool");
  await page.getByLabel("From").fill("2026-10-11");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0540/ }).click();

  const fires = page.getByRole("row").filter({ hasText: "13 Oct 06:37" });
  await fires.filter({ hasText: "Inside, 3.4 km" }).getByRole("button").click();
  const firm = page.getByRole("article", { name: "First seen inside, 3.4 km from the edge" });
  await expect(firm).toBeVisible();
  await expect(firm.getByText(/^The satellite didn't see this fire again/)).toHaveCount(0);
  await firm.getByText("How this is worked out").click();
  await expect(
    firm.getByText(/Straight below the satellite, NOAA-20 places almost every detection within 400 m of the fire/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Fires in ID-WOOD-CONCESSION-0540" }).click();
  await fires.filter({ hasText: "Outside, 3.1 km" }).getByRole("button").click();
  const weak = page.getByRole("article", { name: WEAK });
  await expect(weak.getByText(WEAK_NOTE)).toBeVisible();

  const [pack] = await Promise.all([
    page.context().waitForEvent("page"),
    weak.getByRole("link", { name: "Make complaint pack" }).click(),
  ]);
  await expect(pack.getByRole("heading", { level: 1 })).toHaveText(`${WEAK}, as one detection`);
  await expect(pack.locator(".pack-head").getByText(WEAK_NOTE)).toBeVisible();
  await expect(pack.getByRole("region", { name: "Basis" }).getByRole("link", { name: "Version 2, in full" })).toBeVisible();
  await pack.close();

  await page.goto("/");
  await page.getByRole("button", { name: "Go to the example fire" }).click();
  await expect(
    page.getByText(
      "The satellite first saw it on 12 Oct as one detection, 3,100 m outside the concession. On 14 Oct it joined a" +
        " second fire, first seen the day before on both sides of the edge.",
      { exact: false },
    ),
  ).toBeVisible();

  const steps = page.getByRole("region", { name: "A real case" }).getByRole("listitem");
  await toStep(page, 2);
  await expect(steps.nth(2)).toContainText(
    "It didn't see the fire again for 25 hours, so that detection may be a separate fire.",
  );
  await toStep(page, 3);
  await expect(steps.nth(3)).toContainText(
    "These include another fire, first seen on this pass more than 1 km from the first, on both sides of the edge.",
  );
  await toStep(page, 6);
  await expect(steps.nth(6)).toContainText(
    "14 Oct 17:20 UTC · 66 detections, 43 inside the concession. On this pass the fires came within 1 km of each" +
      " other, so Fire Watch counts them as one.",
  );
  await expect(steps.filter({ hasText: "On this point the record agrees with the company" })).toHaveCount(0);
  await expect(steps.filter({ hasText: "The fire has crossed the edge" })).toHaveCount(0);
});
