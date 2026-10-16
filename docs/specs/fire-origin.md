# Fire origin

**Version:** v1 · **Status:** Draft · **Type:** Feature · **Project type:** Web UI

**Shape doc:** docs/specs/fire-watch/shape.md
**Depends on:** fire-record

The investigator opens a concession and sees its nearby detections grouped into fires. For each
fire it says where the satellite first saw it against the boundary, and in what order it spread,
pass by pass, built only from detections already sealed. It comes now because "the fire started
outside and spread in" is the answer companies give (shape O3), and complaint-pack needs it.

## Problem

Companies answer fire grievances by saying the fire started outside their concession and spread
in (KLK, Sept 2026, shape O3). Fire Watch today lists single detections on or near a concession.
It doesn't group them into fires or say where a fire was first seen, so the investigator can't
answer that claim from it.

The fires are there. From 2026-10-12 03:32 to 2026-10-15 18:43 UTC, the 6,608 recorded detections
form 1,451 fires (same fire when within 1 km and 48 hours, D25), and 400 of them were seen on two
or more passes. A fire had detections on both sides of a concession's edge 65 times. In 15 of
those, every first detection sat more than 375 m from the edge on one side, so the record can say
which side it was first seen on. In the other 50 it can't (O5, D26).

## Slice test

| Check                         | Result |
| ----------------------------- | ------ |
| Cuts every layer it needs     | yes — fires worked out in the API from the stored records, a fire view on the page, shipped by the existing deploy. The recorder and the chain don't change (D24) |
| One e2e test walks it         | yes — record the real ID-WOOD-CONCESSION-0332 fire on anvil, open 0332, open the fire, see "First seen outside, 950 m from the edge", step through 4 passes, see the first detection match the chain |
| Worth shipping alone          | yes — when a company says a fire started outside, the investigator can show where the satellite first saw it, from sealed detections, or know the record can't settle it |
| Fits (≤5 scenarios, ≤2 areas) | yes — 5 scenarios; two areas: the API's fire grouping and the page's fire view |

**Split.** The shaped fire-origin also forecast where each fire goes next. That fails "Fits": the
forecast brings a wind source, a model, a new kind of seal and a check against where the fire
really went, a third area and at least three more scenarios. It becomes its own slice:

- **fire-origin** (this spec): fires, where each was first seen, and the spread order.
- **spread-forecast** (new): where a fire goes next, sealed before it arrives. Takes shape O12.
  season-backtest now depends on it rather than on fire-origin.

**Path:** full — a new interface and new logic over the stored records.

## User story

As a watchdog investigator, I want to see where each fire near a concession was first seen
against its boundary and how it spread, pass by pass, from sealed detections, so that when the
company says it started outside, I can show what the satellite recorded, or know the record
can't settle it.

## Flow

```mermaid
flowchart LR
    I((investigator)) -- "opens ID-WOOD-CONCESSION-0332" --> V[concession view]
    V -- "fires near it, worked out from every stored detection" --> L[fire list]
    L -- "opens a fire" --> F[first seen, and the spread by pass]
    F -- "steps through 4 passes" --> F
    F -- "picks a detection" --> P[record panel]
    P -- "Matches the chain" --> I
```

The investigator opens a concession, opens one of its fires, reads where it was first seen,
steps through its passes, and checks any detection against the chain as before.

## States

```mermaid
stateDiagram-v2
    [*] --> Burning: a detection with none of the fire's within 1 km in the 48 h before
    Burning --> Burning: a pass adds a detection within 1 km of the fire
    Burning --> Merged: one detection lies within 1 km of two fires
    Merged --> Burning: one fire, the earlier first pass decides first seen
    Burning --> Over: 48 h with no detection within 1 km
```

Fires are worked out again on each request, so a new pass grows a fire, and a detection that
links two fires changes what the joined fire reads (O4, D25).

How the first pass is read, per concession:

| First pass | Reads |
| ---------- | ----- |
| Every detection inside, each more than 375 m from the edge | First seen inside, at the nearest one's distance |
| Every detection outside, each more than 375 m from the edge | First seen outside, at the nearest one's distance |
| Any detection within 375 m of the edge, or detections on both sides | Too close to the edge to tell which side it started on |

375 m is half the widest VIIRS pixel: fire-record's fixture has scan widths from 0.33 to 0.76 km.
A detection farther than that from the edge has its whole pixel on one side. Geolocation error
is not counted.

## Acceptance criteria

