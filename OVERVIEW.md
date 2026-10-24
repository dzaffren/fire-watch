# ClimateChain hackathon entry

**Status:** Active · **Release:** v1.1.0 · **Updated:** 2026-10-24 by /ship pack-claims

Fire Watch, an entry for the IEEE ClimateChain Global Hackathon (deadline 2026-10-25). It shows
satellite fire hotspots with on-chain proof that each record hasn't changed since it was sealed,
for watchdog investigators who file grievances over fires on plantation land.

## Run it

| Task    | Command                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------- |
| install | `cd web && pnpm install --frozen-lockfile`; the API installs on its first `uv run`               |
| run     | `cd web && pnpm dev`; `cd api && uv run uvicorn firewatch.app:app`                               |
| test    | `cd contracts && forge test`; `cd api && uv run pytest`; `cd web && pnpm test && pnpm e2e`       |
| lint    | `cd contracts && forge fmt --check`                                                             |

## Where things are

- `contracts/` — FireRuns, which seals one root per recorder run, and FireRecords, which holds the older seals (Foundry)
- `api/` — the hourly `record-hotspots` recorder, `load-concessions`, and the read-only FastAPI service
- `web/` — the fire record page (Vite, React, TypeScript) and the e2e test
- `fixtures/` — FIRMS CSVs, a cut of the Trase concession map, and fingerprint vectors shared by Python and TypeScript
- `infra/` — one-time Azure setup, including the recorder job, and the Neon read-only role
- `.github/workflows/` — CI on every push, deploy on main, an hourly recorder check
- `docs/` — architecture, specs, design system and lessons

## Slices

| Slice            | Status | What it does                                                                                              | Page                              |
| ---------------- | ------ | --------------------------------------------------------------------------------------------------------- | --------------------------------- |
| walking-skeleton | Shipped | The first path from a hotspot to its seal on Base Sepolia and back to a check in the browser. The fire record page replaced its latest-hotspot page. | docs/specs/walking-skeleton.md    |
| fire-record      | Shipped | Pick dates, see which pulpwood concessions had hotspots, and check any hotspot's sealed record.             | docs/specs/fire-record.md         |
| fire-origin      | Shipped | See a concession's fires, where each was first seen against its edge, and its passes in order, from sealed detections. | docs/specs/fire-origin.md         |
| complaint-pack   | Shipped | Turn one fire into a pack with its own link, which anyone's browser checks against the chain, and print it to PDF. | docs/specs/complaint-pack.md      |
| spread-forecast  | Shipped | After each pass, forecast whether a fire near a concession is seen inside within 48 hours, seal it, and list every forecast with its outcome. | docs/specs/spread-forecast.md     |
| season-backtest  | Shipped | See how the forecast rule did on a replay of 2023, next to a downwind guess, in the forecast panel; `backtest-2023` redoes it byte for byte. | docs/specs/season-backtest.md     |
| damage-estimate  | Shipped | Each fire gets an estimate of the ground it burned, the CO₂ it released and what that cost, split at the concession's edge, in the fire view and the pack. | docs/specs/damage-estimate.md     |
| landing-page     | Shipped | A page at the site's address says what Fire Watch is for a newcomer, with a globe of 14 Oct 2026's fires that flies to a real fire; the tool moves to `/?tool`. | docs/specs/landing-page.md        |
| newcomer-walkthrough | Shipped | The landing walks a judge through one real fire, from the company's claim to a seal check in their own browser, then says how to use the tool. | docs/specs/newcomer-walkthrough.md |
| replay-pace      | Shipped | Play in a fire's replay holds each satellite pass for 1.5 s, not 0.6 s, so the spread can be followed pass by pass. | docs/specs/replay-pace.md         |
| palette          | Shipped | Every screen takes colour from a deeper Peatland palette: the maps, the page ground and panels, and two bands on the landing. | docs/specs/palette.md             |
| honest-claims    | Shipped | Each detection's seal time comes from the chain, the page reads the chain even when the API says a record is unsealed, and six lines of copy claim no more than the chain or the data show. | docs/specs/honest-claims.md       |
| fair-baseline    | Shipped | The 2023 replay adds rule version 1's near-edge step alone and a next-pass guess beside the downwind guess. The forecast panel shows all four, and one sentence says what the rule adds. | docs/specs/fair-baseline.md       |
| run-roots        | Shipped | The recorder seals one Merkle root for each run with new records on FireRuns, whose recorder key an owner key can replace. The page checks each new record's proof against its run's root, and old seals still check on FireRecords. | docs/specs/run-roots.md           |
| origin-confidence | Shipped | The fire view, the pack and the landing say when a fire's first sighting is one detection with a long gap after it, and when one fire is several that the satellite first saw apart. | docs/specs/origin-confidence.md   |
| complete-packs   | Shipped | A complaint pack shows, in the reader's browser, that no stored detection of its fire was left out of the recorder runs in its window, and lists any that was. | docs/specs/complete-packs.md      |
| damage-check     | Shipped | Each damage estimate adds the ground that likely burned, at the shares Fire Watch found burned near concessions in 2023 on NASA's MODIS map, in large patches: 61.8% of peat and 42.2% of other ground. `damage-check-2023` redoes the shares from pinned files. | docs/specs/damage-check.md        |
| forecast-v2-trial | Shipped | The 2023 replay adds one rule version 2, picked on January to September and judged once on October to December. It warned of 2 fewer arrivals than the near-edge step there, so rule version 1 stays, and the forecast panel says so. | docs/specs/forecast-v2-trial.md   |
| claim-fixes      | Shipped | The landing opens with the answer a company gives to a fire grievance, and it and the complaint pack claim no more than the chain or the data shows. The README's sha for the example pack matches the API again. | docs/specs/claim-fixes.md         |
| origin-and-range | Shipped | A weak first sighting says "as one detection" in its headline. Every fire names what the satellite can miss, and the CO₂ figure leads with its range. | docs/specs/origin-and-range.md |
| source-claims    | Shipped | The landing names the one satellite Fire Watch reads and when its records begin. The globe caption counts squares, the damage estimate credits its shares to Fire Watch's own check, and a joined fire's inside time names the fire it came from. | docs/specs/source-claims.md |
| pack-claims      | Shipped | The fire view, the complaint pack, the landing and the forecast panel stop making five claims that the chain or the data doesn't support. The landing's earlier sightings rest on a committed copy of NASA's archive, as every other figure on the page does. | docs/specs/pack-claims.md |

## More

README.md · docs/ARCHITECTURE.md · DECISIONS.md · CHANGELOG.md
