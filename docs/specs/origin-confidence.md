# Origin confidence

**Version:** v1 · **Status:** Refined · **Type:** Enhancement · **Project type:** Web UI

**Shape doc:** docs/specs/judge-review/shape.md
**Depends on:** fire-origin, complaint-pack, newcomer-walkthrough

The fire view, the pack and the landing say when a fire's first sighting is one detection with a
long gap after it, and when one fire is several that the satellite first saw apart. It comes now
because the landing's example fire rests on both, and a hostile review found it.

## Problem

"First seen outside" is the reading a company can attack first. Two facts behind a reading are
not on the page today:

- **One pixel, then a long gap.** On 12 to 22 Oct 2026 the record holds 4,445 fire readings
  (3,660 fires, some near two concessions). 1,230 were seen on two or more passes. In 380 of all
  readings, the first pass is one detection and the satellite next saw the fire more than 14 hours
  later, so it missed at least one pass in between.
- **Joined fires.** A pass that comes within 1 km of two fires joins them (D25), and the joined
  fire keeps the older one's first sighting (fire-origin rule 3). 127 of the 1,230 multi-pass
  readings joined fires that the satellite first saw apart.

The landing's example fire has both. As its pack stands at 17 Oct 09:00 UTC, with 283 detections
on 8 passes:

- Its first pass, 12 Oct 05:16 UTC, is one nominal-confidence detection, 3,100 m outside
  ID-WOOD-CONCESSION-0332. The satellite next saw it 25 hours later.
- Until 14 Oct 17:20 UTC it was two fires more than 1 km apart. The second was first seen on
  13 Oct 06:37 UTC, 2 m from the edge, with 6 of its 16 detections inside.
- Before the join, the first fire's 3 detections inside were all within 129 m of the edge.

So the landing's "By 13 Oct it was inside" (`web/src/Landing.tsx:65`) and "The fire has crossed the
edge" at pass 2 (`web/src/RealCase.tsx:157`) rest on the second fire. "On this point the record
agrees with the company" (`web/src/RealCase.tsx:140`) rests on one pixel.

Two limits are not named anywhere:

- **VIIRS position error.** NOAA-20's VIIRS positions are within 400 m at nadir (3-sigma), most
  within 200 m (Blonski, Wang and Cao, J. Appl. Remote Sens. 17(3) 034506). D26's 375 m margin
  counts half the widest pixel and no position error.
- **Concession edges.** Trase draws them from the Ministry of Forestry's permit maps and states no
  position accuracy. Gaveau et al. (2017) found that land use often does not match the permit
  lines.

## Slice test

| Check                         | Result |
| ----------------------------- | ------ |
| Cuts every layer it needs     | yes — the API's fire reading (`fires.py`) adds the weak-sighting and joined facts; the fire view, the pack and the landing show them. No schema, recorder or contract change |
| One e2e test walks it         | yes — on anvil with the example pack's 283 records sealed (D92), open 0332's fire and read both notes, open its pack and read them on top, then read the landing's pass 1 and pass 5 steps |
| Worth shipping alone          | yes — an investigator sees the weak point before a company does, and a judge no longer finds a landing claim that rests on a second fire |
| Fits (≤5 scenarios, ≤2 areas) | yes — 5 scenarios; two areas: the API's fire reading, and the page that shows it in three places from the same fields |

**Path:** full — new logic in the fire reading and new copy on three screens.

## User story

As a watchdog investigator, I want the fire view and the pack to say when a fire's first sighting
is weak or the fire is several joined, so that I don't send a grievance whose "first seen outside"
a company can pick apart.

## Flow

```mermaid
flowchart LR
    I((investigator)) -- "opens 0332's fire" --> F[fire view]
    F -- "reading, then the one-pixel and joined notes" --> I
    F -- "How this is worked out: position error, edges, joins" --> I
    F -- "Make complaint pack" --> P[pack]
    P -- "the same notes on top" --> B((buyer))
    J((judge)) -- "scrolls the walkthrough" --> L[landing, 0332's pack]
    L -- "one pixel, a second fire, the join" --> J
```

