import { Fragment, useState } from "react";
import type { ConcessionDetail, FireSummary } from "./api";
import { count, detectedShort, distance, firstSeenShort, plural } from "./format";
import { AlertIcon, ChevronLeftIcon } from "./icons";

export type DetailLoad = { kind: "loading" } | { kind: "error" } | { kind: "ready"; detail: ConcessionDetail };

const PAGE = 100;

/** Under the fires table's "Where first seen": when it was first clearly on the other side. */
function whereNext(fire: FireSummary): string | null {
  const { reading, inside, edge_m } = fire.first_seen;
  if (reading === "outside" && fire.inside_from_unix) return `Inside from ${detectedShort(fire.inside_from_unix)}`;
  if (reading === "inside" && fire.outside_from_unix) return `Outside from ${detectedShort(fire.outside_from_unix)}`;
  if (reading === "edge") return `${distance(edge_m)} ${inside ? "inside" : "outside"} the edge`;
  if (fire.never_spread) return "Never spread";
  return null;
}

interface Props {
  id: string;
  load: DetailLoad;
  mapVersion: string;
  picked: number | null;
  onBack: () => void;
  onPick: (index: number) => void;
  onRetry: () => void;
}

export function ConcessionView({ id, load, mapVersion, picked, onBack, onPick, onRetry }: Props) {
  // Keep the picked fire's row on screen when coming back from it.
  const [shown, setShown] = useState(() => (picked === null ? PAGE : Math.ceil((picked + 1) / PAGE) * PAGE));

  return (
    <div className="concession">
      <button className="fw-link back" type="button" onClick={onBack}>
        <ChevronLeftIcon />
        All concessions
      </button>
      <h2 className="concession-id">{id}</h2>

      {load.kind === "error" && (
        <div className="fw-panel fw-empty enter">
          <AlertIcon />
          <h3>Couldn't load this concession</h3>
          <p className="fw-help">The server didn't answer. Try again in a moment.</p>
          <button className="fw-btn" type="button" onClick={onRetry}>Try again</button>
        </div>
      )}

      {load.kind === "loading" && (
        <div className="fw-panel" aria-busy="true" aria-label="Loading the concession">
          <div className="sk-rows">
            {[50, 35, 60, 80, 45].map((w, i) => (
              <Fragment key={i}>
                <div className="fw-skeleton" />
                <div className="fw-skeleton" style={{ width: `${w}%` }} />
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {load.kind === "ready" && (
        <>
          <dl className="fw-kv enter">
            <dt>Province</dt>
            <dd>{load.detail.province}</dd>
            <dt>Area</dt>
            <dd>{count(load.detail.area_ha)} ha</dd>
            <dt>Hotspots</dt>
            <dd>{count(load.detail.inside)} inside, {count(load.detail.near)} within 5 km</dd>
            <dt>Fires</dt>
            <dd>{count(load.detail.fires.length)}</dd>
            <dt>Boundaries</dt>
            <dd>{mapVersion}</dd>
          </dl>
          <p className="fw-help list-note enter">
            Detections within 1 km and 48 hours of each other count as one fire. Newest first.
          </p>
          <div className="table-box enter">
            <table className="fw-table">
              <thead>
                <tr><th scope="col">First seen (UTC)</th><th scope="col">Where first seen</th></tr>
              </thead>
              <tbody>
                {load.detail.fires.slice(0, shown).map((f, i) => {
                  const next = whereNext(f);
                  return (
                    <tr key={f.key} className="row-open" aria-selected={i === picked ? true : undefined}>
                      <td>
                        <button className="row-btn" type="button" onClick={() => onPick(i)}>
                          {detectedShort(f.first_seen_unix)}
                          <span className="sub">
                            {plural(f.passes, "pass", "passes")}, {plural(f.detections, "detection", "detections")}
                          </span>
                        </button>
                      </td>
                      <td>
                        {firstSeenShort(f.first_seen)}
                        {next && <span className="sub">{next}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {shown < load.detail.fires.length && (
            <button className="fw-btn fw-btn--secondary more" type="button" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, load.detail.fires.length - shown)} more
              <span className="more-left">{count(load.detail.fires.length - shown)} not shown</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
