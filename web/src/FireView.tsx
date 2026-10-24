import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { FireDetail, HotspotRecord, JoinedFire } from "./api";
import { DamagePanel } from "./Damage";
import type { Dot } from "./FireMap";
import type { Area } from "./maps";
import { count, detected, detectedShort, distance, firePower, firstSeenLine, firstSeenShort, plural, seenWhere } from "./format";
import { AlertIcon, ChevronLeftIcon, ExternalIcon, PauseIcon, PlayIcon } from "./icons";
import { sideJoin } from "./sameFire";

export type FireLoad = { kind: "loading" } | { kind: "error" } | { kind: "ready"; fire: FireDetail };

const PAGE = 100;
// Older to newer, as on the detections guideline: this pass, the one before, the rest.
const AGE_ALPHA = [1, 0.65, 0.3];

/** The fire's detections up to `at` for the map, faded by pass, the first pass marked. */
export function fireDots(hotspots: HotspotRecord[], at: number): { dots: Dot[]; index: number[] } {
  const dots: Dot[] = [];
  const index: number[] = [];
  hotspots.forEach((h, i) => {
    const pass = h.pass ?? 1;
    if (pass > at) return;
    dots.push({ ...h, alpha: AGE_ALPHA[Math.min(at - pass, 2)], first: pass === 1 });
    index.push(i);
  });
  return { dots, index };
}

/** Each pass's time, from its first detection. */
export const passTimes = (hotspots: HotspotRecord[]) => {
  const times: number[] = [];
  for (const h of hotspots) times[(h.pass ?? 1) - 1] ??= h.acquired_unix;
  return times;
};

// About 1 km around a fire's detections, so the nearby edge shows.
const FIRE_PAD_DEG = 0.01;

/** The map area that frames a fire's detections. */
export function fireArea(hotspots: HotspotRecord[]): Area {
  const lats = hotspots.map((h) => h.lat_e5 / 1e5);
  const lons = hotspots.map((h) => h.lon_e5 / 1e5);
  return {
    west: Math.min(...lons) - FIRE_PAD_DEG,
    east: Math.max(...lons) + FIRE_PAD_DEG,
    south: Math.min(...lats) - FIRE_PAD_DEG,
    north: Math.max(...lats) + FIRE_PAD_DEG,
  };
}

/** "Outside, 950 m": where one detection sits against the concession's edge. */
export function where(h: HotspotRecord, id: string): string {
  const m = h.concessions.find((c) => c.id === id);
  return m ? `${m.inside ? "Inside" : "Outside"}, ${distance(m.edge_m)}` : "";
}

/** What weakens where a fire was first seen: one detection with a long gap after it (D112), and
 *  fires joined to it as it grew (D114). `listed` says where more than one joined fire is listed. */
export function OriginNotes({ fire, listed }: { fire: FireDetail; listed: string }) {
  const hours = fire.first_alone_h;
  const joined = fire.joined ?? [];
  return (
    <>
      {hours != null && (
        <p className="fw-help">
          The satellite didn't see this fire again for {plural(hours, "hour", "hours")}, so that detection may be a
          separate fire.
        </p>
      )}
      {joined.length === 1 && (
        <p className="fw-help">
          Fire Watch joined another fire to this one on {detectedShort(joined[0].at_unix)} UTC, when they came within 1
          km. First seen above is the older of the two. The other was first seen on{" "}
          {detectedShort(joined[0].first_seen_unix)} UTC, {seenWhere(joined[0].first_seen)}.
        </p>
      )}
      {joined.length > 1 && (
        <p className="fw-help">
          Fire Watch joined {count(joined.length)} other fires to this one, the first time on{" "}
          {detectedShort(joined[0].at_unix)} UTC, as they came within 1 km. First seen above is the oldest of them. They
          are listed {listed}.
        </p>
      )}
    </>
  );
}

/** What the satellite can miss, so any fire may have burned before it was first seen (D139). */
export const MISSED =
  "The satellite can miss fire under cloud, heavy smoke or thick tree canopy, and peat that smoulders with too little heat to show.";

