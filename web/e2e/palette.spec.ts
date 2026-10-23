import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const FAKE_GOOGLE_MAPS = fileURLToPath(new URL("./fake-google-maps.js", import.meta.url));
const READING = "First seen outside, 950 m from the edge";

// The land and water colours the map was last styled with, as Google would paint them.
function mapColours(page: Page) {
  return page.evaluate(() => {
    type Style = { featureType?: string; elementType?: string; stylers?: { color?: string }[] };
    const styles = (window as unknown as { __fakeMap: { styles: Style[] } }).__fakeMap.styles;
    const colour = (featureType?: string) =>
      styles.find((s) => s.featureType === featureType && s.elementType === "geometry")?.stylers?.[0].color;
    return { land: colour(), water: colour("water") };
  });
}

test.use({ viewport: { width: 1440, height: 900 } });

test("a judge meets the palette on the landing, the tool's map and the printed pack", async ({ page, context }) => {
  await context.route("https://maps.googleapis.com/**", (route) =>
    route.fulfill({ path: FAKE_GOOGLE_MAPS, contentType: "text/javascript" }),
  );

  // The hero on moss and the real case on peat, painted past the reading column to the screen's edges.
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const hero = page.locator(".landing-hero");
  const realCase = page.getByRole("region", { name: "A real case" });
  await expect(hero).toHaveCSS("border-image-source", /rgb\(224, 236, 206\)/);
  await expect(realCase).toHaveCSS("border-image-source", /rgb\(233, 224, 209\)/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(hero).toHaveCSS("border-image-source", /rgb\(29, 37, 20\)/);
  await expect(realCase).toHaveCSS("border-image-source", /rgb\(37, 30, 21\)/);

  // The tool: moss ground, pale panels, and a map of moss land and slate water.
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?tool");
  await page.getByLabel("From").fill("2026-10-12");
  await page.getByLabel("To").fill("2026-10-15");
  await page.getByRole("button", { name: /^ID-WOOD-CONCESSION-0332/ }).click();
  await page.getByRole("row").filter({ hasText: "13 Oct 17:37" }).getByRole("button").click();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(238, 243, 228)");
  await expect(page.getByRole("article", { name: READING })).toHaveCSS("background-color", "rgb(250, 252, 246)");
  await expect.poll(() => mapColours(page)).toEqual({ land: "#d9e8c4", water: "#bdd6e0" });

  // The pack, open in dark, prints on a white page with dark ink and its map in the light colours.
  const [pack] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "Make complaint pack" }).click(),
  ]);
  await expect(pack.getByRole("heading", { level: 1 })).toHaveText(READING);
  await pack.emulateMedia({ colorScheme: "dark" });
  await expect(pack.locator("body")).toHaveCSS("background-color", "rgb(18, 22, 16)");
  await expect.poll(() => mapColours(pack)).toEqual({ land: "#1e2613", water: "#112028" });

  await pack.evaluate(() => dispatchEvent(new Event("beforeprint")));
  await pack.emulateMedia({ media: "print" });
  await expect(pack.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(pack.getByRole("heading", { level: 1 })).toHaveCSS("color", "rgb(31, 36, 33)");
  // The seal check and the left-out check.
  await expect(pack.locator(".pack-check")).toHaveCount(2);
  for (const panel of await pack.locator(".pack-check").all()) {
    await expect(panel).toHaveCSS("background-color", "rgb(255, 255, 255)");
  }
  await expect.poll(() => mapColours(pack)).toEqual({ land: "#d9e8c4", water: "#bdd6e0" });
  await expect(pack.locator(".legend-dot").first()).toHaveCSS("print-color-adjust", "exact");
});
