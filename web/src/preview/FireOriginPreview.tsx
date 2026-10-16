import { useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import type { HotspotRecord } from "../api";
import { FireRecordPage, type FireRecordSource, type View } from "../FireRecordPage";
import {
  enrich,
  fingerprintOf,
  FIRES,
  fireHotspots,
  fixture,
  never,
  param,
  syncPreview,
  THEMES,
  wait,
  WAIT_MS,
  type FixtureHotspot,
  type Theme,
} from "./fixture";
import "./preview.css";

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

const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;

const RECORD_STATES: State[] = ["matches", "mismatch", "pending", "checking", "chainError"];

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
      return { ...summary, hotspots: fireHotspots(records.get(id)!, key), as_of_unix: Date.now() / 1000 };
    },
    // The complaint-pack preview, as of now, for this fire.
    packHref: (id, f) => `/?${new URLSearchParams({ preview: "complaint-pack", state: "matches", pack: id, fire: f.key })}`,
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

export default function FireOriginPreview() {
  const [state, setState] = useState<State>(() => param("state", STATES, "flow"));
  const [theme, setTheme] = useState<Theme>(() => param("theme", THEMES, "system"));
  const source = useMemo(() => makeSource(state), [state]);

  useEffect(() => syncPreview(state, theme), [state, theme]);

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
