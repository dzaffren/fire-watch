# Pack claims

**Version:** v1 · **Status:** Draft · **Type:** Bug · **Project type:** Web UI

**Shape doc:** docs/specs/judge-review/shape.md
**Depends on:** source-claims

The fire view, the complaint pack, the landing and the forecast panel stop making five claims that
the chain or the data doesn't support. The landing's earlier sightings rest on a committed copy of
NASA's archive, as every other figure on the page does.

## Problem

The hostile review run again on 2026-10-24, after source-claims shipped, scored the site 6.9/10. It
still found five claims that a company's lawyer could use:

- **"The first pass is the earliest satellite pass that saw the fire."** Every fire view and pack
  says this (`web/src/FireView.tsx:141`). For the example fire it is false: NOAA-20 saw fire 680 m
  away on 11 Oct, 11 hours before the first detection in Fire Watch's records. The landing now says
  so (`web/src/RealCase.tsx:24`), but the pack, which is what a buyer gets, doesn't. The landing's
  first step also says "the NOAA-20 satellite saw this fire" from 12 Oct (`web/src/RealCase.tsx:119`).
- **"Anyone can redo this from the chain and NASA FIRMS's public archive."** (`web/src/FireView.tsx:158`)
  The chain holds fingerprints, or one root per run, under random record IDs. Nothing on the chain
  ties to a FIRMS row without the records that Fire Watch's API sends.
- **The 11 Oct and 10 Oct sightings have no source a reader can check.** They are two dated
  constants (`web/src/RealCase.tsx:22-26`), read from FIRMS by hand on 2026-10-24. No data file,
  sha256 or command backs them, unlike every other figure on the landing.
- **"NOAA-20 places almost every detection within 400 m of the fire."** (`web/src/FireView.tsx:150`)
  Blonski and others (2023) measured where NOAA-20 places its image pixels, not how far a detection
  sits from the fire. A detection can sit anywhere in its 375 m pixel as well.
- **Two smaller ones.** The lede says "NASA's NOAA-20 satellite" (`web/src/Landing.tsx:48`).
  NOAA-20 is NOAA's satellite, and its detections come through NASA FIRMS. The 2023 table heads its
  column "Arrivals warned of, out of 135" (`web/src/ForecastPanel.tsx:55`). The 135 are forecasts
  whose fire came in, from 103 fires (`fixtures/backtest/2023-forecasts.csv`).

## Slice test

| Check                         | Result |
| ----------------------------- | ------ |
| Cuts every layer it needs     | yes: the fire view, the pack, the landing and the forecast panel in `web/src`, and a committed FIRMS cut in `fixtures/`. The API, the recorder and the chain don't change |
| One e2e test walks it         | yes: read the landing's lede and first steps, open the example pack's method, then open the e2e's 0332 fire and its forecast panel in the tool |
| Worth shipping alone          | yes: a lawyer loses five lines to quote, and a judge can check the earlier sightings |
| Fits (≤5 scenarios, ≤2 areas) | yes: 5 scenarios; two areas, the landing and the tool with its pack |

**Path:** full. Copy changes in four files, and a new committed data file.

## Flow

```mermaid
flowchart LR
    J((judge)) -- "reads the lede and the first steps" --> L["Landing: NOAA's NOAA-20, Fire Watch's records"]
    L -- "11 Oct and 10 Oct lines rest on" --> A[("fixtures/firms: pinned FIRMS cut")]
    L -- "See its complaint pack" --> P["Pack: How this is worked out"]
    I((investigator)) -- "opens a fire" --> F["Fire view: How this is worked out"]
    F -- "Make complaint pack" --> P
    I -- "reads the 2023 replay" --> FP["Forecast panel: forecasts that came in"]
```

A judge reads the satellite and the records' start on the landing, whose earlier sightings rest on
a committed FIRMS cut. An investigator reads the same method in the fire view and the pack, and the
2023 table in the forecast panel.

## Acceptance criteria

```gherkin
Scenario: The fire view and the pack say the first pass is the earliest in Fire Watch's records
  Given the example pack of the ID-WOOD-CONCESSION-0332 fire, first detected on 12 Oct 05:16 UTC,
    1 hour after Fire Watch's records begin
  When a reader opens how the reading is worked out, in the pack or in the fire view
  Then it says the first pass is the earliest that Fire Watch's records hold, not the earliest the
    satellite made
  And the note on when the records begin says NASA's archive may hold earlier detections
  And the example pack names NOAA-20's 11 Oct detections under 1 km away, from the committed FIRMS
    cut of scenario 3

Scenario: The method claims only what a reader can check
  Given any fire's view or pack
  When a reader opens how the reading is worked out
  Then it says the reader's browser checks each record it was sent against the chain
  And it says a record matches a row of NASA FIRMS's archive by its time and place
  And it no longer says anyone can redo the reading from the chain and FIRMS's archive

Scenario: The landing's earlier sightings rest on a committed copy of NASA's archive
  Given FIRMS's NOAA-20, S-NPP, NOAA-21 and MODIS files for 10 to 12 Oct 2026 around the example
    fire, committed with their sha256 and the commands that fetched them
  When a test reads them against the example pack's first passes
  Then NOAA-20 saw fire under 1 km from the first fire's first detection on 11 Oct, outside the
    concession
  And other satellites saw fire under 1 km from the second fire's first pass on 10 Oct, on both
    sides of the edge

Scenario: The position-error note says what the study measured
  Given any fire's view or pack
  When a reader opens how the reading is worked out
  Then it says Blonski and others (2023) measured where NOAA-20 places its pixels
  And it says a detection can sit anywhere in its 375 m pixel as well

Scenario: The landing and the forecast panel say what they name and count
  Given the landing, and the 2023 replay in the forecast panel of the 0332 fire
  When a judge reads them
  Then the lede says NOAA-20 is NOAA's satellite, read through NASA FIRMS
  And the real case's first step says Fire Watch's records hold the fire from 12 Oct to 17 Oct, on
    8 passes and 283 detections
  And the 2023 table's column says its 135 are forecasts whose fire came in
```

