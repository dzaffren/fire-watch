import { useEffect, useMemo, useState } from "react";
import { keccak256, toHex, zeroHash, type Hex } from "viem";
import type { FireDetail, Forecast, HotspotRecord, Point, Ring } from "../api";
import { forecastFingerprint } from "../fingerprint";
import { FireRecordPage, type FireRecordSource, type View } from "../FireRecordPage";
import { passTimes } from "../FireView";
import { enrich, fingerprintOf, FIRES, fireHotspots, fixture, iso, never, param, syncPreview, THEMES, wait, WAIT_MS, type Theme } from "./fixture";
import "./preview.css";

// Forecasts made up over the fire-origin fixture's real fires, as if the recorder had forecast
// from 2026-10-13 09:00 UTC. Detections are real VIIRS NOAA-20 rows from 12 to 15 Oct 2026; the
// forecasts, seals and transactions are not.

type FireRef = { id: string; key: Hex };

const at = (text: string) => Date.parse(`${text}Z`) / 1000;
const FORECASTS_FROM = at("2026-10-13T09:00:00");
// Pass 3 of the 0332 fire: the world of scenario 1, before its 15 Oct pass saw it inside.
const WAITING_AS_OF = at("2026-10-14T20:30:00");
// The other states, while the waiting fire's forecast made 15 Oct 21:00 has its 48 hours to run.
const AS_OF = at("2026-10-16T00:00:00");
const SEAL_AFTER_S = 120;
const HORIZON_S = 48 * 3600;

const FIRE = {
  outside: FIRES.outside,
  stayedOut: { id: "ID-WOOD-CONCESSION-0540", key: "0xeadfd96db42a3265c367d69d83a6cb07f5d4cb539abb912be024dd69112c9e2a" },
  waiting: { id: "ID-WOOD-CONCESSION-0332", key: "0x4800376bcbf81c91d61ed2a53ccce068b7805eb81d6ac7029e639ccaa781d2ea" },
  joined: { id: "ID-WOOD-CONCESSION-0332", key: "0x2ee3d2538b1fc6ffbe75dd9b8a349bcf454dc7797a7976bff9a545c01c787120" },
  before: { id: "ID-WOOD-CONCESSION-0332", key: "0x620f1adebe52b3dbaa00ca7233dd7cf74642c6902673ef0abd8f6d36f869e71d" },
  inside: FIRES.inside,
} as const satisfies Record<string, FireRef>;
// The two detections 1,054 and 1,365 m outside 0332 that the 13 Oct 17:37 pass joined to the fire above.
const JOINED_AWAY = [
  { lat_e5: -287657, lon_e5: 11272855 },
  { lat_e5: -287605, lon_e5: 11273171 },
];

const STATES = {
  concession: "0332, one fire forecast inside",
  waiting: "1. A forecast after each pass, waiting (0332, 14 Oct 20:30)",
  hit: "2. Came true, and one before said no (0332)",
  stayedOut: "3. Said inside, stayed out; said no, stayed out (0540)",
  mismatch: "4. A forecast changed after its seal (0332)",
  joined: "5. Joined another fire first (0332)",
  pending: "Newest not on chain yet",
  checking: "Checking the chain",
  chainError: "Couldn't reach Base Sepolia",
  none: "No forecasts: seen inside on its first pass (0356)",
  before: "No forecasts: before forecasting began (0332)",
} as const;
type State = keyof typeof STATES;

const records = new Map(
  Object.entries(fixture.detail).map(([id, d]) => [id, d.hotspots.map((h) => enrich(h, false))] as const),
);
const hotspotsOf = ({ id, key }: FireRef) => fireHotspots(records.get(id)!, key);

/** The nearest point on a concession's edge, flat-earth over a few kilometres. */
function nearestEdge(p: Point, rings: Ring[]): Point {
  const k = Math.cos((p.lat_e5 / 1e5) * (Math.PI / 180));
  const [px, py] = [(p.lon_e5 / 1e5) * k, p.lat_e5 / 1e5];
  let best = { d: Infinity, x: px, y: py };
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay, bx, by] = [ring[i - 1][0] * k, ring[i - 1][1], ring[i][0] * k, ring[i][1]];
      const [dx, dy] = [bx - ax, by - ay];
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      const [x, y] = [ax + t * dx, ay + t * dy];
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < best.d) best = { d, x, y };
    }
  }
  return { lat_e5: Math.round(best.y * 1e5), lon_e5: Math.round((best.x / k) * 1e5) };
}

