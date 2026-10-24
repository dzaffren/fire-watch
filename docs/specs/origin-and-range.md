# Origin and range

**Version:** v1 · **Status:** Draft · **Type:** Enhancement · **Project type:** Web UI

**Shape doc:** docs/specs/judge-review/shape.md
**Depends on:** origin-confidence, damage-check, claim-fixes

A weak first sighting says "as one detection" in its headline. Every fire names what the satellite
can miss, and the CO₂ figure leads with its range. claim-fixes left these to this slice (its O2), so
a reader's last three points stop holding.

## Problem

A reader of the live site on 2026-10-23 made three points that the page doesn't answer yet:

- **The headline rests on one detection.** The example pack's headline reads "First seen outside,
  3.1 km from the edge". Its first pass, 12 Oct 05:16 UTC, is one detection, and the satellite next
  saw the fire 25 hours later. The note under the headline says so (D113), but the headline alone
  doesn't. The detection's FIRMS grade, nominal, is not the weak part: 251 of the pack's 283
  detections are nominal.
- **The satellite misses fire, and the page says so only once.** NOAA-20 can miss fire under cloud
  or thick tree canopy, and peat that smoulders below the surface. So a fire may burn unseen before
  it is first seen, on either side of a concession's edge. Only "How this is worked out" names
  cloud, behind a disclosure (`web/src/FireView.tsx:129`). Canopy and peat are not named.
- **The CO₂ figure reads as one number.** The fire view reads "About 76,000 t" for the e2e's 0332
  fire, with "Likely 37,000 to 110,000 t." in the grey line under it (`web/src/Damage.tsx:94`). The
  range is there, but it comes second.

IPCC's tables, read on 2026-10-24, give the range its limits:

| Factor | Value | Interval |
| ------ | ----- | -------- |
| Peat fuel burned, tropical drained peat wildfire (2013 Wetlands Supplement, Table 2.6) | 353 t dry matter a hectare | 95%: 170 to 536 |
| Peat's gas factor (Table 2.7) | 464 g CO₂-C a kg | none: one study, Christian et al. 2003 |
| Other ground's fuel burned, all secondary tropical forests (2006 Guidelines, Vol. 4, Table 2.4) | 42.2 t dry matter a hectare | standard error 23.6, so a 95% interval reaches zero |
| Other ground's gas factor, tropical forest (Table 2.5) | 1,580 g CO₂ a kg | ± 90, one standard deviation |

## Slice test

| Check                         | Result |
| ----------------------------- | ------ |
| Cuts every layer it needs     | yes: the fire view, the pack, the landing's real case and the damage estimate in `web/src`. The API already sends `first_alone_h` and the four ground parts, so the API, the recorder and the chain don't change |
| One e2e test walks it         | yes: open the weak and the firm fire near ID-WOOD-CONCESSION-0540 and read their headlines and notes, open the 0332 fire and read its CO₂ range, make its pack and read the same, then read the landing's first-sighting step |
| Worth shipping alone          | yes: a judge who opens the example pack reads "as one detection" in its headline, and every reader sees what the satellite can miss and the CO₂ as a range |
| Fits (≤5 scenarios, ≤2 areas) | yes: 5 scenarios; two areas, the first-sighting reading (fire view, pack and landing) and the damage estimate |

**Path:** full. New copy in three places and a changed figure in two, across more than three files.

## User story

As a watchdog investigator, I want the headline, the first sighting and the CO₂ figure to show how
sure each one is, so that a company can't say the grievance hides its weak points.

## Flow

```mermaid
flowchart LR
    I((investigator)) -- "opens a fire" --> F["Fire view: headline, notes, damage"]
    F -- "weak: ', as one detection'" --> H[headline]
    F -- "every fire: cloud, canopy, peat" --> N[notes under the headline]
    F -- "CO₂: range first, average under it" --> D[damage estimate]
    F -- "Make complaint pack" --> P["Pack: the same headline, notes and range"]
    J((judge)) -- "scrolls the real case" --> L["Landing: 'Where it was first seen'"]
    L -- "See its complaint pack" --> P
```

