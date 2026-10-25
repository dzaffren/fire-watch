import { Fragment, useState } from "react";
import { FireGlobe } from "./FireGlobe";
import { count } from "./format";
import { DAY_DETECTIONS, DAY_DETECTIONS_INDONESIA } from "./globe";
import { LogoMark } from "./icons";
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
  { title: "Open a fire.", text: "See where its records first place it against the concession's edge, and step through how it spread, pass by pass." },
  { title: "Make a pack and send its link.", text: "The buyer opens it in their own browser, which checks each record Fire Watch sends against the blockchain." },
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
        <span className="app-name"><LogoMark />Fire Watch</span>
        <a className="fw-link" href={TOOL_HREF}>Open the tool</a>
      </header>
      <main className="landing-main">
        <div className="landing-hero">
          <section className="landing-intro" aria-labelledby="h-landing">
            <h1 id="h-landing">
              When a company says a fire spread in from outside its land, show where the record first places it, and how it spread.
            </h1>
            <p className="landing-lede">
              Fire Watch is built for the watchdog groups that report plantation fires to the companies that buy from
              the plantation. It reads NOAA's NOAA-20 satellite through NASA's FIRMS service. It shows where its records
              first place a fire and how it spread, on records the buyer checks in their own browser.
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
                  A fire in ID-WOOD-CONCESSION-0332, Central Kalimantan, on 14 Oct 2026. Fire Watch's records first show
                  it on 12 Oct as one detection, 3,100 m outside the concession. On 14 Oct it joined a second fire, first
                  recorded the day before on both sides of the edge.{" "}
                  <a className="fw-link" href={EXAMPLE_PACK_HREF}>See its complaint pack</a>
                </p>
              ) : (
                <p>
                  Each dot is a square about 1 km across where the NOAA-20 satellite detected fire on 14 Oct 2026, and
                  near the example fire, one detection. That day it made {count(DAY_DETECTIONS)} detections worldwide,{" "}
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
