# Landing page

**Version:** v1 · **Status:** Draft · **Type:** Feature · **Project type:** Web UI

**Shape doc:** docs/specs/fire-watch/shape.md
**Depends on:** complaint-pack

A page that says what Fire Watch is, for someone who has never heard of a concession, with a globe
of one day's fires that flies to a real fire. It comes now because the judges are newcomers, and the
site opens straight into dates and a list of concession IDs.

## Problem

The site opens on "Pulpwood concessions with hotspots", one sentence and a date picker. A reader
who doesn't know what a concession, a hotspot or a seal is can't tell what the site is for, or
why the blockchain matters. The hackathon judges are that reader, and so is a new investigator.

The home page was built for an investigator who already knows the field (D14). Nothing on the
site says what problem it solves: companies answer a fire grievance with "it started outside our
concession" or "the complaint has no site, date or basis" (shape, Problem).

## Slice test

| Check                         | Result |
| ----------------------------- | ------ |
| Cuts every layer it needs     | yes: the page, and one day of FIRMS detections fetched once and committed. The landing reads nothing from the API, so the API and the database don't change |
| One e2e test walks it         | yes: open the site, read the landing, fly to the example fire, open its pack, come back, open the tool |
| Worth shipping alone          | yes: a judge or a new investigator learns what the site is for before using it |
| Fits (≤5 scenarios, ≤2 areas) | yes: 5 scenarios, one area (`web/`, with its committed data file) |

**Path:** full. The slice adds a new screen and the tier 3 globe.

## User story

As someone new to plantation fires, I want to read what Fire Watch does and why before I use it,
so that the concession list and the "Matches the chain" check make sense to me.

## Flow

```mermaid
flowchart LR
    V((newcomer or judge)) -- "opens /" --> L[landing page with the globe]
    L -- "Go to the example fire" --> G[globe over the example fire in 0332]
    G -- "See its complaint pack" --> P[complaint pack of the example fire]
    L -- "See a real example" --> P
    L -- "Open the tool" --> T["dates and concession list, /?tool"]
    T -- "About Fire Watch" --> L
    B((buyer)) -- "pack link" --> P
```

A newcomer reads the landing, flies to a real fire and opens its pack, then opens the tool. A
returning investigator bookmarks the tool's link, and a buyer's pack link opens the pack straight
away.

## Acceptance criteria

Exact wording is set at pause 2. The scenarios fix what each part must say.

```gherkin
Scenario: A newcomer learns what Fire Watch is
  Given someone who has never heard of a concession opens the site's address
  And the API has scaled to zero after a quiet hour
  When the page loads
  Then the landing shows at once, since it needs nothing from the server
  And its first line says what Fire Watch does and for whom
  And it gives the problem in plain words: a company answers a fire grievance with "it started
    outside our concession" or "the complaint has no site, date or basis"
  And four steps say how it works: satellites spot fires; each record is sealed on a public
    blockchain; an investigator finds the fire and where it started; a buyer gets a pack they can
    check
  And dated facts give the scale: 62,489 NOAA-20 fire detections worldwide on 14 Oct 2026, 9,923
    of them in the box around Indonesia
  And a short list explains "concession", "hotspot", "seal" and "peat" in one line each
  And no company is named (shape O10)

Scenario: The globe shows a day of fires and flies to a real one
  Given the landing on a desktop browser
  When the globe has loaded on its own
  Then it shows the NOAA-20 fire detections of 14 Oct 2026, and turns slowly
  And the reader can drag it to turn it
  When the reader presses "Go to the example fire"
  Then it flies to Indonesia and the fire in ID-WOOD-CONCESSION-0332 seen at 06:18 and 17:20 UTC
    that day
  And the caption reads that the satellite first saw the fire on 12 Oct, outside the concession and
    3,100 m from its edge, and that by 13 Oct it was inside
  And it offers "See its complaint pack"

Scenario: On a phone, with reduced motion, or without 3D, nothing turns on its own
  Given the landing on a phone
  Then the same fires show on a flat world map, and no 3D code downloads
  Given a desktop browser set to reduce motion
  Then the globe doesn't turn on its own, and "Go to the example fire" jumps straight there
  Given a desktop browser that can't draw 3D
  Then the flat map stays in its place, and nothing on the page shifts

Scenario: A real example pack opens from the landing
  Given the landing page
  When the reader presses "See a real example", or "See its complaint pack" after the flight
  Then the complaint pack of that fire opens, cut at 17 Oct 2026 09:00 UTC: 283 detections on 8
    passes, first seen on 12 Oct at 05:16 UTC, outside the concession and 3,100 m from its edge
  And their browser checks each of its detections against Base Sepolia, as any pack does

Scenario: Each address opens its own page
  Given the site's address, the landing opens
  When the reader presses "Open the tool"
  Then the date picker and the ranked concession list show, as the home page does today, at the
    tool's own link, which they can bookmark
  And "About Fire Watch" in the tool's header goes back to the landing
  Given the tool's link opened directly, the tool opens with no landing in front of it
  Given the link of a complaint pack, the pack opens with no landing in front of it
```

