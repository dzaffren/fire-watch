import type { ConcessionListing } from "./api";
import { count } from "./format";
import { AlertIcon, CalendarIcon } from "./icons";

export type ListLoad = { kind: "loading" } | { kind: "error" } | ({ kind: "ready" } & ConcessionListing);

interface Props {
  load: ListLoad;
  slow: boolean;
  from: string;
  to: string;
  onOpen: (id: string) => void;
  onRetry: () => void;
}

const SKELETON_ROWS = [62, 48, 70, 55, 66, 44];

export function ConcessionList({ load, slow, from, to, onOpen, onRetry }: Props) {
  if (load.kind === "error") {
    return (
      <div className="fw-panel fw-empty enter">
        <AlertIcon />
        <h3>Couldn't load the concessions</h3>
        <p className="fw-help">The server didn't answer. Try again in a moment.</p>
        <button className="fw-btn" type="button" onClick={onRetry}>Try again</button>
      </div>
    );
  }

  if (load.kind === "loading") {
    return (
      <>
        <div className="table-box" aria-busy="true" aria-label="Loading the concessions">
          <table className="fw-table">
            <thead>
              <tr><th scope="col">Concession</th><th scope="col" className="num">Inside</th><th scope="col" className="num">Within 5 km</th></tr>
            </thead>
            <tbody>
              {SKELETON_ROWS.map((w, i) => (
                <tr key={i}>
                  <td><div className="fw-skeleton" style={{ width: `${w}%` }} /><div className="fw-skeleton sk-sub" /></td>
                  <td><div className="fw-skeleton sk-num" /></td>
                  <td><div className="fw-skeleton sk-num" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {slow && (
          <p className="fw-help rec-note" role="status">
            Starting the server after a quiet spell. This can take up to a minute; the list loads on its own.
          </p>
        )}
      </>
    );
  }

  if (load.concessions.length === 0) {
    return (
      <div className="fw-panel fw-empty enter">
        <CalendarIcon />
        <h3>No hotspots in these dates</h3>
        <p className="fw-help">No hotspots on or near a pulpwood concession between {from} and {to}.</p>
        {load.recording_started && <p className="fw-help">Recording started {load.recording_started}.</p>}
      </div>
    );
  }

  return (
    <div className="list enter">
      <p className="fw-help list-note">
        {count(load.concessions.length)} concessions, ranked by hotspots inside.
      </p>
      <div className="table-box">
        <table className="fw-table">
          <thead>
            <tr><th scope="col">Concession</th><th scope="col" className="num">Inside</th><th scope="col" className="num">Within 5 km</th></tr>
          </thead>
          <tbody>
            {load.concessions.map((c) => (
              <tr key={c.id} className="row-open">
                <td>
                  <button className="row-btn" type="button" onClick={() => onOpen(c.id)}>
                    <span className="cid">{c.id}</span>
                    <span className="sub">{c.province}</span>
                  </button>
                </td>
                <td className="num">{count(c.inside)}</td>
                <td className="num">{count(c.near)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
