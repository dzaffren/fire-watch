# ClimateChain hackathon entry · architecture

**Status:** Active · **Updated:** 2026-10-20 by /ship season-backtest

## Context

```mermaid
flowchart LR
    F[(NASA FIRMS)] -- "fire hotspots" --> P[Fire Watch]
    T[(Trase)] -- "pulpwood concession map" --> P
    P -- "record fingerprints" --> C[(Base Sepolia)]
    U((watchdog investigator)) -- "picks dates and a concession" --> P
    P -- "hotspots and Matches the chain" --> U
```

## Components

```mermaid
flowchart LR
    F[(NASA FIRMS)] -- "area CSV, hourly" --> R[record-hotspots job]
    T[(Trase)] -- "GeoJSON, sha256 pinned" --> L[load-concessions]
    L -- "INSERT concessions" --> D[(Neon + PostGIS)]
    Q[load-peat] -- "committed peat cut, sha256 pinned: INSERT peat" --> D
    R -- "match within 5 km, INSERT" --> D
    R -- "forecasts, then hotspots: seal(recordId, fingerprint v3 or v2)" --> C[FireRecords, Base Sepolia]
    A[API] -- "SELECT, read-only role" --> D
    W[fire record page] -- "GET concessions and fires" --> A
    W -- "sealOf(recordId); a pack's or a fire's forecasts' seals in one Multicall3 read" --> C
    W -- "map load" --> G[Google Maps]
    K[recorder-check] -- "GET /api/health" --> A
    F -- "2023 archive file, sha256 pinned" --> B[backtest-2023]
    B -- "2023.json, bundled at build" --> W
```

Only the recorder job writes, and only it holds the wallet key. The API only reads, and the page
checks the chain itself.

| Component        | Folder                          | Does                                                                                          |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| FireRecords      | `contracts/`                    | Stores each record's fingerprint once; only the recorder wallet can seal                      |
| record-hotspots  | `api/`                          | Hourly Container Apps job: fetches FIRMS, matches hotspots to concessions and stores them; by the chain's clock, settles waiting forecasts and forecasts each fire with a new pass (`forecast.py`, D48, D50); seals the forecasts, then the hotspots (D49) |
| load-concessions | `api/`                          | Operator CLI: loads Trase's pulpwood concession map, once per map version                     |
| load-peat        | `api/`, `fixtures/peat/`        | Operator CLI: loads the committed cut of WRI's Global Peatlands map, once per map version (D69). `--cut` redoes the cut from the 10 pinned tiles with a GFW key (D70) |
| backtest-2023    | `api/`, `fixtures/backtest/`    | Operator CLI, run by hand on the compose db: replays 2023 as the recorder would have run it, with rule version 1 and the downwind guess (D57, D60), and writes the totals and every forecast to `fixtures/backtest/`. Seals nothing (D55) |
| API              | `api/`                          | Read-only FastAPI: `GET /api/concessions`, `GET /api/concessions/{id}`, `GET /api/concessions/{id}/fires/{key}` (`?as_of=` for a pack, D37) and `GET /api/health`; groups a concession's detections into fires on each request (`fires.py`, D31); a fire lists its forecasts, and a concession lists fires forecast inside first (D45); a fire and a pack carry the four hectare parts of its damage, inside and outside, on peat and off it (`peat.py`, D71) |
| Database         | `api/migrations/`               | Postgres with PostGIS on Neon: hotspots, concessions, their matches, forecasts, recorder runs and peat |
| Fire record page | `web/`                          | Lists concessions for the dates, shows one with its fires, shows where a fire was first seen and replays its passes, checks a record against the chain. A fire shows each forecast and its outcome, checked in one Multicall3 read, and the bundled 2023 replay's totals (D54, D59). A complaint pack (`/?pack=`) holds one fire as of a stored time and checks every detection through Multicall3 (D38). A fire and a pack show its damage estimate, with the factors applied in the page (D64, D71) |
| CI and deploy    | `.github/workflows/`, `infra/`  | Tests on every push; a push to main ships the API, then the page; the job's image is set by hand, by digest |
| recorder-check   | `.github/workflows/`            | Hourly: fails, so GitHub emails, after 2 hours without a good run or when a run seals nothing |
