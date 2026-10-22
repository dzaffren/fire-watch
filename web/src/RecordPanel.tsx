import type { ReactNode } from "react";
import { zeroHash, type Hex } from "viem";
import type { HotspotRecord } from "./api";
import type { Seal } from "./chain";
import { confidence, count, detected, firePower, gap, location, plural, satellite, shortHash, whereFromEdge } from "./format";
import { AlertIcon, BadIcon, CheckingIcon, ExternalIcon, OkIcon, PendingIcon } from "./icons";
import { leaf, rootFrom } from "./merkle";

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

const RUN_MISMATCH_NOTE = "The stored record has changed since its run was sealed. The chain still holds the run's original root.";

/** One record's check from its seal: zero is not on the chain yet, its own fingerprint matches, anything else changed. */
export const checkOf = (sealed: Hex, fingerprint: Hex): Check =>
  sealed === zeroHash ? { state: "pending" } : sealed === fingerprint ? { state: "matches" } : { state: "mismatch", sealed };

/** Where a record is sealed: in a seal of its own on FireRecords, or under its run's root on FireRuns. */
export type SealedIn = { contract: "FireRecords" } | { contract: "FireRuns"; run: number };

/** A record's check, with its seal's time by the chain's clock and where it is sealed; both null
 *  until the chain answers with a seal (D97). */
export interface SealCheck {
  check: Check;
  sealedAt: number | null;
  sealedIn: SealedIn | null;
}

/** A detection or a forecast; the API sends a proof only for one in a sealed run's root. */
interface Sealable {
  record_id: Hex;
  run?: number | null;
  proof?: readonly Hex[] | null;
}

/** The root that a record's fingerprint and its proof lead to (D108). */
const runRootOf = (record: Sealable, fingerprint: Hex) => rootFrom(leaf(record.record_id, fingerprint), record.proof ?? []);

const NOT_YET: SealCheck = { check: { state: "pending" }, sealedAt: null, sealedIn: null };

/** One record's check from its seal: on FireRecords its own fingerprint, on FireRuns the root its
 *  fingerprint and proof lead to, must equal what the chain holds. A zero is not on the chain yet. */
export function checkSeal(seal: Seal, record: Sealable, fingerprint: Hex): SealCheck {
  if (seal.contract === "FireRecords") {
    const check = checkOf(seal.fingerprint, fingerprint);
    return check.state === "pending" ? NOT_YET : { check, sealedAt: seal.sealedAt, sealedIn: { contract: "FireRecords" } };
  }
  if (seal.root === zeroHash) return NOT_YET;
  const check: Check = runRootOf(record, fingerprint) === seal.root ? { state: "matches" } : { state: "mismatch", sealed: seal.root };
  return { check, sealedAt: seal.sealedAt, sealedIn: { contract: "FireRuns", run: seal.run } };
}

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

const sealedInLine = (s: SealedIn) => (s.contract === "FireRecords" ? "FireRecords, in a seal of its own" : `FireRuns, run ${s.run}'s root`);

interface SealRowsProps {
  record: Sealable;
  fingerprint?: Hex;
  check: Check;
  sealedIn: SealedIn | null;
}

/** A record's fingerprint rows, then where it is sealed once the chain answers. On a mismatch, a
 *  record in a run's root shows its run's root on the chain and the root its proof leads to now. */
export function SealRows({ record, fingerprint, check, sealedIn }: SealRowsProps) {
  return (
    <>
      {check.state === "mismatch" && sealedIn?.contract === "FireRuns" ? (
        <>
          <dt>Fingerprint now</dt>
          <dd className="fw-mono">{fingerprint && shortFingerprint(fingerprint)}</dd>
          <dt>Run root on chain</dt>
          <dd className="fw-mono">{shortFingerprint(check.sealed)}</dd>
          <dt>Run root now</dt>
          <dd className="fw-mono">{fingerprint && shortFingerprint(runRootOf(record, fingerprint))}</dd>
        </>
      ) : check.state === "mismatch" ? (
        <>
          <dt>Sealed fingerprint</dt>
          <dd className="fw-mono">{shortFingerprint(check.sealed)}</dd>
          <dt>Fingerprint now</dt>
          <dd className="fw-mono">{fingerprint && shortFingerprint(fingerprint)}</dd>
        </>
      ) : (
        <>
          <dt>Fingerprint</dt>
          <dd className="fw-mono">{fingerprint && shortFingerprint(fingerprint)}</dd>
        </>
      )}
      {sealedIn && (
        <>
          <dt>Sealed in</dt>
          <dd>{sealedInLine(sealedIn)}</dd>
        </>
      )}
    </>
  );
}

interface Props {
  record: HotspotRecord;
  fingerprint: Hex;
  check: Check;
  /** Unix seconds by the chain's clock; null until the chain answers with a seal (D97). */
  sealedAt: number | null;
  sealedIn: SealedIn | null;
  onCheckAgain: () => void;
}

export function RecordPanel({ record, fingerprint, check, sealedAt, sealedIn, onCheckAgain }: Props) {
  const status = check.state === "error" ? null : STATUS[check.state];
  const note = check.state === "mismatch" && sealedIn?.contract === "FireRuns" ? RUN_MISMATCH_NOTE : status?.note;
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
        <p key={check.state} className="fw-help rec-note enter">{note}</p>
      ) : (
        <div className="rec-act enter">
          <p className="fw-help rec-note">Couldn't reach Base Sepolia to check this record.</p>
          <button className="fw-btn" type="button" onClick={onCheckAgain}>Check again</button>
        </div>
      )}
      <dl className="fw-kv">
        <dt>Detected</dt>
        <dd>{detected(record.acquired_unix)}</dd>
        {sealedAt !== null && (
          <>
            <dt>Sealed</dt>
            <dd>
              {detected(sealedAt)}
              <span className="sub">{gap(record.acquired_unix, new Date(sealedAt * 1000).toISOString())} after detection</span>
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
        <SealRows record={record} fingerprint={fingerprint} check={check} sealedIn={sealedIn} />
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
          {record.run != null && (
            <>
              . Run {record.run}'s root, worked out from it and the{" "}
              {plural(record.proof?.length ?? 0, "proof hash", "proof hashes")} above:{" "}
              <span className="fw-mono">{runRootOf(record, fingerprint).slice(2)}</span>
            </>
          )}
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
