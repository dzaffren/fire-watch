import { useEffect, useMemo, useState } from "react";
import { FireRecordPage } from "../FireRecordPage";
import { Landing } from "../Landing";
import { fixture, param, syncPreview, THEMES, type Theme } from "./fixture";
import { makeSource as makeCaseSource } from "./NewcomerWalkthroughPreview";
import { AS_OF, makeSource } from "./SpreadForecastPreview";
import "./preview.css";

// The landing with the real fire globe of 14 Oct 2026, and the tool with its link back. The tool's concessions,
// seals and forecasts come from the earlier previews' fixture; "Open the tool" and the example pack leave the preview.

const STATES = {
  landing: "1–4. The landing",
  tool: "5. The tool, with About Fire Watch",
} as const;
type State = keyof typeof STATES;

export default function LandingPagePreview() {
  const [state, setState] = useState<State>(() => param("state", STATES, "landing"));
  const [theme, setTheme] = useState<Theme>(() => param("theme", THEMES, "system"));
  const tool = useMemo(() => makeSource("concession"), []);
  const real = useMemo(() => makeCaseSource("match"), []);

  useEffect(() => syncPreview(state, theme), [state, theme]);

  return (
    <div className={state === "landing" ? "preview preview--page" : "preview"}>
      <div className="preview-bar">
        <p className="fw-help">
          Preview of landing-page. The globe's dots are real NOAA-20 detections of 14 Oct 2026; the tool's records come
          from the earlier previews' fixture.
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
      {state === "landing" ? (
        <Landing key={theme} caseSource={real} />
      ) : (
        <FireRecordPage
          key={theme}
          source={tool}
          today={fixture.today}
          initialDates={{ from: fixture.from, to: fixture.to }}
          now={AS_OF}
          aboutHref="/?preview=landing-page&state=landing"
        />
      )}
    </div>
  );
}
