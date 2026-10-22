import { keccak256, toHex, zeroHash, type Hex } from "viem";
import type { ConcessionSummary, FireSummary, HotspotRecord, Ring } from "../api";
import type { Seal } from "../chain";
import { leaf, rootFrom } from "../merkle";
import raw from "./fire-origin.fixture.json";

// Real VIIRS NOAA-20 detections from 2026-10-12 to 15 near four concessions, grouped into fires by
// the fire-origin spec's rule (D25, D26, D27) from the live read-only database. Seal times,
// fingerprints and transactions are made up here, as in the fire-record preview.

export type FixtureHotspot = Pick<
  HotspotRecord,
  "lat_e5" | "lon_e5" | "acquired_unix" | "frp_e2" | "confidence" | "concessions" | "fire_key" | "pass"
>;
interface FixtureDetail extends ConcessionSummary {
  boundary: Ring[];
  hotspots: FixtureHotspot[];
  fires: FireSummary[];
}
interface Fixture {
  map_version: string;
  from: string;
  to: string;
  today: string;
  recording_started: string;
  concessions: ConcessionSummary[];
  detail: Record<string, FixtureDetail>;
}

export const fixture = raw as unknown as Fixture;

// The spec's scenario fires, by the record ID of each fire's first detection.
export const FIRES = {
  outside: { id: "ID-WOOD-CONCESSION-0332", key: "0x48f25fe185b0402018dc6cd3fab3930a760bc0c47bed4d163aa67f678000fbc1" },
  inside: { id: "ID-WOOD-CONCESSION-0356", key: "0x9b5e7cf66d458017f0d0e7e9fad7dcb2e0ae3e3309ef04e6e5b848be5a7a5547" },
  neighbour: { id: "ID-WOOD-CONCESSION-0372", key: "0x9b5e7cf66d458017f0d0e7e9fad7dcb2e0ae3e3309ef04e6e5b848be5a7a5547" },
  edge: { id: "ID-WOOD-CONCESSION-0540", key: "0x3f9765e240f39e98d13e8fe523a4ace4b730b361d34c2d5bda1d00f72e81301f" },
  still: { id: "ID-WOOD-CONCESSION-0540", key: "0xceb010accad1087b319b17528fcdf3cfd6d4285a099a88671ae1e9ea9d86fe18" },
  largest: { id: "ID-WOOD-CONCESSION-0332", key: "0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7" },
} as const satisfies Record<string, { id: string; key: Hex }>;
// FireRuns, at the address the e2e's anvil gives it; it is not on Base Sepolia yet.
export const FIRE_RUNS: Hex = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const SEAL_AFTER_S = 2 * 3600 + 47 * 60;
export const WAIT_MS = 350;

export const iso = (unix: number) => new Date(unix * 1000).toISOString().replace(".000", "");
export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const never = () => new Promise<never>(() => {});

export const fingerprintOf = (r: HotspotRecord): Hex =>
  keccak256(toHex(JSON.stringify([r.source, r.lat_e5, r.lon_e5, r.acquired_unix, r.frp_e2, r.confidence, r.concessions, r.map_version])));

/** A record's seal as the fake FireRecords holds it: its fingerprint and seal time, zeros while it waits. */
export const chainSeal = (sealed: HotspotRecord): Seal =>
  sealed.sealed_at
    ? { contract: "FireRecords", fingerprint: fingerprintOf(sealed), sealedAt: Date.parse(sealed.sealed_at) / 1000 }
    : { contract: "FireRecords", fingerprint: zeroHash, sealedAt: 0 };

interface Sealable {
  record_id: Hex;
  tx_hash: Hex | null;
  sealed_at: string | null;
  run?: number | null;
  proof?: Hex[] | null;
}

/** Records sealed under one run's root, as the recorder stores them: the run, its one transaction,
 *  its block time and each record's proof. The tree is built as merkle.py builds it (D108). */
export function inRun<T extends Sealable>(records: T[], run: number, sealedAt: number, fingerprint: (r: T) => Hex) {
  const leaves = records.map((r) => leaf(r.record_id, fingerprint(r)));
  let level = [...leaves].sort();
  const at = new Map(level.map((l, i) => [l, i]));
  const proofs = new Map(level.map((l) => [l, [] as Hex[]]));
  while (level.length > 1) {
    for (const [l, i] of at) {
      if ((i ^ 1) < level.length) proofs.get(l)!.push(level[i ^ 1]);
      at.set(l, i >> 1);
    }
    level = level.flatMap((n, i) => (i % 2 ? [] : [i + 1 < level.length ? rootFrom(n, [level[i + 1]]) : n]));
  }
  const tx_hash = keccak256(toHex(`run:${run}`));
  return {
    root: level[0],
    records: records.map((r, i) => ({ ...r, run, proof: proofs.get(leaves[i])!, tx_hash, sealed_at: iso(sealedAt) })),
  };
}

export function enrich(h: FixtureHotspot, unsealed: boolean): HotspotRecord {
  const record_id = keccak256(toHex(`${h.lat_e5},${h.lon_e5},${h.acquired_unix}`));
  return {
    ...h,
    record_id,
    source: "VIIRS_NOAA20_NRT",
    acquired_at: iso(h.acquired_unix),
    fingerprint_version: 2,
    tx_hash: unsealed ? null : keccak256(record_id),
    sealed_at: unsealed ? null : iso(h.acquired_unix + SEAL_AFTER_S),
    map_version: fixture.map_version,
  };
}

/** One fire's detections, oldest first, as the fire route answers. */
export const fireHotspots = (records: HotspotRecord[], key: Hex) =>
  records.filter((h) => h.fire_key === key).sort((a, b) => a.acquired_unix - b.acquired_unix || a.lat_e5 - b.lat_e5);

export const THEMES = { system: "System", light: "Light", dark: "Dark" } as const;
export type Theme = keyof typeof THEMES;

export function param<T extends string>(name: string, options: Record<T, string>, fallback: T): T {
  const value = new URLSearchParams(location.search).get(name);
  return value && value in options ? (value as T) : fallback;
}

/** Keeps the picked state and theme in the address, and applies the theme. */
export function syncPreview(state: string, theme: Theme) {
  const url = new URL(location.href);
  url.searchParams.set("state", state);
  url.searchParams.set("theme", theme);
  history.replaceState(null, "", url);
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
