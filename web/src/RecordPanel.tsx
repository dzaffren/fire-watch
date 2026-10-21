import type { ReactNode } from "react";
import type { Hex } from "viem";
import type { HotspotRecord } from "./api";
import { confidence, count, detected, firePower, gap, location, plural, satellite, shortHash, whereFromEdge } from "./format";
import { AlertIcon, BadIcon, CheckingIcon, ExternalIcon, OkIcon, PendingIcon } from "./icons";

export type Check =
  | { state: "pending" }
  | { state: "checking" }
  | { state: "matches" }
  | { state: "mismatch"; sealed: Hex }
  | { state: "error" };

const STATUS: Record<Exclude<Check["state"], "error">, { chip: string; icon: ReactNode; label: string; note: string }> = {
  pending: {
    chip: "fw-chip--pending",
    icon: <PendingIcon />,
    label: "Not on chain yet",
    note: "This record is stored but not sealed on the chain yet, so it can't be checked.",
  },
  checking: {
    chip: "fw-chip--checking",
    icon: <CheckingIcon />,
    label: "Checking",
    note: "Comparing the stored record with the chain.",
  },
  matches: {
    chip: "fw-chip--ok",
    icon: <OkIcon />,
    label: "Matches the chain",
    note: "The stored record is exactly what was sealed on Base Sepolia.",
  },
  mismatch: {
    chip: "fw-chip--bad",
    icon: <BadIcon />,
    label: "Does not match the chain",
    note: "The stored record has changed since it was sealed. The chain still holds the original fingerprint.",
  },
};

/** The headline count: how many of the pack's detections match their seals. */
export function checkTitle(checks: Check[]): string {
  const n = checks.length;
  const tally = (state: Check["state"]) => checks.filter((c) => c.state === state).length;
  const [matches, mismatch, pending, checking, failed] = (["matches", "mismatch", "pending", "checking", "error"] as const).map(tally);
  if (checking) return `Checking ${plural(n, "detection", "detections")} against the chain`;
  if (failed) return `Couldn't check ${count(failed)} of ${plural(n, "detection", "detections")}`;
  let title = `${count(matches)} of ${plural(n, "detection", "detections")} ${matches === 1 ? "matches" : "match"} the chain`;
  if (mismatch) title += `. ${count(mismatch)} ${mismatch === 1 ? "does" : "do"} not.`;
  if (pending) title += `${mismatch ? "" : "."} ${count(pending)} ${pending === 1 ? "is" : "are"} not on the chain yet.`;
  return title;
}

export function overall(checks: Check[]): Check {
  for (const state of ["checking", "error", "mismatch", "pending"] as const) {
    const found = checks.find((c) => c.state === state);
    if (found) return found;
  }
  return { state: "matches" };
}

/** A record's check in a list: the status label alone, or "Couldn't check". */
export function Chip({ check }: { check: Check }) {
  if (check.state === "error") return <span className="none">Couldn't check</span>;
  const { chip, icon, label } = STATUS[check.state];
  return (
    <span className={`fw-chip ${chip}`}>
      {icon}
      {label}
    </span>
  );
}

const shortFingerprint = (fp: Hex) => shortHash(fp.slice(2), 10, 6);

interface Props {
  record: HotspotRecord;
  fingerprint: Hex;
  check: Check;
  onCheckAgain: () => void;
}

