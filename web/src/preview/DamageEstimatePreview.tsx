import { useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import trase from "../../../fixtures/concessions/trase-cut.geojson?raw";
import type { ConcessionDetail, Damage, FireDetail, FireSummary, PackRef, Ring } from "../api";
import { ComplaintPack, type PackSource } from "../ComplaintPack";
import { FireRecordPage, type FireRecordSource, type View } from "../FireRecordPage";
import { chainSeal, enrich, fingerprintOf, FIRE_RUNS, FIRES, fireHotspots, fixture, param, syncPreview, THEMES, wait, WAIT_MS, type Theme } from "./fixture";
import { AS_OF, makeSource as forecastSource } from "./SpreadForecastPreview";
import "./preview.css";

// Each fire's four parts, worked out by the damage query on the compose PostGIS from its real
// detections, Trase's map v2026-02-20 and WRI's peat map v20230315. Seals, transactions and
// forecasts are made up, as in the earlier previews.

// FireRecords on Base Sepolia, as deployed.
const CONTRACT: Hex = "0x6a55489a05a9c79d2cd35212878d113557dceb2a";
const PACK_AS_OF = Date.parse("2026-10-17T09:00:00Z") / 1000;
const C0377 = "ID-WOOD-CONCESSION-0377";

// Hotspot B of fire-record scenario 1: 3.67525°S, 115.35328°E, 371 m outside 0377, off peat.
const B = enrich(
  {
    lat_e5: -367525,
    lon_e5: 11535328,
    acquired_unix: Date.parse("2026-10-14T06:18:00Z") / 1000,
    frp_e2: 303,
    confidence: "n",
    concessions: [
      { id: C0377, inside: false, edge_m: 371 },
      { id: "ID-WOOD-CONCESSION-0275", inside: false, edge_m: 1019 },
    ],
    pass: 1,
  },
  false,
);
const B_FIRE: FireSummary = {
  key: B.record_id,
  first_seen_unix: B.acquired_unix,
  last_seen_unix: B.acquired_unix,
  passes: 1,
  detections: 1,
  first_seen: { reading: "edge", inside: false, edge_m: 371 },
  inside_from_unix: null,
  outside_from_unix: null,
  never_spread: false,
  recorded_before_h: null,
};

const DAMAGE: Record<Hex, Damage> = {
  [FIRES.outside.key]: { inside_peat_ha: 59.21, inside_other_ha: 0, outside_peat_ha: 144.31, outside_other_ha: 6.3 },
  [FIRES.still.key]: { inside_peat_ha: 58.25, inside_other_ha: 0, outside_peat_ha: 0, outside_other_ha: 0 },
  [FIRES.largest.key]: { inside_peat_ha: 221.48, inside_other_ha: 446.27, outside_peat_ha: 372.35, outside_other_ha: 503.75 },
  [B_FIRE.key]: { inside_peat_ha: 0, inside_other_ha: 0, outside_peat_ha: 0, outside_other_ha: 14.06 },
};

const STATES = {
  peat: "1. Peat fire (0332)",
  offPeat: "2. Off peat (0377, B)",
  pack: "3–4. Its pack (0332)",
  still: "5. Never spread (0540)",
  stillPack: "5. Its pack (0540)",
  largest: "188 detections (0332)",
} as const;
type State = keyof typeof STATES;

/** 0377 from the committed Trase cut, every ring of its boundary. */
function concession0377(): ConcessionDetail {
  const feature = JSON.parse(trase).features.find(
    (f: { properties: { wood_supplier_trase_id: string } }) => f.properties.wood_supplier_trase_id === C0377,
  );
  const { type, coordinates } = feature.geometry;
  const boundary: Ring[] = type === "MultiPolygon" ? coordinates.flat() : coordinates;
  return {
    id: C0377,
    province: "Kalimantan Selatan",
    area_ha: 248719,
    inside: 0,
    near: 1,
    boundary,
    hotspots: [{ ...B, fire_key: B.record_id }],
    fires: [B_FIRE],
  };
}

const packHref = (id: string, f: FireDetail) =>
  `/?${new URLSearchParams({ preview: "damage-estimate", state: "pack", pack: id, fire: f.key })}`;

function fireSource(): FireRecordSource {
  const base = forecastSource("hit");
  return {
    ...base,
    async concession(id, from, to) {
      if (id !== C0377) return base.concession(id, from, to);
      await wait(WAIT_MS);
      return concession0377();
    },
    async fire(id, key) {
      if (id === C0377) {
        await wait(WAIT_MS);
        return { ...B_FIRE, hotspots: [{ ...B, fire_key: B.record_id }], as_of_unix: AS_OF, damage: DAMAGE[key] };
      }
      return { ...(await base.fire(id, key)), damage: DAMAGE[key] };
    },
    packHref,
  };
}

function packSource(): PackSource {
  return {
    async pack({ id, key }: PackRef) {
      await wait(WAIT_MS);
      const d = fixture.detail[id];
      const summary = d?.fires.find((f) => f.key === key);
      if (!summary) return null;
      return {
        ...summary,
        hotspots: fireHotspots(d.hotspots.map((h) => enrich(h, false)), key),
        damage: DAMAGE[key],
        as_of_unix: PACK_AS_OF,
        concession_id: id,
        province: d.province,
        boundary: d.boundary,
        map_version: fixture.map_version,
        rule_version: 1,
      };
    },
    contracts: { records: CONTRACT, runs: FIRE_RUNS },
    async sealsOf(records) {
      await wait(WAIT_MS * 2);
      return records.map(chainSeal);
    },
    fingerprint: fingerprintOf,
  };
}

/** The pack the link names, as the fire view makes it, else the state's own fire. */
function packRef(state: State): PackRef {
  const params = new URLSearchParams(location.search);
  const id = params.get("pack");
  const key = params.get("fire") as Hex | null;
  const named = id && key && DAMAGE[key] ? { id, key } : null;
  return { ...(named ?? (state === "stillPack" ? FIRES.still : FIRES.outside)), asOf: PACK_AS_OF };
}

function initialView(state: State): View {
  if (state === "offPeat") return { kind: "fire", id: C0377, key: B_FIRE.key };
  if (state === "still" || state === "largest") return { kind: "fire", ...FIRES[state] };
  return { kind: "fire", ...FIRES.outside };
}

export default function DamageEstimatePreview() {
  const [state, setState] = useState<State>(() => param("state", STATES, "peat"));
  const [theme, setTheme] = useState<Theme>(() => param("theme", THEMES, "system"));
  const fires = useMemo(() => fireSource(), []);
  const packs = useMemo(() => packSource(), []);
  const ref = useMemo(() => packRef(state), [state]);
  const inPack = state === "pack" || state === "stillPack";

  useEffect(() => syncPreview(state, theme), [state, theme]);

  return (
    <div className="preview">
      <div className="preview-bar">
        <p className="fw-help">
          Preview of damage-estimate. Real FIRMS detections from 12 to 15 Oct 2026, with each fire's ground worked out
          from them and WRI's peat map. Seals, transactions and forecasts are made up.
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
      {inPack ? (
        <ComplaintPack key={`${state}-${theme}`} source={packs} packRef={ref} />
      ) : (
        <FireRecordPage
          key={`${state}-${theme}`}
          source={fires}
          today={fixture.today}
          initialView={initialView(state)}
          initialDates={{ from: fixture.from, to: fixture.to }}
          now={AS_OF}
        />
      )}
    </div>
  );
}
