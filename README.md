# ClimateChain hackathon entry

> The backend sleeps when no one is using it, so the first visit after a quiet spell can take up
> to a minute.

<!-- zuko:start — generated from OVERVIEW.md; edit that file, not this block -->

## What it does

An entry for the IEEE ClimateChain Global Hackathon (AI and blockchain for climate, deadline 2026-10-25).
The product is not chosen yet; /shape picks it.

## Features

Nothing shipped yet

## Docs

- [Overview](OVERVIEW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decisions](DECISIONS.md)
- [Changelog](CHANGELOG.md)

<!-- zuko:end -->

## Run it locally

Needs Docker, uv, pnpm and Foundry (`forge`, `anvil` on the path).

| Task | Command |
| ---- | ------- |
| Database for tests | `docker compose up -d --wait db` |
| Contract tests | `cd contracts && forge test` |
| API and recorder tests | `cd api && uv run pytest` |
| Page tests | `cd web && pnpm install && pnpm test` |
| End-to-end test | `cd web && pnpm exec playwright install chromium && pnpm e2e` |
| Migrate | `cd api && uv run python -m firewatch.migrate up` (or `down`) |
| Record the latest hotspot | `cd api && uv run record-latest` |

`record-latest` reads `DATABASE_URL`, `FIRMS_MAP_KEY`, `RPC_URL`, `CONTRACT_ADDRESS` and
`RECORDER_PRIVATE_KEY` from the environment. Keep them in the untracked `.env`.

## First deploy

1. **Neon:** create a free project. Put its owner URL in `.env` as `DATABASE_URL`, run the
   migration, then create the API's read-only login with `infra/neon-reader.sql`.
2. **Base Sepolia:** fund the recorder wallet from a faucet, then deploy the contract:
   `cd contracts && RECORDER_ADDRESS=<recorder> forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --private-key <deployer key> --broadcast`.
3. **Google Maps:** two keys. Production is locked to the site's address and to the Maps
   JavaScript API; development is locked to `http://localhost:5173/*`. Cap map loads at 300 a
   day and set a $1 budget alert in the Cloud console.
4. **GitHub:** push the repo. CI runs; Deploy pushes `ghcr.io/<owner>/firewatch-api:<sha>` and
   then fails at the Azure login, which is expected the first time. Make that package public.
5. **Azure:** `GITHUB_REPO=<owner/name> ALERT_EMAIL=<you> READER_DATABASE_URL=<reader url> IMAGE=<that image> infra/setup.sh`.
   It creates everything with the cost guardrails and a $1 budget alert, then prints the GitHub
   variables to set. Set them and rerun Deploy.
6. **Record:** `cd api && uv run record-latest`.
