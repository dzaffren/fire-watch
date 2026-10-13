import { useEffect, useMemo, useState } from "react";
import { latestHotspot, type HotspotRecord } from "./api";
import { sealOf } from "./chain";
import { fingerprint } from "./fingerprint";
import { HotspotMap } from "./HotspotMap";
import { EmptyPanel, LoadErrorPanel, LoadingPanel, RecordPanel, type Check } from "./RecordPanel";

type Load = { kind: "loading" } | { kind: "error" } | { kind: "empty" } | { kind: "record"; record: HotspotRecord };

const SLOW_AFTER_MS = 3000;

export function HomePage() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [slow, setSlow] = useState(false);
  const [check, setCheck] = useState<Check>({ state: "checking" });
  const [checkAttempt, setCheckAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    latestHotspot()
      .then(
        (record) => live && setLoad(record ? { kind: "record", record } : { kind: "empty" }),
        () => live && setLoad({ kind: "error" }),
      )
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [loadAttempt]);

  const record = load.kind === "record" ? load.record : null;
  const fp = useMemo(() => record && fingerprint(record), [record]);

  useEffect(() => {
    if (!record?.tx_hash) return;
    let live = true;
    sealOf(record.record_id).then(
      (seal) => live && setCheck(seal.fingerprint === fp ? { state: "matches" } : { state: "mismatch", sealed: seal.fingerprint }),
      () => live && setCheck({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [record, fp, checkAttempt]);

  function reload() {
    setLoad({ kind: "loading" });
    setSlow(false);
    setCheck({ state: "checking" });
    setLoadAttempt((n) => n + 1);
  }

  function checkAgain() {
    setCheck({ state: "checking" });
    setCheckAttempt((n) => n + 1);
  }

  return (
    <div className="app">
      <header className="app-top">
        <span className="app-name">Fire Watch</span>
        <p className="fw-help">Records are sealed on Base Sepolia, a test network</p>
      </header>
      <main className="app-main">
        <section className="rec-col" aria-labelledby="h-latest">
          <div className="intro">
            <h1 id="h-latest">Latest recorded hotspot</h1>
            <p className="fw-help">
              The newest NASA FIRMS fire detection in and around Indonesia, sealed on a public blockchain so anyone can
              check it hasn't changed since.
            </p>
          </div>
          <div className="slot" aria-live="polite">
            {load.kind === "loading" && <LoadingPanel slow={slow} />}
            {load.kind === "error" && <LoadErrorPanel onRetry={reload} />}
            {load.kind === "empty" && <EmptyPanel />}
            {record && fp && (
              <RecordPanel
                record={record}
                fingerprint={fp}
                check={record.tx_hash ? check : { state: "pending" }}
                onCheckAgain={checkAgain}
              />
            )}
          </div>
        </section>
        <HotspotMap point={record && { lat_e5: record.lat_e5, lon_e5: record.lon_e5 }} />
      </main>
    </div>
  );
}
