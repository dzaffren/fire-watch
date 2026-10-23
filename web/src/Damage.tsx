import type { Damage, FireDetail } from "./api";
import { count } from "./format";
import { ExternalIcon } from "./icons";

// IPCC 2013 Wetlands Supplement, Tables 2.6 and 2.7: tropical wildfire on drained peat (D62).
const PEAT_DM = { mean: 353, low: 170, high: 536 }; // t dry matter a hectare, mean and 95% interval
const PEAT_CO2_C = 464; // g a kg of dry matter
// IPCC 2006 Volume 4, Tables 2.4 and 2.5: all secondary tropical forests, tropical forest (D66).
const OTHER_DM = 42.2;
const OTHER_CO2 = 1580;
const CO2_PER_C = 44 / 12;
// The World Bank's "The Cost of Fire" (2016): Indonesia's 2015 fires (D61).
const COST_USD = 16.1e9;
const COST_HA = 2.6e6;

// NASA's MODIS MCD64A1 C6.1 over 2023's detection pixels near concessions: the ground it found
// burned, in patches of more than 20 joined squares and in all (D126, D127).
const CHECK_2023 = {
  peat: { ha: 31915, share: 0.611 },
  other: { ha: 25535, share: 0.416 },
  all: { ha: 456345, share: 0.148 },
};

const peatCo2 = (dm: number) => ((dm * PEAT_CO2_C) / 1000) * CO2_PER_C;
const OTHER_CO2_HA = (OTHER_DM * OTHER_CO2) / 1000;
const COST_PER_HA = COST_USD / COST_HA;

const IPCC_PEAT_URL =
  "https://www.ipcc-nggip.iges.or.jp/public/wetlands/pdf/Wetlands_separate_files/WS_Chp2_Drained_Inland_Organic_Soils.pdf";
const IPCC_OTHER_URL = "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/4_Volume4/V4_02_Ch2_Generic.pdf";
const COST_URL = "https://openknowledge.worldbank.org/entities/publication/391e19f4-18f7-56c2-8c28-bb89cc9e7d6f";
const PEAT_MAP_URL = "https://data.globalforestwatch.org/datasets/gfw::global-peatlands/about";
const PEAT_TILES_URL = "https://github.com/dzaffren/fire-watch/blob/main/api/src/firewatch/peat.py";
const MODIS_URL = "https://lpdaac.usgs.gov/products/mcd64a1v061/";
const CHECK_URL = "https://github.com/dzaffren/fire-watch/blob/main/api/src/firewatch/damage_check.py";

const NOT_MEASURED =
  "An estimate, not a measurement. A detection means fire somewhere in its 375 m pixel, not that the whole pixel burned.";
const NEVER_SPREAD = "This fire never spread. If it is a fixed heat source, such as a mill, little or nothing here burned.";

/** A fire's ground, the part that likely burned, and its CO2 and cost, whole and inside the concession. */
export function estimate(d: Damage) {
  const peat = d.inside_peat_ha + d.outside_peat_ha;
  const other = d.inside_other_ha + d.outside_other_ha;
  const inside = d.inside_peat_ha + d.inside_other_ha;
  // The CO2 and the cost follow the ground that likely burned, not the whole pixels (D126).
  const peatBurned = peat * CHECK_2023.peat.share;
  const otherBurned = other * CHECK_2023.other.share;
  const insidePeatBurned = d.inside_peat_ha * CHECK_2023.peat.share;
  const insideOtherBurned = d.inside_other_ha * CHECK_2023.other.share;
  const co2 = (dm: number, peatHa: number, otherHa: number) => peatHa * peatCo2(dm) + otherHa * OTHER_CO2_HA;
  return {
    peat,
    ha: peat + other,
    haInside: inside,
    burned: peatBurned + otherBurned,
    burnedInside: insidePeatBurned + insideOtherBurned,
    co2: co2(PEAT_DM.mean, peatBurned, otherBurned),
    co2Low: co2(PEAT_DM.low, peatBurned, otherBurned),
    co2High: co2(PEAT_DM.high, peatBurned, otherBurned),
    co2Inside: co2(PEAT_DM.mean, insidePeatBurned, insideOtherBurned),
    cost: (peatBurned + otherBurned) * COST_PER_HA,
    costInside: (insidePeatBurned + insideOtherBurned) * COST_PER_HA,
  };
}

