import { useEffect, useMemo, useRef, useState } from "react";
import type { HotspotRecord, PackDetail } from "./api";
import { FireMap, type Dot } from "./FireMap";
import { fireArea, fireDots, MISSED, passTimes } from "./FireView";
import { count, detected, detectedShort, location, plural, seenWhere } from "./format";
import { checkTitle, Chip, overall, type Check } from "./RecordPanel";

/** Where the case gets its fire; the preview passes fixtures, the landing the committed copy and the chain. */
export interface CaseSource {
  /** The example fire's pack, as committed (D85). */
  pack(): Promise<PackDetail>;
  /** Each record's check against its seal, in order, in one read. */
  check(records: HotspotRecord[]): Promise<Check[]>;
}

type Step = { kind: "fire" } | { kind: "claim" } | { kind: "pass"; pass: number } | { kind: "seals" } | { kind: "pack" };
type CaseLoad = { kind: "loading" } | { kind: "error" } | { kind: "ready"; pack: PackDetail };

// The committed copy is cut at 17 Oct 2026 09:00 UTC, so these lines can't drift from it (D84, D85).
const SEALED_WHEN =
  "Passes 1 to 6 were sealed on 16 Oct, when recording began: 23 hours to 4 days after the satellite saw them. Passes 7 and 8 were sealed about 3 hours after.";

const insideOf = (h: HotspotRecord, id: string) => h.concessions.some((m) => m.id === id && m.inside);
const day = (unix: number) => detectedShort(unix).split(" ").slice(0, 2).join(" ");

