import { useEffect, useMemo, useState } from "react";
import { keccak256, toHex, type Hex } from "viem";
import type { ConcessionSummary, FireSummary, HotspotRecord, Ring } from "../api";
import { FireRecordPage, type FireRecordSource, type View } from "../FireRecordPage";
import raw from "./fire-origin.fixture.json";
import "./preview.css";

// Real VIIRS NOAA-20 detections from 2026-10-12 to 15 near four concessions, grouped into fires by
// the fire-origin spec's rule (D25, D26, D27) from the live read-only database. Seal times,
// fingerprints and transactions are made up here, as in the fire-record preview.

type FixtureHotspot = Pick<
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

const fixture = raw as unknown as Fixture;

// The spec's scenario fires, by the record ID of each fire's first detection.
const FIRES = {
  outside: { id: "ID-WOOD-CONCESSION-0332", key: "0x48f25fe185b0402018dc6cd3fab3930a760bc0c47bed4d163aa67f678000fbc1" },
  inside: { id: "ID-WOOD-CONCESSION-0356", key: "0x9b5e7cf66d458017f0d0e7e9fad7dcb2e0ae3e3309ef04e6e5b848be5a7a5547" },
  neighbour: { id: "ID-WOOD-CONCESSION-0372", key: "0x9b5e7cf66d458017f0d0e7e9fad7dcb2e0ae3e3309ef04e6e5b848be5a7a5547" },
  edge: { id: "ID-WOOD-CONCESSION-0540", key: "0x3f9765e240f39e98d13e8fe523a4ace4b730b361d34c2d5bda1d00f72e81301f" },
  still: { id: "ID-WOOD-CONCESSION-0540", key: "0xceb010accad1087b319b17528fcdf3cfd6d4285a099a88671ae1e9ea9d86fe18" },
} as const satisfies Record<string, { id: string; key: Hex }>;
const SEAL_AFTER_S = 2 * 3600 + 47 * 60;
const WAIT_MS = 350;
const DAY_S = 86400;

const STATES = {
  flow: "Live flow, from the list",
  loading: "Loading the list",
  error: "Couldn't load the list",
  empty: "No hotspots in the dates",
  concession: "0332, its fires",
  outside: "1. First seen outside, then inside (0332)",
  inside: "2. First seen inside (0356)",
  neighbour: "2. The same fire from 0372",
  edge: "3. Too close to tell (0540)",
  still: "4. Never spread (0540)",
  oneDay: "5. Dates cut to 15 Oct (0332)",
  fireLoading: "Loading a fire",
  fireError: "Couldn't load a fire",
  matches: "First detection, matches the chain",
  mismatch: "First detection, edited after sealing",
  pending: "First detection, not on chain yet",
  checking: "First detection, checking",
  chainError: "First detection, couldn't reach the chain",
} as const;
type State = keyof typeof STATES;

const THEMES = { system: "System", light: "Light", dark: "Dark" } as const;
type Theme = keyof typeof THEMES;

const iso = (unix: number) => new Date(unix * 1000).toISOString().replace(".000", "");
const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const never = () => new Promise<never>(() => {});

const fingerprintOf = (r: HotspotRecord): Hex =>
  keccak256(toHex(JSON.stringify([r.source, r.lat_e5, r.lon_e5, r.acquired_unix, r.frp_e2, r.confidence, r.concessions, r.map_version])));

const RECORD_STATES: State[] = ["matches", "mismatch", "pending", "checking", "chainError"];