The investigator reads the notes before making a pack, the buyer gets them on top of the pack, and
the judge reads the same facts in the walkthrough.

## States

```mermaid
stateDiagram-v2
    [*] --> OnePass: first pass is one detection
    [*] --> Firm: first pass has 2 or more
    OnePass --> Firm: next pass sees it within 14 h
    OnePass --> Weak: next pass sees it after more than 14 h
    Firm --> Joined: a pass comes within 1 km of another fire
    Weak --> Joined: a pass comes within 1 km of another fire
```

Fires are worked out again on each request, so the notes appear as passes arrive. A one-pass fire
gets no weak note: its Passes line already says "1, with 1 detection". Joined and Weak can both
hold, as on 0332.

## Acceptance criteria

```gherkin
Scenario: A first sighting of one detection, then a long gap
  Given 0332's fire as stored by 17 Oct 2026 09:00 UTC: 283 detections on 8 passes
  And its first pass, 12 Oct 05:16 UTC, is one nominal-confidence detection 3,100 m outside
  And the satellite next saw the fire on 13 Oct 06:37 UTC
  When the investigator opens this fire
  Then it still reads "First seen outside, 3.1 km from the edge"
  And it says "First seen as one detection, then not seen for 25 hours. That detection may be a
    separate fire."

Scenario: A fire joined from two first seen apart
  Given the same fire
  And until 14 Oct 17:20 UTC it was two fires more than 1 km apart
  And the second was first seen on 13 Oct 06:37 UTC, 2 m from the edge, 6 of its 16 detections inside
  When the investigator opens this fire
  Then it says "Fire Watch joined another fire to this one on 14 Oct 17:20 UTC, when they came
    within 1 km. First seen above is the older of the two. The other was first seen on 13 Oct
    06:37 UTC, on both sides of the edge."
  And "Seen inside from 13 Oct 06:37 UTC" stays, as the joined fire's

Scenario: A firm, unjoined fire gets no note, and the method names its limits
  Given the ID-WOOD-CONCESSION-0356 fire first seen on 14 Oct 06:20 UTC as one detection, 409 m inside
  And the satellite saw it again 11 hours later, and it never joined another fire
  When the investigator opens this fire
  Then it reads "First seen inside, 410 m from the edge" with no one-detection or joined note
  And "How this is worked out" says "Straight below the satellite, NOAA-20 places almost every
    detection within 400 m of the fire, and most within 200 m"
  And it says "Concession edges come from Trase's map, which gives no accuracy for its lines."
  And it says "one fire here can be several that the satellite first saw apart"

Scenario: The pack carries the notes
  Given the investigator makes a pack of 0332's fire, cut at 17 Oct 09:00 UTC
  When the buyer opens the pack link
  Then both notes from the first two scenarios sit on top with the other caveats
  And they print on the PDF

Scenario: The landing tells 0332's fire as the record shows it
  Given the landing's example, 0332's pack cut at 17 Oct 09:00 UTC
  When a judge scrolls the walkthrough
  Then the hero caption says "The satellite first saw it on 12 Oct as one detection, 3,100 m
    outside the concession. On 14 Oct it joined a second fire, first seen the day before on both
    sides of the edge."
  And the pass 1 step says "It didn't see the fire again for 25 hours, so that detection may be a
    separate fire."
  And the pass 2 step says "These include another fire, first seen on this pass more than 1 km from
    the first, on both sides of the edge."
  And the pass 5 step says "On this pass the fires came within 1 km of each other, so Fire Watch
    counts them as one."
  And no step says "On this point the record agrees with the company" or "The fire has crossed the
    edge"
```

## Scope

**In:**
- A weak first sighting: the first pass is one detection, and the satellite next saw the fire
  more than 14 hours later (D112). A one-pass fire gets no note.
- A weak first sighting keeps its reading. The note says the detection may be a separate fire
  (D113).
- A joined fire: a note says when it was joined and where each other fire was first seen (D114).
  Pause 2 sets how a long list is cut short; the live 0332 fire has 7 joins.
