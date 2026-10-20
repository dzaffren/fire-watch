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
    L -- "Go to the example fire" --> G[globe over the 0332 fire]
    G -- "See its complaint pack" --> P[complaint pack of the 0332 fire]
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
  Then it flies to Indonesia and the ID-WOOD-CONCESSION-0332 fire, seen at 06:18 and 17:20 UTC
    that day
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
  Then the complaint pack of the ID-WOOD-CONCESSION-0332 fire of fire-origin scenario 1 opens
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