## Scope

**In:**

- A landing page at the site's address with the one-line summary, the problem, the four steps,
  the dated facts, the four terms, "See a real example" and "Open the tool".
- The fire globe of D3: 14 Oct 2026's NOAA-20 detections, loaded on its own on desktop, turning
  slowly, dragged by the reader, with one flight to the 0332 fire. A flat world map of the same
  fires on phones, with reduced motion, and where 3D can't run.
- The day's detections, fetched once from FIRMS and committed.
- The tool at its own link, and "About Fire Watch" in its header.
- Light and dark themes, phone and desktop widths, from the existing design system (D2, D4).

**Out:**

- Live counts from the API, such as detections sealed so far (O3): not planned.
- The latest day's fires on the globe (O5): not planned; the day is fixed.
- Zoom, and a card for each fire on the globe (O7): not planned.
- Help for each term inside the tool's own screens: not planned.
- Any language but English: the design brief settles English only.
- Company names: never (shape O10).

## Interface

The landing is one page that scrolls, on the design system's tokens (D2, D4). It opens with a plain
question beside the globe of 14 Oct 2026's fires, the one tier 3 piece (D3). One real fire then
carries the explanation, instead of a list of features. The tool gets "About Fire Watch" in its
header.

```mermaid
flowchart LR
    L["/ : landing"] -- "Open the tool" --> T["/?tool : dates and concession list"]
    T -- "About Fire Watch" --> L
    L -- "Go to the example fire" --> G[globe over the example fire]
    G -- "See its complaint pack" --> P["/?pack= : its pack, cut 17 Oct 09:00 UTC"]
    L -- "See a real example" --> P
```

A reader goes from the landing to the tool and back, or to the example fire's pack, by the globe or
straight from the hero.

| Part | What shows |
| ---- | ---------- |
| Header | "Fire Watch", and "Open the tool" as a link |
| Headline | "Where did the fire start?" |
| Lede | "Fire Watch records every satellite fire detection on or near Indonesia's pulpwood plantations, and seals each record on a public blockchain. Watchdog investigators use it to show a company's buyers where a fire started and how it spread, on records anyone can check." |
| Actions | "Open the tool" (primary button) and "See a real example" (secondary), both links |
| Globe, beside the text on desktop | The fire globe primitive, in a square box; under it on a phone, as the flat map |
| Caption, before the flight | "Every dot is a fire the NOAA-20 satellite saw on 14 Oct 2026: 62,489 worldwide, 9,923 of them in and around Indonesia." and the button "Go to the example fire" |
| Caption, after the flight | "A fire in ID-WOOD-CONCESSION-0332, Central Kalimantan, on 14 Oct 2026. The satellite first saw it on 12 Oct, outside the concession and 3,100 m from its edge. By 13 Oct it was inside." and the link "See its complaint pack" |
| "Two accounts of the same fire" | "When a fire burns on plantation land, a watchdog files a grievance with the buyers of the company that holds the land. The company often answers that the fire started outside its concession and spread in, or that the complaint has no site, date or basis. The buyer then has to pick one account." Then: "Fire Watch gives the grievance its site, dates and basis from satellite records, each sealed when it came in. The buyer can check them instead of picking." |
| "How it works", numbered | 1 "Satellites spot fires." 2 "Each record is sealed." 3 "An investigator finds where it started." 4 "The buyer checks it.", each with two plain sentences |
| "Words used here", a key-value list | Concession, Hotspot, Seal, Peat, one line each |
| Footer | The sources: NASA FIRMS, Trase, WRI Global Peatlands (CC BY 4.0), Natural Earth; Base Sepolia as a test network; the hackathon |
| The tool's header | "About Fire Watch", a link to the landing, after "Records are sealed on Base Sepolia, a test network" |

| State | What shows |
| ----- | ---------- |
| Loading | The text at once; a skeleton block holds the globe's space |
| Desktop with WebGL | The flat map, then the globe fading in over it, opening on Indonesia |
| Phone, touch screen or no WebGL | The flat map in its own 18:7 box; no 3D code downloads |
| After "Go to the example fire" | The flight, then the second caption; reduced motion jumps straight there |
| The globe's data didn't load | A help line in its place; the rest of the page works |

**Motion tier:** 3 for the globe alone, within the brief's budget: 244 kB on desktop of the 250 kB
ceiling, and 104 kB for the flat map. Tier 1 for the rest: the buttons' hover. Nothing else on the
page moves.

