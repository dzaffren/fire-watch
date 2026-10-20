import { fileURLToPath } from "node:url";
import { expect, test, type Locator } from "@playwright/test";

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const READING = "First seen outside, 950 m from the edge";

test.beforeEach(async ({ context }) => {
  await context.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );
});

/** The figures of scenario 1: 209.8 ha, 59.2 of it inside, all on peat. */
async function readFigures(damage: Locator) {
  await expect(damage.getByText("About 210 ha", { exact: true })).toBeVisible();
  await expect(damage.getByText("59 ha of it inside the concession.", { exact: true })).toBeVisible();
  await expect(damage.getByText("About 120,000 t", { exact: true })).toBeVisible();
}

// fire-origin.csv holds the 19 detections of the ID-WOOD-CONCESSION-0332 fire, and global-setup
// loads the peat cut around them.
test("reads the 0332 fire's damage in the fire view and the same in its pack", async ({ page }) => {
  await page.goto("/?tool");
  await page.getByLabel("From").fill("2026-10-12");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0332/ }).click();
  await page.getByRole("row").filter({ hasText: "13 Oct 17:37" }).getByRole("button").click();

  const damage = page.getByRole("region", { name: "Damage estimate" });
  await readFigures(damage);
  await damage.getByText("How this is worked out").click();
  await expect(damage.getByRole("cell", { name: "59.21 ha" })).toBeVisible();

  const [pack] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("link", { name: "Make complaint pack" }).click(),
  ]);
  await expect(pack.getByRole("heading", { level: 1 })).toHaveText(READING);

  const packDamage = pack.getByRole("region", { name: "Damage estimate" });
  await readFigures(packDamage);
  await expect(packDamage.getByRole("cell", { name: "59.21 ha" })).toBeVisible();
});

test("every damage control is at least 44 px to tap on a touch screen", async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
  const page = await phone.newPage();
  await page.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );

  await page.goto("/?tool");
  await page.getByLabel("From").fill("2026-10-12");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0332/ }).click();
  await page.getByRole("row").filter({ hasText: "13 Oct 17:37" }).getByRole("button").click();
  const damage = page.getByRole("region", { name: "Damage estimate" });
  await damage.getByText("How this is worked out").click();
  await expect(damage.getByRole("link", { name: /^The peat map's tiles/ })).toBeVisible();

  const tooSmall = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".damage a[href], .damage summary")]
      .filter((el) => {
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const hits = (dy: number) => document.elementFromPoint(x, y + dy)?.closest("a[href], button, summary") === el;
        return r.width < 44 || !hits(-21) || !hits(21);
      })
      .map((el) => el.textContent?.trim()),
  );
  expect(tooSmall).toEqual([]);
  await phone.close();
});
