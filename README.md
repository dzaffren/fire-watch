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
- See how the forecast rule did on a replay of 2023, next to a downwind guess, in the forecast panel; `backtest-2023` redoes it byte for byte.
- Each fire gets an estimate of the ground it burned, the CO₂ it released and what that cost, split at the concession's edge, in the fire view and the pack.
- A page at the site's address says what Fire Watch is for a newcomer, with a globe of 14 Oct 2026's fires that flies to a real fire; the tool moves to `/?tool`.
- The landing walks a judge through one real fire, from the company's claim to a seal check in their own browser, then says how to use the tool.
- Play in a fire's replay holds each satellite pass for 1.5 s, not 0.6 s, so the spread can be followed pass by pass.
- Every screen takes colour from a deeper Peatland palette: the maps, the page ground and panels, and two bands on the landing.
- Each detection's seal time comes from the chain, the page reads the chain even when the API says a record is unsealed, and six lines of copy claim no more than the chain or the data show.
- The 2023 replay adds rule version 1's near-edge step alone and a next-pass guess beside the downwind guess. The forecast panel shows all four, and one sentence says what the rule adds.

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
| Load the peat map | `cd api && uv run --env-file ../.env load-peat` |
| Record hotspots | `cd api && uv run --env-file ../.env record-hotspots` |
| Redo the globe's data | `cd api && uv run --env-file ../.env globe-day` |

The database runs PostGIS. A container made before that is plain Postgres; recreate it once
with `docker compose up -d --wait --force-recreate --renew-anon-volumes db`.

`load-concessions` downloads the pinned Trase file and refuses it if its checksum differs; give
it a path and it loads that file as is. `record-hotspots` reads `DATABASE_URL`,
`FIRMS_MAP_KEY`, `RPC_URL`, `FIRE_RUNS_ADDRESS` and `RECORDER_PRIVATE_KEY` from the
environment; `load-concessions` needs only `DATABASE_URL`. Keep them in the untracked `.env` at
the repo root; `--env-file ../.env` loads it, since `uv run` doesn't on its own.

The page opens on the landing at `/`. The tool is at `/?tool`, and a complaint pack at its own
`/?pack=` link.

`load-peat` loads the committed cut of WRI's peat map,
`fixtures/peat/gfw-peatlands-v20230315.geojson.gz`, and refuses it if its sha256 differs; give it
a path and it loads that file as is. Each load replaces the peat already there. The API sends no
damage estimate while the `peat` table is empty.

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

## Redo the peat cut

The damage estimate tells peat from other ground with
`fixtures/peat/gfw-peatlands-v20230315.geojson.gz`: every peat pixel of WRI's Global Peatlands
map, gfw_peatlands v20230315, within 5.5 km of a concession. `api/src/firewatch/peat.py` pins
the 10 tiles it comes from by sha256. GFW serves the tiles only with an API key, so put one in
`.env` as `GFW_API_KEY`. Then, with the full concession map loaded in `DATABASE_URL`:

```sh
cd api && uv run --env-file ../.env load-peat --cut
git diff --stat ../fixtures/peat
```

`load-peat --cut` stops if a tile's sha256 has changed. It took about 2 minutes on the compose
database. An empty `git diff` means you got the same bytes.

