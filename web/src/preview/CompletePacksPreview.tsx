import { useEffect, useMemo, useState } from "react";
import { zeroHash, type Hex } from "viem";
import type { HotspotRecord, PackDetail } from "../api";
import type { Seal } from "../chain";
import { ComplaintPack, type LeftOutCheck, type PackSource, type RunSeal } from "../ComplaintPack";
import { chainSeal, enrich, fingerprintOf, FIRE_RUNS, FIRES, fireHotspots, fixture, inRun, never, param, syncPreview, THEMES, wait, WAIT_MS, type Theme } from "./fixture";
import "./preview.css";

// The 0332 fire from the fire-origin fixture, 19 real detections on 4 passes from 12 to 15 Oct 2026, packed as of
// 17 Oct 09:00 UTC. Run numbers, seal times and record counts are made up: no root was on Base Sepolia then.

const CONTRACT: Hex = "0x6a55489a05a9c79d2cd35212878d113557dceb2a";
const AS_OF = Date.parse("2026-10-17T09:00:00Z") / 1000;
// A pass is stored about 3 hours after it was taken, and its run's root sealed a few minutes later.
const SEALED_AFTER_S = 3 * 3600 + 4 * 60;
const HOUR = 3600;

const STATES = {
  whole: "1. Nothing left out of runs 407 to 412",
  leftOut: "2. The server leaves a pass 3 detection out",
  unmatched: "3. Run 411's records no longer rebuild its root",
  beforeRuns: "4. Began before run roots: passes 1 to 3 on FireRecords",
  noRuns: "4. Every record sealed before run roots: no check, as today",
  waiting: "5. Pass 4 waits for its root",
  checking: "Checking the runs",
  error: "Couldn't check the runs",
} as const;
type State = keyof typeof STATES;

const fire = FIRES.outside;
const detail = fixture.detail[fire.id];
const summary = detail.fires.find((f) => f.key === fire.key)!;

/** Each pass's records under one run's root, numbered from `firstRun`; passes after `upTo` wait unsealed. */
function sealedByPass(records: HotspotRecord[], firstRun: number, upTo: number) {
  const roots = new Map<number, RunSeal & { root: Hex }>();
  const out = records.map((h) => h);
  for (let pass = 1; pass <= upTo; pass++) {
    const members = records.filter((h) => h.pass === pass);
    const run = firstRun + pass - 1;
    const sealedAt = members[0].acquired_unix + SEALED_AFTER_S;
    const sealed = inRun(members, run, sealedAt, fingerprintOf);
    roots.set(run, { run, sealedAt, root: sealed.root });
    for (const h of sealed.records) out[records.findIndex((r) => r.record_id === h.record_id)] = h;
  }
  return { records: out, roots };
}

function makeSource(state: State): PackSource {
  let roots = new Map<number, RunSeal & { root: Hex }>();
  let check: LeftOutCheck | null = null;

  return {
    async pack() {
      await wait(WAIT_MS);
      const waiting = state === "waiting";
      let hotspots = fireHotspots(detail.hotspots.map((h) => enrich(h, waiting && h.pass === 4)), fire.key);
      const firstSeen = summary.first_seen_unix;
      let runs: PackDetail["runs"] = null;

      if (state === "beforeRuns") {
        // Run roots began after pass 3: pass 4 sits in runs 1 and 2, as FIRMS published it in two pieces.
        const pass4 = hotspots.filter((h) => h.pass === 4);
        const at = pass4[0].acquired_unix + SEALED_AFTER_S;
        const [one, two] = [inRun(pass4.slice(0, 4), 1, at, fingerprintOf), inRun(pass4.slice(4), 2, at + HOUR, fingerprintOf)];
        const inRoot = new Map([...one.records, ...two.records].map((h) => [h.record_id, h]));
        hotspots = hotspots.map((h) => inRoot.get(h.record_id) ?? h);
        roots = new Map([
          [1, { run: 1, sealedAt: at, root: one.root }],
          [2, { run: 2, sealedAt: at + HOUR, root: two.root }],
        ]);
        runs = { first: 1, last: 9 };
        check = {
          first: { run: 1, sealedAt: at },
          last: { run: 9, sealedAt: AS_OF - 56 * 60 },
          records: 2931,
          beforeRuns: true,
          missing: [],
          unmatched: [],
        };
      } else if (state !== "noRuns") {
        // Runs 409 to 412 hold passes 1 to 4; runs 407 and 408, sealed in the 48 hours before, hold other fires' records.
        const sealed = sealedByPass(hotspots, 409, waiting ? 3 : 4);
        hotspots = sealed.records;
        roots = sealed.roots;
        const last = waiting ? 411 : 412;
        runs = { first: 407, last };
        check = {
          first: { run: 407, sealedAt: firstSeen - 46 * HOUR },
          last: { run: last, sealedAt: roots.get(last)!.sealedAt },
          records: waiting ? 7180 : 9412,
          beforeRuns: false,
          missing: [],
          unmatched: state === "unmatched" ? [411] : [],
        };
        if (state === "leftOut") {
          // Scenario 2: the server drops one of pass 3's detections from the pack; run 411 still holds it.
          const dropped = hotspots.filter((h) => h.pass === 3)[1];
          hotspots = hotspots.filter((h) => h !== dropped);
          check.missing = [dropped];
        }
      }

      return {
        ...summary,
        detections: hotspots.length,
        hotspots,
        as_of_unix: AS_OF,
        concession_id: fire.id,
        province: detail.province,
        boundary: detail.boundary,
        map_version: fixture.map_version,
        rule_version: 2,
        runs,
      };
    },
    contracts: { records: CONTRACT, runs: FIRE_RUNS },
    async sealsOf(records) {
      await wait(WAIT_MS * 2);
      return records.map((r): Seal => {
        if (r.run == null) return chainSeal(r);
        const { root, sealedAt } = roots.get(r.run) ?? { root: zeroHash, sealedAt: 0 };
        return { contract: "FireRuns", run: r.run, root, sealedAt };
      });
    },
    fingerprint: fingerprintOf,
    async leftOut() {
      if (state === "checking") return never();
      await wait(WAIT_MS * 4);
      if (state === "error") throw new Error("preview: runs unreachable");
      return check!;
    },
  };
}

export default function CompletePacksPreview() {
  const [state, setState] = useState<State>(() => param("state", STATES, "whole"));
  const [theme, setTheme] = useState<Theme>(() => param("theme", THEMES, "system"));
  const source = useMemo(() => makeSource(state), [state]);

  useEffect(() => syncPreview(state, theme), [state, theme]);

  return (
    <div className="preview">
      <div className="preview-bar">
        <p className="fw-help">
          Preview of complete-packs. Real FIRMS detections from 12 to 15 Oct 2026; runs, seals and record counts are made
          up.
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
      <ComplaintPack key={`${state}-${theme}`} source={source} packRef={{ ...fire, asOf: AS_OF }} />
    </div>
  );
}