function enrich(h: FixtureHotspot, unsealed: boolean): HotspotRecord {
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

function makeSource(state: State): FireRecordSource {
  const target = FIRES.outside;
  const isTargetFirst = (id: string, h: FixtureHotspot) => id === target.id && h.fire_key === target.key && h.pass === 1;
  const originals = new Map<Hex, HotspotRecord>();
  const records = new Map<string, HotspotRecord[]>();
  for (const [id, d] of Object.entries(fixture.detail)) {
    records.set(
      id,
      d.hotspots.map((h) => {
        const record = enrich(h, state === "pending" && isTargetFirst(id, h));
        originals.set(record.record_id, record);
        // Scenario 4 of fire-record: the stored match now says inside; the seal holds the original.
        if (state === "mismatch" && isTargetFirst(id, h)) {
          return { ...record, concessions: record.concessions.map((m) => (m.id === id ? { ...m, inside: true } : m)) };
        }
        return record;
      }),
    );
  }
  const within = (from: string, to: string) => (h: { acquired_unix: number }) =>
    h.acquired_unix >= day(from) && h.acquired_unix < day(to) + DAY_S;

  return {
    async concessions(from, to) {
      if (state === "loading") return never();
      await wait(WAIT_MS);
      if (state === "error") throw new Error("preview: server down");
      const inRange = within(from, to);
      const concessions = fixture.concessions
        .map((c) => {
          const here = fixture.detail[c.id].hotspots.filter(inRange).map((h) => h.concessions.find((m) => m.id === c.id)!);
          return { ...c, inside: here.filter((m) => m.inside).length, near: here.filter((m) => !m.inside).length };
        })
        .filter((c) => c.inside + c.near > 0)
        .sort((a, b) => b.inside - a.inside || b.near - a.near || a.id.localeCompare(b.id));
      return { recording_started: fixture.recording_started, map_version: fixture.map_version, concessions };
    },
    async concession(id, from, to) {
      await wait(WAIT_MS);
      const d = fixture.detail[id];
      if (!d) throw new Error(`preview: no ${id}`);
      const hotspots = records.get(id)!.filter(within(from, to));
      const keys = new Set(hotspots.map((h) => h.fire_key));
      const inside = hotspots.filter((h) => h.concessions.find((m) => m.id === id)?.inside).length;
      return { ...d, inside, near: hotspots.length - inside, hotspots, fires: d.fires.filter((f) => keys.has(f.key)) };
    },
    async fire(id, key) {
      if (state === "fireLoading") return never();
      await wait(WAIT_MS);
      if (state === "fireError") throw new Error("preview: server down");
      const summary = fixture.detail[id]?.fires.find((f) => f.key === key);
      if (!summary) throw new Error(`preview: no fire ${key}`);
      const hotspots = records
        .get(id)!
        .filter((h) => h.fire_key === key)
        .sort((a, b) => a.acquired_unix - b.acquired_unix || a.lat_e5 - b.lat_e5);
      return { ...summary, hotspots };
    },
    async sealOf(record) {
      if (state === "checking") return never();
      await wait(WAIT_MS * 2);
      if (state === "chainError") throw new Error("preview: chain unreachable");
      return fingerprintOf(originals.get(record.record_id) ?? record);
    },
    fingerprint: fingerprintOf,
  };
}

function initialView(state: State): View | undefined {
  if (state === "concession") return { kind: "concession", id: FIRES.outside.id };
  if (state === "oneDay" || state === "fireLoading" || state === "fireError") return { kind: "fire", ...FIRES.outside };
  if (state in FIRES) return { kind: "fire", ...FIRES[state as keyof typeof FIRES] };
  if (RECORD_STATES.includes(state)) return { kind: "hotspot", ...FIRES.outside, index: 0 };
  return undefined;
}

function initialDates(state: State) {
  if (state === "empty") return { from: "2026-10-01", to: "2026-10-07" };
  if (state === "oneDay") return { from: "2026-10-15", to: "2026-10-15" };
  return { from: fixture.from, to: fixture.to };
}

function param<T extends string>(name: string, options: Record<T, string>, fallback: T): T {
  const value = new URLSearchParams(location.search).get(name);
  return value && value in options ? (value as T) : fallback;
}

export default function FireOriginPreview() {
  const [state, setState] = useState<State>(() => param("state", STATES, "flow"));
  const [theme, setTheme] = useState<Theme>(() => param("theme", THEMES, "system"));
  const source = useMemo(() => makeSource(state), [state]);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("state", state);
    url.searchParams.set("theme", theme);
    history.replaceState(null, "", url);
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [state, theme]);

  return (
    <div className="preview">
      <div className="preview-bar">
        <p className="fw-help">
          Preview of fire-origin. Real FIRMS detections from 12 to 15 Oct 2026 near four concessions; seal times,
          fingerprints and transactions are made up.
        </p>
        <label className="preview-pick">
          State
          <select className="fw-input" value={state} onChange={(e) => setState(e.target.value as State)}>
            {Object.entries(STATES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="preview-pick">
          Theme
          <select className="fw-input" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            {Object.entries(THEMES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <FireRecordPage
        key={`${state}-${theme}`}
        source={source}
        today={fixture.today}
        initialView={initialView(state)}
        initialDates={initialDates(state)}
      />
    </div>
  );
}