```gherkin
Scenario: A fire first seen outside a concession, then seen inside
  Given recording started 2026-10-12 03:32 UTC
  And these VIIRS NOAA-20 detections near ID-WOOD-CONCESSION-0332 are recorded and sealed:
    | pass (UTC)       | detections | against ID-WOOD-CONCESSION-0332                  |
    | 2026-10-13 17:37 | 3          | outside, 954 to 1,258 m from the edge            |
    | 2026-10-14 06:18 | 6          | outside, 731 to 1,575 m                          |
    | 2026-10-14 17:20 | 4          | outside, 32 to 761 m                             |
    | 2026-10-15 18:43 | 6          | 4 inside, 194 to 804 m; 2 outside, 7 and 283 m   |
  When the investigator opens ID-WOOD-CONCESSION-0332 for 2026-10-12 to 2026-10-15
  And opens this fire
  Then it reads "First seen outside, 950 m from the edge" and "2026-10-13 17:37 UTC"
  And "Seen inside from 2026-10-15 18:43 UTC"
  And it lists the 4 passes in time order, 19 detections, each checkable against the chain
  And it says recording had started 38 hours before, so the fire may have been burning earlier

Scenario: A fire first seen inside a concession
  Given these detections are recorded and sealed:
    | pass (UTC)       | detections | against ID-WOOD-CONCESSION-0356              | against ID-WOOD-CONCESSION-0372 |
    | 2026-10-14 06:20 | 1          | inside, 409 m from the edge                  | outside, 4,182 m               |
    | 2026-10-14 17:20 | 3          | 2 inside, 217 and 304 m; 1 outside, 211 m    | outside, 3,976 to 4,399 m      |
  When the investigator opens this fire from ID-WOOD-CONCESSION-0356
  Then it reads "First seen inside, 410 m from the edge" and "2026-10-14 06:20 UTC"
  And it has no "Seen outside from" line, since the one outside detection is within 375 m
  And it has no recording-start note, since recording had run 51 hours
  When they open the same fire from ID-WOOD-CONCESSION-0372
  Then it reads "First seen outside, 4.2 km from the edge"

Scenario: A fire first seen too close to the edge to tell
  Given these detections near ID-WOOD-CONCESSION-0540 are recorded and sealed:
    | pass (UTC)       | detections | against ID-WOOD-CONCESSION-0540          |
    | 2026-10-14 06:18 | 1          | inside, 158 m from the edge              |
    | 2026-10-14 19:02 | 3          | 1 inside, 88 m; 2 outside, 64 and 108 m  |
    | 2026-10-15 05:59 | 2          | inside, 360 and 408 m                    |
    | 2026-10-15 18:41 | 2          | inside, 235 and 302 m                    |
  When the investigator opens this fire
  Then it reads "First seen 160 m inside the edge, within one satellite pixel of it"
  And "The satellite record can't say which side this fire started on"
  And "Seen inside from 2026-10-15 05:59 UTC"

Scenario: A heat source that never spreads is flagged
  Given 6 detections inside ID-WOOD-CONCESSION-0540, 1,106 to 1,661 m from the edge, on 5 passes
    from 2026-10-12 06:57 to 2026-10-15 18:41 UTC, none more than 483 m from the first
  When the investigator opens this fire
  Then it says "Seen on 5 passes without spreading. This can be a fixed heat source, such as a
    mill, or peat smouldering in place."

Scenario: The chosen dates don't move where a fire was first seen
  Given the ID-WOOD-CONCESSION-0332 fire from the first scenario
  When the investigator picks 2026-10-15 to 2026-10-15
  Then the fire is listed
  And it still reads "First seen outside, 950 m from the edge" and "2026-10-13 17:37 UTC"
  And all 4 passes show
```

## Scope

**In:**
- A concession's fires, worked out from every stored version 2 detection inside or within 5 km of
  it: same fire when a detection is within 1 km and 48 hours of one already in it (D25). Rule
  version 1, written out on the page and in the repo, so anyone can redo it.
- The dates pick which fires show, those with any detection in the range. They never cut a fire:
  first seen and the passes come from all its detections (scenario 5).
- Per fire and concession: the first pass read as in the table above; the first pass seen on the
  other side, using the same 375 m rule; every pass in time order with its detections; each
  detection opens the record panel and its chain check, unchanged from fire-record.
- Wording says "first seen", never "started". Help text says NOAA-20 passes about twice a day,
  so a fire can burn for hours, or under cloud, before it is seen (O2).
- A fire first seen within 48 hours of recording starting (2026-10-12 03:32 UTC) says it may have
  been burning before recording began.