**Components used:** `app-top`, `fw-btn`, `fw-btn--secondary`, `fw-link`, `fw-kv`, `fw-help`, and
the fire globe (`FireGlobe`), added to the system by `/design-system` for this slice. No new token.
`app.css` adds the `.landing` composition, the `.globe` box and `.app-top-end`.

**Design system:** Fire Watch, `docs/design/design-system/`, with its new guideline
`guidelines/globe.html` (D2, D3, D4, D76).

**Preview:** `cd web && pnpm dev`, then `http://localhost:5173/?preview=landing-page` for the landing
and the tool's header, and `?preview=fire-globe` for the globe's states. The globe's dots are FIRMS's
NOAA-20 detections of 14 Oct 2026; land is Natural Earth 110m, and 10m around the example fire. The
example pack link is the production pack. The data files were made by a scratch script; pause 3 plans
the committed one. The drift check passed over the 9 files written, every token used exists, `tsc -b`
is clean and the 171 web unit tests pass. At 390 px, in both themes, no page has a sideways scroll.

**The page expects:** no API change. `web/public/globe/` holds three gzipped files: land, the day's
fire cells, and the full detail near the example fire. Routes: `/` the landing, `/?tool` the tool
(D74), `/?pack=` a pack, as today.

## Open items

| ID | What | Type | Raised at | Owner | Status | Answer |
| -- | ---- | ---- | --------- | ----- | ------ | ------ |
| O1 | Where the explanation goes: a landing page at the site's address with the tool one click away, which supersedes D14 ("the home page is dates, then a concession list"), or an explainer block above the date picker, which keeps D14 | question | spec p1 | user | Resolved | 2026-10-20: a landing page at the site's address, the tool one click away (D72, superseding D14) |
| O2 | Whether the landing carries the 3D fire globe that D3 and the design brief planned for the public intro (three.js, a 250 kB budget, a flat map on phones), or ships plain now with the globe as a later slice | question | spec p1 | user | Resolved | 2026-10-20: the globe is in this slice. It competes with the demo video for the days left before 2026-10-24 |
| O3 | Whether the landing shows numbers: live counts from the API (a new endpoint, a second area), dated facts written into the text, such as the 4,172 detections in the Indonesia box on 12 Oct 2026, or none | question | spec p1 | user | Resolved | 2026-10-20: dated facts in the text (D73) |
| O4 | How an investigator who comes back reaches the tool: a link of its own they can bookmark, the browser remembering they have seen the landing, or one click through the landing every time | question | spec p1 | user | Resolved | 2026-10-20: the tool gets its own link (D74, superseding D34) |
| O5 | Which day of fires the globe shows: 14 Oct 2026, when the 0332 fire burns; 12 Oct 2026, the day the brief measured; or the latest day, fetched live | question | spec p1 | user | Resolved | 2026-10-20: 14 Oct 2026, fixed and committed. FIRMS gives 62,489 NOAA-20 detections worldwide that day, 9,923 in the box around Indonesia (D75) |
| O6 | When the 3D globe loads: on a press, as the design brief's tier 3 budget says ("nothing downloads until asked"), or on its own on desktop | question | spec p1 | user | Resolved | 2026-10-20: on its own on desktop. The flat map shows first and holds the space; phones keep the flat map (D76) |
| O7 | What the reader can do with the globe: drag it and take one flight to the example fire, watch a fixed sequence, or explore freely with zoom and a card per fire | question | spec p1 | user | Resolved | 2026-10-20: drag to turn, and one flight to the 0332 fire (D77) |
| O8 | Which fire the landing flies to and opens as its example pack. The spec named the fire of fire-origin scenario 1. On the full production record that fire reads "first seen on both sides of the edge", since the scenario used a 19-row cut | question | spec p2 | user | Resolved | 2026-10-20: 0332's fire first seen on 12 Oct 2026 at 05:16 UTC, outside the concession and 3,100 m from its edge, inside from 13 Oct. Its pack is cut at 17 Oct 2026 09:00 UTC: 283 sealed detections (D78) |
_Never delete this section or its rows. See references/ledger.md._

## Glossary

- **Concession** — land the Indonesian government licenses to a company; here, to grow trees for
  paper pulp.
- **Hotspot** — one spot where a satellite saw fire on one pass overhead.
- **Seal** — a record's fingerprint written on a public blockchain, so any later change shows.
- **Landing page** — the first page a visitor sees, saying what the site is before they use it.
- **FIRMS** — NASA's service that publishes satellite fire detections within hours.
- **NOAA-20** — the satellite whose VIIRS sensor gives each detection; it passes over twice a day.
- **three.js** — the JavaScript library that draws the 3D globe in the browser.
- **Reduced motion** — a setting in the reader's system asking sites not to animate.
- **e2e** — end-to-end: one test that walks the whole slice as a user would.
