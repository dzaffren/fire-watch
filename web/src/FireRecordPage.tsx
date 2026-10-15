import { useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import type { ConcessionDetail, ConcessionListing, HotspotRecord } from "./api";
import { ConcessionList, type ListLoad } from "./ConcessionList";
import { ConcessionView, type DetailLoad } from "./ConcessionView";
import { DateRange, daysBefore } from "./DateRange";
import { FireMap } from "./FireMap";
import { count, location } from "./format";
import { ChevronLeftIcon, ExternalIcon } from "./icons";
import { LoadErrorPanel, LoadingPanel, RecordPanel, type Check } from "./RecordPanel";

/** Where the page gets its data; the preview passes fixtures, the app passes the API and the chain. */
export interface FireRecordSource {
  concessions(from: string, to: string): Promise<ConcessionListing>;
  concession(id: string, from: string, to: string): Promise<ConcessionDetail>;
  sealOf(record: HotspotRecord): Promise<Hex>;
  fingerprint(record: HotspotRecord): Hex;
}

export type View =
  | { kind: "list" }
  | { kind: "concession"; id: string; picked?: number }
  | { kind: "hotspot"; id: string; index: number };

const SLOW_AFTER_MS = 3000;
const DEFAULT_DAYS = 7;
const TRASE_DATASET = "https://trase.earth/open-data/datasets/indonesia-wood-pulp-concessions-2023-2024";

interface Props {
  source: FireRecordSource;
  today: string;
  initialView?: View;
  initialDates?: { from: string; to: string };
}

export function FireRecordPage({ source, today, initialView, initialDates }: Props) {
  const [dates, setDates] = useState(initialDates ?? { from: daysBefore(today, DEFAULT_DAYS - 1), to: today });
  const [view, setView] = useState<View>(initialView ?? { kind: "list" });
  const [list, setList] = useState<ListLoad>({ kind: "loading" });
  const [listAttempt, setListAttempt] = useState(0);
  const [slow, setSlow] = useState(false);
  // Kept from the last list, so the concession view still names the map while a new list loads.
  const [mapVersion, setMapVersion] = useState("");
  const [detail, setDetail] = useState<DetailLoad>({ kind: "loading" });
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [check, setCheck] = useState<Check>({ state: "checking" });
  const [checkAttempt, setCheckAttempt] = useState(0);
  const openId = view.kind === "list" ? null : view.id;

  useEffect(() => {
    let live = true;
    setList({ kind: "loading" });
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    source
      .concessions(dates.from, dates.to)
      .then(
        (listing) => {
          if (!live) return;
          setList({ kind: "ready", ...listing });
          setMapVersion(listing.map_version);
        },
        () => live && setList({ kind: "error" }),
      )
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [source, dates, listAttempt]);

  useEffect(() => {
    if (!openId) return;
    let live = true;
    setDetail({ kind: "loading" });
    source.concession(openId, dates.from, dates.to).then(
      (d) => live && setDetail({ kind: "ready", detail: d }),
      () => live && setDetail({ kind: "error" }),
    );
    return () => {
      live = false;
    };
  }, [source, openId, dates, detailAttempt]);

  const ready = detail.kind === "ready" && detail.detail.id === openId ? detail.detail : null;
  const record = view.kind === "hotspot" && ready ? ready.hotspots[view.index] : null;
  const fp = useMemo(() => record && source.fingerprint(record), [source, record]);

  useEffect(() => {
    if (!record?.tx_hash || !fp) return;
    let live = true;
    setCheck({ state: "checking" });
    source.sealOf(record).then(
      (sealed) => live && setCheck(sealed === fp ? { state: "matches" } : { state: "mismatch", sealed }),
      () => live && setCheck({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [source, record, fp, checkAttempt]);

  let mapLabel = "Map of Indonesia's pulpwood concessions";
  if (view.kind === "list" && list.kind === "ready") mapLabel = `Map of the ${count(list.concessions.length)} listed concessions`;
  if (ready) mapLabel = `Map of ${openId} with ${count(ready.hotspots.length)} hotspots`;
  if (record) mapLabel += `, the one at ${location(record.lat_e5, record.lon_e5)} marked`;

  return (
    <div className="app">
      <header className="app-top">
        <span className="app-name">Fire Watch</span>
        <p className="fw-help">Records are sealed on Base Sepolia, a test network</p>
      </header>
      <main className="app-main app-main--wide">
        <section className="rec-col" aria-labelledby="h-page">
          <div className="intro">
            <h1 id="h-page">Pulpwood concessions with hotspots</h1>
            <p className="fw-help">
              NASA FIRMS fire detections on or within 5 km of Indonesia's licensed pulpwood concessions. Each is sealed
              on a public blockchain so anyone can check it hasn't changed since.
            </p>
          </div>
          <DateRange
            from={dates.from}
            to={dates.to}
            today={today}
            onChange={(from, to) => {
              setDates({ from, to });
              if (view.kind === "hotspot") setView({ kind: "concession", id: view.id });
            }}
          />
          <div className="slot" aria-live="polite">
            {view.kind === "list" && (
              <ConcessionList
                load={list}
                slow={slow}
                from={dates.from}
                to={dates.to}
                onOpen={(id) => setView({ kind: "concession", id })}
                onRetry={() => setListAttempt((n) => n + 1)}
              />
            )}
            {view.kind === "concession" && (
              <ConcessionView
                key={view.id}
                id={view.id}
                load={detail}
                mapVersion={mapVersion}
                picked={view.picked ?? null}
                onBack={() => setView({ kind: "list" })}
                onPick={(index) => setView({ kind: "hotspot", id: view.id, index })}
                onRetry={() => setDetailAttempt((n) => n + 1)}
              />
            )}
            {view.kind === "hotspot" && (
              <div className="hotspot">
                <button
                  className="fw-link back"
                  type="button"
                  onClick={() => setView({ kind: "concession", id: view.id, picked: view.index })}
                >
                  <ChevronLeftIcon />
                  Hotspots in {view.id}
                </button>
                {record && fp ? (
                  <RecordPanel
                    record={record}
                    fingerprint={fp}
                    check={record.tx_hash ? check : { state: "pending" }}
                    onCheckAgain={() => setCheckAttempt((n) => n + 1)}
                  />
                ) : detail.kind === "error" ? (
                  <LoadErrorPanel onRetry={() => setDetailAttempt((n) => n + 1)} />
                ) : (
                  <LoadingPanel />
                )}
              </div>
            )}
          </div>
          <p className="fw-help credit">
            Concession boundaries from{" "}
            <a className="fw-link" href={TRASE_DATASET} target="_blank" rel="noopener">
              Trase, Indonesia wood pulp concessions 2023–2024
              <ExternalIcon />
            </a>
            , CC BY 4.0. They may miss concessions licensed or redrawn since.
          </p>
        </section>
        <FireMap
          label={mapLabel}
          boundary={ready?.boundary}
          dots={ready?.hotspots}
          selected={view.kind === "hotspot" ? view.index : null}
          onSelect={openId ? (index) => setView({ kind: "hotspot", id: openId, index }) : undefined}
        />
      </main>
    </div>
  );
}