- A fire seen on 4 or more passes with no detection more than 750 m from its first carries the
  never-spread note of scenario 4 (D27). 5 fires met that on 2026-10-12 to 15.
- No new seals. Each detection was sealed when recorded; the fire is worked out from them (D24).

**Out:**
- Where a fire goes next — spread-forecast (new slice).
- Other satellites (VIIRS S-NPP, NOAA-21, MODIS) — not planned yet. They would add passes about
  50 minutes apart on the same afternoon and night orbits, not shrink the 375 m doubt, and would
  triple the seals (fire-record put them here; moved out).
- Settling "too close to tell" with sharper imagery such as Sentinel-2 — not planned.
- Fires that start more than 5 km from every concession: their detections out there are never
  recorded (D13), so they read as first seen where they came within 5 km.
- A link to each fire, and the pack for a buyer — complaint-pack.
- Past seasons — season-backtest.
- Company names — not planned (shape O10).

## Interface

The concession step's table becomes its fires, and a fire step sits between it and the record.
Every detection belongs to exactly one fire, so each stays one click deeper. The map still shows
all the concession's detections, and clicking one opens its fire. Record first, map second, as
before (D2).

```mermaid
flowchart LR
    D[Dates] -- "a valid range" --> L[Concession list]
    L -- "opens a row" --> C[Concession and its fires]
    C -- "picks a fire row or a dot" --> F[Fire: first seen, detections, replay]
    F -- "picks a detection row or a dot" --> R[Detection record]
    R -- "Fire first seen 13 Oct 17:37" --> F
    F -- "Fires in ID-WOOD-CONCESSION-0332" --> C
    C -- "All concessions" --> L
```

The investigator opens a concession, picks a fire, reads where it was first seen, plays its passes
on the map, and opens any detection's record; back links step out one level at a time.

| Step | Left column | Map |
| ---- | ----------- | --- |
| Concession | As fire-record, plus "Fires 34" in the details. Then "Detections within 1 km and 48 hours of each other count as one fire. Largest first." and a table, most detections first, then newest first seen: First seen (UTC), with "4 passes, 19 detections" under it, and Where first seen ("Outside, 950 m", "Too close to tell", "Both sides of the edge"), with "Inside from 15 Oct 18:43", the edge distance, or "Never spread" under it. 100 rows at a time | As fire-record: boundary and every detection in the dates. A dot opens its fire |
| Fire | "Fires in ID-WOOD-CONCESSION-0332", then a panel: the reading as its title ("First seen outside, 950 m from the edge"), the notes that qualify it, then Concession, First seen, Seen inside from or Seen outside from, Last seen, Passes ("4, with 19 detections"), and "How this is worked out" behind a disclosure. Then "19 detections, oldest first. Pick one to check it against the chain." and the detections table from fire-record, oldest first | Framed on the fire's detections plus about 1 km, at most zoom 14. First-pass detections are first-seen diamonds; the rest fade older to newer. The replay timeline sits across the top, left of the zoom buttons, starting on the last pass. Legend adds First seen and Older to newer |
| Record | "Fire first seen 13 Oct 17:37", then the record panel, unchanged | Stays framed on the fire, the picked detection ringed |

| State | What shows |
| ----- | ---------- |
| Reading inside or outside | "First seen inside, 410 m from the edge" |
| Too close to tell | "First seen 160 m inside the edge, within one satellite pixel of it", then "The satellite record can't say which side this fire started on." |
| Both sides on the first pass | "First seen on both sides of the edge", with the same note |
| Never spread | "Seen on 5 passes without spreading. This can be a fixed heat source, such as a mill, or peat smouldering in place." |
| Near recording start | "Recording had started 38 hours before this fire was first seen, so it may have been burning earlier." Under an hour: "less than an hour" |
| One pass only | No replay; the diamonds alone |
| Loading or couldn't load a fire | The panel's skeleton; or "Couldn't load this fire", "The server didn't answer. Try again in a moment." and Try again |
| Replay | Play, then one pass a step; dragging or the arrow keys move it and stop play. Its value reads "Pass 2 of 4, 2026-10-14 06:18 UTC" |

**Fixed copy.** "How this is worked out": "A detection joins a fire when it is within 1 km and 48
hours of one already in it. The first pass is the earliest satellite pass that saw the fire. A side
is named only when every detection on that pass is more than 375 m from the edge, half the widest
VIIRS pixel; nearer than that, the fire could be on either side." and "NOAA-20 passes about twice
a day and cloud can hide a fire, so it may burn for hours before it is first seen. Each detection
is sealed, so anyone can redo this from the chain and NASA FIRMS's public archive."

