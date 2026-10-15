import { useEffect, useMemo, useState } from "react";
import { keccak256, toHex, type Hex } from "viem";
import type { ConcessionDetail, ConcessionSummary, HotspotRecord, Ring } from "../api";
import { FireRecordPage, type FireRecordSource, type View } from "../FireRecordPage";
import raw from "./fire-record.fixture.json";
import "./preview.css";

// Real VIIRS NOAA-20 detections from 2026-10-11 to 14 matched against the Trase map, built by
// the fixture script in the fire-record spec. Seal times, fingerprints and transactions are made
// up here, since nothing in the fixture was ever sealed.

type FixtureHotspot = Pick<HotspotRecord, "lat_e5" | "lon_e5" | "acquired_unix" | "frp_e2" | "confidence" | "concessions">;
type FixtureDetail = Omit<ConcessionDetail, "hotspots"> & { hotspots: FixtureHotspot[] };
type FixtureSummary = ConcessionSummary & { outline: Ring[] };
interface Fixture {
  map_version: string;
  from: string;
  to: string;
  today: string;
  recording_started: string;
  concessions: FixtureSummary[];
  detail: Record<string, FixtureDetail>;
}

const fixture = raw as unknown as Fixture;

const A = { id: "ID-WOOD-CONCESSION-0540", lat_e5: -358175, lon_e5: 10571567 };
const B = { id: "ID-WOOD-CONCESSION-0377", lat_e5: -367525, lon_e5: 11535328 };
const SEAL_AFTER_S = 2 * 3600 + 47 * 60;
const WAIT_MS = 350;

const STATES = {
  flow: "Live flow",
  loading: "Loading the list",
  error: "Couldn't load the list",
  empty: "No hotspots in the dates",
  matches: "Hotspot A, matches the chain",
  mismatch: "Hotspot B, edited after sealing",
  pending: "Hotspot A, not on chain yet",
  checking: "Hotspot A, checking",
  chainError: "Hotspot A, couldn't reach the chain",
} as const;
type State = keyof typeof STATES;

const THEMES = { system: "System", light: "Light", dark: "Dark" } as const;
type Theme = keyof typeof THEMES;

const iso = (unix: number) => new Date(unix * 1000).toISOString().replace(".000", "");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const never = () => new Promise<never>(() => {});

const fingerprintOf = (r: HotspotRecord): Hex =>
  keccak256(toHex(JSON.stringify([r.source, r.lat_e5, r.lon_e5, r.acquired_unix, r.frp_e2, r.confidence, r.concessions, r.map_version])));

function enrich(h: FixtureHotspot, state: State): HotspotRecord {
  const record_id = keccak256(toHex(`${h.lat_e5},${h.lon_e5},${h.acquired_unix}`));
  const unsealed = state === "pending" && h.lat_e5 === A.lat_e5 && h.lon_e5 === A.lon_e5;
  return {
    ...h,
    record_id,
    source: "VIIRS_NOAA20_NRT",
    acquired_at: iso(h.acquired_unix),
    tx_hash: unsealed ? null : keccak256(record_id),
    sealed_at: unsealed ? null : iso(h.acquired_unix + SEAL_AFTER_S),
    map_version: fixture.map_version,
  };
}

function makeSource(state: State): FireRecordSource {
  const originals = new Map<Hex, HotspotRecord>();
  const details = new Map<string, ConcessionDetail>();
  for (const [id, d] of Object.entries(fixture.detail)) {
    const hotspots = d.hotspots.map((h) => {
      const record = enrich(h, state);
      originals.set(record.record_id, record);
      // Scenario 4: B's stored record now says it is inside 0377; the seal still holds the original.
      if (state === "mismatch" && h.lat_e5 === B.lat_e5 && h.lon_e5 === B.lon_e5) {
        return { ...record, concessions: record.concessions?.map((m) => (m.id === B.id ? { ...m, inside: true } : m)) };
      }
      return record;
    });
    details.set(id, { ...d, hotspots });
  }
  const overlaps = (from: string, to: string) => from <= fixture.to && to >= fixture.from;

  return {
    async concessions(from, to) {
      if (state === "loading") return never();
      await wait(WAIT_MS);
      if (state === "error") throw new Error("preview: server down");
      return overlaps(from, to) ? fixture.concessions.map(({ outline: _, ...c }) => c) : [];
    },
    async concession(id) {
      await wait(WAIT_MS);
      const d = details.get(id);
      if (d) return d;
      // Only two concessions carry hotspots in the fixture; the rest open with their outline.
      const s = fixture.concessions.find((c) => c.id === id);
      if (!s) throw new Error(`preview: no ${id}`);
      const { outline, ...summary } = s;
      return { ...summary, boundary: outline, hotspots: [] };
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

function initialView(state: State, source: Record<string, FixtureDetail>): View | undefined {
  const target = state === "mismatch" ? B : ["matches", "pending", "checking", "chainError"].includes(state) ? A : null;
  if (!target) return undefined;
  const index = source[target.id].hotspots.findIndex((h) => h.lat_e5 === target.lat_e5 && h.lon_e5 === target.lon_e5);
  return { kind: "hotspot", id: target.id, index };
}

function param<T extends string>(name: string, options: Record<T, string>, fallback: T): T {
  const value = new URLSearchParams(location.search).get(name);
  return value && value in options ? (value as T) : fallback;
}

export default function FireRecordPreview() {
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
          Preview of fire-record. Real FIRMS detections from 11 to 14 Oct 2026; seal times, fingerprints and
          transactions are made up.
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
        recordingStarted={fixture.recording_started}
        mapVersion={fixture.map_version}
        initialView={initialView(state, fixture.detail)}
        initialDates={state === "empty" ? { from: "2026-10-01", to: "2026-10-07" } : undefined}
      />
    </div>
  );
}