export function RecordPanel({ record, fingerprint, check, onCheckAgain }: Props) {
  const status = check.state === "error" ? null : STATUS[check.state];
  const tx = record.tx_hash;

  return (
    <article className="fw-panel rec enter" aria-labelledby="h-rec">
      <div className="rec-head">
        <h2 id="h-rec">Hotspot record</h2>
        {status && (
          <span key={check.state} className={`fw-chip ${status.chip} enter`}>
            {status.icon}
            {status.label}
          </span>
        )}
      </div>
      {status ? (
        <p key={check.state} className="fw-help rec-note enter">{status.note}</p>
      ) : (
        <div className="rec-act enter">
          <p className="fw-help rec-note">Couldn't reach Base Sepolia to check this record.</p>
          <button className="fw-btn" type="button" onClick={onCheckAgain}>Check again</button>
        </div>
      )}
      <dl className="fw-kv">
        <dt>Detected</dt>
        <dd>{detected(record.acquired_unix)}</dd>
        {record.sealed_at && (
          <>
            <dt>Sealed</dt>
            <dd>
              {detected(Date.parse(record.sealed_at) / 1000)}
              <span className="sub">{gap(record.acquired_unix, record.sealed_at)} after detection</span>
            </dd>
          </>
        )}
        <dt>Satellite</dt>
        <dd>{satellite(record.source)}</dd>
        <dt>Location</dt>
        <dd className="fw-mono">{location(record.lat_e5, record.lon_e5)}</dd>
        <dt>Fire power</dt>
        <dd>{firePower(record.frp_e2)}</dd>
        <dt>Confidence</dt>
        <dd>{confidence(record.confidence)}</dd>
        <dt>{record.concessions.length > 1 ? "Concessions" : "Concession"}</dt>
        <dd>
          <ul className="matches">
            {record.concessions.map((m) => (
              <li key={m.id}>
                {m.id}
                <span className="sub">{whereFromEdge(m)}</span>
              </li>
            ))}
          </ul>
        </dd>
        <dt>Boundaries</dt>
        <dd>{record.map_version}</dd>
        {check.state === "mismatch" ? (
          <>
            <dt>Sealed fingerprint</dt>
            <dd className="fw-mono">{shortFingerprint(check.sealed)}</dd>
            <dt>Fingerprint now</dt>
            <dd className="fw-mono">{shortFingerprint(fingerprint)}</dd>
          </>
        ) : (
          <>
            <dt>Fingerprint</dt>
            <dd className="fw-mono">{shortFingerprint(fingerprint)}</dd>
          </>
        )}
        <dt>Transaction</dt>
        <dd>
          {tx ? (
            <a
              className="fw-link fw-mono"
              href={`https://sepolia.basescan.org/tx/${tx}`}
              target="_blank"
              rel="noopener"
              aria-label={`View transaction ${shortHash(tx, 6, 4)} on Basescan`}
            >
              {shortHash(tx, 10, 6)}
              <ExternalIcon />
            </a>
          ) : (
            <span className="none">Not sent yet</span>
          )}
        </dd>
      </dl>
      <details>
        <summary>Show the raw record</summary>
        <pre>{JSON.stringify(record, null, 2)}</pre>
        <p className="fw-help">
          Fingerprint of this record: <span className="fw-mono">{fingerprint.slice(2)}</span>
        </p>
      </details>
    </article>
  );
}

const SKELETON_WIDTHS = [70, 55, 80, 40, 45, 85, 75];

export function LoadingPanel() {
  return (
    <div className="fw-panel" aria-busy="true" aria-label="Loading the record">
      <div className="sk-head">
        <div className="fw-skeleton" style={{ width: "45%" }} />
      </div>
      <div className="fw-skeleton" style={{ width: "85%" }} />
      <div className="sk-rows">
        {SKELETON_WIDTHS.map((w, i) => (
          <SkeletonRow key={i} width={w} />
        ))}
      </div>
    </div>
  );
}

function SkeletonRow({ width }: { width: number }) {
  return (
    <>
      <div className="fw-skeleton" />
      <div className="fw-skeleton" style={{ width: `${width}%` }} />
    </>
  );
}

export function LoadErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="fw-panel fw-empty enter">
      <AlertIcon />
      <h3>Couldn't load the record</h3>
      <p className="fw-help">The server didn't answer. Try again in a moment.</p>
      <button className="fw-btn" type="button" onClick={onRetry}>Try again</button>
    </div>
  );
}
