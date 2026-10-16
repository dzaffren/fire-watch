# ClimateChain hackathon entry · architecture

**Status:** Active · **Updated:** 2026-10-17 by /build complaint-pack

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
    R -- "match within 5 km, INSERT" --> D
    R -- "seal(recordId, fingerprint v2)" --> C[FireRecords, Base Sepolia]
    A[API] -- "SELECT, read-only role" --> D
    W[fire record page] -- "GET concessions and fires" --> A
    W -- "sealOf(recordId); a pack's seals in one Multicall3 read" --> C
    W -- "map load" --> G[Google Maps]
    K[recorder-check] -- "GET /api/health" --> A
```

Only the recorder job writes, and only it holds the wallet key. The API only reads, and the page
checks the chain itself.

| Component        | Folder                          | Does                                                                                          |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| FireRecords      | `contracts/`                    | Stores each record's fingerprint once; only the recorder wallet can seal                      |
| record-hotspots  | `api/`                          | Hourly Container Apps job: fetches FIRMS, matches hotspots to concessions, stores and seals them |
| load-concessions | `api/`                          | Operator CLI: loads Trase's pulpwood concession map, once per map version                     |
| API              | `api/`                          | Read-only FastAPI: `GET /api/concessions`, `GET /api/concessions/{id}`, `GET /api/concessions/{id}/fires/{key}` (`?as_of=` for a pack, D37) and `GET /api/health`; groups a concession's detections into fires on each request (`fires.py`, D31) |
| Database         | `api/migrations/`               | Postgres with PostGIS on Neon: hotspots, concessions, their matches and recorder runs         |
| Fire record page | `web/`                          | Lists concessions for the dates, shows one with its fires, shows where a fire was first seen and replays its passes, checks a record against the chain. A complaint pack (`/?pack=`) holds one fire as of a stored time and checks every detection through Multicall3 (D38) |
| CI and deploy    | `.github/workflows/`, `infra/`  | Tests on every push; a push to main ships the API, then the page; the job's image is set by hand, by digest |
| recorder-check   | `.github/workflows/`            | Hourly: fails, so GitHub emails, after 2 hours without a good run or when a run seals nothing |
