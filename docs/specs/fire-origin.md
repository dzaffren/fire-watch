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
| Concession | As fire-record, plus "Fires 34" in the details. Then "Detections within 1 km and 48 hours of each other count as one fire. Newest first." and a table: First seen (UTC), with "4 passes, 19 detections" under it, and Where first seen ("Outside, 950 m", "Too close to tell", "Both sides of the edge"), with "Inside from 15 Oct 18:43", the edge distance, or "Never spread" under it. 100 rows at a time | As fire-record: boundary and every detection in the dates. A dot opens its fire |
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

**Map labels.** Google's place labels are off on every view: at the fire view's zoom they put
business names such as a "PT" company beside the boundary, and records name no company (shape
O10).

**The page expects** (pause 3 settles it): `GET /api/concessions/<id>` adds `fires`, each as
`FireSummary` in `web/src/api.ts`, and a `fire_key` on each detection; a new
`GET /api/concessions/<id>/fires/<key>` returns one fire with every detection, oldest first, each
with its `pass`. A fire's key is the record ID of its first detection.

**Motion tier:** 2 for the replay only, as the design system sets: one pass a step every
`--fw-replay-step` (240 ms), no easing, under reduced motion too. Everything else stays tier 1.

**Components used:** `fw-panel`, `fw-kv`, `fw-table` (with the selected row), `fw-help`, `fw-link`,
`fw-btn` (secondary), `fw-mono`, `fw-empty`, `fw-skeleton`, the disclosure from the record panel,
and from the detections guideline: fire dots, older-to-newer opacity, the selected ring, the
first-seen diamond, the concession boundary and the replay timeline. No new components or tokens;
the timeline is a native range input drawn as the guideline's track.

**Design system:** Fire Watch, `docs/design/design-system/` (D2, D4, D22).

**Preview:** real components in `web/src`: `ConcessionView` (fires table), `FireView` with
`Replay`, `FireMap` (fade, diamonds, framing on the fire) and `FireRecordPage`. Run
`cd web && pnpm dev` and open `http://localhost:5173/?preview=fire-origin`. Pickers at the top
switch between 18 states, numbered by scenario, and themes; `&state=edge&theme=dark` links
straight to one. The data is real VIIRS NOAA-20 detections from 2026-10-12 to 15 near
ID-WOOD-CONCESSION-0332, 0356, 0372 and 0540, grouped by D25 to D27 from the live read-only
database (`web/src/preview/fire-origin.fixture.json`, no company names); seal times,
fingerprints and transactions are made up. It replaces the fire-record preview, which showed the
old concession table. Drift check passed over the 11 files written; all 35 tokens used exist in
`docs/design/design-system/tokens/`. The 9 unit tests that read the old detections table in
`ConcessionView.test.tsx` and `FireRecordPage.test.tsx` fail until `/build` rewrites them.

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
| O8 | The fires table lists newest first, so on ID-WOOD-CONCESSION-0332 one-pass fires fill the top rows and the 188- and 90-detection fires that crossed the edge sit lower. 18 of 0332's 34 fires were seen on one pass | question | spec p2 | user | Open | — |
| O9 | The map draws a concession as a dashed line only, so it doesn't show which side is inside. ID-WOOD-CONCESSION-0356 has several outlines close together, and "inside, 410 m" can't be read off the map. An inside tint would be a new design-system rule | question | spec p2 | user | Open | — |
| O10 | The replay steps one pass every 240 ms (`--fw-replay-step`), so a 4-pass fire plays in under a second | question | spec p2 | user | Open | — |

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
- **Disclosure** — a "show more" toggle that keeps detail hidden until asked for.
- **e2e** — end-to-end: one test that walks the whole slice as a user would.
