import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { API_URL } from "./env";

const CASE_COPY = fileURLToPath(new URL("../public/case/pack-0332.json", import.meta.url));
// The landing's example pack, answered from the committed copy as in landing-page.spec.ts (D137).
const EXAMPLE_PACK =
  "/?pack=ID-WOOD-CONCESSION-0332&fire=0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7&as_of=1792227600";
// --fw-ink and --fw-fire, light and dark.
const LIGHT = { ring: "rgb(31, 36, 33)", square: "rgb(194, 65, 12)" };
const DARK = { ring: "rgb(232, 233, 228)", square: "rgb(255, 138, 76)" };

// The mark beside the name in the page's header, read once by a screen reader, in the given colours.
async function expectMark(page: Page, colours: typeof LIGHT) {
  const banner = page.getByRole("banner");
  await expect(banner.getByText("Fire Watch", { exact: true })).toHaveCount(1);
  const mark = banner.locator(".app-name > svg");
  await expect(mark).toHaveAttribute("aria-hidden", "true");
  await expect(mark).toHaveCSS("width", "24px");
  await expect(mark.locator("path").first()).toHaveCSS("fill", colours.ring);
  await expect(mark.locator("path").last()).toHaveCSS("fill", colours.square);
}

test.use({ viewport: { width: 1440, height: 900 } });

test("a judge sees the Clasp mark in the tab, on the landing and the tool in both themes, and on the printed pack", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expectMark(page, LIGHT);

  // The tab's icons, each served from the site root.
  const icons = {
    'link[rel="icon"][type="image/svg+xml"]': ["/favicon.svg", "image/svg+xml"],
    'link[rel="icon"][sizes="48x48"]': ["/favicon.ico", "image/"],
    'link[rel="apple-touch-icon"]': ["/apple-touch-icon.png", "image/png"],
  };
  for (const [selector, [href, type]] of Object.entries(icons)) {
    await expect(page.locator(selector)).toHaveAttribute("href", href);
    const answer = await page.request.get(href);
    expect(answer.status()).toBe(200);
    expect(answer.headers()["content-type"]).toContain(type);
  }

  await page.emulateMedia({ colorScheme: "dark" });
  await expectMark(page, DARK);

  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("banner").getByRole("link", { name: "Open the tool" }).click();
  await expect(page.getByLabel("From")).toBeVisible();
  await expectMark(page, LIGHT);

  // The pack, open in dark, prints the mark in the light colours.
  await page.route(`${API_URL}/api/concessions/ID-WOOD-CONCESSION-0332/fires/**`, (route) =>
    route.fulfill({ path: CASE_COPY, contentType: "application/json" }),
  );
  await page.goto(EXAMPLE_PACK);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectMark(page, DARK);
  await page.evaluate(() => dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
  await expectMark(page, LIGHT);
});
