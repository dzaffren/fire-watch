import { useEffect, useState } from "react";
import { FireGlobe } from "../FireGlobe";
import { param, syncPreview, THEMES, type Theme } from "./fixture";
import "./preview.css";

// The fire globe primitive on its own. Every dot is a real NOAA-20 detection of 14 Oct 2026 from FIRMS; land is
// Natural Earth 110m; the edge is ID-WOOD-CONCESSION-0332 from Trase v2026-02-20.

const STATES = {
  globe: "Desktop: the globe turning",
  atFire: "Desktop: at the example fire",
  still: "Reduced motion",
  flat: "Phone or no 3D: the flat map",
  flatAtFire: "Flat map at the example fire",
} as const;
type State = keyof typeof STATES;

function Globe({ state }: { state: State }) {
  const [atFire, setAtFire] = useState(state === "atFire" || state === "flatAtFire");
  const [arrived, setArrived] = useState(false);
  const flat = state === "flat" || state === "flatAtFire";
  return (
    <div className="globe-preview">
      <FireGlobe
        atFire={atFire}
        onArrive={() => setArrived(true)}
        flat={flat ? true : undefined}
        still={state === "still" ? true : undefined}
      />
      <div className="globe-preview-actions">
        <button type="button" className="fw-btn fw-btn--secondary" disabled={atFire} onClick={() => setAtFire(true)}>
          Go to the example fire
        </button>
        {arrived && <span className="fw-help">Arrived over ID-WOOD-CONCESSION-0332, 14 Oct 2026.</span>}
      </div>
    </div>
  );
}

export default function FireGlobePreview() {
  const [state, setState] = useState<State>(() => param("state", STATES, "globe"));
  const [theme, setTheme] = useState<Theme>(() => param("theme", THEMES, "system"));

  useEffect(() => syncPreview(state, theme), [state, theme]);

  return (
    <div className="preview">
      <div className="preview-bar">
        <p className="fw-help">
          Preview of the fire globe. Every dot is a real NOAA-20 detection of 14 Oct 2026 from NASA FIRMS. Land is Natural
          Earth 110m, and the dashed edge is ID-WOOD-CONCESSION-0332 from Trase.
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
      <Globe key={`${state}-${theme}`} state={state} />
    </div>
  );
}
