# ClimateChain hackathon entry

> The backend sleeps when no one is using it, so the first visit after a quiet spell can take up
> to a minute.

<!-- zuko:start skip=install — generated from OVERVIEW.md; edit that file, not this block -->

## What it does

Fire Watch, an entry for the IEEE ClimateChain Global Hackathon (deadline 2026-10-25). It shows
satellite fire hotspots with on-chain proof that each record hasn't changed since it was written,
for watchdog investigators who file grievances over fires on plantation land.

## Features

- See the latest fire hotspot on a map, with a check that its record still matches the seal on Base Sepolia.
- Pick dates, see which pulpwood concessions had hotspots, and check any hotspot's sealed record.
- See a concession's fires, where each was first seen against its edge, and its passes in order, from sealed detections.
- Turn one fire into a pack with its own link, which anyone's browser checks against the chain, and print it to PDF.
- After each pass, forecast whether a fire near a concession is seen inside within 48 hours, seal it, and list every forecast with its outcome.

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
| Migrate | `cd api && uv run --env-file ../.env python -m firewatch.migrate up` (or `down`) |
| Load the concession map | `cd api && uv run --env-file ../.env load-concessions` |
| Record hotspots | `cd api && uv run --env-file ../.env record-hotspots` |

The database runs PostGIS. A container made before that is plain Postgres; recreate it once
with `docker compose up -d --wait --force-recreate --renew-anon-volumes db`.

`load-concessions` downloads the pinned Trase file and refuses it if its checksum differs; give
it a path and it loads that file as is. `record-hotspots` reads `DATABASE_URL`,
`FIRMS_MAP_KEY`, `RPC_URL`, `CONTRACT_ADDRESS` and `RECORDER_PRIVATE_KEY` from the
environment; `load-concessions` needs only `DATABASE_URL`. Keep them in the untracked `.env` at
the repo root; `--env-file ../.env` loads it, since `uv run` doesn't on its own.

## Redo the 2023 replay

The forecast panel's 2023 numbers are `fixtures/backtest/2023.json`, and every forecast behind
them is in `fixtures/backtest/2023-forecasts.csv`. To redo both on the compose database:

```sh
docker compose up -d --wait db
cd api && DATABASE_URL=postgresql://firewatch:firewatch@127.0.0.1:55432/firewatch uv run backtest-2023
git diff --stat ../fixtures/backtest
```

`backtest-2023` downloads FIRMS's 2023 VIIRS NOAA-20 file for Indonesia and Trase's concession
map. It stops if either file's sha256 has changed. The FIRMS file's sha256 is
`99969d975480ab57a129b02502b4b968ced195dc2c7fcaf947eb693ef7010fd7`. It loads the map into the
database, replays 2023 as the hourly recorder would have run it, and writes both files over the
committed ones. It takes about 2 minutes. An empty `git diff` means you got the
same bytes.

The same bytes come out on the compose database's PostGIS 3.5, the version Neon runs. Another
PostGIS or GEOS version can move an edge distance by a metre.

`--firms <path>` and `--map <path>` read saved copies instead. `--out <dir>` writes somewhere else.
The downwind guess reads its wind from `fixtures/backtest/2023-wind.csv`. `--fetch-wind` fetches it
again from Open-Meteo, 35 seconds between requests, in about 10 minutes.

Wind data by [Open-Meteo.com](https://open-meteo.com/): ERA5 hourly reanalysis from the
Copernicus Climate Change Service, under CC BY 4.0.

## First deploy

1. **Neon:** create a free project. Put its owner URL in `.env` as `DATABASE_URL`, run the
   migration and `load-concessions`, then create the API's read-only login with
   `infra/neon-reader.sql`.
2. **Base Sepolia:** fund the recorder wallet from a faucet, then deploy the contract:
   `cd contracts && RECORDER_ADDRESS=<recorder> forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --private-key <deployer key> --broadcast`.
   Then verify it on Basescan once, so its transactions read as `seal` calls. With
   `ETHERSCAN_API_KEY` (a free Etherscan key, kept in `.env`) and `RECORDER_ADDRESS` in the
   environment, run from `contracts/`:
   `forge verify-contract 0x6a55489a05a9c79d2cd35212878d113557dceb2a src/FireRecords.sol:FireRecords --chain 84532 --constructor-args "$(cast abi-encode 'constructor(address)' "$RECORDER_ADDRESS")" --watch`.
   The deployed FireRecords was verified this way on 2026-10-17.
3. **Google Maps:** two keys. Production is locked to the site's address and to the Maps
   JavaScript API; development is locked to `http://localhost:5173/*`. Cap map loads at 300 a
   day and set a $1 budget alert in the Cloud console.
4. **GitHub:** push the repo. CI runs; Deploy pushes `ghcr.io/<owner>/firewatch-api:<sha>` and
   then fails at the Azure login, which is expected the first time. Make that package public,
   and get its digest: `docker buildx imagetools inspect ghcr.io/<owner>/firewatch-api:<sha>`.
5. **Azure:** `GITHUB_REPO=<owner/name> ALERT_EMAIL=<you> READER_DATABASE_URL=<reader url> IMAGE=ghcr.io/<owner>/firewatch-api@sha256:<digest> OWNER_DATABASE_URL=<owner url> RECORDER_PRIVATE_KEY=<key> FIRMS_MAP_KEY=<key> RPC_URL=https://sepolia.base.org CONTRACT_ADDRESS=<address> infra/setup.sh`.
   It creates everything with the cost guardrails and a $1 budget alert, including the
   `firewatch-recorder` job that runs `record-hotspots` on the hour with the recorder's
   settings as secrets, then prints the GitHub variables to set. Set them and rerun Deploy.
6. **Record:** the job's first run takes the 5 days FIRMS offers. To start it now rather
   than on the hour: `az containerapp job start -g firewatch -n firewatch-recorder`. The
   Recorder check workflow fails, so GitHub emails you, after 2 hours without a good run or
   when a run seals nothing while records wait.

## Updating

Deploy ships the API and the page on every push to main. GitHub can't reach the recorder job,
which holds the wallet key, so after a recorder change point it at the new image by hand, by
digest so a re-pushed tag can't change it:
`az containerapp job update -g firewatch -n firewatch-recorder --image ghcr.io/<owner>/firewatch-api@sha256:<digest>`.

Moving a walking-skeleton deploy to the fire record, in order: `migrate up`,
`load-concessions`, merge to main (Deploy ships the API and the page), then rerun
`infra/setup.sh` as in step 5 with `IMAGE` at the merged sha's digest. That creates the job, whose
first run backfills, and narrows GitHub's Azure role to the API app. The Recorder check is red
until that first run finishes. If Deploy's `az containerapp update` is then refused, also give
GitHub Contributor on `firewatch-env`. To stop recording,
`az containerapp job delete -g firewatch -n firewatch-recorder`; `setup.sh` recreates it.

Turning on spread forecasts, in order, on the day it merges: `migrate up`, which adds the
`forecasts` table and lets the read-only role read it; merge to main (Deploy ships the API, then
the page); then point the recorder job at the merged sha's image by digest, as above. Forecasts
count only from their seal, so each day between the merge and the job update loses that day's
forecasts. The next run's log line shows `forecasts=` and `forecast_ms=`. To roll back, point the
job at its previous digest; `migrate down` only if the table must go.