- "How this is worked out" names the VIIRS position error with its numbers and source, the
  concession edges' source and its missing accuracy, and joining. The 375 m margin stays (D115).
- The notes show in the fire view and the pack, on top with the other caveats (D36). The
  concession list stays as it is (D116).
- 0332's fire stays the landing's example. The hero caption and the walkthrough steps say what the
  record shows: one pixel, a second fire on both sides of the edge, then the join (D111).
- No new seals (D24). The notes are worked out from sealed detections, as first seen is.

**Out:**
- Splitting joined fires apart, or a new join rule — not planned; D25 stays.
- Each detection's own pixel size from its scan width — the record does not store scan width; not
  planned.
- Proving no detection is missing from a pack — complete-packs.
- A wider margin for position error — forecast-v2 can take it with the forecast's own 375 m step
  (D115).
- Marking weak and joined fires in the concession list — not planned (D116).

## Interface

The fire view and the pack get two notes under the reading, the same sentences in both. A fire
joined from more than two gets its list: behind a disclosure in the fire view, under Basis in the
pack, which prints. The method text names joins, position error and the concession edges, in both.
The landing's hero caption and three walkthrough steps tell 0332's fire as the record shows it.

```mermaid
flowchart LR
    API["fire route and pack: first_alone_h, joined"] -- "hours, joined fires" --> N[OriginNotes]
    N -- "under the reading" --> FV[fire view]
    N -- "under the reading, in Caveats" --> PK[pack]
    API -- "joined, 2 or more" --> T[JoinedTable]
    T -- "disclosure" --> FV
    T -- "under Basis, printed" --> PK
    API -- "committed pack-0332.json" --> RC[landing walkthrough]
```

Each place reads the same two fields, so the fire view, the pack and the landing say the same
thing.

| Where | When | Copy |
| ----- | ---- | ---- |
| Fire view, pack | `first_alone_h` is set | First seen as one detection, then not seen for 25 hours. That detection may be a separate fire. |
| Fire view, pack | one fire joined | Fire Watch joined another fire to this one on 14 Oct 17:20 UTC, when they came within 1 km. First seen above is the older of the two. The other was first seen on 13 Oct 06:37 UTC, on both sides of the edge. |
| Fire view, pack | 2 or more joined | Fire Watch joined 7 other fires to this one, the first time on 14 Oct 17:20 UTC, as they came within 1 km. First seen above is the oldest of them. They are listed below. (Pack: "listed under Basis.") |
| Fire view disclosure, pack Basis | 2 or more joined | "The 7 fires joined to this one", then a table: Joined (UTC), First seen (UTC), Where first seen ("Both sides of the edge", "Outside, 2.6 km") |
| Method, both | always | A fire that comes within 1 km of another is joined to it, so one fire here can be several that the satellite first saw apart. First seen is the oldest one's. |
| Method, both | always | A detection's position can be off as well. Straight below the satellite, NOAA-20 places almost every detection within 400 m of the fire, and most within 200 m (Blonski and others, 2023, doi 10.1117/1.JRS.17.034506). The 375 m margin doesn't allow for this. Concession edges come from Trase's map, which gives no accuracy for its lines. |
| Landing hero caption | at the example fire | A fire in ID-WOOD-CONCESSION-0332, Central Kalimantan, on 14 Oct 2026. The satellite first saw it on 12 Oct as one detection, 3,100 m outside the concession. On 14 Oct it joined a second fire, first seen the day before on both sides of the edge. |
| Walkthrough, pass 1 | `first_alone_h` is set | The satellite first saw it on 12 Oct 05:16 UTC as one detection, outside the concession and 3,100 m from its edge. It didn't see the fire again for 25 hours, so that detection may be a separate fire. Scroll on to see what came next, one satellite pass at a time. |
| Walkthrough, a pass | a joined fire was first seen on it | 13 Oct 06:37 UTC · 35 detections, 6 inside the concession. These include another fire, first seen on this pass more than 1 km from the first, on both sides of the edge. |
| Walkthrough, a pass | a join happened on it | 14 Oct 17:20 UTC · 66 detections, 43 inside the concession. On this pass the fires came within 1 km of each other, so Fire Watch counts them as one. |

