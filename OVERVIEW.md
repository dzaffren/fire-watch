# ClimateChain hackathon entry

**Status:** Active · **Updated:** 2026-10-16 by /ship fire-record

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

## More

README.md · docs/ARCHITECTURE.md · DECISIONS.md · CHANGELOG.md
