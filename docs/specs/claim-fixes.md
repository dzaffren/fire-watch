# Claim fixes

**Version:** v1 · **Status:** Draft · **Type:** Bug · **Project type:** Web UI

**Shape doc:** docs/specs/judge-review/shape.md
**Depends on:** None

The landing and the complaint pack stop making four claims the chain or the data doesn't support,
and the README's example pack sha matches the API again. The landing's top says why Fire Watch
matters before the reader reaches the example.

## Problem

The judge review rerun on the live site on 2026-10-23 (judge-review O4) found claims that the
chain or the data doesn't support. Four are on the page and one is in the README:

- The pack footer says "This pack holds every detection of this fire that Fire Watch had stored
  by 2026-10-17 09:00 UTC." The 0332 pack has no recorder runs, so nothing checks that. The same
  pack's check panel says "Fire Watch's server chose which records to send."
- The landing says "Watchdog groups use Fire Watch…". No watchdog or buyer has seen it (judge-review
  O3).
- The globe caption says "Every dot is a fire". Each dot is one detection, and the real case
  groups 283 of them into one fire.
- The real case says the satellite "saw this fire 283 times". It is 283 detections on 8 passes.
- The README gives the example pack's sha256 as `740b31f…`. Since complete-packs, the API adds
  `"runs": null`, and the same curl line now gives `33037b98…`. D90 says one curl line redoes the
  committed copy.

The review's other claims are out of this slice; Scope says where each one goes.

A reader who saw the site on 2026-10-23 had to read the example to understand why it matters. The
reason is in the first shape's O3: companies answer fire grievances by saying the fire started
outside their land, or that the complaint names no site, date or basis. The landing never says so.

## Slice test

| Check                         | Result |
| ----------------------------- | ------ |
| Cuts every layer it needs     | yes: the page copy in `web/src`, the committed example pack in `web/public/case`, and the README. The API, the recorder and the chain don't change |
| One e2e test walks it         | yes: the landing e2e reads the heading, the globe caption and the real case, then follows "See its complaint pack" and reads the footer |
| Worth shipping alone          | yes: a judge reads no claim on the landing or the pack that the chain or the data doesn't back, and reads why it matters first |
| Fits (≤5 scenarios, ≤2 areas) | yes: 5 scenarios; two areas, the landing and the complaint pack, plus the README |

**Path:** full. The change is copy, but it touches four page files and the README, above the light
path's three.

## User story

As a hackathon judge reading the site once, I want every claim on it to hold up and the reason it
matters to come first, so that I can score it on what it does.

## Flow

```mermaid
flowchart LR
    J((judge)) -- "opens the site" --> H["Landing top: heading and why it matters"]
    H -- "reads on" --> G["Globe caption: detections on 14 Oct 2026"]
    G -- "Walk through a real case" --> C["Real case: 8 passes, 283 detections"]
    C -- "See its complaint pack" --> P["Pack footer: the fire as stored by its cut"]
    O((operator)) -- "README curl line" --> F["web/public/case/pack-0332.json, same sha"]
```

A judge reads the landing top to bottom and opens the example pack. Each place they read says only
what the chain or the data shows. An operator redoes the landing's example pack and gets the sha the
README gives.

## Acceptance criteria

```gherkin
Scenario: The pack says what it holds without claiming it is complete
  Given the complaint pack of the ID-WOOD-CONCESSION-0332 fire, cut at 2026-10-17 09:00 UTC,
    which the API gives no recorder runs
  When anyone opens it
  Then the footer says "This pack holds this fire as Fire Watch had stored it by 2026-10-17 09:00 UTC.
    Passes after that are not in it."
  And no text on the pack says it holds every detection of the fire

Scenario: The landing says why it matters before the example
  Given the landing at the site's address
  When a judge reads the top of the page
  Then the heading says "When a company says a fire spread in from outside its land, show where
    satellites first saw it."
  And the paragraph under it says "Fire Watch is built for the watchdog groups that report
    plantation fires to the companies that buy from the plantation. It shows where satellites first
    saw a fire and how it spread, on records the buyer checks in their own browser."
  And no text on the landing says that watchdog groups use Fire Watch

Scenario: The globe counts detections, not fires
  Given the landing's globe, before it flies to the example fire
  Then its caption says "Every dot is one detection by the NOAA-20 satellite on 14 Oct 2026: 62,489
    worldwide, 9,923 of them in and around Indonesia."

Scenario: The real case counts passes and detections
  Given the real case's first stop, read from the committed 0332 pack
  Then it says "From 12 Oct to 17 Oct 2026, the NOAA-20 satellite saw this fire on 8 passes, 283
    detections in all, near ID-WOOD-CONCESSION-0332, in Central Kalimantan."

Scenario: The README's curl line gives the committed example pack
  Given a fresh checkout
  When anyone runs the README's "Redo the real case's data" curl line and sha256sum
  Then the sha256 is the one the README gives
  And the file equals the committed web/public/case/pack-0332.json byte for byte
```

The heading and the paragraph rest on the first shape's O3: KLK said the fires "originated outside"
its concession, and Wilmar said an allegation gave no "specific sites, dates or the basis" (both
September 2026).

## Scope

**In:**

- The pack footer's sentence, for every pack.
- The landing's heading and the paragraph under it.
- The globe's caption before the flight.
- The real case's first stop.
- The committed example pack, fetched again with its `"runs": null`, and the README's sha.

**Out:**

- The pack header's "A newer one is under its recorder run's root on FireRuns": true once FireRuns
  seals its first root. FireRuns went live on 2026-10-23, so the rollout closes it.
