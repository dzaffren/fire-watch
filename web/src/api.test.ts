import { afterEach, describe, expect, it, vi } from "vitest";
import { latestHotspot } from "./api";

const record = {
  record_id: `0x${"ab".repeat(32)}`,
  source: "VIIRS_NOAA20_NRT",
  lat_e5: 43120,
  lon_e5: 10121540,
  acquired_at: "2026-10-12T06:18:00Z",
  acquired_unix: 1791785880,
  frp_e2: 1420,
  confidence: "n",
  tx_hash: null,
  sealed_at: null,
};

function answer(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("latestHotspot", () => {
  it("returns the record on 200", async () => {
    answer(200, record);
    await expect(latestHotspot()).resolves.toEqual(record);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/hotspots\/latest$/));
  });

  it("returns null when no hotspot is recorded yet", async () => {
    answer(404, { detail: "No hotspot recorded yet" });
    await expect(latestHotspot()).resolves.toBeNull();
  });

  it("throws on a server error", async () => {
    answer(503, { detail: "unavailable" });
    await expect(latestHotspot()).rejects.toThrow();
  });

  it("throws when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(latestHotspot()).rejects.toThrow();
  });
});
