# ClimateChain hackathon entry

**Status:** Active · **Updated:** 2026-10-20 by /ship season-backtest

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

- `contracts/` — FireRecords, the write-once seal contract (Foundry)
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

## More

README.md · docs/ARCHITECTURE.md · DECISIONS.md · CHANGELOG.md