Peat map: [WRI Global Peatlands](https://data.globalforestwatch.org/datasets/gfw::global-peatlands/about),
under CC BY 4.0.

## Redo the globe's data

The landing's globe reads three gzipped files in `web/public/globe`: Natural Earth's land, the
NOAA-20 detections of 14 Oct 2026, and the detail around the example fire in
ID-WOOD-CONCESSION-0332. `api/src/firewatch/globe_day.py` pins its sources by sha256 and gives
the method. With `FIRMS_MAP_KEY` in `.env`:

```sh
cd api && uv run --env-file ../.env globe-day
git diff --stat ../web/public/globe
```

`globe-day` downloads FIRMS's world file for the day, Natural Earth 110m and 10m land, and
Trase's concession map. It stops if a file's sha256 has changed. It takes a few seconds. An empty
`git diff` means you got the same bytes. `--out <dir>` writes somewhere else.

Land: [Natural Earth](https://www.naturalearthdata.com/) v5.1.2, in the public domain.

## Redo the real case's data

The landing's real case reads `web/public/case/pack-0332.json`: the complaint pack of the example
fire in ID-WOOD-CONCESSION-0332, cut at 17 Oct 2026 09:00 UTC, as the API answers it (D90). A pack
holds its fire as it stood at its cut, so the API gives the same bytes each time:

```sh
curl -s "https://firewatch-api.thankfulhill-89a2c8ca.southeastasia.azurecontainerapps.io/api/concessions/ID-WOOD-CONCESSION-0332/fires/0x13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7?as_of=1792227600" -o web/public/case/pack-0332.json
sha256sum web/public/case/pack-0332.json
```

The sha256 is `d1a43d1e71fb51bdf0ea0ca28137675d3ad077df53b19afe56aa4aa04b1fd419`. The first call after a
quiet hour can take up to a minute while the API wakes.

## First deploy

1. **Neon:** create a free project. Put its owner URL in `.env` as `DATABASE_URL`, run the
   migration, `load-concessions` and `load-peat`, then create the API's read-only login with
   `infra/neon-reader.sql`.
2. **Base Sepolia:** fund the recorder wallet from a faucet, then deploy the contract:
   `cd contracts && RECORDER_ADDRESS=<recorder> forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --private-key <deployer key> --broadcast`.
   Then verify it on Basescan once, so its transactions read as `seal` calls. With
   `ETHERSCAN_API_KEY` (a free Etherscan key, kept in `.env`) and `RECORDER_ADDRESS` in the
   environment, run from `contracts/`:
   `forge verify-contract 0x6a55489a05a9c79d2cd35212878d113557dceb2a src/FireRecords.sol:FireRecords --chain 84532 --constructor-args "$(cast abi-encode 'constructor(address)' "$RECORDER_ADDRESS")" --watch`.
   The deployed FireRecords was verified this way on 2026-10-17. Then make the owner key and
   deploy FireRuns, which the recorder seals its run roots on (D103, D104), as in "Turning on
   run roots" below.
3. **Google Maps:** two keys. Production is locked to the site's address and to the Maps
   JavaScript API; development is locked to `http://localhost:5173/*`. Cap map loads at 300 a
   day and set a $1 budget alert in the Cloud console.
4. **GitHub:** push the repo. CI runs; Deploy pushes `ghcr.io/<owner>/firewatch-api:<sha>` and
   then fails at the Azure login, which is expected the first time. Make that package public,
   and get its digest: `docker buildx imagetools inspect ghcr.io/<owner>/firewatch-api:<sha>`.
5. **Azure:** `GITHUB_REPO=<owner/name> ALERT_EMAIL=<you> READER_DATABASE_URL=<reader url> IMAGE=ghcr.io/<owner>/firewatch-api@sha256:<digest> OWNER_DATABASE_URL=<owner url> RECORDER_PRIVATE_KEY=<key> FIRMS_MAP_KEY=<key> RPC_URL=https://sepolia.base.org FIRE_RUNS_ADDRESS=<address> infra/setup.sh`.
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

Turning on run roots, in order. The recorder then seals one root per run on FireRuns, and the
owner key can replace the recorder key if it leaks (D103, D104).

1. `migrate up`, which adds the `roots` table and each record's `root_id` and `proof`.
2. Merge to main. Deploy ships the API and the page, which still check every record on
   FireRecords.
3. Make the owner key in an encrypted Foundry keystore on your machine, never in `.env` or
   Azure: `cast wallet new fire-runs-owner`. Fund it for the deploy and for any replacement:
   `cast send <owner address> --value 0.003ether --rpc-url https://sepolia.base.org --private-key "$(grep '^RECORDER_PRIVATE_KEY=' .env | cut -d= -f2-)"`.
4. Deploy FireRuns from the owner key, with the recorder wallet as its recorder, from
   `contracts/`:
   `OWNER_ADDRESS=<owner address> RECORDER_ADDRESS=0x6f09c576Be8AFB0f2175A97A0eFa26DE23A532f3 forge script script/DeployRuns.s.sol --rpc-url https://sepolia.base.org --account fire-runs-owner --broadcast`.
   Verify it, with `ETHERSCAN_API_KEY` in the environment:
   `forge verify-contract <FireRuns address> src/FireRuns.sol:FireRuns --chain 84532 --watch --constructor-args "$(cast abi-encode 'constructor(address,address)' <owner address> 0x6f09c576Be8AFB0f2175A97A0eFa26DE23A532f3)"`.
5. `gh variable set FIRE_RUNS_ADDRESS -b <FireRuns address>`, then rerun Deploy, so the page
   can read FireRuns.
6. Point the recorder job at the merged sha's image by digest, with the new address:
   `az containerapp job update -g firewatch -n firewatch-recorder --image ghcr.io/<owner>/firewatch-api@sha256:<digest> --set-env-vars FIRE_RUNS_ADDRESS=<FireRuns address>`.
   The next run's log line shows `roots=1 run=<n>`, and Basescan shows one `sealRoot` an hour.

To roll back, point the job at its previous digest; it still has `CONTRACT_ADDRESS`, and seals
any record with no `tx_hash` on FireRecords. The page and the API read both contracts, so they
stay. `migrate down` only before any root is sealed, since it drops the proofs.

If the recorder key leaks, make and fund a new recorder wallet, then replace the recorder from
the owner key:
`cast send <FireRuns address> 'replaceRecorder(address)' <new recorder address> --rpc-url https://sepolia.base.org --account fire-runs-owner`.
Then give the job the new key:
`az containerapp job secret set -g firewatch -n firewatch-recorder --secrets recorder-private-key=<new key>`.
A root from the old key is refused from then on, and roots sealed before still check.

Turning on the damage estimate, in order, before the merge: `migrate up`, which adds the `peat`
table and lets the read-only role read it; `load-peat`; then merge to main (Deploy ships the API,
then the page). The API sends no estimate while `peat` is empty, so a page never shows a wrong
one. The fire's log line shows `damage_ms=`. To roll back, revert the merge; `migrate down` only
if the table must go.
