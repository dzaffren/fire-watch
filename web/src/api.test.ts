import { zeroHash } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiSource,
  concession,
  concessions,
  pack,
  packRef,
  packSource,
  runRecords,
  type Forecast,
  type HotspotRecord,
  type PackDetail,
} from "./api";
import { checkReads, runsOf, type Seal } from "./chain";

vi.mock("./chain", () => ({ checkReads: vi.fn(), runsOf: vi.fn() }));

vi.hoisted(() => {
  vi.stubEnv("VITE_CONTRACT_ADDRESS", "0x6a55489a05a9c79d2cd35212878d113557dceb2a");
  vi.stubEnv("VITE_FIRE_RUNS_ADDRESS", "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512");
});

const MAP = "Trase pulpwood concessions 2023–2024, v2026-02-20";
const A_FP = "0x86a47945c682c15fb86471df99c10a3fe1d8fc4ba7f39f87e70b46703b85f051";
const RUN_ROOT = "0x5e11c4070cf64b7a13a2533fbf4ab6c17cfa8065e0446c079070a2cbd0a5a71d" as const;

const hotspotA: HotspotRecord = {
  record_id: `0x${"ab".repeat(32)}`,
  source: "VIIRS_NOAA20_NRT",
  lat_e5: -358175,
  lon_e5: 10571567,
  acquired_at: "2026-10-14T06:18:00Z",
  acquired_unix: 1791958680,
  frp_e2: 520,
  confidence: "n",
  tx_hash: null,
  sealed_at: null,
  fingerprint_version: 2,
  map_version: MAP,
  concessions: [{ id: "ID-WOOD-CONCESSION-0540", inside: true, edge_m: 3099 }],
};

// Scenario 1's forecast, as the shared version 3 vector holds it.
const FORECAST_FP = "0x8d241f36bb7851fa396129c88476e5677cbf694e4c1497724a46332ace86295e";
const forecast: Forecast = {
  record_id: `0x${"cd".repeat(32)}`,
  concession_id: "ID-WOOD-CONCESSION-0332",
  fire_key: "0x48f25fe185b0402018dc6cd3fab3930a760bc0c47bed4d163aa67f678000fbc1",
  after_pass_unix: 1791998400,
  made_unix: 1792008000,
  until_unix: 1792180800,
  inside_by_unix: 1792041600,
  from: { lat_e5: -284220, lon_e5: 11271781 },
  crossing: { lat_e5: -284194, lon_e5: 11271793 },
  rule_version: 1,
  tx_hash: `0x${"12".repeat(32)}`,
  sealed_at: "2026-10-14T20:02:00Z",
  run: null,
  proof: null,
  outcome: "waiting",
  outcome_unix: null,
};

const listing = {
  recording_started: "2026-10-11",
  map_version: MAP,
  concessions: [{ id: "ID-WOOD-CONCESSION-0540", province: "Sumatera Selatan", area_ha: 251385, inside: 14, near: 9 }],
};

function answer(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("concessions", () => {
  it("asks for the dates and returns the list with when recording started", async () => {
    answer(200, listing);
    await expect(concessions("2026-10-11", "2026-10-14")).resolves.toEqual(listing);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/concessions\?from=2026-10-11&to=2026-10-14$/));
  });

  it("throws on a server error", async () => {
    answer(503, { detail: "unavailable" });
    await expect(concessions("2026-10-11", "2026-10-14")).rejects.toThrow();
  });

  it("throws when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(concessions("2026-10-11", "2026-10-14")).rejects.toThrow();
  });
});

describe("concession", () => {
  it("asks for one concession in the dates", async () => {
    const detail = { ...listing.concessions[0], boundary: [[[105.4972, -3.7258]]], hotspots: [hotspotA] };
    answer(200, detail);
    await expect(concession("ID-WOOD-CONCESSION-0540", "2026-10-11", "2026-10-14")).resolves.toEqual(detail);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/concessions\/ID-WOOD-CONCESSION-0540\?from=2026-10-11&to=2026-10-14$/),
    );
  });

  it("throws on an unknown concession", async () => {
    answer(404, { detail: "No such concession" });
    await expect(concession("ID-WOOD-CONCESSION-9999", "2026-10-11", "2026-10-14")).rejects.toThrow();
  });
});

