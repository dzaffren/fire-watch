/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { loadGlobe } from "./globe";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("reads the committed files: 41,380 fires, 128 land rings, and 0332's box and two edge rings", async () => {
  vi.stubGlobal("fetch", async (path: string) => new Response(readFileSync(resolve("public", path.slice(1)))));

  const data = await loadGlobe();

  expect(data.fires.length / 2).toBe(41380);
  expect(data.land).toHaveLength(128);
  expect(data.near.box).toEqual([112.08, -3.59, 113.54, -2.59]);
  expect(data.near.fires).toHaveLength(1228);
  expect(data.near.concession).toHaveLength(2);
  // Every fire is on the earth, and the near ones are inside their box.
  for (let i = 0; i < data.fires.length; i += 2) {
    expect(Math.abs(data.fires[i])).toBeLessThanOrEqual(180);
    expect(Math.abs(data.fires[i + 1])).toBeLessThanOrEqual(90);
  }
  const [west, south, east, north] = data.near.box;
  expect(data.near.fires.every(([x, y]) => x >= west && x <= east && y >= south && y <= north)).toBe(true);
});