The exact words come at pause 2. Scenarios 1 and 3 read the committed example pack, as the landing
e2e does (D137). Scenarios 2, 4 and 5's panel read the e2e's own 0332 fire in
`fixtures/firms/fire-origin.csv`.

## Scope

**In:**

- The method in the fire view and the pack: the first pass, the redo line and the position-error
  line (`OriginMethod`).
- The note on when the records begin, in the fire view and the pack, and the example pack's 11 Oct
  sightings, read from the committed FIRMS cut (O1).
- The landing's lede, its first step, and the 11 Oct and 10 Oct lines, which now rest on a
  committed FIRMS cut with a sha256 and a redo command (O2).
- The 2023 table's column head in the forecast panel.

**Out:**

- Looking up NASA's archive for every pack, to list earlier sightings of any fire: not planned.
  It puts the FIRMS key on the public API, spends FIRMS quota on each open, and a pack would change
  when FIRMS's answer does, against D33 (O1).
- Record IDs and fingerprints in the printed pack: not planned (O3). The roadmap names it.
- Swapping the example for a fire recorded after FireRuns went live: not planned. It needs a new
  pack, 283 new seals and the landing's copy again, which doesn't fit the deadline.
- Raising the 375 m margin for position error: not planned (D115).
- The written deliverables: on the `docs/submission` branch, not in this slice (judge-review O2).

## Interface

Copy changes in the real components, one note shared by the fire view and the pack, and a definition
in the forecast panel's method. Nothing is added to the layout, moved or restyled.

```mermaid
flowchart LR
    CUT[("fixtures/firms/archive: pinned FIRMS cut")] -- "held to by archive.test.ts" --> RC["RealCase.tsx: BEFORE_RECORDS, SECOND_BEFORE"]
    CUT -- "held to by archive.test.ts" --> RB["FireView.tsx: RecordsBegin, BEFORE_RECORDS by fire key"]
    RB -- "records begin, and 11 Oct for the example" --> FV["FireView.tsx: Reading notes"]
    RB -- "the same" --> PK["ComplaintPack.tsx: Caveats"]
    OM["FireView.tsx: OriginMethod"] -- "first pass, position, redo" --> FV
    OM -- "the same" --> PK
    LD["Landing.tsx: lede"] -- "NOAA's NOAA-20, NASA's FIRMS" --> J((judge))
    FP["ForecastPanel.tsx: 2023 tables, method"] -- "forecasts that came in" --> I((investigator))
```

`RecordsBegin` replaces the two copies of the records-begin note in `FireView.tsx` and
`ComplaintPack.tsx`. It adds the example fire's 11 Oct sentence by its fire key, so the tool's view
of the same fire and its pack say the same.

