import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Hex } from "viem";
import type { HotspotRecord, PackDetail, PackRef } from "./api";
import type { Seal } from "./chain";
import { DamageSection } from "./Damage";
import { FireMap } from "./FireMap";
import { fireArea, fireDots, passTimes, Replay, where } from "./FireView";
import { count, detected, detectedShort, distance, firstSeenLine, location, plural, shortHash } from "./format";
import { AlertIcon, ExternalIcon, OkIcon } from "./icons";
import { checkSeal, checkTitle, Chip, overall, RecordPanel, type Check, type SealCheck } from "./RecordPanel";

/** Where the pack gets its data; the preview passes fixtures, the app passes the API and the chain. */
export interface PackSource {
  pack(ref: PackRef): Promise<PackDetail | null>;
  /** FireRecords on Base Sepolia, which the reader's browser reads each seal from. */
  contract: Hex;
  /** Each record's seal on FireRecords or its run's root on FireRuns, in order, in one read; zeros for one not sealed yet. */
  sealsOf(records: HotspotRecord[]): Promise<Seal[]>;
  fingerprint(record: HotspotRecord): Hex;
}

type PackLoad = { kind: "loading" } | { kind: "error" } | { kind: "missing" } | { kind: "ready"; pack: PackDetail };

const SLOW_AFTER_MS = 3000;
const COPIED_MS = 2000;
const RULE_URL = "https://github.com/dzaffren/fire-watch/blob/main/api/src/firewatch/fires.py";
const TRASE_DATASET = "https://trase.earth/open-data/datasets/indonesia-wood-pulp-concessions-2023-2024";

/** "3 outside, 950 m to 1.3 km; 1 inside, 190 m": one pass against the concession's edge. */
function passSides(detections: HotspotRecord[], id: string): string {
  const parts: string[] = [];
  for (const inside of [true, false]) {
    const edges = detections
      .map((h) => h.concessions.find((m) => m.id === id))
      .filter((m) => m && m.inside === inside)
      .map((m) => m!.edge_m)
      .sort((a, b) => a - b);
    if (!edges.length) continue;
    const span = edges.length > 1 ? `${distance(edges[0])} to ${distance(edges[edges.length - 1])}` : distance(edges[0]);
    parts.push(`${count(edges.length)} ${inside ? "inside" : "outside"}, ${span}`);
  }
  return parts.join("; ");
}

interface Props {
  source: PackSource;
  /** The pack the link names; null when the link is broken. */
  packRef: PackRef | null;
  /** A detection opened from the start, as the preview shows one. */
  initialOpen?: number | null;
}