const centre = (points: Point[]): Point => ({
  lat_e5: Math.round(points.reduce((s, p) => s + p.lat_e5, 0) / points.length),
  lon_e5: Math.round(points.reduce((s, p) => s + p.lon_e5, 0) / points.length),
});

/** The pass's detection nearest the edge; one inside counts as 0 m (D48, step 2). */
function nearestToEdge(id: string, pass: HotspotRecord[]): Point {
  const edge = (h: HotspotRecord) => {
    const m = h.concessions.find((c) => c.id === id)!;
    return m.inside ? 0 : m.edge_m;
  };
  const h = pass.reduce((best, h) => (edge(h) < edge(best) ? h : best));
  return { lat_e5: h.lat_e5, lon_e5: h.lon_e5 };
}

interface Made {
  pass: number;
  made: string;
  insideBy: string | null;
  outcome: Forecast["outcome"];
  outcomeAt?: number;
  from?: Point[];
}

/** One forecast after a real pass, from that pass's detection nearest the edge to the nearest point on it.
 *  The 0332 fire's times are forecast rule version 1's (D48); the others are made up. */
function forecast(fire: FireRef, m: Made, forKey: Hex = fire.key): Forecast {
  const hotspots = hotspotsOf(fire);
  const made = at(m.made);
  const from = m.insideBy ? (m.from ? centre(m.from) : nearestToEdge(fire.id, hotspots.filter((h) => h.pass === m.pass))) : null;
  const record_id = keccak256(toHex(`forecast:${fire.id}:${forKey}:${made}`));
  return {
    record_id,
    concession_id: fire.id,
    fire_key: forKey,
    after_pass_unix: passTimes(hotspots)[m.pass - 1],
    made_unix: made,
    until_unix: made + HORIZON_S,
    inside_by_unix: m.insideBy ? at(m.insideBy) : null,
    from,
    crossing: from && nearestEdge(from, fixture.detail[fire.id].boundary),
    rule_version: 1,
    tx_hash: keccak256(record_id),
    sealed_at: iso(made + SEAL_AFTER_S),
    outcome: m.outcome,
    outcome_unix: m.outcomeAt ?? null,
  };
}

function forecastsFor(fire: FireRef, waiting: boolean): Forecast[] {
  const seenInside = (f: FireRef) => passTimes(hotspotsOf(f))[3];
  if (fire.key === FIRE.outside.key) {
    const outcome = (o: Forecast["outcome"]) => (waiting ? { outcome: "waiting" as const } : { outcome: o, outcomeAt: seenInside(fire) });
    return [
      forecast(fire, { pass: 3, made: "2026-10-14T20:00:00", insideBy: "2026-10-15T05:20:00", ...outcome("seen_inside") }),
      forecast(fire, { pass: 2, made: "2026-10-14T09:00:00", insideBy: "2026-10-15T06:18:00", ...outcome("seen_inside") }),
      forecast(fire, { pass: 1, made: "2026-10-13T20:00:00", insideBy: null, ...outcome("seen_inside") }),
    ];
  }
  if (fire.key === FIRE.stayedOut.key) {
    return [
      forecast(fire, { pass: 4, made: "2026-10-15T09:00:00", insideBy: "2026-10-15T18:00:00", outcome: "not_seen_inside" }),
      forecast(fire, { pass: 3, made: "2026-10-14T09:00:00", insideBy: "2026-10-15T06:00:00", outcome: "not_seen_inside" }),
      forecast(fire, { pass: 2, made: "2026-10-13T20:00:00", insideBy: null, outcome: "not_seen_inside" }),
      forecast(fire, { pass: 1, made: "2026-10-13T09:00:00", insideBy: null, outcome: "not_seen_inside" }),
    ];
  }
  if (fire.key === FIRE.waiting.key) {
    return [forecast(fire, { pass: 1, made: "2026-10-15T21:00:00", insideBy: "2026-10-16T18:00:00", outcome: "waiting" })];
  }
  if (fire.key === FIRE.joined.key) {
    const away = records.get(fire.id)!.find((h) => h.lat_e5 === JOINED_AWAY[0].lat_e5 && h.lon_e5 === JOINED_AWAY[0].lon_e5)!;
    const m: Made = {
      pass: 1,
      made: "2026-10-13T09:00:00",
      insideBy: "2026-10-14T06:00:00",
      outcome: "joined",
      outcomeAt: passTimes(hotspotsOf(fire))[1],
      from: JOINED_AWAY,
    };
    return [forecast(fire, m, away.record_id)];
  }
  return [];
}

