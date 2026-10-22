# ClimateChain hackathon entry

**Status:** Active · **Updated:** 2026-10-22 by /ship run-roots

Fire Watch, an entry for the IEEE ClimateChain Global Hackathon (deadline 2026-10-25). It shows
satellite fire hotspots with on-chain proof that each record hasn't changed since it was written,
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
| walking-skeleton | Shipped | See the latest fire hotspot on a map, with a check that its record still matches the seal on Base Sepolia. | docs/specs/walking-skeleton.md    |
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
| run-roots        | Shipped | The recorder seals one Merkle root per run on FireRuns, whose recorder key an owner key can replace. The page checks each new record's proof against its run's root, and old seals still check on FireRecords. | docs/specs/run-roots.md           |

## More

README.md · docs/ARCHITECTURE.md · DECISIONS.md · CHANGELOG.md
