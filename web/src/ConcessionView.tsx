import { Fragment, useState } from "react";
import type { ConcessionDetail } from "./api";
import { count, detectedShort, distance, firePower } from "./format";
import { AlertIcon, ChevronLeftIcon } from "./icons";

export type DetailLoad = { kind: "loading" } | { kind: "error" } | { kind: "ready"; detail: ConcessionDetail };

const PAGE = 100;

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
  // Keep the picked hotspot's row on screen when coming back from its record.
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
            {[50, 35, 60, 80].map((w, i) => (
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
            <dt>Boundaries</dt>
            <dd>{mapVersion}</dd>
          </dl>
          <div className="table-box enter">
            <table className="fw-table">
              <thead>
                <tr><th scope="col">Detected (UTC)</th><th scope="col" className="num">Fire power</th><th scope="col">Where</th></tr>
              </thead>
              <tbody>
                {load.detail.hotspots.slice(0, shown).map((h, i) => {
                  const match = h.concessions.find((m) => m.id === id);
                  return (
                    <tr key={h.record_id} className="row-open" aria-selected={i === picked ? true : undefined}>
                      <td>
                        <button className="row-btn" type="button" onClick={() => onPick(i)}>
                          {detectedShort(h.acquired_unix)}
                        </button>
                      </td>
                      <td className="num">{firePower(h.frp_e2)}</td>
                      <td>{match && `${match.inside ? "Inside" : "Outside"}, ${distance(match.edge_m)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {shown < load.detail.hotspots.length && (
            <button className="fw-btn fw-btn--secondary more" type="button" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, load.detail.hotspots.length - shown)} more
              <span className="more-left">{count(load.detail.hotspots.length - shown)} not shown</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
