import { useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import type { ConcessionDetail, FireDetail, JoinedFire, PackDetail } from "../api";
import { ComplaintPack, type PackSource } from "../ComplaintPack";
import { FireRecordPage, type FireRecordSource } from "../FireRecordPage";
import { fingerprint } from "../fingerprint";
import { Landing } from "../Landing";
import type { CaseSource } from "../RealCase";
import { checkOf } from "../RecordPanel";
import { chainSeal, enrich, fingerprintOf, FIRE_RUNS, FIRES, fireHotspots, fixture, never, param, syncPreview, THEMES, wait, WAIT_MS, type Theme } from "./fixture";
import "./preview.css";

// The landing's example fire from its committed pack, cut at 17 Oct 2026 09:00 UTC (D85), with the two facts this
// slice adds, worked out from the live record on 22 Oct. Seals stand in: each record's seal is its own fingerprint.

const CONTRACT: Hex = "0x6a55489a05a9c79d2cd35212878d113557dceb2a";
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;

// As the pack stands: one detection on 12 Oct 05:16, the next pass 25.35 hours later, and one join on 14 Oct.
export const AS_PACKED: Pick<FireDetail, "first_alone_h" | "joined"> = {
  first_alone_h: 25,
  joined: [{ at_unix: at("2026-10-14T17:20"), first_seen_unix: at("2026-10-13T06:37"), first_seen: { reading: "both", inside: false, edge_m: 2 } }],
};

// The same fire on 22 Oct 05:27 UTC: 869 detections on 19 passes, 7 fires joined to it.
export const LIVE_JOINED: JoinedFire[] = [
  ["2026-10-14T17:20", "2026-10-13T06:37", "both", false, 2],
  ["2026-10-17T18:04", "2026-10-17T05:23", "outside", false, 2576],
  ["2026-10-18T06:44", "2026-10-17T18:04", "outside", false, 4456],
  ["2026-10-18T17:45", "2026-10-16T18:21", "both", true, 35],
  ["2026-10-18T17:45", "2026-10-16T18:21", "both", true, 27],
  ["2026-10-22T05:27", "2026-10-18T17:45", "outside", false, 1340],
  ["2026-10-22T05:27", "2026-10-21T18:30", "outside", false, 627],
].map(([joined, first, reading, inside, edge_m]) => ({
  at_unix: at(joined as string),
  first_seen_unix: at(first as string),
  first_seen: { reading: reading as JoinedFire["first_seen"]["reading"], inside: inside as boolean, edge_m: edge_m as number },
}));

const STATES = {
  fire: "1–2. 0332's fire as its pack stands: one detection first, one join",
  fireLive: "2. The same notes for the 7 fires joined to it by 22 Oct (detections as of 17 Oct)",
  firm: "3. 0356's fire: one detection, seen again 11 h later, no note",
  pack: "4. 0332's pack: both notes on top",
  packLive: "4. The pack with the 7 fires joined by 22 Oct, listed under Basis",
  landing: "5. The landing tells 0332's fire as the record shows it",
} as const;
type State = keyof typeof STATES;

const committed = () =>
  fetch(`${import.meta.env.BASE_URL}case/pack-0332.json`).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json() as Promise<PackDetail>;
  });

async function examplePack(state: State): Promise<PackDetail> {
  const pack = await committed();
  const live = state === "fireLive" || state === "packLive";
  return { ...pack, ...AS_PACKED, ...(live && { joined: LIVE_JOINED }) };
}

function fireSource(state: State): FireRecordSource {
  async function fire(id: string, key: Hex): Promise<FireDetail> {
    await wait(WAIT_MS);
    if (key === FIRES.largest.key) return examplePack(state);
    const d = fixture.detail[id];
    const summary = d.fires.find((f) => f.key === key)!;
    return { ...summary, hotspots: fireHotspots(d.hotspots.map((h) => enrich(h, false)), key), as_of_unix: at("2026-10-17T09:00") };
  }
  return {
    concessions: never,
    async concession(id): Promise<ConcessionDetail> {
      const d = fixture.detail[id];
      if (id !== FIRES.largest.id) return { ...d, hotspots: d.hotspots.map((h) => enrich(h, false)) };
      const pack = await examplePack(state);
      const hotspots = pack.hotspots.map((h) => ({ ...h, fire_key: pack.key }));
      return { ...d, boundary: pack.boundary, hotspots, fires: [pack] };
    },
    fire,
    packHref: () => "/?preview=origin-confidence&state=pack",
    sealOf: async (record) => chainSeal(record),
    fingerprint: fingerprintOf,
  };
}

function packSource(state: State): PackSource {
  return {
    pack: async () => {
      await wait(WAIT_MS);
      return examplePack(state);
    },
    contracts: { records: CONTRACT, runs: FIRE_RUNS },
    sealsOf: async (records) => {
      await wait(WAIT_MS * 2);
      return records.map(chainSeal);
    },
    fingerprint: fingerprintOf,
  };
}

const caseSource = (state: State): CaseSource => ({
  pack: () => examplePack(state),
  check: async (records) => {
    await wait(WAIT_MS * 3);
    return records.map((r) => checkOf(fingerprint(r), fingerprint(r)));
  },
});

function Shown({ state }: { state: State }) {
  const fires = useMemo(() => fireSource(state), [state]);
  const packs = useMemo(() => packSource(state), [state]);
  const story = useMemo(() => caseSource(state), [state]);
  if (state === "landing") return <Landing caseSource={story} />;
  if (state === "pack" || state === "packLive") {
    return <ComplaintPack source={packs} packRef={{ ...FIRES.largest, asOf: at("2026-10-17T09:00") }} initialOpen={null} />;
  }
  const view = state === "firm" ? FIRES.inside : FIRES.largest;
  return (
    <FireRecordPage
      source={fires}
      today="2026-10-17"
      initialView={{ kind: "fire", ...view }}
      initialDates={{ from: "2026-10-12", to: "2026-10-17" }}
    />
  );
}

export default function OriginConfidencePreview() {
  const [state, setState] = useState<State>(() => param("state", STATES, "fire"));
  const [theme, setTheme] = useState<Theme>(() => param("theme", THEMES, "system"));

  useEffect(() => syncPreview(state, theme), [state, theme]);

  return (
    <div className={state === "landing" ? "preview preview--page" : "preview"}>
      <div className="preview-bar">
        <p className="fw-help">
          Preview of origin-confidence. The 0332 fire is the landing's committed pack; 0356's is fire-origin's fixture.
          Seals stand in, so every record matches.
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
      <Shown key={`${state}-${theme}`} state={state} />
    </div>
  );
}