The notes sit after "The satellite record can't say which side this fire started on" and before
the never-spread and records-begin notes. A one-pass fire and a fire with nothing joined show
nothing new. The two dropped lines are "On this point the record agrees with the company" and
"The fire has crossed the edge".

**The page expects** (pause 3 settles it): the fire route and the pack add `first_alone_h`, whole
hours or null (D112), and `joined`, oldest join first, each `{at_unix, first_seen_unix,
first_seen}` with `first_seen` read from that fire's own first pass (`JoinedFire` in
`web/src/api.ts`). The concession list gets neither (D116). The committed `pack-0332.json` gets
both from the redone curl line (D90).

**Phone.** At 390 px the joined table's headers and times wrap, so the fire panel and the pack stay
inside the screen; on wider screens the two times stay on one line. The new disclosure's summary
takes the existing `.fire-reading summary` touch padding.

**Motion tier:** 1, and nothing new moves. The notes enter with the panel's `enter`; the new
disclosure opens with the fire panel's existing details animation, which reduced motion already
stops (O7).

**Components used:** `fw-panel`, `fw-help`, `fw-kv`, `fw-table` in `table-box`, and the
disclosure from the fire panel. No new token. One layout rule in `web/src/styles/app.css`,
`.joined`, keeps the two times unwrapped on wide screens, as `.forecast .table-box th.method` does.

**Design system:** Fire Watch, `docs/design/design-system/` (D2, D4, D94).

**Preview:** real components in `web/src`: `OriginNotes`, `JoinedTable` and `OriginMethod` in
`FireView.tsx`, used by `ComplaintPack.tsx`; captions in `RealCase.tsx` and `Landing.tsx`. Run
`cd web && pnpm dev` and open `http://localhost:5173/?preview=origin-confidence`. Six states, with
themes: 0332's fire as its pack stands; the same with the live list of 7 joined fires (O8); 0356's
firm fire; 0332's pack, with and without the long list; and the landing. The 0332 data is the
committed `pack-0332.json` plus the two new fields; 0356's is fire-origin's fixture. Seals stand
in. Drift check passed over the 9 files written. Two unit tests fail on the old copy until
`/build` rewrites them: `RealCase.test.tsx` "tells the fire, the claim, …" and `Landing.test.tsx`
"goes to the example fire, …".

## Technical plan

### Approach

The fire rule gains two steps, as fire rule version 2. Step 9 is `first_alone_h`, read from the
first two passes. Step 10 is `joined`, worked out by grouping the fire's own detections again, pass
by pass. Only the fire route works out `joined`, for the tool and the pack. The concession route
and the recorder group as before (D31). Nothing new is stored or sealed (D24). The page is the
pause 2 code. `pack-0332.json` is redone by the README's curl path, against the new API run on this
machine with Neon's read-only login. The deployed API's bytes are checked after the merge (D90).

Relies on: D24, D25, D26, D31, D32, D33, D37, D85, D90, D92, D109, D111–D118.

```mermaid
flowchart TB
    subgraph browser
        FV["FireView, ComplaintPack: OriginNotes, JoinedTable"]
        RC["Landing, RealCase"]
    end
    subgraph api["firewatch-api, Container Apps"]
        R["GET /api/concessions/&lt;id&gt;/fires/&lt;key&gt;"]
        G["fires.group(): first_alone_h"]
        J["fires.joined(fire)"]
    end
    DB[("Neon: hotspots, hotspot_concessions")]
    P["web/public/case/pack-0332.json"]
    FV -- "fire key, as_of for a pack" --> R
    R -- "SELECT, read-only role" --> DB
    R -- "the concession's detections" --> G
    R -- "the one fire" --> J
    R -- "first_alone_h, joined, records" --> FV
    R -. "curl once, before the merge" .-> P
    P -- "committed copy" --> RC
```