An investigator reads the weak point in the headline, the satellite's limits under it, and the CO₂
as a range, and the pack carries all three. A judge meets the limits on the landing and the
headline in the example pack.

## Acceptance criteria

```gherkin
Scenario: A weak first sighting says so in its headline
  Given the fire near ID-WOOD-CONCESSION-0540 first seen on 13 Oct 2026 06:37 UTC as one detection,
    3.1 km outside the concession
  And the satellite next saw it 36 hours later
  When the investigator opens this fire
  Then its heading reads "First seen outside, 3.1 km from the edge, as one detection"
  And the note under it says "The satellite didn't see this fire again for 36 hours, so that detection
    may be a separate fire."
  And its complaint pack's heading and note read the same

Scenario: Every fire names what the satellite can miss
  Given the fire near ID-WOOD-CONCESSION-0540 first seen on 13 Oct 2026 06:37 UTC as one detection,
    3.4 km inside the concession, and seen again 12.7 hours later
  When the investigator opens this fire
  Then its heading reads "First seen inside, 3.4 km from the edge", with no "as one detection"
  And under it: "The satellite can miss fire under cloud or thick tree canopy, and peat that
    smoulders below the surface. This fire may have burned unseen before it was first seen, inside
    or outside the concession."
  And its complaint pack carries the same two sentences on top, with the other caveats

Scenario: The CO₂ figure leads with its range
  Given the ID-WOOD-CONCESSION-0332 fire of damage-check scenario 1: 19 VIIRS NOAA-20 detections
    whose squares join into 59.21 ha inside on peat, 144.31 ha outside on peat and 6.30 ha outside
    on other ground
  When the investigator opens the fire
  Then "CO₂ released" reads "37,000 to 110,000 t"
  And the line under it says "About 76,000 t at IPCC's average. 11,000 to 33,000 t of it inside
    the concession."
  And its complaint pack reads the same

Scenario: A fire with no peat keeps one CO₂ figure
  Given hotspot B of fire-record scenario 1, 2026-10-14 06:18 UTC, 370 m outside
    ID-WOOD-CONCESSION-0377, whose square is 14.06 ha with no peat
  When the investigator opens its fire from ID-WOOD-CONCESSION-0377
  Then "CO₂ released" reads "About 400 t", with no range
  And "How this is worked out" says "The CO₂ range is IPCC's 95% interval for the peat a fire burns.
    Other ground is at IPCC's average, since its interval reaches zero."

Scenario: The landing's first sighting names what the satellite can miss
  Given the landing's real case, read from the committed pack of the ID-WOOD-CONCESSION-0332 fire,
    cut at 17 Oct 2026 09:00 UTC
  When a judge scrolls to "Where it was first seen"
  Then after "It didn't see the fire again for 25 hours, so that detection may be a separate fire."
    it says "The satellite can miss fire under cloud or thick tree canopy, and peat that smoulders
    below the surface."
  And "See its complaint pack" opens a pack whose heading reads "First seen outside, 3.1 km from
    the edge, as one detection"
```

The fires in scenarios 1, 2 and 4 are the e2e's own records in `fixtures/firms/fire-record.csv`,
and the fire in scenario 3 is in `fixtures/firms/fire-origin.csv`. The CO₂ figures use the 2023
shares, 61.8% of peat and 42.2% of other ground (D126, D127).

## Scope

**In:**

- A weak first sighting (D112) adds ", as one detection" to its headline: the fire view's `h2` and
  the pack's `h1`. The reading stays (D113). The weak note under it no longer repeats "one
  detection" (O1).
- Every fire carries two sentences on what the satellite can miss under its headline, in the fire
  view and on top of the pack (D36). The landing's "Where it was first seen" step adds the first
  sentence (O2).
- "CO₂ released" leads with the range from peat fuel's 95% interval. The average moves to the grey
  line. The part inside the concession is a range when it holds peat (O3).
- A fire with no peat keeps one figure. "How this is worked out" says why other ground and peat's
  gas factor have no interval.
- Every pack, old or new, shows the new copy (D129).

**Out:**

