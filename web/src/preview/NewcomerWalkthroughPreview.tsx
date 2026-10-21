import { useEffect, useMemo, useState } from "react";
import type { PackDetail } from "../api";
import { fingerprint } from "../fingerprint";
import { Landing } from "../Landing";
import type { CaseSource } from "../RealCase";
import { never, param, syncPreview, THEMES, wait, WAIT_MS, type Theme } from "./fixture";
import "./preview.css";

// The landing with the real case of the 0332 fire, from the committed copy of its pack (D85). The chain is stood in
// for: each record's seal is its own fingerprint, so the copy matches unless a state changes a record.

const STATES = {
  match: "1–5. The landing, every seal matches",
  checking: "4. Seals, checking",
  mismatch: "4. Seals, one record changed",
  unreachable: "4. Seals, Base Sepolia doesn't answer",
  loading: "2. The case, loading",
  failed: "2. The case, didn't load",
} as const;
type State = keyof typeof STATES;

const committed = () =>
  fetch(`${import.meta.env.BASE_URL}case/pack-0332.json`).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json() as Promise<PackDetail>;
  });

export function makeSource(state: State): CaseSource {
  return {
    pack: async () => {
      if (state === "loading") return never();
      if (state === "failed") throw new Error("preview");
      const pack = await committed();
      if (state !== "mismatch") return pack;
      // The second detection, its fire power edited after it was sealed.
      const hotspots = pack.hotspots.map((h, i) => (i === 1 ? { ...h, frp_e2: h.frp_e2 + 100 } : h));
      return { ...pack, hotspots };
    },
    sealsOf: async (records) => {
      await wait(WAIT_MS * 3);
      if (state === "checking") return never();
      if (state === "unreachable") throw new Error("preview");
      const original = state === "mismatch" ? (await committed()).hotspots : records;
      return original.map(fingerprint);
    },
    fingerprint,
  };
}

export default function NewcomerWalkthroughPreview() {
  const [state, setState] = useState<State>(() => param("state", STATES, "match"));
  const [theme, setTheme] = useState<Theme>(() => param("theme", THEMES, "system"));
  const source = useMemo(() => makeSource(state), [state]);

  useEffect(() => syncPreview(state, theme), [state, theme]);

  return (
    <div className="preview preview--page">
      <div className="preview-bar">
        <p className="fw-help">
          Preview of newcomer-walkthrough. The case is the real 0332 fire from its committed pack; the chain is stood in
          for, so the seal states can be shown.
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
      <Landing key={`${state}-${theme}`} caseSource={source} />
    </div>
  );
}