describe("apiSource", () => {
  it("fingerprints a record with version 2", () => {
    expect(apiSource.fingerprint(hotspotA)).toBe(A_FP);
  });

  it("reads the record's seal and its time from the chain", async () => {
    const seal: Seal = { contract: "FireRecords", fingerprint: A_FP, sealedAt: 1791968700 };
    vi.mocked(checkReads).mockClear().mockResolvedValue([seal]);
    await expect(apiSource.sealOf(hotspotA)).resolves.toEqual(seal);
    expect(checkReads).toHaveBeenCalledWith([hotspotA]);
  });

  it("reads a record in a run's root from its run", async () => {
    const inRun = { ...hotspotA, run: 412, proof: [RUN_ROOT] };
    const seal: Seal = { contract: "FireRuns", run: 412, root: RUN_ROOT, sealedAt: 1792828992 };
    vi.mocked(checkReads).mockClear().mockResolvedValue([seal]);
    await expect(apiSource.sealOf(inRun)).resolves.toEqual(seal);
    expect(checkReads).toHaveBeenCalledWith([inRun]);
  });

  it("fingerprints a forecast with version 3", () => {
    expect(apiSource.forecastFingerprint!(forecast)).toBe(FORECAST_FP);
  });

  it("reads every forecast's seal and its time in one chain read", async () => {
    const other = { ...forecast, record_id: `0x${"ef".repeat(32)}` as const, run: 412, proof: [RUN_ROOT] };
    const seals: Seal[] = [
      { contract: "FireRecords", fingerprint: FORECAST_FP, sealedAt: 1792008120 },
      { contract: "FireRuns", run: 412, root: zeroHash, sealedAt: 0 },
    ];
    vi.mocked(checkReads).mockClear().mockResolvedValue(seals);
    await expect(apiSource.forecastSeals!([forecast, other])).resolves.toEqual(seals);
    expect(checkReads).toHaveBeenCalledTimes(1);
    expect(checkReads).toHaveBeenCalledWith([forecast, other]);
  });
});

describe("packRef", () => {
  const KEY = "0x48f25fe185b0402018dc6cd3fab3930a760bc0c47bed4d163aa67f678000fbc1";
  const link = (query: string) => packRef(new URLSearchParams(query));

  it("reads the concession, the fire key and the as-of time from the link", () => {
    expect(link(`pack=ID-WOOD-CONCESSION-0332&fire=${KEY}&as_of=1792227602`)).toEqual({
      id: "ID-WOOD-CONCESSION-0332",
      key: KEY,
      asOf: 1792227602,
    });
  });

  it("refuses a key cut short", () => {
    expect(link(`pack=ID-WOOD-CONCESSION-0332&fire=${KEY.slice(0, 40)}&as_of=1792227602`)).toBeNull();
  });

  it("refuses a link with no as-of time", () => {
    expect(link(`pack=ID-WOOD-CONCESSION-0332&fire=${KEY}`)).toBeNull();
  });
});

describe("pack", () => {
  const ref = { id: "ID-WOOD-CONCESSION-0332", key: `0x${"ab".repeat(32)}` as const, asOf: 1792227602 };

  it("asks for the fire as of the link's time", async () => {
    answer(200, { key: ref.key, as_of_unix: ref.asOf });
    await expect(pack(ref)).resolves.toEqual({ key: ref.key, as_of_unix: ref.asOf });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`/api/concessions/ID-WOOD-CONCESSION-0332/fires/${ref.key}\\?as_of=1792227602$`)),
    );
  });

  it("gives null when the API knows no such fire then", async () => {
    answer(404, { detail: "No such fire" });
    await expect(pack(ref)).resolves.toBeNull();
  });

  it("throws on a server error", async () => {
    answer(503, { detail: "unavailable" });
    await expect(pack(ref)).rejects.toThrow();
  });
});

