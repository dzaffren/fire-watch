import { useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import type { HotspotRecord, PackRef } from "../api";
import { ComplaintPack, type PackSource } from "../ComplaintPack";
import { enrich, fingerprintOf, FIRES, fireHotspots, fixture, never, param, syncPreview, THEMES, wait, WAIT_MS, type Theme } from "./fixture";
import "./preview.css";

// Packs made from the fire-origin fixture's real fires, as of 2026-10-17 09:00 UTC. Seals and
// transactions are made up, as in the fire-origin preview.

// FireRecords on Base Sepolia, as deployed.
const CONTRACT: Hex = "0x6a55489a05a9c79d2cd35212878d113557dceb2a";
const AS_OF = Date.parse("2026-10-17T09:00:00Z") / 1000;
// Scenario 3's detection: 2.85500°S, 112.72607°E at 2026-10-14 06:18 UTC, its fire power edited from 14.48 to 1.45 MW.
const EDITED = { lat_e5: -285500, lon_e5: 11272607, frp_e2: 145 };

const STATES = {
  matches: "2. Every detection matches the chain",
  pending: "2. Made while 6 waited for their seal",
  mismatch: "3. A detection changed after its seal",
  edge: "5. Too close to tell (0540)",
  still: "5. Never spread (0540)",
  largest: "The 188-detection fire (0332)",
  opened: "A detection opened",
  checking: "Checking the chain",
  chainError: "Couldn't reach Base Sepolia",
  loading: "Loading; the server note after 3 s",
  error: "Couldn't load the pack",
  missing: "A broken link",
} as const;
type State = keyof typeof STATES;

/** The fire a state shows; check states take the fire named in the link, as the fire view makes it. */
function fireFor(state: State): { id: string; key: Hex } {
  if (state === "edge" || state === "still" || state === "largest") return FIRES[state];
  const params = new URLSearchParams(location.search);
  const id = params.get("pack");
  const key = params.get("fire");
  return id && key && fixture.detail[id]?.fires.some((f) => f.key === key) ? { id, key: key as Hex } : FIRES.outside;
}

function makeSource(state: State): PackSource {
  const originals = new Map<Hex, HotspotRecord>();
  const lastPass = (id: string, key: Hex) => Math.max(...fixture.detail[id].hotspots.filter((h) => h.fire_key === key).map((h) => h.pass ?? 1));

  return {
    async pack({ id, key }: PackRef) {
      if (state === "loading") return never();
      await wait(WAIT_MS);
      if (state === "error") throw new Error("preview: server down");
      if (state === "missing") return null;
      const d = fixture.detail[id];
      const summary = d?.fires.find((f) => f.key === key);
      if (!summary) return null;
      const waiting = lastPass(id, key);
      const records = d.hotspots.map((h) => {
        // Scenario 2: the fire's last pass, 6 detections, still waited for its seal.
        const record = enrich(h, state === "pending" && h.fire_key === key && h.pass === waiting);
        originals.set(record.record_id, record);
        const edited = state === "mismatch" && h.lat_e5 === EDITED.lat_e5 && h.lon_e5 === EDITED.lon_e5;
        return edited ? { ...record, frp_e2: EDITED.frp_e2 } : record;
      });
      return {
        ...summary,
        hotspots: fireHotspots(records, key),
        as_of_unix: AS_OF,
        concession_id: id,
        province: d.province,
        boundary: d.boundary,
        map_version: fixture.map_version,
        rule_version: 1,
      };
    },
    contract: CONTRACT,
    async sealOf(record) {
      if (state === "checking") return never();
      await wait(WAIT_MS * 2 + Math.random() * WAIT_MS);
      if (state === "chainError" && record.pass === 2) throw new Error("preview: chain unreachable");
      return fingerprintOf(originals.get(record.record_id) ?? record);
    },
    fingerprint: fingerprintOf,
  };
}

export default function ComplaintPackPreview() {
  const [state, setState] = useState<State>(() => param("state", STATES, "matches"));
  const [theme, setTheme] = useState<Theme>(() => param("theme", THEMES, "system"));
  const source = useMemo(() => makeSource(state), [state]);
  const ref = useMemo(() => ({ ...fireFor(state), asOf: AS_OF }), [state]);

  useEffect(() => syncPreview(state, theme), [state, theme]);

  return (
    <div className="preview">
      <div className="preview-bar">
        <p className="fw-help">
          Preview of complaint-pack. Real FIRMS detections from 12 to 15 Oct 2026; seals and transactions are made up.
          Scenario 1 starts on{" "}
          <a className="fw-link" href="/?preview=fire-origin&state=outside">the 0332 fire view</a>.
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
      <ComplaintPack key={`${state}-${theme}`} source={source} packRef={ref} initialOpen={state === "opened" ? 3 : null} />
    </div>
  );
}