export function ComplaintPack({ source, packRef, initialOpen = null }: Props) {
  const [load, setLoad] = useState<PackLoad>(packRef ? { kind: "loading" } : { kind: "missing" });
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);
  const [checked, setChecked] = useState<{ pack: PackDetail; seals: SealCheck[] } | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [open, setOpen] = useState<number | null>(initialOpen);
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const [copied, setCopied] = useState<"no" | "yes" | "failed">("no");
  const rows = useRef(new Map<number, HTMLTableRowElement>());

  useEffect(() => {
    if (!packRef) return;
    let live = true;
    setLoad({ kind: "loading" });
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    source
      .pack(packRef)
      .then(
        (p) => live && setLoad(p ? { kind: "ready", pack: p } : { kind: "missing" }),
        () => live && setLoad({ kind: "error" }),
      )
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [source, packRef, attempt]);

  const pack = load.kind === "ready" ? load.pack : null;
  const fps = useMemo(() => pack?.hotspots.map(source.fingerprint) ?? [], [source, pack]);

  // A pack the chain hasn't answered for yet reads Checking, also before the read below starts.
  const checks = useMemo(
    () =>
      pack && checked?.pack === pack ? checked.seals.map((s) => s.check) : (pack?.hotspots.map((): Check => ({ state: "checking" })) ?? []),
    [pack, checked],
  );

  useEffect(() => {
    if (!pack) return;
    let live = true;
    const all = (check: Check) => pack.hotspots.map((): SealCheck => ({ check, sealedAt: null, sealedIn: null }));
    setChecked({ pack, seals: all({ state: "checking" }) });
    source.sealsOf(pack.hotspots).then(
      (seals) => live && setChecked({ pack, seals: seals.map((s, i) => checkSeal(s, pack.hotspots[i], fps[i])) }),
      () => live && setChecked({ pack, seals: all({ state: "error" }) }),
    );
    return () => {
      live = false;
    };
  }, [source, pack, fps, checkAttempt]);

  // A printed pack is a document: light, whatever the screen's theme.
  useEffect(() => {
    const root = document.documentElement;
    let before: string | undefined;
    const toLight = () => {
      before = root.dataset.theme;
      root.dataset.theme = "light";
    };
    const back = () => {
      if (before === undefined) delete root.dataset.theme;
      else root.dataset.theme = before;
    };
    addEventListener("beforeprint", toLight);
    addEventListener("afterprint", back);
    return () => {
      removeEventListener("beforeprint", toLight);
      removeEventListener("afterprint", back);
    };
  }, []);

  useEffect(() => {
    if (pack) document.title = `Complaint pack: ${pack.concession_id}, fire first seen ${detectedShort(pack.first_seen_unix)} UTC`;
  }, [pack]);

  const times = useMemo(() => (pack ? passTimes(pack.hotspots) : []), [pack]);
  const at = replayAt ?? times.length;
  const replay = useMemo(() => (pack ? fireDots(pack.hotspots, at) : null), [pack, at]);
  const area = useMemo(() => (pack ? fireArea(pack.hotspots) : undefined), [pack]);
  // Detections that don't match go first (scenario 3); the rest stay oldest first.
  const order = useMemo(() => {
    const all = pack?.hotspots.map((_, i) => i) ?? [];
    return [...all.filter((i) => checks[i]?.state === "mismatch"), ...all.filter((i) => checks[i]?.state !== "mismatch")];
  }, [pack, checks]);

  function pickOnMap(dot: number) {
    const i = replay ? replay.index[dot] : dot;
    setOpen(i);
    rows.current.get(i)?.scrollIntoView({ block: "nearest" });
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(
      () => setCopied("yes"),
      () => setCopied("failed"),
    );
    setTimeout(() => setCopied("no"), COPIED_MS);
  }

  let mapLabel = "Map of the fire";
  if (pack) {
    mapLabel = `Map of the fire first seen ${detectedShort(pack.first_seen_unix)} UTC near ${pack.concession_id}, pass ${at} of ${times.length} shown`;
  }

  return (
    <div className="app">
      <header className="app-top">
        <span className="app-name">Fire Watch</span>
        <p className="fw-help">Records are sealed on Base Sepolia, a test network</p>
      </header>
      <main className="app-main app-main--pack">
        <article className="rec-col pack" aria-labelledby="h-pack" aria-busy={load.kind === "loading"}>
          {load.kind === "loading" && <PackSkeleton slow={slow} />}
          {load.kind === "error" && (
            <div className="fw-panel fw-empty enter">
              <AlertIcon />
              <h3 id="h-pack">Couldn't load this pack</h3>
              <p className="fw-help">The server didn't answer. Try again in a moment.</p>
              <button className="fw-btn" type="button" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
            </div>
          )}
          {load.kind === "missing" && (
            <div className="fw-panel fw-empty enter">
              <AlertIcon />
              <h3 id="h-pack">This link doesn't open a pack</h3>
              <p className="fw-help">Part of the link may be missing. Ask whoever sent it for the whole link.</p>
            </div>
          )}
          {pack && (
            <>
              <header className="pack-head enter">
                <p className="fw-help">Complaint pack, as of {detected(pack.as_of_unix)}</p>
                <h1 id="h-pack">{firstSeenLine(pack.first_seen)}</h1>
                <p className="pack-where">
                  {pack.concession_id}, {pack.province}
                </p>
                <Caveats pack={pack} />
                <div className="pack-actions">
                  <button className="fw-btn fw-btn--secondary" type="button" onClick={copyLink}>
                    {copied === "yes" ? <><OkIcon />Link copied</> : "Copy link"}
                  </button>
                  <button className="fw-btn fw-btn--secondary" type="button" onClick={() => print()}>
                    Print or save as PDF
                  </button>
                </div>
                {copied === "failed" && (
                  <p className="fw-help" role="status">Couldn't copy. Copy the link from the address bar instead.</p>
                )}
              </header>

              <section className="fw-panel pack-check enter" aria-labelledby="h-check" aria-live="polite">
                <div className="rec-head">
                  <h2 id="h-check">{checkTitle(checks)}</h2>
                  {overall(checks).state !== "error" && <Chip check={overall(checks)} />}
                </div>
                <p className="fw-help rec-note">
                  Your browser worked out each detection's fingerprint and read its seal from FireRecords on Base
                  Sepolia, a test network. Fire Watch's server chose which records to send. NASA FIRMS's public
                  archive shows whether one is missing.
                </p>
                {checks.some((c) => c.state === "mismatch") && (
                  <p className="fw-help rec-note">
                    A detection that doesn't match was changed after it was sealed. It is listed first below.
                  </p>
                )}
                {checks.some((c) => c.state === "pending") && (
                  <p className="fw-help rec-note">
                    The recorder seals new detections each hour. Open this pack again later to check the rest.
                  </p>
                )}
                {checks.some((c) => c.state === "error") && (
                  <div className="rec-act">
                    <p className="fw-help rec-note">Couldn't reach Base Sepolia to check every detection.</p>
                    <button className="fw-btn" type="button" onClick={() => setCheckAttempt((n) => n + 1)}>
                      Check again
                    </button>
                  </div>
                )}
                <dl className="fw-kv">
                  <dt>Contract</dt>
                  <dd>
                    <a
                      className="fw-link fw-mono"
                      href={`https://sepolia.basescan.org/address/${source.contract}#code`}
                      target="_blank"
                      rel="noopener"
                      aria-label={`View FireRecords ${shortHash(source.contract, 6, 4)} on Basescan`}
                    >
                      {shortHash(source.contract, 10, 6)}
                      <ExternalIcon />
                    </a>
                  </dd>
                </dl>
              </section>

              <section className="pack-section enter" aria-labelledby="h-site">
                <h2 id="h-site">Site</h2>
                <dl className="fw-kv">
                  <dt>Concession</dt>
                  <dd>{pack.concession_id}</dd>
                  <dt>Province</dt>
                  <dd>{pack.province}</dd>
                  <dt>First detection</dt>
                  <dd className="fw-mono">{location(pack.hotspots[0].lat_e5, pack.hotspots[0].lon_e5)}</dd>
                  <dt>Boundaries</dt>
                  <dd>{pack.map_version}</dd>
                </dl>
              </section>

              <section className="pack-section enter" aria-labelledby="h-dates">
                <h2 id="h-dates">Dates</h2>
                <dl className="fw-kv">
                  <dt>First seen</dt>
                  <dd>{detected(pack.first_seen_unix)}</dd>
                  {pack.inside_from_unix !== null && pack.first_seen.reading !== "inside" && (
                    <>
                      <dt>Seen inside from</dt>
                      <dd>{detected(pack.inside_from_unix)}</dd>
                    </>
                  )}
                  {pack.outside_from_unix !== null && pack.first_seen.reading !== "outside" && (
                    <>
                      <dt>Seen outside from</dt>
                      <dd>{detected(pack.outside_from_unix)}</dd>
                    </>
                  )}
                  <dt>Last seen</dt>
                  <dd>{detected(pack.last_seen_unix)}</dd>
                </dl>
              </section>

              <DamageSection pack={pack} />

              <section className="pack-section enter" aria-labelledby="h-basis">
                <h2 id="h-basis">Basis</h2>
                <p className="fw-help">
                  A detection joins a fire when it is within 1 km and 48 hours of one already in it. The first pass is
                  the earliest satellite pass that saw the fire. A side is named only when every detection on that pass
                  is more than 375 m from the edge, half the widest VIIRS pixel; nearer than that, the fire could be on
                  either side.
                </p>
                <p className="fw-help">
                  NOAA-20 passes about twice a day and cloud can hide a fire, so it may burn for hours before it is
                  first seen. Each detection is sealed, so anyone can redo this from the chain and NASA FIRMS's public
                  archive.
                </p>
                <dl className="fw-kv">
                  <dt>Fire rule</dt>
                  <dd>
                    <a className="fw-link" href={RULE_URL} target="_blank" rel="noopener">
                      Version {pack.rule_version}, in full
                      <ExternalIcon />
                    </a>
                  </dd>
                  <dt>Passes</dt>
                  <dd>
                    {count(pack.passes)}, with {plural(pack.detections, "detection", "detections")}
                  </dd>
                </dl>

                <h3 id="h-passes">Spread, pass by pass</h3>
                <div className="table-box">
                  <table className="fw-table" aria-labelledby="h-passes">
                    <thead>
                      <tr><th scope="col">Pass</th><th scope="col">Seen (UTC)</th><th scope="col">Against the edge</th></tr>
                    </thead>
                    <tbody>
                      {times.map((t, p) => (
                        <tr key={t}>
                          <td>{p + 1}</td>
                          <td>{detectedShort(t)}</td>
                          <td>{passSides(pack.hotspots.filter((h) => (h.pass ?? 1) === p + 1), pack.concession_id)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3 id="h-detections">{plural(pack.detections, "detection", "detections")}, oldest first</h3>
                <p className="fw-help list-note">Pick one to see its full record and seal.</p>
                <div className="table-box">
                  <table className="fw-table" aria-labelledby="h-detections">
                    <thead>
                      <tr><th scope="col">Detected (UTC)</th><th scope="col">Where</th><th scope="col">Chain</th></tr>
                    </thead>
                    <tbody>
                      {order.map((i) => {
                        const h = pack.hotspots[i];
                        return (
                          <Fragment key={h.record_id}>
                            <tr
                              ref={(el) => {
                                if (el) rows.current.set(i, el);
                                else rows.current.delete(i);
                              }}
                              className="row-open"
                              aria-selected={i === open ? true : undefined}
                            >
                              <td>
                                <button
                                  className="row-btn"
                                  type="button"
                                  aria-expanded={i === open}
                                  onClick={() => setOpen(i === open ? null : i)}
                                >
                                  {detectedShort(h.acquired_unix)}
                                  <span className="sub">Pass {h.pass ?? 1}</span>
                                </button>
                              </td>
                              <td>{where(h, pack.concession_id)}</td>
                              <td><Chip check={checks[i] ?? { state: "checking" }} /></td>
                            </tr>
                            {i === open && (
                              <tr className="pack-record">
                                <td colSpan={3}>
                                  <RecordPanel
                                    record={h}
                                    fingerprint={fps[i]}
                                    check={checks[i] ?? { state: "checking" }}
                                    sealedAt={checked?.pack === pack ? checked.seals[i].sealedAt : null}
                                    sealedIn={checked?.pack === pack ? checked.seals[i].sealedIn : null}
                                    onCheckAgain={() => setCheckAttempt((n) => n + 1)}
                                  />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <footer className="pack-foot">
                <p className="fw-help">
                  This pack holds every detection of this fire that Fire Watch had stored by{" "}
                  {detected(pack.as_of_unix)}. Passes after that are not in it.
                </p>
                <p className="fw-help">
                  Link: <span className="fw-mono pack-link">{window.location.href}</span>
                </p>
                <p className="fw-help">
                  Concession boundaries from{" "}
                  <a className="fw-link" href={TRASE_DATASET} target="_blank" rel="noopener">
                    Trase, Indonesia wood pulp concessions 2023–2024
                    <ExternalIcon />
                  </a>
                  , CC BY 4.0. Company names are left out on purpose.
                </p>
              </footer>
            </>
          )}
        </article>
        <FireMap
          label={mapLabel}
          boundary={pack?.boundary}
          dots={replay?.dots}
          selected={open === null || !replay || !replay.index.includes(open) ? null : replay.index.indexOf(open)}
          area={area}
          fire
          onSelect={pickOnMap}
        >
          {times.length > 1 && <Replay times={times} at={at} onChange={setReplayAt} />}
        </FireMap>
      </main>
    </div>
  );
}

function Caveats({ pack }: { pack: PackDetail }) {
  const { reading } = pack.first_seen;
  const unclear = reading === "edge" || reading === "both";
  const hours = pack.recorded_before_h;
  if (!unclear && !pack.never_spread && hours === null) return null;
  return (
    <div className="fire-notes pack-caveats">
      {unclear && <p className="fw-help">The satellite record can't say which side this fire started on.</p>}
      {pack.never_spread && (
        <p className="fw-help">
          Seen on {count(pack.passes)} passes without spreading. This can be a fixed heat source, such as a mill, or
          peat smouldering in place.
        </p>
      )}
      {hours !== null && (
        <p className="fw-help">
          Fire Watch's records begin {hours < 1 ? "less than an hour" : plural(hours, "hour", "hours")} before this fire
          was first seen, so it may have been burning earlier.
        </p>
      )}
    </div>
  );
}

const SKELETON_WIDTHS = [55, 70, 45, 60];

function PackSkeleton({ slow }: { slow: boolean }) {
  return (
    <div className="pack-head" aria-label="Loading the pack">
      <div className="fw-skeleton" style={{ width: "40%" }} />
      <div className="fw-skeleton pack-sk-title" />
      <div className="fw-skeleton" style={{ width: "55%" }} />
      <div className="fw-panel">
        <div className="fw-skeleton" style={{ width: "70%", height: 18 }} />
        <div className="sk-rows">
          {SKELETON_WIDTHS.map((w, i) => (
            <Fragment key={i}>
              <div className="fw-skeleton" />
              <div className="fw-skeleton" style={{ width: `${w}%` }} />
            </Fragment>
          ))}
        </div>
      </div>
      {slow && (
        <p className="fw-help rec-note" role="status">
          Starting the server after a quiet spell. This can take up to a minute; the pack loads on its own.
        </p>
      )}
    </div>
  );
}
