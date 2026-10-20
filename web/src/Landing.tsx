import { Fragment, useState } from "react";
import { FireGlobe } from "./FireGlobe";
import { count } from "./format";
import { DAY_DETECTIONS, DAY_DETECTIONS_INDONESIA } from "./globe";

// The tool at its own link (D74), and the example fire's complaint pack, cut at 17 Oct 2026 09:00 UTC: 283 sealed
// detections, first seen 12 Oct 05:16 UTC outside ID-WOOD-CONCESSION-0332, 3,100 m from its edge (O8).
export const TOOL_HREF = "/?tool";
export const EXAMPLE_PACK_HREF =
  "/?pack=ID-WOOD-CONCESSION-0332&fire=0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7&as_of=1792227600";


const STEPS = [
  {
    title: "Satellites spot fires.",
    text: "NASA FIRMS publishes each fire the NOAA-20 satellite detects, within about three hours: where, when and how hot.",
  },
  {
    title: "Each record is sealed.",
    text: "Every hour Fire Watch stores the detections within 5 km of a pulpwood concession. It writes each one's fingerprint to Base Sepolia, a public blockchain. A record changed later no longer matches its seal.",
  },
  {
    title: "An investigator finds where it started.",
    text: "Pick dates and a concession, then open a fire. It shows where the satellite first saw the fire against the concession's edge, and replays how it spread, pass by pass.",
  },
  {
    title: "The buyer checks it.",
    text: "A complaint pack holds the fire as it stood when it was made, at its own link. The buyer's browser checks every record against the blockchain, so nobody has to take anyone's word for it.",
  },
];

const WORDS = [
  ["Concession", "Land the Indonesian government licenses to a company, here to grow trees for paper pulp. The company answers for fires on it."],
  ["Hotspot", "One spot where a satellite saw fire on one pass overhead, about 375 m across."],
  ["Seal", "A record's fingerprint, written on a public blockchain when the record comes in, so any later change shows."],
  ["Peat", "Soil made of old plants. Once drained, it burns deep and releases far more CO₂ than other ground."],
];

/** The page at the site's address: what Fire Watch is, for someone who has never heard of a concession (D72). */
export function Landing() {
  const [atFire, setAtFire] = useState(false);
  const [arrived, setArrived] = useState(false);

  return (
    <div className="landing">
      <header className="app-top">
        <span className="app-name">Fire Watch</span>
        <a className="fw-link" href={TOOL_HREF}>Open the tool</a>
      </header>
      <main className="landing-main">
        <div className="landing-hero">
          <section className="landing-intro" aria-labelledby="h-landing">
            <h1 id="h-landing">Where did the fire start?</h1>
            <p className="landing-lede">
              Fire Watch records every satellite fire detection on or near Indonesia's pulpwood plantations, and seals
              each record on a public blockchain. Watchdog investigators use it to show a company's buyers where a fire
              started and how it spread, on records anyone can check.
            </p>
            <div className="landing-actions">
              <a className="fw-btn" href={TOOL_HREF}>Open the tool</a>
              <a className="fw-btn fw-btn--secondary" href={EXAMPLE_PACK_HREF}>See a real example</a>
            </div>
          </section>

          <figure className="landing-globe">
            <FireGlobe atFire={atFire} onArrive={() => setArrived(true)} />
            <figcaption>
              {arrived ? (
                <p>
                  A fire in ID-WOOD-CONCESSION-0332, Central Kalimantan, on 14 Oct 2026. The satellite first saw it on
                  12 Oct, outside the concession and 3,100 m from its edge. By 13 Oct it was inside.{" "}
                  <a className="fw-link" href={EXAMPLE_PACK_HREF}>See its complaint pack</a>
                </p>
              ) : (
                <p>
                  Every dot is a fire the NOAA-20 satellite saw on 14 Oct 2026: {count(DAY_DETECTIONS)} worldwide,{" "}
                  {count(DAY_DETECTIONS_INDONESIA)} of them in and around Indonesia.
                </p>
              )}
              {!atFire && (
                <button type="button" className="fw-btn fw-btn--secondary" onClick={() => setAtFire(true)}>
                  Go to the example fire
                </button>
              )}
            </figcaption>
          </figure>
        </div>

        <section className="landing-section" aria-labelledby="h-problem">
          <h2 id="h-problem">Two accounts of the same fire</h2>
          <div className="landing-text">
            <p>
              When a fire burns on plantation land, a watchdog files a grievance with the buyers of the company that
              holds the land. The company often answers that the fire started outside its concession and spread in, or
              that the complaint has no site, date or basis. The buyer then has to pick one account.
            </p>
            <p>
              Fire Watch gives the grievance its site, dates and basis from satellite records, each sealed when it came
              in. The buyer can check them instead of picking.
            </p>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="h-how">
          <h2 id="h-how">How it works</h2>
          <ol className="landing-steps">
            {STEPS.map((s) => (
              <li key={s.title}>
                <p>
                  <strong>{s.title}</strong> {s.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" aria-labelledby="h-words">
          <h2 id="h-words">Words used here</h2>
          <dl className="fw-kv landing-words">
            {WORDS.map(([word, meaning]) => (
              <Fragment key={word}>
                <dt>{word}</dt>
                <dd>{meaning}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      </main>
      <footer className="landing-foot fw-help">
        <p>
          Fire detections from NASA FIRMS. Concession map from Trase. Peat map from WRI Global Peatlands, under CC BY
          4.0. Land from Natural Earth. Records are sealed on Base Sepolia, a test network. Made for the IEEE
          ClimateChain Global Hackathon.
        </p>
      </footer>
    </div>
  );
}