/** Two significant figures: 209.84 is 210, 122,661 is 120,000, 6.31 is 6.3. */
export function twoFigures(n: number): number {
  return Number(n.toPrecision(2));
}

/** "120,000", "1.3 million". */
export function amount(n: number): string {
  const r = twoFigures(n);
  return r >= 1e6 ? `${count(r / 1e6)} million` : count(r);
}

const exactHa = (n: number) => `${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
const perHa = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
// A number keeps its unit on its line.
const ha = (n: number) => `${amount(n)}\u00a0ha`;
const tonnes = (n: number) => `${amount(n)}\u00a0t`;
const usd = (n: number) => `US$${amount(n).replace(" ", "\u00a0")}`;
const percent = (share: number, places = 0) => `${(share * 100).toFixed(places)}%`;

function DamageFigures({ d }: { d: Damage }) {
  const e = estimate(d);
  // Name the part inside only when the fire is on both sides of the edge.
  const split = e.haInside > 0 && e.haInside < e.ha;
  const inside = (text: string) => (split ? ` ${text} of it inside the concession.` : "");
  return (
    <>
      <dl className="fw-kv">
        <dt>Ground in its pixels</dt>
        <dd>
          <span className="damage-value">About {ha(e.ha)}</span>
          {split && <span className="sub">{ha(e.haInside)} of it inside the concession.</span>}
        </dd>
        <dt>Likely burned</dt>
        <dd>
          <span className="damage-value">About {ha(e.burned)}</span>
          <span className="sub">
            At NASA's 2023 shares: {percent(CHECK_2023.peat.share)} of peat, {percent(CHECK_2023.other.share)} of other
            ground.{inside(ha(e.burnedInside))}
          </span>
        </dd>
        <dt>CO₂ released</dt>
        <dd>
          <span className="damage-value">About {tonnes(e.co2)}</span>
          {(e.peat > 0 || split) && (
            <span className="sub">
              {e.peat > 0 && `Likely ${amount(e.co2Low)} to ${tonnes(e.co2High)}.`}
              {inside(tonnes(e.co2Inside))}
            </span>
          )}
        </dd>
        <dt>Cost</dt>
        <dd>
          <span className="damage-value">About {usd(e.cost)}</span>
          <span className="sub">
            At Indonesia's 2015 average of US${count(Math.round(COST_PER_HA))} a hectare.{inside(usd(e.costInside))}
          </span>
        </dd>
      </dl>
      {!split && (
        <p className="fw-help">{e.haInside ? "All" : "None"} of this ground is inside the concession.</p>
      )}
    </>
  );
}

function Source({ href, children }: { href: string; children: string }) {
  return (
    <p className="fw-help">
      <a className="fw-link" href={href} target="_blank" rel="noopener">
        {children}
        <ExternalIcon />
      </a>
    </p>
  );
}

/** How the estimate is worked out, with the exact parts, every factor and its source (D61–D68). */
function DamageMethod({ d, labelledBy }: { d: Damage; labelledBy: string }) {
  return (
    <>
      <p className="fw-help">
        Each detection stands for a 375 m square of ground around it. Where squares from different passes overlap, the
        ground counts once. The ground is split at the concession's edge, and by WRI's Global Peatlands map into peat
        and other ground. The ground that likely burned is each part at the share NASA found burned in 2023, below.
      </p>
      <div className="table-box">
        <table className="fw-table" aria-labelledby={labelledBy}>
          <thead>
            <tr><td /><th scope="col" className="num">On peat</th><th scope="col" className="num">Other ground</th></tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Inside the concession</th>
              <td className="num">{exactHa(d.inside_peat_ha)}</td>
              <td className="num">{exactHa(d.inside_other_ha)}</td>
            </tr>
            <tr>
              <th scope="row">Outside</th>
              <td className="num">{exactHa(d.outside_peat_ha)}</td>
              <td className="num">{exactHa(d.outside_other_ha)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="fw-help" id="damage-check-2023">
        In 2023, NASA's MODIS burned-area map checked the squares of every detection within 5 km of a concession:
      </p>
      <div className="table-box">
        <table className="fw-table" aria-labelledby="damage-check-2023">
          <thead>
            <tr><td /><th scope="col" className="num">Ground in its pixels</th><th scope="col" className="num">Found burned</th></tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Peat, in large patches</th>
              <td className="num">{count(CHECK_2023.peat.ha)} ha</td>
              <td className="num">{percent(CHECK_2023.peat.share, 1)}</td>
            </tr>
            <tr>
              <th scope="row">Other ground, in large patches</th>
              <td className="num">{count(CHECK_2023.other.ha)} ha</td>
              <td className="num">{percent(CHECK_2023.other.share, 1)}</td>
            </tr>
            <tr>
              <th scope="row">All ground</th>
              <td className="num">{count(CHECK_2023.all.ha)} ha</td>
              <td className="num">{percent(CHECK_2023.all.share, 1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="fw-help">
        A large patch is more than 20 squares that touch. MODIS's 500 m pixels miss small burns, so the shares come
        from large patches, which it can see. A small fire may have burned less than these shares.
      </p>
      <dl className="fw-kv">
        <dt>Likely burned</dt>
        <dd>
          {percent(CHECK_2023.peat.share, 1)} of the peat and {percent(CHECK_2023.other.share, 1)} of the other ground in
          its pixels.
        </dd>
        <dt>CO₂ on peat</dt>
        <dd>
          {perHa(peatCo2(PEAT_DM.mean))} t a hectare, likely {perHa(peatCo2(PEAT_DM.low))} to{" "}
          {perHa(peatCo2(PEAT_DM.high))}. A wildfire on drained tropical peat burns {PEAT_DM.mean} t of dry matter a
          hectare, likely {PEAT_DM.low} to {PEAT_DM.high}, at {PEAT_CO2_C} g of carbon as CO₂ a kilogram.
        </dd>
        <dt>CO₂ on other ground</dt>
        <dd>
          {perHa(OTHER_CO2_HA)} t a hectare: {OTHER_DM} t of dry matter, as in secondary tropical forest, at{" "}
          {count(OTHER_CO2)} g of CO₂ a kilogram.
        </dd>
        <dt>Cost</dt>
        <dd>
          US${count(Math.round(COST_PER_HA))} a hectare: US$16.1 billion over 2.6 million ha burned in Indonesia in
          2015, counting haze, health and crop losses.
        </dd>
      </dl>
      <p className="fw-help">
        Methane and carbon monoxide are left out. This estimate is not sealed. Its detections are sealed, and the maps,
        the 2023 check and the factors are pinned, so anyone can redo it.
      </p>
      <Source href={IPCC_PEAT_URL}>IPCC 2013 Wetlands Supplement, Tables 2.6 and 2.7</Source>
      <Source href={IPCC_OTHER_URL}>IPCC 2006 Guidelines, Volume 4, Tables 2.4 and 2.5</Source>
      <Source href={COST_URL}>World Bank, The Cost of Fire (2016)</Source>
      <Source href={PEAT_MAP_URL}>WRI Global Peatlands, v20230315, CC BY 4.0</Source>
      <Source href={PEAT_TILES_URL}>The peat map's tiles and their sha256</Source>
      <Source href={MODIS_URL}>NASA MODIS Burned Area, MCD64A1 Collection 6.1</Source>
      <Source href={CHECK_URL}>The 2023 check, its files and their sha256</Source>
    </>
  );
}

/** The fire view's damage estimate, after where the fire was first seen. */
export function DamagePanel({ fire }: { fire: FireDetail }) {
  if (!fire.damage) return null;
  return (
    <section className="fw-panel damage enter" aria-labelledby="h-damage">
      <h2 id="h-damage">Damage estimate</h2>
      {fire.never_spread && <p className="fw-help">{NEVER_SPREAD}</p>}
      <DamageFigures d={fire.damage} />
      <p className="fw-help">{NOT_MEASURED}</p>
      <details>
        <summary id="h-damage-how">How this is worked out</summary>
        <DamageMethod d={fire.damage} labelledBy="h-damage-how" />
      </details>
    </section>
  );
}

/** The pack's damage estimate, as of the pack's cut time, with its working in full for print. */
export function DamageSection({ pack }: { pack: FireDetail }) {
  if (!pack.damage) return null;
  return (
    <section className="pack-section damage enter" aria-labelledby="h-damage">
      <h2 id="h-damage">Damage estimate</h2>
      {pack.never_spread && <p className="fw-help">{NEVER_SPREAD}</p>}
      <DamageFigures d={pack.damage} />
      <p className="fw-help">{NOT_MEASURED}</p>
      <h3 id="h-damage-how">How this is worked out</h3>
      <DamageMethod d={pack.damage} labelledBy="h-damage-how" />
    </section>
  );
}