- "as one detection" on a first pass that isn't weak: not planned. Most fires are first seen as one
  detection, so the words would stop standing out (D112, O1).
- The concession list's "Where first seen" cell: not planned (D116).
- A range on the ground, the likely burned ground or the cost: not planned. D126 rejected a range
  from the MODIS share, and the World Bank's cost has no interval.
- Other ground's interval in the CO₂ range: not planned (O3).
- The FIRMS confidence grade in the headline: not planned. 251 of the example pack's 283 detections
  are nominal, so the grade doesn't mark the weak point.
- The landing's hero caption: it already says "as one detection", so it stays.

## Interface

Copy changes in the real components, and one figure leads with its range. Nothing is added, moved or
restyled.

```mermaid
flowchart LR
    FS["format.ts: firstSeenLine(first_seen, first_alone_h)"] -- "headline" --> FV["FireView.tsx: Reading h2"]
    FS -- "headline" --> PK["ComplaintPack.tsx: pack-head h1"]
    MN["FireView.tsx: MissedNote, last in fire-notes"] -- "every fire" --> FV
    MN -- "every pack, in Caveats" --> PK
    M["FireView.tsx: MISSED"] -- "first sentence" --> RC["RealCase.tsx: Where it was first seen"]
    D["Damage.tsx: DamageFigures"] -- "CO₂ range first" --> FV
    D -- "CO₂ range first" --> PK
```

`firstSeenLine` adds the words when `first_alone_h` is set, so the fire view and the pack read the
same headline. `MissedNote` sits last in the notes, after the notes on the fire's own record.

| Where | Was | Now |
| ----- | --- | --- |
| Fire view `h2`, pack `h1`, weak first sighting | First seen outside, 3.1 km from the edge | First seen outside, 3.1 km from the edge, as one detection |
| The weak note | First seen as one detection, then not seen for 25 hours. That detection may be a separate fire. | The satellite didn't see this fire again for 25 hours, so that detection may be a separate fire. |
| Fire view notes and pack caveats, every fire, last | (none) | The satellite can miss fire under cloud or thick tree canopy, and peat that smoulders below the surface. This fire may have burned unseen before it was first seen, inside or outside the concession. |
| Fire view, "How this is worked out" | NOAA-20 passes about twice a day and cloud can hide a fire, so it may burn for hours before it is first seen. | NOAA-20 passes about twice a day, so a fire may burn for hours before it is first seen. |
| Landing, "Where it was first seen" | …so that detection may be a separate fire. Scroll on… | …so that detection may be a separate fire. The satellite can miss fire under cloud or thick tree canopy, and peat that smoulders below the surface. Scroll on… |
| "CO₂ released", with peat | About 76,000 t / Likely 37,000 to 110,000 t. 22,000 t of it inside the concession. | 37,000 to 110,000 t / About 76,000 t at IPCC's average. 11,000 to 33,000 t of it inside the concession. |
| "CO₂ released", no peat | About 400 t | About 400 t |
| Damage, "How this is worked out", before "Methane…" | (none) | The CO₂ range is IPCC's 95% interval for the peat a fire burns. Other ground is at IPCC's average, since its interval reaches zero. IPCC gives no interval for peat's 464 g, which comes from one study. |

The fire view's notes and the pack's caveats now always show, since every fire has the missed note.
A range whose ends round to the same two figures shows as one figure, "About …", so a fire with a
sliver of peat never reads "400 to 400 t". The part inside follows the same rule. "Likely" leaves
the CO₂ line: the range says it.

**Motion tier:** none new. The notes and the damage panel enter with the fire view as they do now
(tier 1).

**Components used:** the fire view's `h2` and `fire-notes`, the pack's `pack-head` `h1` and
`pack-caveats`, `fw-help`, the real case's step, and the damage panel's `fw-kv` with
`damage-value` and `sub`. There is no new component, no new token and no CSS change.

**Design system:** Fire Watch, `docs/design/design-system/` (D2).

