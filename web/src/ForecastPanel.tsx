import type { Hex } from "viem";
import type { FireDetail, Forecast } from "./api";
import { detected, detectedShort, duration, gap, location, plural, shortHash } from "./format";
import { ExternalIcon } from "./icons";
import { Chip, type Check } from "./RecordPanel";

const RULE_URL = "https://github.com/dzaffren/fire-watch/blob/main/api/src/firewatch/forecast.py";

/** A forecast's chain check, with the seal's time by Base Sepolia's clock once it is read. */
export interface ForecastCheck {
  check: Check;
  sealedAt: number | null;
}

/** "Forecast to be seen inside by about 15 Oct 18:00 UTC", or that it isn't (D39). */
export const forecastLine = (f: Forecast) =>
  f.inside_by_unix === null
    ? `Not forecast to be seen inside by ${detectedShort(f.until_unix)} UTC`
    : `Forecast to be seen inside by about ${detectedShort(f.inside_by_unix)} UTC`;

const forecastShort = (f: Forecast) =>
  f.inside_by_unix === null ? `Not inside by ${detectedShort(f.until_unix)}` : `Inside by about ${detectedShort(f.inside_by_unix)}`;

/** How the forecast turned out, from the passes after its seal (D44); none for a changed one. After
 *  its end it waits up to 6 hours more for passes taken before then, until the recorder closes it. */
function outcomeLine(f: Forecast, check: Check, now: number, short = false): string {
  if (check.state === "mismatch") return short ? "Changed after its seal" : "Changed after its seal, so its outcome isn't shown.";
  const at = f.outcome_unix ?? 0;
  const utc = short ? "" : " UTC";
  switch (f.outcome) {
    case "waiting":
      if (now >= f.until_unix) return `Waiting for the last passes before ${detectedShort(f.until_unix)}${utc}`;
      return `Waiting until ${detectedShort(f.until_unix)}${utc}`;
    case "seen_inside": {
      if (f.inside_by_unix === null) return `Seen inside ${detectedShort(at)}${utc}. Not forecast.`;
      const off = at - f.inside_by_unix;
      const by = short ? gap(0, new Date(Math.abs(off) * 1000).toISOString()) : duration(off);
      const when = off === 0 ? "at the forecast time" : `${by} ${off < 0 ? "before" : "after"}${short ? "" : " the forecast time"}`;
      return `Seen inside ${detectedShort(at)}${utc}, ${when}`;
    }
    case "not_seen_inside":
      return f.inside_by_unix === null ? "Not seen inside, as forecast" : `Not seen inside within 48 ${short ? "h" : "hours"}`;
    case "joined":
      return short ? "Joined another fire. Not checked." : "Joined another fire before it was seen inside. Not checked.";
    case "seen_before_seal":
      return short ? "Seen inside before its seal. Not checked." : "Seen inside on a pass before this forecast was sealed. Not checked.";
  }
}

/** What the chain says about this forecast, in one sentence. */
function sealLine(f: Forecast, { check, sealedAt }: ForecastCheck): string {
  if (check.state === "pending") return "Not on the chain yet. The recorder seals each forecast in the run that makes it.";
  if (check.state === "checking") return "Reading its seal from Base Sepolia.";
  if (check.state === "mismatch") {
    return "This forecast has changed since it was sealed. The chain still holds the original fingerprint.";
  }
  if (check.state === "error" || sealedAt === null) return "";
  if (f.outcome === "seen_inside" && f.outcome_unix !== null && sealedAt < f.outcome_unix) {
    return `Sealed ${duration(f.outcome_unix - sealedAt)} before the pass that saw it inside, by Base Sepolia's clock.`;
  }
  return `Sealed ${duration(sealedAt - f.made_unix)} after it was made, by Base Sepolia's clock.`;
}

/** Why a fire has no forecasts: seen inside at once, or before forecasting began. */
function noneLine(fire: FireDetail): string {
  const first = fire.hotspots.filter((h) => h.pass === 1);
  if (fire.inside_from_unix !== null && first.length && fire.inside_from_unix === first[0].acquired_unix) {
    return "No forecasts. This fire was seen inside on its first pass, so there was nothing to forecast.";
  }
  const from = fire.forecasts_from_unix;
  if (from) {
    return `No forecasts. Fire Watch began forecasting on ${detected(from)}, and makes one only after a pass that leaves a fire not yet seen inside.`;
  }
  return "No forecasts for this fire yet.";
}

interface Props {
  fire: FireDetail;
  checks: ForecastCheck[];
  fingerprints: Hex[];
  picked: number;
  /** Unix seconds, to tell a waiting forecast whose 48 hours have ended. */
  now: number;
  onPick: (index: number) => void;
  onCheckAgain: () => void;
}