The fire route groups the concession's detections, then works out the joins for the one fire it
answers. The landing reads the same answer from its committed copy.

```mermaid
sequenceDiagram
    participant B as browser
    participant A as API
    participant D as Neon
    B->>A: GET /api/concessions/ID-WOOD-CONCESSION-0332/fires/0x13b4…?as_of=1792227600
    A->>D: detections matched to 0332, stored by 17 Oct 09:00 UTC
    A->>A: fires.group(): the fire, first_alone_h 25
    A->>A: fires.joined(fire): passes 1 to 8, one join on pass 5
    A->>D: the fire's 283 records
    A-->>B: first_alone_h 25, joined [14 Oct 17:20, 13 Oct 06:37, both sides], rule_version 2
    B->>B: OriginNotes: the one-detection note and the joined note
```

The pack asks for its fire at its cut. The API groups, works out the joins for that fire, and the
page writes the two notes.

The data crosses no new boundary. The browser reads public detections through the API's read-only
login, as before. The committed copy holds the same public FIRMS detections and seals (D85).

### Changes

| File | What changes | Why |
| ---- | ------------ | --- |
| `api/src/firewatch/fires.py:1-29` | Rule text, version 2. Step 9: when the first pass is one detection and the next pass came more than 14 hours after it, first alone gives the whole hours between, rounded down. Step 10: take the passes in order and group the detections seen so far after each, by steps 2 and 3. Each fire that a pass joins to the fire holding the first detection is listed once, with the pass's time and its own first seen, read by step 5 from its own first pass. A fire there can already be two that joined each other. Steps 1 to 8 are version 1's, so every reading is the same | Scenarios 1, 2 |
| `api/src/firewatch/fires.py:36` | `RULE_VERSION = 2` (D117), and `FIRST_ALONE = timedelta(hours=14)` beside `RECORDED_BEFORE` | Scenarios 1, 4 |
| `api/src/firewatch/fires.py:79` | `Fire` gains `first_alone_h: int \| None` | Scenario 1 |
| `api/src/firewatch/fires.py:151` | `_fire()` sets `first_alone_h` from `passes[0]` and `passes[1]` | Scenario 1 |
| `api/src/firewatch/fires.py` (new function) | `Joined(at, first_seen_at, first_seen)` and `joined(fire)`. A union-find over the fire's own detections, pass by pass, with the 0.01° grid (`CELL_E5`), `distance_m`, `JOIN_M` and `JOIN_TIME` that `_components()` uses. After each pass, each group that was apart from the first detection's group and now shares its root is listed. Its first seen is `_first_seen()` of the group's detections on its earliest pass. A prototype took 24 ms on the live 0332 fire's 869 detections (2026-10-22, this machine) | Scenario 2 |
| `api/src/firewatch/app.py:262-321` | The fire route adds `first_alone_h` and `joined`, each `{at_unix, first_seen_unix, first_seen}`. `_fire()` (`:159`) stays as it is, so the concession route sends neither (D116). The log line (`:301`) gains `joined=%d first_alone_h=%s` | Scenarios 1, 2, 4 |
| `api/tests/test_fires.py` | `test_rule_version_is_2`. 0332's 283 detections, from `web/public/case/pack-0332.json`: `first_alone_h` 25, and one join, on 14 Oct 17:20, of the fire first seen 13 Oct 06:37 on both sides, 2 m from the edge. Made-up cases: a gap of exactly 14 h gives none and 14 h 1 min gives 14; a one-pass fire gives none; two fires that join each other before joining the first are listed once; two joined on one pass are both listed. 0356 from `fixtures/fires/scenarios.json`: neither | Scenarios 1–3 |
| `api/tests/test_app.py` | The fire route on 0332's 283 detections (0332 matches only; 0637 is not in `trase-cut.geojson`), cut at 17 Oct 09:00: both fields. The concession route has neither key. `:681` expects `rule_version` 2 | Scenarios 1, 2, 4 |
| `web/src/` (pause 2 code) | `OriginNotes`, `JoinedTable`, `OriginMethod` in `FireView.tsx`, used by `ComplaintPack.tsx`; `seenWhere` in `format.ts`; `JoinedFire` and the two fields in `api.ts`; captions in `RealCase.tsx` and `Landing.tsx`; `.joined` in `styles/app.css`; the preview | Scenarios 1–5 |
| `web/src/FireView.test.tsx`, `ComplaintPack.test.tsx`, `format.test.ts` | Both notes, the one-join and long-list copy, the disclosure, the method lines, nothing on a firm fire, the pack's notes on top and the list under Basis, `seenWhere` for each reading | Scenarios 1–4 |
| `web/public/case/pack-0332.json` | Redone from the new API (see Rollout). It gains `first_alone_h` 25, `joined`, `rule_version` 2, and `run` and `proof` as null on each record (run-roots, D109) | Scenario 5 |
| `web/src/case.test.ts`, `RealCase.test.tsx`, `Landing.test.tsx` | The copy's `first_alone_h` and join; the hero caption; the pass 1, 2 and 5 captions; the two dropped lines | Scenario 5 |
| `README.md:146-150` | The new sha256 | D90 |
| `web/e2e/origin-confidence.spec.ts` (new) | The e2e below | Scenarios 1, 3, 4, 5 |
| `web/e2e/landing-page.spec.ts:55`, `:73` | The new hero caption and pass 2 caption | Scenario 5 |

