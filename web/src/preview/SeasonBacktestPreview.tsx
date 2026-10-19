import { useEffect, useMemo, useState } from "react";
import type { Backtest } from "../api";
import { FireRecordPage } from "../FireRecordPage";
import { fixture, param, syncPreview, THEMES, type Theme } from "./fixture";
import { AS_OF, initialView, makeSource, type State as ForecastState } from "./SpreadForecastPreview";
import "./preview.css";

// The totals of a scratch replay of 2023, run 2026-10-19 with a 3-hour FIRMS lag and ERA5 wind from
// Open-Meteo. /build replaces them with the committed result. The forecasts on the 2026 fires are the
// spread-forecast preview's.
const SCRATCH: Backtest = {
  rule_version: 1,
  forecasts: 20277,
  joined: 246,
  seen_before_made: 21,
  ends_after_2023: 15,
  rule: { warned: 123, missed: 12, did_not_come_in: 3751, stayed_out: 16109, median_hours_off: 11.7 },
  downwind: { warned: 19, missed: 116, did_not_come_in: 256, stayed_out: 19604, median_hours_off: 11.7 },
};

const STATES = {
  hit: "0332: came true, replay under it",
  stayedOut: "0540: said inside, stayed out",
  mismatch: "Changed after its seal",
  none: "No forecasts, no replay (0356)",
} as const satisfies Partial<Record<ForecastState, string>>;
type State = keyof typeof STATES;

export default function SeasonBacktestPreview() {
  const [state, setState] = useState<State>(() => param("state", STATES, "hit"));
  const [theme, setTheme] = useState<Theme>(() => param("theme", THEMES, "system"));
  const source = useMemo(() => ({ ...makeSource(state), backtest: SCRATCH }), [state]);

  useEffect(() => syncPreview(state, theme), [state, theme]);

  return (
    <div className="preview">
      <div className="preview-bar">
        <p className="fw-help">
          Preview of season-backtest. The replay totals come from a scratch run over 2023; the 2026 forecasts, seals
          and transactions are made up, as in the spread-forecast preview.
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
        initialDates={{ from: fixture.from, to: fixture.to }}
        now={AS_OF}
      />
    </div>
  );
}
