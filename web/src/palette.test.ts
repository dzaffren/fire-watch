/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const CSS = readFileSync(resolve("../docs/design/design-system/tokens/colors.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// The tokens of the rule whose selector is `selector`, by name.
function block(selector: string): Record<string, string> {
  for (const [, head, body] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (head.replace(/\s+/g, " ").trim() !== selector) continue;
    return Object.fromEntries([...body.matchAll(/(--fw-[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
  }
  throw new Error(`colors.css has no rule for ${selector}`);
}

const LIGHT = block(':root, [data-theme="light"]');
const DARK = block('[data-theme="dark"]');
const SYSTEM_DARK = block(':root:not([data-theme="light"])');
const PRINT = block(':root, :root:not([data-theme="light"]), [data-theme]');

type Rgba = [number, number, number, number];

function rgba(hex: string): Rgba {
  const [r, g, b, a = 255] = hex.slice(1).match(/../g)!.map((h) => parseInt(h, 16));
  return [r, g, b, a / 255];
}

// A see-through colour laid over an opaque one, as the browser paints it.
function over([r, g, b, a]: Rgba, [R, G, B]: Rgba): Rgba {
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
}

function luminance([r, g, b]: Rgba): number {
  const [R, G, B] = [r, g, b].map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const GROUNDS = ["--fw-bg", "--fw-surface", "--fw-band-moss", "--fw-band-peat", "--fw-hover-fill", "--fw-table-head"];
const TEXT = ["--fw-ink", "--fw-muted", "--fw-accent", "--fw-ok", "--fw-bad"];

it("every text, control and fire pair passes AA in light and dark", () => {
  const short: string[] = [];
  for (const [theme, t] of Object.entries({ light: LIGHT, dark: DARK })) {
    const check = (fg: string, bg: string, floor: number, on: Rgba = rgba(t[bg])) => {
      const ratio = contrast(rgba(t[fg]), on);
      if (ratio < floor) short.push(`${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}, under ${floor}`);
    };
    for (const bg of GROUNDS) {
      for (const fg of TEXT) check(fg, bg, 4.5);
      check("--fw-control", bg, 3);
    }
    check("--fw-fire", "--fw-map", 3);
    check("--fw-fire", "--fw-water", 3);
    check("--fw-fire", "--fw-concession", 3, over(rgba(t["--fw-concession"]), rgba(t["--fw-map"])));
  }
  expect(short).toEqual([]);
});

it("the system's dark and the chosen dark theme hold the same tokens", () => {
  expect(SYSTEM_DARK).toEqual(DARK);
  expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
});

it("print whitens only the grounds, so the pack's switch to light sets the ink", () => {
  expect(PRINT).toEqual({
    "--fw-bg": "#ffffff",
    "--fw-surface": "#ffffff",
    "--fw-table-head": "#ffffff",
    "--fw-hover-fill": "#ffffff",
    "--fw-band-moss": "#ffffff",
    "--fw-band-peat": "#ffffff",
  });
});