Reusing: `_components()`'s grid and pair test, `_first_seen()`, `distance_m()`, `plural()`,
`detectedShort()`, `firstSeenShort()`, the fire panel's disclosure, `table-box`, the e2e's
`sealCase()` (D92) and its 0540 records from `fixtures/firms/fire-record.csv`.

### Earn-it

| Added | Triggered by |
| ----- | ------------ |
| `fires.joined()` and `Joined` | Scenario 2: the note and the list need each joined fire's time and first seen, and the grouping keeps no history of joins |
| `Fire.first_alone_h` | Scenario 1 |
| `OriginNotes`, `JoinedTable`, `OriginMethod` | The fire view and the pack show the same notes, list and method; today the method text is written twice |
| `.joined` CSS rule | Pause 2: at desktop width one time wrapped and the other didn't; on a phone the table ran 22 px past the screen |

No new dependency, config option, table or service.

### Non-functionals

|                      |  |
| -------------------- | - |
| **Load**             | A few fire and pack requests an hour. `joined()` adds about 24 ms on the largest fire today, 869 detections; `first_alone_h` is one subtraction |
| **Breaks first**     | Grouping on each request (D31). At 10× a concession's detections the fire route slows first. Answer: cache the grouping per cut, or D31's rejected stored grouping |
| **Security surface** | Anyone can call the fire route, as before. No new input. It reads public detections with the read-only login, touches no secret and stores nothing |
| **Proof it works**   | `served fire id=ID-WOOD-CONCESSION-0332 key=0x13b4… as_of=1792227600 detections=283 passes=8 … joined=1 first_alone_h=25`, and the README curl's sha256 after deploy matching the committed copy |
| **Rollout**          | No flag, as D81. The pack copy is redone before the merge: `cd api && DATABASE_URL="$(grep -m1 '^READER_DATABASE_URL=' ../.env \| cut -d= -f2-)" uv run uvicorn firewatch.app:app --port 8011`, then the README's curl path on `http://127.0.0.1:8011`. Deploy on main sends the API and the page together (D21). After deploy, the README curl must give the same sha256. Rollback: `git revert` the merge, which takes the API, the page and the copy back together |

### Test plan

