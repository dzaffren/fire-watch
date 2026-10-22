import { Fragment, useState } from "react";
import { FireGlobe } from "./FireGlobe";
import { count } from "./format";
import { DAY_DETECTIONS, DAY_DETECTIONS_INDONESIA } from "./globe";
import { RealCase, type CaseSource } from "./RealCase";

// The tool at its own link (D74), and the example fire's complaint pack, cut at 17 Oct 2026 09:00 UTC: 283 sealed
// detections, first seen 12 Oct 05:16 UTC outside ID-WOOD-CONCESSION-0332, 3,100 m from its edge (O8).
export const TOOL_HREF = "/?tool";
export const EXAMPLE_PACK_HREF =
  "/?pack=ID-WOOD-CONCESSION-0332&fire=0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7&as_of=1792227600";


// The tool's four steps, in the order a watchdog takes them (D87).
const USE = [
  { title: "Pick dates.", text: "Up to 31 days at a time. The tool lists every pulpwood concession with a fire detection on it or within 5 km." },
  { title: "Pick a concession.", text: "The list puts the most detections inside first, since a complaint names one company's land." },
  { title: "Open a fire.", text: "See where the satellite first saw it against the concession's edge, and step through how it spread, pass by pass." },
  { title: "Make a pack and send its link.", text: "The buyer opens it in their own browser, which checks every record against the blockchain." },
];

const WORDS = [
  ["Concession", "Land the Indonesian government licenses to a company, here to grow trees for paper pulp. The company answers for fires on it."],
  ["Hotspot", "One spot where a satellite saw fire on one pass overhead, about 375 m across."],
  ["Seal", "A record's fingerprint, written on a public blockchain, so any later change to the record shows."],
  ["Peat", "Soil made of old plants. Once drained, it burns deep and releases far more CO₂ than other ground."],
];

/** The page at the site's address: what Fire Watch is and how it is used, for a judge reading once (D72, D88). */
export function Landing({ caseSource }: { caseSource: CaseSource }) {
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
            <h1 id="h-landing">Show where satellites first saw a plantation fire, on records anyone can check.</h1>
            <p className="landing-lede">
              Watchdog groups use Fire Watch to report a fire on plantation land to the companies that buy from it. It
              shows where satellites first saw the fire and how it spread, and the buyer checks every record in their
              own browser.
            </p>
            <div className="landing-actions">
              <a className="fw-btn" href="#case">Walk through a real case</a>
              <a className="fw-btn fw-btn--secondary" href={TOOL_HREF}>Open the tool</a>
            </div>
            <p className="fw-help">
              Today it watches Indonesia's pulpwood concessions, the first map loaded. The same method works wherever a
              public map shows who holds the land.
            </p>
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

        <section className="case" id="case" aria-labelledby="h-case">
          <h2 id="h-case">A real case</h2>
          <RealCase source={caseSource} packHref={EXAMPLE_PACK_HREF} />
        </section>

        <section className="landing-section" aria-labelledby="h-use">
          <h2 id="h-use">How you use it</h2>
          <div className="landing-text">
            <ol className="landing-steps">
              {USE.map((s) => (
                <li key={s.title}>
                  <p>
                    <strong>{s.title}</strong> {s.text}
                  </p>
                </li>
              ))}
            </ol>
            <p>
              <a className="fw-btn" href={TOOL_HREF}>Open the tool</a>
            </p>
          </div>
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