function makeSource(state: State): FireRecordSource {
  const waiting = state === "waiting" || state === "pending";
  const sealed = new Map<Hex, Hex>();
  const stored = (fire: FireRef) =>
    forecastsFor(fire, waiting).map((f, i) => {
      sealed.set(f.record_id, forecastFingerprint(f));
      // Scenario 4: the stored forecast time moved from 05:20 to 18:40 after its seal.
      if (state === "mismatch" && i === 0) return { ...f, inside_by_unix: at("2026-10-15T18:40:00") };
      if (state === "pending" && i === 0) return { ...f, tx_hash: null, sealed_at: null };
      return f;
    });

  return {
    async concessions() {
      await wait(WAIT_MS);
      return { recording_started: fixture.recording_started, map_version: fixture.map_version, concessions: fixture.concessions };
    },
    async concession(id) {
      await wait(WAIT_MS);
      const d = fixture.detail[id];
      const marked = d.fires.map((f) =>
        f.key === FIRE.waiting.key && id === FIRE.waiting.id ? { ...f, forecast_inside_by_unix: at("2026-10-16T18:00:00") } : f,
      );
      // Fires forecast to be seen inside first, then largest first, as the API will rank them (O13).
      const fires = [...marked.filter((f) => f.forecast_inside_by_unix), ...marked.filter((f) => !f.forecast_inside_by_unix)];
      return { ...d, hotspots: records.get(id)!, fires };
    },
    async fire(id, key): Promise<FireDetail> {
      await wait(WAIT_MS);
      const summary = fixture.detail[id]?.fires.find((f) => f.key === key);
      if (!summary) throw new Error(`preview: no fire ${key}`);
      const ref = { id, key };
      const forecasts = stored(ref);
      let hotspots: HotspotRecord[] = hotspotsOf(ref);
      let detail = { ...summary };
      if (waiting && key === FIRE.outside.key) {
        hotspots = hotspots.filter((h) => h.acquired_unix <= WAITING_AS_OF);
        detail = {
          ...summary,
          passes: Math.max(...hotspots.map((h) => h.pass ?? 1)),
          detections: hotspots.length,
          last_seen_unix: hotspots[hotspots.length - 1].acquired_unix,
          inside_from_unix: null,
        };
      }
      return { ...detail, hotspots, as_of_unix: Date.now() / 1000, forecasts, forecasts_from_unix: FORECASTS_FROM };
    },
    packHref: (id, f) => `/?${new URLSearchParams({ preview: "complaint-pack", state: "matches", pack: id, fire: f.key })}`,
    async sealOf(record) {
      await wait(WAIT_MS * 2);
      return fingerprintOf(record);
    },
    fingerprint: fingerprintOf,
    async forecastSeals(forecasts) {
      if (state === "checking") return never();
      await wait(WAIT_MS * 2);
      if (state === "chainError") throw new Error("preview: chain unreachable");
      return forecasts.map((f) =>
        f.tx_hash
          ? { fingerprint: sealed.get(f.record_id) ?? zeroHash, sealedAt: Date.parse(f.sealed_at!) / 1000 }
          : { fingerprint: zeroHash, sealedAt: 0 },
      );
    },
    forecastFingerprint,
  };
}

function initialView(state: State): View {
  if (state === "concession") return { kind: "concession", id: FIRE.waiting.id };
  if (state === "stayedOut" || state === "joined" || state === "before") return { kind: "fire", ...FIRE[state] };
  if (state === "none") return { kind: "fire", ...FIRE.inside };
  return { kind: "fire", ...FIRE.outside };
}

export default function SpreadForecastPreview() {
  const [state, setState] = useState<State>(() => param("state", STATES, "hit"));
  const [theme, setTheme] = useState<Theme>(() => param("theme", THEMES, "system"));
  const source = useMemo(() => makeSource(state), [state]);

  useEffect(() => syncPreview(state, theme), [state, theme]);

  return (
    <div className="preview">
      <div className="preview-bar">
        <p className="fw-help">
          Preview of spread-forecast. Real FIRMS detections from 12 to 15 Oct 2026; the forecasts, seals and
          transactions are made up, as if forecasting began 13 Oct 09:00 UTC.
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
        now={state === "waiting" || state === "pending" ? WAITING_AS_OF : AS_OF}
      />
    </div>
  );
}
