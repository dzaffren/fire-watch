import type { ReactNode } from "react";
import type { Hex } from "viem";
import type { HotspotRecord } from "./api";
import { confidence, detected, firePower, gap, location, satellite, shortHash, whereFromEdge } from "./format";
import { AlertIcon, BadIcon, CheckingIcon, ExternalIcon, OkIcon, PendingIcon, PinIcon } from "./icons";

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
        {record.concessions && record.sealed_at && (
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
        {record.concessions && (
          <>
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
          </>
        )}
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

export function LoadingPanel({ slow }: { slow: boolean }) {
  return (
    <>
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
      {slow && (
        <p className="fw-help rec-note" role="status">
          Starting the server after a quiet spell. This can take up to a minute; the record loads on its own.
        </p>
      )}
    </>
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

export function EmptyPanel() {
  return (
    <div className="fw-panel fw-empty enter">
      <PinIcon />
      <h3>No hotspot recorded yet</h3>
      <p className="fw-help">The newest hotspot appears here once it is recorded and sealed.</p>
    </div>
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