/** The note every fire carries, after the notes on its own record. */
export function MissedNote() {
  return (
    <p className="fw-help">
      {MISSED} This fire may have burned unseen before it was first seen, inside or outside the concession.
    </p>
  );
}

/** When the fire was first seen on a side of the edge, naming the joined fire when it, not this one, was seen there
 *  first (D142). */
export function SideFrom({ fire, id, inside }: { fire: FireDetail; id: string; inside: boolean }) {
  const by = sideJoin(fire, id, inside);
  return (
    <>
      {detected((inside ? fire.inside_from_unix : fire.outside_from_unix)!)}
      {by && `, by the fire joined to this one on ${detectedShort(by.at_unix)} UTC`}
    </>
  );
}

/** The fires joined to this one: when, and where the satellite first saw each (D114). */
export function JoinedTable({ joined, labelledBy }: { joined: JoinedFire[]; labelledBy: string }) {
  return (
    <div className="table-box joined">
      <table className="fw-table" aria-labelledby={labelledBy}>
        <thead>
          <tr><th scope="col">Joined (UTC)</th><th scope="col">First seen (UTC)</th><th scope="col">Where first seen</th></tr>
        </thead>
        <tbody>
          {joined.map((j, i) => (
            <tr key={i}>
              <td>{detectedShort(j.at_unix)}</td>
              <td>{detectedShort(j.first_seen_unix)}</td>
              <td>{firstSeenShort(j.first_seen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// From the pinned FIRMS cut in fixtures/firms/archive/, which archive.test.ts holds these lines to (D141).
const BEFORE_RECORDS: Record<string, string> = {
  "0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7":
    "In NASA's FIRMS archive, NOAA-20 saw fire under 1 km from this fire's first detection on 11 Oct, also outside the concession.",
};

/** When Fire Watch's records begin, for a fire first seen within 48 hours of them, and any sighting in NASA's archive
 *  before them. */
export function RecordsBegin({ fire }: { fire: FireDetail }) {
  const hours = fire.recorded_before_h;
  if (hours === null) return null;
  const before = BEFORE_RECORDS[fire.key];
  return (
    <p className="fw-help">
      Fire Watch's records begin {hours < 1 ? "less than an hour" : plural(hours, "hour", "hours")} before this fire
      was first seen, so it may have been burning earlier. NASA's archive may hold detections from before then.
      {before && ` ${before}`}
    </p>
  );
}

/** How where a fire was first seen is worked out, and what that can't allow for (D25, D26, D115). */
export function OriginMethod() {
  return (
    <>
      <p className="fw-help">
        A detection joins a fire when it is within 1 km and 48 hours of one already in it. The first pass is the
        earliest NOAA-20 pass in Fire Watch's records that saw the fire. Other satellites, or NOAA-20 before the records
        begin, may have seen it earlier. A side is named only when every detection on that pass is more than 375 m from
        the edge, half the widest VIIRS pixel; nearer than that, the fire could be on either side.
      </p>
      <p className="fw-help">
        A fire that comes within 1 km of another is joined to it, so one fire here can be several that the satellite
        first saw apart. First seen is the oldest one's.
      </p>
      <p className="fw-help">
        A detection's position can be off as well. Straight below the satellite, NOAA-20 places almost every pixel
        within 400 m of where it belongs, and most within 200 m (Blonski and others, 2023, doi 10.1117/1.JRS.17.034506).
        A fire can also sit anywhere in its 375 m pixel. The 375 m margin allows for neither. Concession edges come from
        Trase's map, which gives no accuracy for its lines.
      </p>
      <p className="fw-help">
        NOAA-20 passes about twice a day, so a fire may burn for hours before it is first seen. NASA FIRMS names cloud,
        heavy smoke and tree canopy among the reasons a fire goes unseen. Smouldering peat is hard to see from space, as
        its heat is low and its area small (Sofan and others, 2019, doi 10.3390/rs11040465). Each detection is sealed:
        your browser checks each record Fire Watch sends against the chain, and a record matches a row of NASA FIRMS's
        public archive by its time and place.
      </p>
    </>
  );
}

interface Props {
  id: string;
  load: FireLoad;
  packHref: string | null;
  /** The fire's forecasts, between where it was first seen and its detections. */
  forecast?: ReactNode;
  picked: number | null;
  onBack: () => void;
  onPick: (index: number) => void;
  onRetry: () => void;
}

export function FireView({ id, load, packHref, forecast, picked, onBack, onPick, onRetry }: Props) {
  const [shown, setShown] = useState(() => (picked === null ? PAGE : Math.ceil((picked + 1) / PAGE) * PAGE));

  return (
    <div className="fire">
      <button className="fw-link back" type="button" onClick={onBack}>
        <ChevronLeftIcon />
        Fires in {id}
      </button>

      {load.kind === "error" && (
        <div className="fw-panel fw-empty enter">
          <AlertIcon />
          <h3>Couldn't load this fire</h3>
          <p className="fw-help">The server didn't answer. Try again in a moment.</p>
          <button className="fw-btn" type="button" onClick={onRetry}>Try again</button>
        </div>
      )}

      {load.kind === "loading" && (
        <div className="fw-panel" aria-busy="true" aria-label="Loading the fire">
          <div className="fw-skeleton" style={{ width: "80%", height: 18 }} />
          <div className="sk-rows">
            {[55, 55, 55, 40].map((w, i) => (
              <Fragment key={i}>
                <div className="fw-skeleton" />
                <div className="fw-skeleton" style={{ width: `${w}%` }} />
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {load.kind === "ready" && <Reading id={id} fire={load.fire} packHref={packHref} />}

      {load.kind === "ready" && <DamagePanel fire={load.fire} />}

      {load.kind === "ready" && forecast}

      {load.kind === "ready" && (
        <>
          <p className="fw-help list-note enter">
            {plural(load.fire.detections, "detection", "detections")}, oldest first. Pick one to check it against the
            chain.
          </p>
          <div className="table-box enter">
            <table className="fw-table">
              <thead>
                <tr><th scope="col">Detected (UTC)</th><th scope="col" className="num">Fire power</th><th scope="col">Where</th></tr>
              </thead>
              <tbody>
                {load.fire.hotspots.slice(0, shown).map((h, i) => (
                  <tr key={h.record_id} className="row-open" aria-selected={i === picked ? true : undefined}>
                    <td>
                      <button className="row-btn" type="button" onClick={() => onPick(i)}>
                        {detectedShort(h.acquired_unix)}
                      </button>
                    </td>
                    <td className="num">{firePower(h.frp_e2)}</td>
                    <td>{where(h, id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown < load.fire.hotspots.length && (
            <button className="fw-btn fw-btn--secondary more" type="button" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, load.fire.hotspots.length - shown)} more
              <span className="more-left">{count(load.fire.hotspots.length - shown)} not shown</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Reading({ id, fire, packHref }: { id: string; fire: FireDetail; packHref: string | null }) {
  const { reading } = fire.first_seen;
  const unclear = reading === "edge" || reading === "both";
  const showInside = fire.inside_from_unix !== null && (reading === "outside" || unclear);
  const showOutside = fire.outside_from_unix !== null && (reading === "inside" || unclear);
  const joined = fire.joined ?? [];

  return (
    <article className="fw-panel fire-reading enter" aria-labelledby="h-fire">
      <h2 id="h-fire">{firstSeenLine(fire.first_seen, fire.first_alone_h)}</h2>
      <div className="fire-notes">
        {unclear && <p className="fw-help">The satellite record can't say which side this fire started on.</p>}
        <OriginNotes fire={fire} listed="below" />
        {fire.never_spread && (
          <p className="fw-help">
            Seen on {count(fire.passes)} passes without spreading. This can be a fixed heat source, such as a mill, or
            peat smouldering in place.
          </p>
        )}
        <RecordsBegin fire={fire} />
        <MissedNote />
      </div>
      <dl className="fw-kv">
        <dt>Concession</dt>
        <dd>{id}</dd>
        <dt>First seen</dt>
        <dd>{detected(fire.first_seen_unix)}</dd>
        {showInside && (
          <>
            <dt>Seen inside from</dt>
            <dd>
              <SideFrom fire={fire} id={id} inside />
            </dd>
          </>
        )}
        {showOutside && (
          <>
            <dt>Seen outside from</dt>
            <dd>
              <SideFrom fire={fire} id={id} inside={false} />
            </dd>
          </>
        )}
        <dt>Last seen</dt>
        <dd>{detected(fire.last_seen_unix)}</dd>
        <dt>Passes</dt>
        <dd>{count(fire.passes)}, with {plural(fire.detections, "detection", "detections")}</dd>
      </dl>
      {joined.length > 1 && (
        <details>
          <summary id="h-joined">The {count(joined.length)} fires joined to this one</summary>
          <JoinedTable joined={joined} labelledBy="h-joined" />
        </details>
      )}
      <details>
        <summary>How this is worked out</summary>
        <OriginMethod />
      </details>
      {packHref && (
        <div className="pack-make">
          <a className="fw-btn" href={packHref} target="_blank" rel="noopener" aria-describedby="pack-make-help">
            Make complaint pack
            <ExternalIcon />
          </a>
          <p id="pack-make-help" className="fw-help">
            Opens this fire as it stands now on a page with its own link, to put in a grievance. Anyone with the link
            can check each record against the chain.
          </p>
        </div>
      )}
    </article>
  );
}

interface ReplayProps {
  times: number[];
  at: number;
  onChange: (at: number) => void;
}

/** The detections guideline's replay timeline: one satellite pass a step, every --fw-replay-step. */
export function Replay({ times, at, onChange }: ReplayProps) {
  const [playing, setPlaying] = useState(false);
  const last = times.length;

  useEffect(() => {
    if (!playing) return;
    if (at >= last) {
      setPlaying(false);
      return;
    }
    // The build's minifier writes 1500ms as 1.5s.
    const css = getComputedStyle(document.documentElement).getPropertyValue("--fw-replay-step");
    const step = parseFloat(css) * (/ms\s*$/.test(css) ? 1 : 1000) || 1500;
    const timer = setTimeout(() => onChange(at + 1), step);
    return () => clearTimeout(timer);
  }, [playing, at, last, onChange]);

  // One pass has nothing to replay; its first-seen diamonds are the whole fire.
  if (last < 2) return null;

  function toggle() {
    if (playing) return setPlaying(false);
    if (at >= last) onChange(1);
    setPlaying(true);
  }

  const label = `Pass ${at} of ${last}`;
  const text = (pass: number) => `Pass ${pass} of ${last} · ${detectedShort(times[pass - 1])} UTC`;
  // Monospaced, so the widest pass's character count holds the track still as the label changes.
  const widest = Math.max(...times.map((_, i) => text(i + 1).length));
  return (
    <div className="fw-panel replay">
      <button
        className="fw-btn fw-btn--secondary replay-play"
        type="button"
        aria-label={playing ? "Pause the spread" : "Play the spread, pass by pass"}
        onClick={toggle}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <input
        className="replay-track"
        type="range"
        min={1}
        max={last}
        step={1}
        value={at}
        aria-label="Satellite pass"
        aria-valuetext={`${label}, ${detected(times[at - 1])}`}
        style={{ "--fill": `${((at - 1) / (last - 1)) * 100}%` } as CSSProperties}
        onChange={(e) => {
          setPlaying(false);
          onChange(Number(e.target.value));
        }}
      />
      <span className="fw-mono replay-at" style={{ minWidth: `${widest}ch` }}>
        {text(at)}
      </span>
    </div>
  );
}