/** The fire view's forecasts: the picked one in full, then every one, newest first (D41). */
export function ForecastPanel({ fire, checks, fingerprints, picked, now, onPick, onCheckAgain }: Props) {
  const forecasts = fire.forecasts ?? [];
  if (!forecasts.length) return <p className="fw-help forecast-none enter">{noneLine(fire)}</p>;

  const f = forecasts[picked] ?? forecasts[0];
  const at = forecasts.indexOf(f);
  const state = checks[at] ?? { check: { state: "checking" }, sealedAt: null };
  const fp = fingerprints[at];
  const seal = sealLine(f, state);

  return (
    <>
      <section key={f.record_id} className="fw-panel forecast enter" aria-labelledby="h-forecast" aria-live="polite">
        <div className="rec-head">
          <h2 id="h-forecast">{forecastLine(f)}</h2>
          <Chip check={state.check} />
        </div>
        <p className="forecast-outcome">{outcomeLine(f, state.check, now)}</p>
        {seal && <p className="fw-help rec-note">{seal}</p>}
        {state.check.state === "error" && (
          <div className="rec-act">
            <p className="fw-help rec-note">Couldn't reach Base Sepolia to check the forecasts.</p>
            <button className="fw-btn" type="button" onClick={onCheckAgain}>Check again</button>
          </div>
        )}
        <dl className="fw-kv">
          <dt>Made</dt>
          <dd>
            {detected(f.made_unix)}
            <span className="sub">
              After the pass at {detectedShort(f.after_pass_unix)} UTC
              {f.fire_key !== fire.key && ", for a fire that later joined this one"}
            </span>
          </dd>
          <dt>Checked against</dt>
          <dd>Passes from its seal to {detected(f.until_unix)}</dd>
          {f.crossing && (
            <>
              <dt>Crosses the edge</dt>
              <dd className="fw-mono">{location(f.crossing.lat_e5, f.crossing.lon_e5)}</dd>
            </>
          )}
          {state.check.state === "mismatch" ? (
            <>
              <dt>Sealed fingerprint</dt>
              <dd className="fw-mono">{shortHash(state.check.sealed.slice(2), 10, 6)}</dd>
              <dt>Fingerprint now</dt>
              <dd className="fw-mono">{fp && shortHash(fp.slice(2), 10, 6)}</dd>
            </>
          ) : (
            <>
              <dt>Fingerprint</dt>
              <dd className="fw-mono">{fp && shortHash(fp.slice(2), 10, 6)}</dd>
            </>
          )}
          <dt>Transaction</dt>
          <dd>
            {f.tx_hash ? (
              <a
                className="fw-link fw-mono"
                href={`https://sepolia.basescan.org/tx/${f.tx_hash}`}
                target="_blank"
                rel="noopener"
                aria-label={`View transaction ${shortHash(f.tx_hash, 6, 4)} on Basescan`}
              >
                {shortHash(f.tx_hash, 10, 6)}
                <ExternalIcon />
              </a>
            ) : (
              <span className="none">Not sent yet</span>
            )}
          </dd>
        </dl>
        <details>
          <summary>How this is worked out</summary>
          <p className="fw-help">
            After each satellite pass, Fire Watch forecasts whether a fire not yet seen inside the concession will be
            seen inside within 48 hours, and when. Seen inside means a detection inside, more than 375 m from the edge,
            half the widest VIIRS pixel.
          </p>
          <p className="fw-help">
            Each forecast is sealed in the run that makes it, and every one stays listed here, right or wrong. Only
            passes after its seal count. A forecast whose fire joins another fire first is not checked.
          </p>
          <p className="fw-help">
            <a className="fw-link" href={RULE_URL} target="_blank" rel="noopener">
              Forecast rule, version {f.rule_version}, in full
              <ExternalIcon />
            </a>
          </p>
        </details>
        <details>
          <summary>Show the raw forecast</summary>
          <pre>{JSON.stringify(f, null, 2)}</pre>
        </details>
      </section>

      {forecasts.length > 1 && (
        <>
          <p className="fw-help list-note enter">
            {plural(forecasts.length, "forecast", "forecasts")} for this fire, newest first. Pick one to see the fire as
            it stood then.
          </p>
          <div className="table-box enter">
            <table className="fw-table">
              <thead>
                <tr><th scope="col">Made (UTC)</th><th scope="col">Forecast</th></tr>
              </thead>
              <tbody>
                {forecasts.map((row, i) => (
                  <tr key={row.record_id} className="row-open" aria-selected={i === at ? true : undefined}>
                    <td>
                      <button className="row-btn" type="button" onClick={() => onPick(i)}>
                        {detectedShort(row.made_unix)}
                      </button>
                      <span className="sub forecast-chip">
                        <Chip check={checks[i]?.check ?? { state: "checking" }} />
                      </span>
                    </td>
                    <td>
                      {forecastShort(row)}
                      <span className="sub">{outcomeLine(row, checks[i]?.check ?? { state: "checking" }, now, true)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