**Inside tint.** Every map view fills the open concession with `--fw-concession` under its dashed
edge, so the map shows which side is inside (D29). The legend row reads "Concession: dashed edge,
tint inside".

**Map labels.** Google's place labels are off on every view: at the fire view's zoom they put
business names such as a "PT" company beside the boundary, and records name no company (shape
O10).

**The page expects** (pause 3 settles it): `GET /api/concessions/<id>` adds `fires`, largest first,
each as `FireSummary` in `web/src/api.ts`, and a `fire_key` on each detection; a new
`GET /api/concessions/<id>/fires/<key>` returns one fire with every detection, oldest first, each
with its `pass`. A fire's key is the record ID of its first detection.

**Motion tier:** 2 for the replay only, as the design system sets: one pass a step every
`--fw-replay-step` (600 ms, D30), no easing, under reduced motion too. Everything else stays tier 1.

**Components used:** `fw-panel`, `fw-kv`, `fw-table` (with the selected row), `fw-help`, `fw-link`,
`fw-btn` (secondary), `fw-mono`, `fw-empty`, `fw-skeleton`, the disclosure from the record panel,
and from the detections guideline: fire dots, older-to-newer opacity, the selected ring, the
first-seen diamond, the concession boundary with its inside tint, and the replay timeline. One new
token, `--fw-concession`, added through `/design-system` (D29); the timeline is a native range
input drawn as the guideline's track.

**Design system:** Fire Watch, `docs/design/design-system/` (D2, D4, D22, D29, D30).

**Preview:** real components in `web/src`: `ConcessionView` (fires table), `FireView` with
`Replay`, `FireMap` (fade, diamonds, framing on the fire) and `FireRecordPage`. Run
`cd web && pnpm dev` and open `http://localhost:5173/?preview=fire-origin`. Pickers at the top
switch between 18 states, numbered by scenario, and themes; `&state=edge&theme=dark` links
straight to one. The data is real VIIRS NOAA-20 detections from 2026-10-12 to 15 near
ID-WOOD-CONCESSION-0332, 0356, 0372 and 0540, grouped by D25 to D27 from the live read-only
database (`web/src/preview/fire-origin.fixture.json`, no company names); seal times,
fingerprints and transactions are made up. It replaces the fire-record preview, which showed the
old concession table. Drift check passed over the 11 files written; all 36 tokens used exist in
`docs/design/design-system/tokens/`. The 9 unit tests that read the old detections table in
`ConcessionView.test.tsx` and `FireRecordPage.test.tsx` fail until `/build` rewrites them.

## Technical plan

### Approach

The API works fires out on each request, in a new pure-Python module, `fires.py`, from every
stored detection near the concession. Nothing new is stored and nothing new is sealed (D24). The
concession route adds the fires with a detection in the dates, largest first, and tags each
detection with its fire. A new route returns one fire with every detection in it, whatever the
dates. The recorder, the contract, the schema and the job don't change. The page is the pause 2
preview code, already in `web/src`.

Relies on: D7, D9, D10, D13, D14, D17, D18, D21, D24–D30, and D31, D32 drafted below.

```mermaid
flowchart TB
    subgraph browser
        P["FireRecordPage → ConcessionView → FireView → RecordPanel"]
    end
    subgraph api["firewatch-api, Container Apps"]
        R1["GET /api/concessions/&lt;id&gt;"]
        R2["GET /api/concessions/&lt;id&gt;/fires/&lt;key&gt;"]
        G["fires.group(), rule version 1"]
    end
    DB[("Neon: hotspots, hotspot_concessions")]
    C["FireRecords, Base Sepolia"]
    J["record-hotspots job, unchanged"]
    P -- "dates, concession ID" --> R1
    P -- "fire key" --> R2
    R1 -- "every detection near the concession" --> G
    R2 -- "every detection near the concession" --> G
    R1 -- "SELECT, read-only role" --> DB
    R2 -- "SELECT, read-only role" --> DB
    P -- "sealOf(recordId)" --> C
    J -- "INSERT, seal, hourly" --> DB
```

Both routes read the concession's detections and group them the same way; only the recorder
writes, and the browser checks seals itself, as before.