- The README, OVERVIEW, ARCHITECTURE and CHANGELOG lines on run roots: the same rollout closes them.
- The damage estimate's 2023 shares on small fires: D127 chose the large-patch shares, so this slice
  doesn't change them.
- The forecast panel's "more than 3,400 variants": forecast-v2-trial's O1 records 17 + 2,482 + 944
  variants, so the claim holds.
- Naming cloud, canopy and smouldering peat where the first sighting shows, leading the CO₂ estimate
  with a range, and review hole 5's one-pixel headline: origin-and-range, a later slice (O2).

## Interface

Four sentences change in the real components, and one heading. Nothing is added, moved or
restyled.

```mermaid
flowchart LR
    L["Landing.tsx: h1 and landing-lede"] -- "Walk through a real case" --> R["RealCase.tsx: the fire step"]
    L -- "globe before the flight" --> G["Landing.tsx: figcaption"]
    R -- "See its complaint pack" --> P["ComplaintPack.tsx: pack-foot"]
```

The reader meets the new heading and paragraph first, the globe caption beside them, the real
case's first stop below, and the pack footer last.

| Where | Was | Now |
| ----- | --- | --- |
| Landing heading | Show where satellites first saw a plantation fire, on records anyone can check. | When a company says a fire spread in from outside its land, show where satellites first saw it. |
| Landing paragraph | Watchdog groups use Fire Watch to report a fire on plantation land to the companies that buy from it. It shows where satellites first saw the fire and how it spread, and the buyer checks every record in their own browser. | Fire Watch is built for the watchdog groups that report plantation fires to the companies that buy from the plantation. It shows where satellites first saw a fire and how it spread, on records the buyer checks in their own browser. |
| Globe caption, before the flight | Every dot is a fire the NOAA-20 satellite saw on 14 Oct 2026: 62,489 worldwide, … | Every dot is one detection by the NOAA-20 satellite on 14 Oct 2026: 62,489 worldwide, … |
| Real case, first stop | …the NOAA-20 satellite saw this fire 283 times near ID-WOOD-CONCESSION-0332… | …the NOAA-20 satellite saw this fire on 8 passes, 283 detections in all, near ID-WOOD-CONCESSION-0332… |
| Pack footer | This pack holds every detection of this fire that Fire Watch had stored by 2026-10-17 09:00 UTC. … | This pack holds this fire as Fire Watch had stored it by 2026-10-17 09:00 UTC. … |

The real case counts passes with `times.length`, as its "Pass 2 of 8" stops do. The heading avoids
"fire started", so the honest-claims guard in `Landing.test.tsx` stays as it is (O3).

**Motion tier:** none new. The globe keeps tier 3 (D3) and the real case tier 1 (D89).

**Components used:** the landing's `h1` and `landing-lede`, the globe's `figcaption`, the real
case's step, and the pack's `pack-foot` with `fw-help`. There is no new component, no new token and
no CSS change.

**Design system:** Fire Watch, `docs/design/design-system/` (D2).

**Preview:** real components in `web/src`, after `cd web && pnpm dev`:
`http://localhost:5173/?preview=landing-page`, `?preview=newcomer-walkthrough` and
`?preview=complaint-pack`. The drift check passed over the 3 files changed. `tsc -b` is clean, all
326 web unit tests pass, and the landing and complaint pack e2e tests pass, 7 of 7. Each changed
test failed on the old copy first. At 390 px and 360 px the landing and the real case don't scroll
sideways. The pack preview does, by 43 px and 73 px, but the cause is the preview's own State
`<select>`, not the pack.

**Craft checks:** a one-line prompt would write "Track plantation fires with blockchain-verified
satellite data". This heading names the answer a company gives, from the first shape's O3, and the
one thing the tool shows against it. Next to Stripe's documentation, the reference for D2, it says
what the reader can do in plain words, with no selling.

## Open items

| ID | What | Type | Raised at | Owner | Status | Answer |
| -- | ---- | ---- | --------- | ----- | ------ | ------ |
| O1 | Does the landing's heading change to lead with the company's answer, or does it stay "Show where satellites first saw a plantation fire, on records anyone can check." with only the paragraph changed? | question | spec p1 | user | Resolved | 2026-10-23: the new heading, "When a company says the fire started outside its land, show where satellites first saw it." A judge reads the reason first |
| O2 | Do the reader's other two points go in this slice: name cloud, canopy and smouldering peat where the first sighting shows, and lead the CO₂ estimate with a range? Review hole 5 goes with them: the headline "First seen outside, 3.1 km" rests on one nominal-confidence pixel | question | spec p1 | user | Resolved | 2026-10-23: a later slice, origin-and-range. This slice keeps to copy that is wrong today. The CO₂ range needs IPCC's emission-factor intervals checked first, and the headline touches D111's example |
| O3 | The approved heading says "the fire started outside its land". honest-claims fails the landing on any "fire started" (`web/src/Landing.test.tsx:34`), so the page never claims where a fire started (D26). The heading only quotes the company | question | spec p2 | user | Resolved | 2026-10-23: reword to "When a company says a fire spread in from outside its land, show where satellites first saw it." The same dispute, in the first shape's words, and the honest-claims guard stays as it is |

_Never delete this section or its rows. See references/ledger.md._

## Glossary

- **Detection**: one spot where the satellite saw fire on one pass, about 375 m across.
- **Pass**: one trip of the NOAA-20 satellite over the area. It sees a place about twice a day.
- **Recorder run**: one hourly start of the recorder. Since run-roots, each run seals one Merkle
  root on FireRuns.
- **Cut**: the time a complaint pack is made at. Detections stored after it are not in the pack.
- **e2e**: end-to-end: one test that walks the whole slice as a user would.