**Preview:** real components in `web/src`, after `cd web && pnpm dev`:
`http://localhost:5173/?preview=origin-confidence` (states: the 0332 fire, the firm 0356 fire, its
pack, the landing) and `?preview=damage-estimate` (the peat, off-peat and never-spread fires). The
drift check passed over the 5 files changed. `tsc -b` is clean, and all 328 web unit tests pass. At
390 px the pack, the fire view, the landing and the damage panel don't scroll sideways once the
preview's own State picker is removed; the picker alone is 588 px wide.

**Craft checks:** a one-line prompt would add a "Confidence: low" badge and an info icon with a
tooltip. This puts the weak point in the headline's own words, and the satellite's limits in a
sentence the reader can't miss, with no new component. Next to Stripe's documentation, the
reference for D2, the figure leads with what is known and the working stays one disclosure away.

## Decisions to record

`/build` appends these to `DECISIONS.md`. None supersedes an entry. They move into the technical plan at pause 3.

### D138 · 2026-10-24 · Say "as one detection" in a weak first sighting's headline

Why: the example pack's headline "First seen outside, 3.1 km from the edge" rests on one detection
that the satellite next saw 25 hours later. The reading stays (D113), and the headline now carries
the weak point. It applies to 380 of 4,445 readings on 12 to 22 Oct 2026.
Rejected: on any one-detection first pass (true of most fires, so the words stop standing out,
D112), the headline as it is (the weak point stays only in the note under it).
Source: docs/specs/origin-and-range.md
Status: active

### D139 · 2026-10-24 · Name cloud, canopy and smouldering peat under every fire's headline

Why: the satellite can miss fire under cloud or thick tree canopy, and peat that smoulders below the
surface. So any fire may have burned unseen before it was first seen, on either side of the edge.
Only the method, behind a disclosure, named cloud.
Rejected: only fires read as inside or outside (the limit holds for every first sighting), only in
"How this is worked out" (a reader of the headline may not open it).
Source: docs/specs/origin-and-range.md
Status: active

### D140 · 2026-10-24 · Lead the CO₂ figure with IPCC's 95% interval for burned peat

Why: one figure claims more than the factors know. IPCC gives a 95% interval only for peat fuel, 170
to 536 t of dry matter a hectare (2013 Wetlands Supplement, Table 2.6). Peat's gas factor comes from
one study with no interval, and other ground's standard error, 23.6 on 42.2, puts its interval at
zero. A fire with no peat keeps one figure.
Rejected: peat and other ground, with other ground from its standard error floored at zero (a fire
with no peat would read "0 to 830 t").
Source: docs/specs/origin-and-range.md
Status: active

## Open items

| ID | What | Type | Raised at | Owner | Status | Answer |
| -- | ---- | ---- | --------- | ----- | ------ | ------ |
| O1 | What does the headline do when it rests on one detection that the satellite next saw 25 hours later? | question | spec p1 | user | Resolved | 2026-10-24: add ", as one detection" to a weak first sighting's headline only (D112). The reading stays (D113), and the note under it drops its repeated words |
| O2 | Where does the line on what the satellite can miss go: cloud, tree canopy and peat that smoulders below the surface? | question | spec p1 | user | Resolved | 2026-10-24: under every fire's headline in the fire view and the pack, and in the landing's "Where it was first seen" step |
| O3 | What does the CO₂ range cover? IPCC gives a 95% interval only for peat fuel | question | spec p1 | user | Resolved | 2026-10-24: peat fuel only. A fire with no peat keeps one figure, and the method says why. The part inside is a range too |

_Never delete this section or its rows. See references/ledger.md._

## Glossary

- **Detection**: one spot where the satellite saw fire on one pass, about 375 m across.
- **Pass**: one trip of the NOAA-20 satellite over the area. It sees a place about twice a day.
- **Weak first sighting**: the first pass is one detection, and the satellite next saw the fire
  more than 14 hours later (D112).
- **95% interval**: the span that IPCC expects the true value to fall in 95 times out of 100.
- **Standard error**: how far a table's average may be from the true one. About two of them each
  side make a 95% interval.
- **Canopy**: the closed roof of tree crowns, which can hide a fire below it from the satellite.
- **e2e**: end-to-end: one test that walks the whole slice as a user would.