describe("packSource", () => {
  it("names FireRecords and FireRuns as the build sets them", () => {
    expect(packSource.contracts).toEqual({
      records: "0x6a55489a05a9c79d2cd35212878d113557dceb2a",
      runs: "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
    });
  });

  it("reads every record's seal and its time in one chain read", async () => {
    const hotspotB = { ...hotspotA, record_id: `0x${"cd".repeat(32)}` as const, run: 412, proof: [RUN_ROOT] };
    const seals: Seal[] = [
      { contract: "FireRecords", fingerprint: A_FP, sealedAt: 1791968700 },
      { contract: "FireRuns", run: 412, root: RUN_ROOT, sealedAt: 1792828992 },
    ];
    vi.mocked(checkReads).mockClear().mockResolvedValue(seals);
    await expect(packSource.sealsOf([hotspotA, hotspotB])).resolves.toEqual(seals);
    expect(checkReads).toHaveBeenCalledTimes(1);
    expect(checkReads).toHaveBeenCalledWith([hotspotA, hotspotB]);
  });

  it("checks the pack's runs against the runs on each side of them on FireRuns", async () => {
    answer(200, { hotspots: [], forecasts: [] });
    vi.mocked(runsOf).mockClear().mockImplementation(async (runs) => runs.map(() => ({ root: zeroHash, sealedAt: 0 })));
    const packed = { concession_id: "ID-WOOD-CONCESSION-0540", as_of_unix: 1792227602, hotspots: [hotspotA], runs: { first: 2, last: 3 } };

    await expect(packSource.leftOut!(packed as PackDetail)).resolves.toEqual({
      first: { run: 2, sealedAt: 0 },
      last: { run: 3, sealedAt: 0 },
      records: 0,
      beforeRuns: false,
      missing: [],
      unmatched: [2, 3],
    });
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/runs\?first=2&last=3$/));
    expect(runsOf).toHaveBeenCalledTimes(1);
    expect(runsOf).toHaveBeenCalledWith([1, 2, 3, 4]);
  });

  it("reads run 1 and the run after the window when the window starts at run 1", async () => {
    answer(200, { hotspots: [], forecasts: [] });
    vi.mocked(runsOf).mockClear().mockImplementation(async (runs) => runs.map(() => ({ root: zeroHash, sealedAt: 0 })));
    const packed = { concession_id: "ID-WOOD-CONCESSION-0540", as_of_unix: 1792227602, hotspots: [hotspotA], runs: { first: 1, last: 1 } };

    await packSource.leftOut!(packed as PackDetail);
    expect(runsOf).toHaveBeenCalledWith([1, 2]);
  });
});

describe("runRecords", () => {
  it("asks for 250 runs in three requests of at most 100 runs, and joins the answers in order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const query = new URL(url, "http://api.test").searchParams;
        const [first, last] = [Number(query.get("first")), Number(query.get("last"))];
        return new Response(JSON.stringify({ hotspots: [{ run: first }], forecasts: [{ run: last }] }));
      }),
    );

    await expect(runRecords(1, 250)).resolves.toEqual({
      hotspots: [{ run: 1 }, { run: 101 }, { run: 201 }],
      forecasts: [{ run: 100 }, { run: 200 }, { run: 250 }],
    });
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url).replace(/^.*\/api/, "/api"))).toEqual([
      "/api/runs?first=1&last=100",
      "/api/runs?first=101&last=200",
      "/api/runs?first=201&last=250",
    ]);
  });

  it("throws on a server error", async () => {
    answer(422, { detail: "Too many runs" });
    await expect(runRecords(1, 2)).rejects.toThrow();
  });
});