| Scenario | Test | Command |
| -------- | ---- | ------- |
| 1. One detection, then 25 hours | `api/tests/test_fires.py` (0332, 14 h edges), `api/tests/test_app.py`, `web/src/FireView.test.tsx` | `cd api && PATH="$HOME/.foundry/bin:$PATH" uv run pytest tests/test_fires.py tests/test_app.py`; `cd web && pnpm test` |
| 2. Joined | `test_fires.py` (0332's join, side joins, two on one pass), `test_app.py`, `FireView.test.tsx` | as above |
| 3. Firm, no note; method | `test_fires.py` (0356), `FireView.test.tsx`; e2e (0540's 12.7 h fire) | as above; `cd web && pnpm e2e e2e/origin-confidence.spec.ts` |
| 4. The pack | `ComplaintPack.test.tsx`, `test_app.py` (cut); e2e | as above |
| 5. The landing | `case.test.ts`, `RealCase.test.tsx`, `Landing.test.tsx`; `web/e2e/landing-page.spec.ts`; e2e | `cd web && pnpm test`; `cd web && pnpm e2e e2e/landing-page.spec.ts` |

**E2E:** `web/e2e/origin-confidence.spec.ts`, "an investigator reads a weak first sighting and its
pack, and a judge reads the example fire's join". It opens `/?tool` for 11 to 15 Oct and opens
ID-WOOD-CONCESSION-0540. The fire first seen 13 Oct 06:37, outside 3.1 km, reads "First seen as one
detection, then not seen for 36 hours." The fire first seen 13 Oct 06:37, inside 3.4 km, has no such
note: its next pass came 12.7 hours later. It makes the weak fire's pack and finds the note on top
and "Version 2, in full". It opens `/` and reads the hero caption, then the pass 1, 2 and 5 captions
of 0332's joined fire. The joined note itself goes through the API in `test_app.py`, not the e2e: the
e2e's records hold no joined fire (O9). Full suite: `cd web && pnpm e2e`.

### Chunks

| Chunk | Scenarios | Files owned |
| ----- | --------- | ----------- |
| A | 1–4, the API | `api/src/firewatch/fires.py`, `api/src/firewatch/app.py`, `api/tests/test_fires.py`, `api/tests/test_app.py` |
| B | 1–4, the page | `web/src/FireView.tsx`, `web/src/ComplaintPack.tsx`, `web/src/format.ts`, `web/src/api.ts`, `web/src/styles/app.css`, `web/src/main.tsx`, `web/src/preview/OriginConfidencePreview.tsx`, `web/src/FireView.test.tsx`, `web/src/ComplaintPack.test.tsx`, `web/src/format.test.ts` |
| C, after A and B | 5 and the e2e | `web/public/case/pack-0332.json`, `README.md`, `web/src/RealCase.tsx`, `web/src/Landing.tsx`, `web/src/case.test.ts`, `web/src/RealCase.test.tsx`, `web/src/Landing.test.tsx`, `web/e2e/origin-confidence.spec.ts`, `web/e2e/landing-page.spec.ts` |

Shared files: `web/src/api.ts` belongs to B. C redoes the pack copy with A's API, then runs the
e2e on A and B.

### Risks

| Risk | Mitigation |
| ---- | ---------- |
| The redone copy differs from today's in more than the new fields, such as the damage estimate | Diff the two copies before committing. `case.test.ts` pins 283 records, the 8 passes and their inside counts, and the e2e seals from the new copy (D92) |
| The deployed API answers other bytes than the local run | After deploy, run the README curl. On a mismatch, commit the deployed bytes and the new sha256 |
| A listed fire can be two that joined each other first | The notes count fires joined to this one (O11), and step 10 says it |
| The live 0332 fire keeps gaining joins (7 now; the longest list today is 16) | The list sits behind a disclosure in the fire view and prints in full in the pack |
| A reader takes "may be a separate fire" as doubt about the record | The note says only the record's facts: one detection, and the hours to the next pass |

### Decisions to record

Recorded as D111 to D118.

## Open items

| ID | What | Type | Raised at | Owner | Status | Answer |
| -- | ---- | ---- | --------- | ----- | ------ | ------ |
| O1 | A stricter origin rule may stop calling 0332's fire "first seen outside", and the landing is built on it (D78, D84) (from shape O9). Checked on 2026-10-22: the reading stays "outside" unless a weak first pass is skipped, which gives "both". The landing's "By 13 Oct it was inside" rests on a second fire, joined on 14 Oct. Only 3 fires in the record are first seen outside, unjoined, not weak and later inside; the largest, in 0341, crossed on 22 Oct and is not on the globe's day | unproven | shape | user | Resolved | 2026-10-22: keep 0332's fire, and retell it on the landing as the record shows it: one pixel, a second fire on both sides of the edge, then the join on 14 Oct (D111) |
| O2 | What makes a first sighting weak? | question | spec p1 | user | Resolved | 2026-10-22: the first pass is one detection, and the satellite next saw the fire more than 14 hours later, so it missed at least one pass. 380 readings (D112) |
| O3 | Does a weak first sighting change the reading, or only add a note? | question | spec p1 | user | Resolved | 2026-10-22: keep the reading and add a note. The detection was where the reading says; the note says it may be a separate fire (D113) |
| O4 | What does the page say about a fire joined from fires first seen apart? | question | spec p1 | user | Resolved | 2026-10-22: a note on each joined fire says when it was joined and where each other fire was first seen (D114) |
| O5 | VIIRS positions can be off by up to 400 m, and D26's 375 m margin counts none of it. Widening it also moves the forecast, which uses the same margin (`api/src/firewatch/forecast.py:98`, `:101`), its sealed rule and the 2023 replay | flag | spec p1 | user | Resolved | 2026-10-22: name it in "How this is worked out" with its numbers and source, and keep 375 m. The forecast, its sealed rule and the 2023 replay don't change (D115) |
| O6 | Does the concession list mark weak and joined fires? | question | spec p1 | user | Resolved | 2026-10-22: no. The notes show in the fire view and the pack; the list stays as it is (D116) |
| O7 | Which motion tier the notes and the joined list use | question | spec p2 | user | Resolved | 2026-10-22: tier 1, nothing new. The notes take the panel's `enter`; the disclosure takes the fire panel's existing details animation |
| O8 | The preview's long joined list is 7 rows read from the live database on 22 Oct: times, readings and edge distances of 0332's fire, no company names. Commit it? | question | spec p2 | user | Resolved | 2026-10-22: yes, in `web/src/preview/OriginConfidencePreview.tsx`. The landing already commits this fire's pack |
| O9 | The e2e's records hold real weak first sightings in 0540 but no joined fire. How does the e2e walk the join? | question | spec p3 | user | Resolved | 2026-10-22: the e2e walks 0540's weak and firm fires and a pack through the API, and the join through the landing's committed copy. `test_app.py` proves the joined list from the API with 0332's real detections (D118) |
| O10 | The fire rule gains steps 9 and 10. Bump `fires.RULE_VERSION`? | question | spec p3 | user | Resolved | 2026-10-22: yes, to 2. Readings don't change, and the rule text says so (D117) |
| O11 | A fire listed as joined can be two that joined each other first. Pause 2's "Fire Watch joined 8 fires here" can undercount the fires first seen apart: the live 0332 fire began as 10 | flag | spec p3 | user | Resolved | 2026-10-22: the notes count fires joined to this one: "joined another fire to this one", "joined 7 other fires to this one". Scenario 2 and the Interface copy changed to match |

_Never delete this section or its rows. See references/ledger.md._

## Glossary

- **VIIRS** — the instrument on the NOAA-20 satellite behind FIRMS's 375 m fire detections.
- **Pass** — one time the satellite flies over and sees the fire; NOAA-20 passes about every 12 hours.
- **Nominal confidence** — FIRMS's middle grade of three (low, nominal, high) for how sure a
  detection is a fire.
- **Nadir** — straight below the satellite, where its pixels are smallest.
- **3-sigma** — a bound that about 997 of 1,000 errors fall within.
- **Join** — fire-origin's rule that puts two detections in one fire when they are within 1 km and
  48 hours of each other.
- **Union-find** — a way to track which items have been joined into one group, by keeping one
  representative per group.
- **e2e** — end-to-end: one test that walks the whole slice as a user would.