```mermaid
sequenceDiagram
    participant B as browser
    participant A as API
    participant D as Neon
    participant C as Base Sepolia RPC
    B->>A: GET /api/concessions/ID-WOOD-CONCESSION-0332?from=2026-10-12&to=2026-10-15
    A->>D: every version 2 detection matched to 0332 (502 rows, 17–30 ms)
    A->>A: fires.group(): 34 fires
    A->>D: records in the dates, as today
    A-->>B: boundary, records each with fire_key, fires largest first
    B->>A: GET /api/concessions/ID-WOOD-CONCESSION-0332/fires/0x48f2…fbc1
    A->>D: every detection matched to 0332, grouped again
    A->>D: the fire's 19 records by record_id
    A-->>B: the fire's reading and its records oldest first, each with pass
    B->>C: sealOf(recordId) for a picked detection
    C-->>B: sealed fingerprint, "Matches the chain"
```

The page asks for the concession, then for one fire by its key, and checks a picked detection
against the chain.

### Changes

| File | What | Why |
| ---- | ---- | --- |
| `api/src/firewatch/fires.py` (new) | `group(detections, recording_started)`: union-find over a 0.01° grid; two detections join when within 1,000 m by haversine on a 6,371,008.8 m sphere and within 48 h (D25). A new pass starts after a 30-minute gap (NOAA-20's next orbit is about 100 minutes on). Per fire: `key` (D32), first and last seen, passes, `first_seen` read by the 375 m rule (D26), `inside_from` and `outside_from`, `never_spread` (4+ passes, all within 750 m of the first, D27), `recorded_before_h` under 48. `RULE_VERSION = 1`. No new dependency (D18) | Scenarios 1–5 |
| `api/src/firewatch/app.py:44` | `CONCESSION_DETECTIONS`: every version 2 detection matched to the concession, with `inside` and `edge_m`. `concession()` (`:135`) groups them, keeps fires with a detection in the dates, ranks them by detections, then newest first seen, then key (D28), and adds `fire_key` to each record. New `GET /api/concessions/{id}/fires/{key}`: `key` must match `^0x[0-9a-f]{64}$` (422), 404 for an unknown concession or key, records by `record_id = ANY(...)` oldest first, each with `pass`. `RECORDING_STARTED` (`:24`) gives the exact start. Logs `served fire id=… key=… detections=… passes=… group_ms=…` | Scenarios 1–5 |
| `api/tests/test_fires.py` (new) | The five scenario fires read as the spec says; joining rule at 999 and 1,001 m and at 47 and 49 h; pass split at 30 min; a chain of detections merging two fires keeps the earlier key; `recorded_before_h` 38 and none; never spread at 4 passes, not at 3 | Scenarios 1–4 |
| `api/tests/test_app.py` | `test_concession_lists_fires_largest_first_with_fire_keys`, `test_fire_has_every_detection_whatever_the_dates` (scenario 5), `test_fire_detections_oldest_first_with_pass`, `test_unknown_fire_is_404`, `test_malformed_fire_key_is_422`; reuses `record()` (`:31`) | Scenarios 1, 5 |
| `fixtures/fires/scenarios.json` (new) | The stored detections of the five scenario fires and their neighbours near 0332, 0356, 0372 and 0540 (ID, position, time, inside, edge_m), from the live database on 2026-10-16; no company names | Unit and API tests at real distances |
| `fixtures/firms/fire-origin.csv` (new) | Real FIRMS rows for the 0332 fire of scenario 1, fetched by date from the FIRMS area API | E2E |
| `fixtures/concessions/trase-cut.geojson` | Adds the real boundaries of ID-WOOD-CONCESSION-0332, 0356 and 0372 from the pinned Trase file | E2E, API tests |
| `web/src/` (pause 2) | `ConcessionView`, `FireView` with `Replay`, `FireMap` (tint, diamonds, fade, framing), `FireRecordPage`, `api.ts` (`fire()`), `format.ts`, `maps.ts`, `icons.tsx`, `app.css`: already written | Scenarios 1–5 |
| `web/src/*.test.ts(x)` | `ConcessionView.test.tsx` and `FireRecordPage.test.tsx` rewritten for the fires flow on `fire-origin.fixture.json`; new `FireView.test.tsx` (readings, notes, `Replay` steps at `--fw-replay-step`, stops when dragged); `FireMap.test.tsx` adds the tint, diamonds, fade and framing on `area`; `format.test.ts` adds `firstSeenLine`. `fire-record.fixture.json` goes once nothing reads it | Test plan |
| `web/e2e/fire-origin.spec.ts` (new), `fire-record.spec.ts`, `global-setup.ts:29` | The FIRMS fixture server serves `fire-record.csv` then `fire-origin.csv`'s rows. `fire-record.spec.ts` reaches hotspot A and B through their fires; the new spec walks scenario 1 | E2E |
| `.github/workflows/deploy.yml:71` | The web job needs the API job, so the page never ships before the routes it calls | Risk: deploy order |

Reusing: `connect()`, `_range()`, `_record()`, `RECORDING_STARTED`, the `record()` and `client`
pytest fixtures, the e2e harness with its anvil, FIRMS server and fake map, and every pause 2
component.

**API.**

| Route | Answers |
| ----- | ------- |
| `GET /api/concessions/<id>?from=<date>&to=<date>` | As today, plus `fires`: each with `key`, `first_seen_unix`, `last_seen_unix`, `passes`, `detections`, `first_seen` (`reading`, `inside`, `edge_m`), `inside_from_unix`, `outside_from_unix`, `never_spread`, `recorded_before_h`, largest first. Each record gains `fire_key` |
| `GET /api/concessions/<id>/fires/<key>` | 200 with the same fire fields and `hotspots`, every record oldest first, each with `pass`. 404 when the concession or fire is unknown, including a fire that has since joined an older one (O11). 422 for a malformed key. No dates: a fire is never cut by them |

### Earn-it

| Added | Triggered by |
| ----- | ------------ |
| `fires.py` | Scenarios 1–5: the rule in one module anyone can read and rerun (D24, D25) |
| The fire route | Scenario 5: a fire's detections outside the dates, which the concession response doesn't carry |
| `fire_key` on records | Pause 2: a dot on the concession map opens its fire |
| Key format check | Security: the key is bound as 32 bytes, never parsed loosely |
| `fixtures/fires/scenarios.json` | Unit and API tests at real distances without running PostGIS matching |
| Deploy order | Risk: the page calling a route the API doesn't have yet |

Cut: a fires table and recorder change (D31), a cache, PostGIS clustering (D31), shapely and
pyproj (D18), sealing fires (D24).

### Non-functionals

|                      |                                                                               |
| -------------------- | ----------------------------------------------------------------------------- |
| **Load**             | Tens of visits a day during judging. Each concession or fire request reads that concession's detections once more: 1,083 for the busiest, ID-WOOD-CONCESSION-0345, on 2026-10-12 to 15, fetched in 17 ms and grouped in 24 ms on a laptop (2026-10-16) |
| **Breaks first**     | Grouping grows with the record, on every request: 10,830 detections, about 40 days of 0345, took 270 ms on a laptop; the 0.25-vCPU container is slower, unmeasured (O12). Past about 1 s, the recorder stores each detection's fire key after each run |
| **Security surface** | Public: the two GET routes. The concession ID is a bound parameter; the key must be `0x` plus 64 hex characters and is bound as bytes; dates as today. Read-only role, CORS for the site only. No secrets touched. Stores nothing |
| **Proof it works**   | The API logs `served fire id=ID-WOOD-CONCESSION-0332 key=0x48f2…fbc1 detections=19 passes=4 group_ms=31`; the live page opens a concession's largest fire and reads "First seen …"; the e2e passes in CI |
| **Rollout**          | No flag: the new fire step is the release, and the recorder, schema and job are untouched. Merge to main: Deploy ships the API, then the page. Rollback: the API image to the previous sha and redeploy the previous page commit; nothing to migrate back |

### Test plan

| Scenario | Test | Command |
| -------- | ---- | ------- |
| 1. First seen outside, then inside | `api/tests/test_fires.py::test_0332_first_seen_outside_then_inside`; `web/e2e/fire-origin.spec.ts`; `FireView.test.tsx` "reads first seen outside with the recording note" | `cd api && uv run pytest`; `cd web && pnpm e2e`; `cd web && pnpm test` |
| 2. First seen inside | `test_fires.py::test_0356_first_seen_inside_and_0372_outside` | `cd api && uv run pytest` |
| 3. Too close to tell | `test_fires.py::test_0540_too_close_to_tell`; `FireView.test.tsx` "says the record can't tell" | both |
| 4. Never spread | `test_fires.py::test_0540_never_spread`; `FireView.test.tsx` "flags a fire that never spread" | both |
| 5. Dates don't cut a fire | `test_app.py::test_fire_has_every_detection_whatever_the_dates`; `FireRecordPage.test.tsx` "a fire from 15 Oct still reads first seen 13 Oct" | both |
| Rule edges | `test_fires.py` joining, pass split, merge, key | `cd api && uv run pytest` |
| Pause 2 states | `ConcessionView.test.tsx`, `FireView.test.tsx`, `FireRecordPage.test.tsx`, `FireMap.test.tsx` | `cd web && pnpm test` |
| Fire-record still works | `web/e2e/fire-record.spec.ts` through fires | `cd web && pnpm e2e` |

pytest and e2e need `docker compose up -d --wait db` and anvil on the path, as before.

**E2E:** `web/e2e/fire-origin.spec.ts` "opens the 0332 fire first seen outside and its first
detection matches the chain". It records the fixture rows on anvil, sets 2026-10-12 to
2026-10-15, opens ID-WOOD-CONCESSION-0332, opens the fire first seen 13 Oct 17:37, sees "First
seen outside, 950 m from the edge" and "Seen inside from 2026-10-15 18:43 UTC", moves the replay
to pass 1 and sees "Pass 1 of 4", then opens the first detection and sees "Matches the chain".

### Chunks

| Chunk | Scenarios | Files owned |
| ----- | --------- | ----------- |
| A | 1–5 (API and rule) | `api/`, `fixtures/` |
| B | 1–5 (page), e2e, deploy order | `web/`, `.github/workflows/deploy.yml` |

A and B run in parallel. B builds against the API shapes above, already typed in
`web/src/api.ts`; its e2e passes only once A is in. Each lockfile sits inside its chunk's
directory; neither chunk adds a dependency.

### Risks

| Risk | Mitigation |
| ---- | ---------- |
| A fire's key changes when a pass joins it to an older fire, so an open fire view answers 404 | The page shows "Couldn't load this fire" with Try again, and Back reloads the fires (O11) |
| Grouping on every request gets slow as the record grows | `group_ms` in the log; store fire keys in the recorder past about 1 s (O12) |
| Someone redoing the rule with PostGIS distances gets a different fire for a pair right at 1 km | `fires.py` states haversine on a 6,371,008.8 m sphere; detections sit on a 375 m grid, so pairs at exactly 1 km are rare |
| The page ships before the API, and the concession view reads `fires` that isn't there | Deploy runs the web job after the API job |
| The 9 web tests that read the old detections table stay red | Chunk B rewrites them first |

### Decisions to record

```
## D31 · 2026-10-16 · Group fires in the API on each request, in Python

Why: one concession's detections fetch in 17–30 ms and group in 24 ms (1,083 detections, measured
2026-10-16), so nothing needs storing. A stored grouping would change whenever a pass joins two
fires, and the recorder's image is updated by hand (D21).
Rejected: the recorder storing each detection's fire key (a table, regrouping on every join, and a
hand-deployed job change), PostGIS ST_ClusterDBSCAN (clusters by one distance; "within 1 km and 48
hours" is two).
Source: docs/specs/fire-origin.md
Status: active

## D32 · 2026-10-16 · Name a fire by its first detection's record ID

Why: the record ID is stored with the row and keys its seal on the chain (D9), so the name needs
no table, and it holds while the fire grows. It changes only when a pass joins the fire to an
older one (O11).
Rejected: a stored serial fire ID (needs the table D31 rejects), a hash of the fire's record IDs
(changes with every pass).
Source: docs/specs/fire-origin.md
Status: active
```

## Open items

| ID | What | Type | Raised at | Owner | Status | Answer |
| -- | ---- | ---- | --------- | ----- | ------ | ------ |
| O1 | A spread forecast built in about 3 days beats a naive baseline (fire moves downwind at its recent speed) on 2023 fires (from shape O12) | unproven | shape | user | Resolved | 2026-10-16: not this slice. The forecast moves to spread-forecast (D23); shape O12 becomes Handed to spread-forecast |
| O2 | First detection is close enough to the real start to say "started inside" or "started outside". Satellites pass a few times a day and can miss small fires (from shape O13) | unproven | shape | user | Resolved | 2026-10-16: no "started" claims. The page says "first seen", calls a side only beyond 375 m (D26), notes the twice-a-day passes, and flags fires first seen within 48 h of recording starting |
| O3 | Whether a fire's first-seen reading gets its own seal, or is worked out from the sealed detections. The shape said "each step is written on-chain as detections arrive"; every detection already is, within the hour | question | spec p1 | user | Resolved | 2026-10-16: worked out from the sealed detections with a published rule; no new seals (D24) |
| O4 | Same fire when within 1 km and 48 h of a detection already in it. Measured on 2026-10-12 to 15: 750 m gives 1,634 fires, 1 km 1,451, 1.5 km and 72 h 1,236. Of 737 gaps between passes of one fire, 9 were over 50 h. A chain of detections can join two fires, and a fire lit inside within 1 km of one burning outside reads as one fire first seen outside | question | spec p1 | user | Resolved | 2026-10-16: 1 km and 48 h (D25). The joining cases stay; the spread order shows each pass, so a reader sees where it went |
| O5 | The headline answer is often "can't tell": of 65 fires with detections on both sides of an edge, 50 were first seen within 375 m of it or on both sides at once. Calling the side by where the first detections fall, ignoring the pixel, would call 39 | flag | spec p1 | user | Accepted risk | 2026-10-16: say "can't tell" rather than make calls a company can pick apart; 15 of 65 called (D26) |
| O6 | Whether to flag fires that never spread (fire-record O4 promised this slice would). A smouldering peat fire can also stay put | question | spec p1 | user | Resolved | 2026-10-16: flag them, naming both a mill and smouldering peat (D27) |
| O7 | The seals prove each detection hasn't changed, not that none is missing. A record left out could change where a fire reads as first seen. Anyone can compare against FIRMS's public archive | flag | spec p1 | user | Accepted risk | 2026-10-16: FIRMS's archive is public, so a missing detection can be found by anyone; sealing each run's list is not worth a new record type now (D24) |
| O8 | The fires table lists newest first, so on ID-WOOD-CONCESSION-0332 one-pass fires fill the top rows and the 188- and 90-detection fires that crossed the edge sit lower. 18 of 0332's 34 fires were seen on one pass | question | spec p2 | user | Resolved | 2026-10-16: largest first, by detections, then newest first seen, as the concession list ranks worst first (D28) |
| O9 | The map draws a concession as a dashed line only, so it doesn't show which side is inside. ID-WOOD-CONCESSION-0356 has several outlines close together, and "inside, 410 m" can't be read off the map. An inside tint would be a new design-system rule | question | spec p2 | user | Resolved | 2026-10-16: add a faint, non-fire inside tint through `/design-system` before `/build`; `FireMap` follows it. `/design-system`: `--fw-concession`, ink at 6% light and 7% dark, on every map view (D29) |
| O10 | The replay steps one pass every 240 ms (`--fw-replay-step`), so a 4-pass fire plays in under a second | question | spec p2 | user | Resolved | 2026-10-16: 600 ms a pass, changed through `/design-system` with O9 (D30) |
| O11 | A fire's key is its first detection's record ID (D32). When a later pass links it to an older fire, the joined fire takes the older key, so a fire view left open answers 404, and complaint-pack can't link to a key and expect it to last | flag | spec p3 | user | Open | — |
| O12 | Grouping on every request stays under about 1 s on the 0.25-vCPU container through judging. Measured on a laptop: 24 ms at 1,083 detections, 270 ms at 10,830 | unproven | spec p3 | user | Open | — |

_Never delete this section or its rows. See references/ledger.md._

## Glossary

- **Hotspot / detection** — a point where a satellite saw unusual heat, usually a fire.
- **Pass** — one satellite overhead; NOAA-20 sees a given spot about twice a day.
- **Fire** — here, detections grouped by the rule in O4, not a fire anyone confirmed on the ground.
- **First seen** — the earliest pass with a detection of the fire. The fire may have started earlier.
- **Pixel** — the patch of ground one detection stands for, 0.33 to 0.76 km wide for VIIRS.
- **Concession** — land the government has licensed to a company, here for pulpwood plantations.
- **Seal** — writing a record's fingerprint to the chain once, so later changes show.
- **FIRMS** — NASA's free service publishing satellite fire detections, live and archived.
- **Peat** — waterlogged soil made of old plant matter; when dry it can smoulder for weeks.
- **Sentinel-2** — a European satellite with 10–20 m images, sharper than VIIRS but no fire alerts.
- **Replay** — the map stepping through a fire's passes in order, oldest first.
- **Union-find** — a quick way to merge items into groups when any two are linked.
- **Haversine** — the formula for the distance between two points on a sphere.
- **Disclosure** — a "show more" toggle that keeps detail hidden until asked for.
- **e2e** — end-to-end: one test that walks the whole slice as a user would.
- **Lockfile** — the file that pins the exact version of every dependency.
- **Container Apps** — Azure's service that runs the API's container and scales it to zero when idle.
- **vCPU** — one virtual processor core; the API gets a quarter of one.