| Where | Was | Now |
| ----- | --- | --- |
| Method, first pass (fire view and pack) | The first pass is the earliest satellite pass that saw the fire. | The first pass is the earliest NOAA-20 pass in Fire Watch's records that saw the fire. Other satellites, or NOAA-20 before the records begin, may have seen it earlier. |
| Method, position error | Straight below the satellite, NOAA-20 places almost every detection within 400 m of the fire, and most within 200 m (Blonski…). The 375 m margin doesn't allow for this. | Straight below the satellite, NOAA-20 places almost every pixel within 400 m of where it belongs, and most within 200 m (Blonski…). A fire can also sit anywhere in its 375 m pixel. The 375 m margin allows for neither. |
| Method, last line | Each detection is sealed, so anyone can redo this from the chain and NASA FIRMS's public archive. | Each detection is sealed: your browser checks each record Fire Watch sends against the chain, and a record matches a row of NASA FIRMS's public archive by its time and place. |
| Records-begin note (fire view and pack) | Fire Watch's records begin 1 hour before this fire was first seen, so it may have been burning earlier. | The same, then: NASA's archive may hold detections from before then. |
| Records-begin note, the example fire | — | The same, then: In NASA's FIRMS archive, NOAA-20 saw fire under 1 km from this fire's first detection on 11 Oct, also outside the concession. |
| Landing lede | It shows where NASA's NOAA-20 satellite first saw a fire and how it spread, on records the buyer checks in their own browser. | It reads NOAA's NOAA-20 satellite through NASA's FIRMS service. It shows where the satellite first saw a fire and how it spread, on records the buyer checks in their own browser. |
| Real case, first step | From 12 Oct to 17 Oct 2026, the NOAA-20 satellite saw this fire on 8 passes, 283 detections in all… | From 12 Oct to 17 Oct 2026, Fire Watch's records hold this fire on 8 passes of the NOAA-20 satellite, 283 detections in all… |
| Real case, "Where it was first seen" | …and read only NASA's NOAA-20 satellite. In NASA's archive, NOAA-20 saw fire under 1 km from here on 11 Oct, before recording began, also outside the concession. | …and hold only the NOAA-20 satellite's detections. In NASA's FIRMS archive, NOAA-20 saw fire under 1 km from here on 11 Oct, before the records begin, also outside the concession. |
| Real case, pass 2 of 8 | In NASA's archive, other satellites saw fire on that ground on 10 Oct… | In NASA's FIRMS archive, other satellites saw fire on that ground on 10 Oct… |
| 2023 tables' column | Arrivals warned of, out of 135 | Warned of, out of 135 forecasts that came in |
| Forecast method | …A warning is a forecast that the fire is seen inside. | The same, then: An arrival is a forecast whose fire was then seen inside within 48 hours, so a fire forecast after several passes counts once for each. |

"Before recording began" becomes "before the records begin": the recorder began on 16 Oct
(`SEALED_WHEN`), and its records reach back to 12 Oct. The pinned cut, read on 2026-10-24, gives
NOAA-20 at 965 m and 680 m from the first detection on 11 Oct, both outside the concession; and S-NPP,
NOAA-21 and MODIS within 1 km of the second fire's first pass on 10 Oct, two inside and seven outside.

**Motion tier:** none new.

**Components used:** the fire view's and the pack's `fire-notes` `fw-help` notes and the method's
`fw-help`, the landing's `landing-lede`, the real case's steps, and the forecast panel's `fw-table`
and `fw-help`. There is no new component, no new token and no CSS change. The longer column head
wraps, as `.forecast .fw-table thead th` sets `white-space: normal`.

**Design system:** Fire Watch, `docs/design/design-system/` (D2).

**Preview:** real components in `web/src`, after `cd web && pnpm dev`:
`http://localhost:5173/?preview=origin-confidence` (the 0332 fire and its pack, with the records-begin
note and the method), `?preview=season-backtest` (the 2023 tables and method) and `/` (the lede and
the real case). The drift check passed over the 5 files changed. `tsc -b` is clean, and all 341 web
unit tests pass on the new words.

**Craft checks:** a one-line prompt would hedge with a "data limitations" box. This puts each limit
in the sentence it qualifies, with no new component. Next to Stripe's documentation, the reference
for D2, each figure says where it comes from at the point of use.

## Open items

| ID | What | Type | Raised at | Owner | Status | Answer |
| -- | ---- | ---- | --------- | ----- | ------ | ------ |
| O1 | The pack can't know of sightings before Fire Watch's records for any fire. Does it only change its method's words, or does the example's pack also list its 11 Oct sightings? | question | spec p1 | user | Resolved | 2026-10-24: every fire view and pack says "earliest in Fire Watch's records", and the example's pack also lists its 11 Oct sightings from the pinned FIRMS cut of O2. A per-pack FIRMS lookup was asked for first, then dropped: it puts the FIRMS key on the public API and lets a pack change with FIRMS's answer (D33) |
| O2 | The 11 Oct and 10 Oct lines rest on a hand reading of FIRMS. Do we commit a pinned cut of FIRMS's files and a test, or drop the two lines from the landing? | question | spec p1 | user | Resolved | 2026-10-24: commit a pinned cut of the four satellites' files for 10 to 12 Oct, with sha256 and the commands that fetched them, and a test that holds the lines to it. D141 stays |
| O3 | The printed pack carries no record IDs or fingerprints, so a paper copy can't be checked against the chain. Is that in this slice? | question | spec p1 | user | Resolved | 2026-10-24: out. The pack's link checks every record in the reader's browser; the roadmap names a pack that carries its proofs |

_Never delete this section or its rows. See references/ledger.md._

## Glossary

- **NOAA-20**: a weather satellite run by NOAA, the US weather agency. Its VIIRS sensor sees fires,
  and NASA's FIRMS service publishes the detections.
- **FIRMS**: NASA's Fire Information for Resource Management System, which serves satellite fire
  detections as files.
- **Pinned cut**: a small copy of a source's files, committed with the sha256 of each file, so anyone
  can check it is the same copy.
- **Pixel geolocation**: where the satellite places a pixel on the ground, which can be off by a few
  hundred metres.
- **e2e**: end-to-end: one test that walks the whole slice as a user would.