/** The example fire told as a scroll story: one map holds still, each step changes one thing on it (D82). */
export function RealCase({ source, packHref }: { source: CaseSource; packHref: string }) {
  const [load, setLoad] = useState<CaseLoad>({ kind: "loading" });
  const [at, setAt] = useState(0);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const steps = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    let live = true;
    source.pack().then(
      (pack) => live && setLoad({ kind: "ready", pack }),
      () => live && setLoad({ kind: "error" }),
    );
    return () => {
      live = false;
    };
  }, [source]);

  const pack = load.kind === "ready" ? load.pack : null;
  const times = useMemo(() => (pack ? passTimes(pack.hotspots) : []), [pack]);
  const story = useMemo<Step[]>(
    () => [{ kind: "fire" }, { kind: "claim" }, ...times.map((_, i): Step => ({ kind: "pass", pass: i + 1 })), { kind: "seals" }, { kind: "pack" }],
    [times],
  );
  const step = story[at] ?? story[0];

  // The step crossing a line just below the middle of the screen is the one the map shows.
  useEffect(() => {
    if (!pack) return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setAt(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-60% 0px -40% 0px" },
    );
    for (const el of steps.current) if (el) seen.observe(el);
    return () => seen.disconnect();
  }, [pack, story]);

  // The check starts when the seal step first scrolls in, so the reader sees it run, and scrolling back doesn't redo it.
  const sealsReached = step.kind === "seals" || step.kind === "pack";
  const [checkStarted, setCheckStarted] = useState(false);
  useEffect(() => {
    if (sealsReached) setCheckStarted(true);
  }, [sealsReached]);

  useEffect(() => {
    if (!pack || !checkStarted) return;
    let live = true;
    setChecks(pack.hotspots.map(() => ({ state: "checking" })));
    source.check(pack.hotspots).then(
      (checked) => live && setChecks(checked),
      () => live && setChecks(pack.hotspots.map(() => ({ state: "error" }))),
    );
    return () => {
      live = false;
    };
  }, [source, pack, checkStarted, checkAttempt]);

  const whole = useMemo<Dot[]>(() => pack?.hotspots.map((h) => ({ ...h, first: (h.pass ?? 1) === 1 })) ?? [], [pack]);
  const upTo = useMemo(() => (pack && step.kind === "pass" ? fireDots(pack.hotspots, step.pass).dots : null), [pack, step]);
  const fireBox = useMemo(() => (pack ? fireArea(pack.hotspots) : undefined), [pack]);

  if (load.kind === "error") {
    return (
      <p className="fw-help case-failed">
        The example fire didn't load. <a className="fw-link" href={packHref}>Its complaint pack</a> has the same records.
      </p>
    );
  }
  if (!pack) return <div className="case-wait" aria-busy="true" />;

  const id = pack.concession_id;
  const inPass = (p: number) => pack.hotspots.filter((h) => (h.pass ?? 1) === p);
  // The pass a time falls in: the last pass that began by then.
  const passOf = (unix: number) => times.filter((t) => t <= unix).length;
  const joined = pack.joined ?? [];
  const insideAll = pack.hotspots.filter((h) => insideOf(h, id)).length;
  const wide = step.kind === "fire" || step.kind === "claim";

  function caption(s: Step) {
    switch (s.kind) {
      case "fire":
        return (
          <>
            <h3>A fire near a pulpwood plantation</h3>
            <p>
              From {day(pack!.first_seen_unix)} to {day(pack!.last_seen_unix)} 2026, the NOAA-20 satellite saw this fire on{" "}
              {times.length} passes, {count(pack!.detections)} detections in all, near {id}, in Central Kalimantan. The
              dashed line is the concession's edge.
              The company that holds the land answers for fires inside it.
            </p>
          </>
        );
      case "claim":
        return (
          <>
            <h3>Two accounts of one fire</h3>
            <p>
              A watchdog reports the fire to the companies that buy this concession's wood. The company that holds it
              can answer that the fire started outside its land and spread in. Without a record, the buyer has to pick
              one account.
            </p>
          </>
        );
      case "pass": {
        const hs = inPass(s.pass);
        const inside = hs.filter((h) => insideOf(h, id)).length;
        const seenNow = joined.filter((j) => passOf(j.first_seen_unix) === s.pass);
        const joinedNow = joined.some((j) => passOf(j.at_unix) === s.pass);
        if (s.pass === 1) {
          const edge = hs[0].concessions.find((m) => m.id === id);
          const alone = pack!.first_alone_h;
          return (
            <>
              <h3>Where it was first seen</h3>
              <p>
                The satellite first saw it on {detectedShort(pack!.first_seen_unix)} UTC
                {alone != null && " as one detection"}, {pack!.first_seen.inside ? "inside" : "outside"} the concession
                {edge ? ` and ${count(edge.edge_m)} m from its edge` : ""}.
                {alone != null &&
                  ` It didn't see the fire again for ${plural(alone, "hour", "hours")}, so that detection may be a separate fire.`}{" "}
                {MISSED} Scroll on to see what came next, one satellite pass at a time.
              </p>
            </>
          );
        }
        return (
          <>
            <h3>
              Pass {s.pass} of {times.length}
            </h3>
            <p>
              <span className="fw-mono">{detectedShort(times[s.pass - 1])} UTC</span>
              {" · "}
              {inside === 0
                ? `${plural(hs.length, "detection", "detections")}, all outside.`
                : `${plural(hs.length, "detection", "detections")}, ${count(inside)} inside the concession.`}
              {seenNow.length > 0 &&
                ` These include ${seenNow.length === 1 ? "another fire" : `${count(seenNow.length)} other fires`}, first seen on this pass more than 1 km from the first${seenNow.length === 1 ? `, ${seenWhere(seenNow[0].first_seen)}` : ""}.`}
              {joinedNow && " On this pass the fires came within 1 km of each other, so Fire Watch counts them as one."}
              {s.pass === times.length &&
                ` In all, ${count(insideAll)} of the ${count(pack!.detections)} detections were inside.`}
            </p>
          </>
        );
      }
      case "seals":
        return <Seals checks={checks} hotspots={pack!.hotspots} onCheckAgain={() => setCheckAttempt((n) => n + 1)} />;
      case "pack":
        return (
          <>
            <h3>What the buyer gets</h3>
            <p>
              A complaint pack: the site, the dates, where the fire was first seen, how it spread pass by pass, an
              estimate of the ground it burned, and all {count(pack!.detections)} sealed records, at one link. The
              buyer's browser checks every record, the same way yours does on this page.
            </p>
            <p>
              <a className="fw-btn" href={packHref}>See its complaint pack</a>
            </p>
          </>
        );
    }
  }

  return (
    <div className="case-story">
      <div className="case-map">
        <FireMap
          label="Map of the example fire"
          boundary={pack.boundary}
          dots={upTo ?? whole}
          area={wide ? undefined : fireBox}
          fire
        >
          {step.kind === "pass" && (
            <div className="fw-panel case-pass">
              <span className="fw-mono">
                Pass {step.pass} of {times.length} · {detectedShort(times[step.pass - 1])} UTC
              </span>
            </div>
          )}
        </FireMap>
      </div>
      <ol className="case-steps">
        {story.map((s, i) => (
          <li
            key={s.kind === "pass" ? `pass-${s.pass}` : s.kind}
            ref={(el) => {
              steps.current[i] = el;
            }}
            data-step={i}
            className={s.kind === "pass" && s.pass > 1 ? "case-step case-step--pass" : "case-step"}
            aria-current={i === at ? "step" : undefined}
          >
            {caption(s)}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Seals({ checks, hotspots, onCheckAgain }: { checks: Check[] | null; hotspots: HotspotRecord[]; onCheckAgain: () => void }) {
  const shown = checks ?? hotspots.map((): Check => ({ state: "checking" }));
  const state = overall(shown);
  const changed = hotspots.filter((_, i) => shown[i].state === "mismatch");
  return (
    <>
      <h3>Every record is sealed</h3>
      <div className="case-check" aria-live="polite">
        {state.state === "error" ? (
          <>
            <p>Couldn't reach Base Sepolia to check the {plural(hotspots.length, "detection", "detections")}.</p>
            <p>
              <button className="fw-btn fw-btn--secondary" type="button" onClick={onCheckAgain}>Check again</button>
            </p>
          </>
        ) : (
          <>
            <Chip check={state} />
            <p className="case-check-title">{checkTitle(shown)}</p>
          </>
        )}
        {changed.length > 0 && (
          <ul className="case-changed">
            {changed.map((h) => (
              <li key={h.record_id} className="fw-mono">
                {detected(h.acquired_unix)}, {location(h.lat_e5, h.lon_e5)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p>
        Your browser reads each detection's seal from Base Sepolia, a public test blockchain, and compares it with the
        record. A record changed after its seal no longer matches.
      </p>
      <p className="fw-help">{SEALED_WHEN}</p>
    </>
  );
}
