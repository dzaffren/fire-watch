# Decisions

Append-only. A changed decision is a new entry that supersedes the old one; only an
old entry's Status line ever changes.

## D1 · 2026-10-13 · Fire watch on fire origin and spread

Why: companies answer fire grievances by saying the fire started outside their concession
(KLK, Sept 2026) or that the complaint lacks site, date and basis (Wilmar, Sept 2026);
nothing found shows a warning before a fire helps a complaint.
Rejected: risk flags before fires (Indonesian courts already apply strict liability),
broad disaster prediction (about 611 past Devpost projects; a forecast gives the chain no
job), EUDR plot proof (at least 5 near-identical past projects), community air evidence
(overlaps PlanetWatch).
Source: docs/specs/fire-watch/shape.md
Status: active

## D2 · 2026-10-13 · Direction A "Clear record", light-first and documentation-grade

Why: what the product produces is evidence a company will try to discredit, so screens must
read as precise and sober; Stripe-style clarity shows the record plainly and keeps the raw
data one click away.
Rejected: B Instrument (dense dark tool for all-day operators, not investigators preparing a
case), C Monochrome evidence (too little colour left to tell "matches" from "does not
match"), D Map first (puts the map ahead of the record, and the record is the evidence).
Source: docs/design/system-brief.md
Status: active

## D3 · 2026-10-13 · Motion ceiling tier 3, used only for the fire globe

Why: the public intro and demo opening need one moment that shows the scale of the fires
(16,496 NOAA-20 detections on 12 Oct 2026, 4,172 in the Indonesia box) before landing on one
record; working screens stay at tier 2 or below.
Rejected: tier 2 ceiling (no signature moment for the demo), space-time cube (shows one
fire's spread over time, but the world view was preferred; spread stays on the tier 2 replay).
Source: docs/design/system-brief.md
Status: active

## D4 · 2026-10-13 · Peatland palette: stone greys, deep teal accent

Why: ties the look to the land the product watches without borrowing the fire's colour; teal
sits far from ember orange, so the accent never reads as fire. Passes WCAG AA in both themes.
Rejected: Survey ink blue (clean but a generic map-office look), Haze indigo (calm but drifts
toward report software), Canopy green (its green accent forced "matches" into blue to stay
distinct).
Source: docs/design/system-brief.md
Status: superseded by D94

## D5 · 2026-10-13 · Google Maps for the base map, not Azure Maps

Why: the map ground must carry the Peatland colours (D4). In a spike on 2026-10-13 Google's
style rules painted land, forest and water within 1 point per channel of #e7ebe4 / #ffffff
(light) and #161a16 / #1a1d1a (dark); Azure Maps style overrides only switch layers on or
off. 10,000 free map loads a month.
Rejected: Azure Maps grayscale (neutral grey, not Peatland), Azure grey with a CSS tint
(approximate colour only), Azure satellite (busy, fire marks harder to read), MapLibre with
OpenFreeMap (run on donations, no uptime promise), MapLibre with our own tile file on Azure
storage (most work), our own Natural Earth drawing (coastlines only, no roads or towns).
Source: docs/specs/walking-skeleton.md
Status: active

## D6 · 2026-10-13 · Host at $0: Static Web Apps Free, Container Apps scaled to zero, Neon Free

Why: the project must cost $0 a month (cost review 2026-10-13). Each piece fits a free
allowance: Static Web Apps 100 GB, Container Apps 180,000 vCPU-s and 2 million requests, Neon
100 CU-hours. The price is a cold start of about 21 s, told on the page and in the README.
Rejected: Azure Database for PostgreSQL B1MS (about $23 a month), Azure SQL free tier (used up
in about 2 days by a 15-minute poller), one always-on Container Apps copy ($5.60–7.80 a month),
Azure Key Vault ($0.03 per 10,000 reads; Container Apps secrets are free), Azure Container
Registry Basic ($0.17 a day; GitHub's registry is free for public images).
Source: docs/specs/walking-skeleton.md
Status: active

## D7 · 2026-10-13 · Check the record in the visitor's browser, not on our server

Why: sealing exists so nobody has to trust us. The page recomputes the fingerprint and reads
Base Sepolia directly (its public RPC accepts browser calls, checked 2026-10-13), so our
server can't report "Matches" for a changed record. The page's code is public in the repo.
Rejected: checking on the server (visitors would trust our API's verdict, which is what the
chain is there to replace).
Source: docs/specs/walking-skeleton.md
Status: active

## D8 · 2026-10-13 · Fingerprint is keccak256 of ABI-encoded whole numbers, version 1

Why: Python and TypeScript must produce identical bytes. FIRMS gives up to 5 decimals for
latitude and longitude and 2 for FRP (30,013 rows checked 2026-10-13), so values are stored and
hashed as whole numbers times 100,000 and times 100.
Rejected: hashing JSON (key order and number formatting differ between Python and JavaScript),
hashing the raw CSV line (the page holds the stored row, not the original line, so it couldn't
re-check it).
Source: docs/specs/walking-skeleton.md
Status: superseded by D17

## D9 · 2026-10-13 · Only the recorder wallet can seal, once per random record ID

Why: a seal must come from the recorder and never change. A random 32-byte record ID, stored
with the row, keys each seal.
Rejected: open sealing (anyone could seal a record ID first with a wrong fingerprint and make
a true record read "Does not match"), a record ID worked out from the hotspot's values (an
edited row would point at no seal and read wrongly instead of "Does not match").
Source: docs/specs/walking-skeleton.md
Status: superseded by D107

## D10 · 2026-10-13 · psycopg and plain SQL migration files, no ORM

Why: the slice has one table and two queries. Numbered up and down SQL files with a short
runner give the tested reverse path.
Rejected: SQLAlchemy with Alembic (an ORM and a framework for one table), yoyo-migrations
(a dependency for what about 30 lines do).
Source: docs/specs/walking-skeleton.md
Status: active

## D11 · 2026-10-13 · React with Vite and TypeScript for the page

Why: the map, the in-browser chain check (D7) and the later replay timeline keep state in the
browser; TypeScript catches API shape mistakes.
Rejected: server-rendered pages (the chain check has to run in the visitor's browser).
Source: docs/specs/walking-skeleton.md
Status: active

## D12 · 2026-10-16 · Match against Trase's pulpwood concession map, not GFW's

Why: a match is only checkable if anyone can get the same boundaries. Trase publishes 298
Indonesian pulpwood concessions as GeoJSON under CC BY 4.0. GFW's Indonesia layers are view
only and can't be downloaded, its CC BY licence excludes Indonesia, and its oil palm data is
from 2012 (checked 2026-10-16).
Rejected: GFW view-only layers (polygons only reachable by scraping map tiles; a checker can't
legally get the same ones), waiting for a downloadable oil palm source (days; fire-origin must
run live by about 2026-10-19).
Source: docs/specs/fire-record.md
Status: active

## D13 · 2026-10-16 · Record hotspots within 5 km of a concession, each listing every concession in reach

Why: fire-origin argues "started outside, spread in", so detections outside the boundary must
be sealed when they happen; a seal added later can't show they weren't made up after a
dispute. 1,805 of 7,972 kept hotspots (2026-10-11 to 15) were within 5 km of two or more
concessions, so naming only one would hide them from the neighbour's page.
Rejected: inside only (no sealed outside detections before fire-origin ships), every hotspot in
the Indonesia box (about 8,600 a day, 5 times the seals, mostly nowhere near a concession),
nearest concession only (drops a hotspot from the neighbouring concession's page), one seal per
hotspot and concession pair (about 25% more seals, the same detection sealed twice).
Source: docs/specs/fire-record.md
Status: active

## D14 · 2026-10-16 · The home page is dates, then a concession list

Why: a grievance names one supplier's land, so the investigator looks up a concession, not a
patch of map. 174 concessions had hotspots on 2026-10-11 to 14; a ranked list puts the worst
first.
Rejected: map view as the area (thousands of dots when zoomed out, needs clustering), province
picker (up to 50 concessions in one province), keeping the latest-hotspot screen beside it (two
screens to explain; the latest hotspot is often far from any concession).
Source: docs/specs/fire-record.md
Status: superseded by D72

## D15 · 2026-10-16 · Record hourly from a scheduled Azure job

Why: a seal is stronger evidence the closer it is to detection, and a run by hand leaves gaps
whenever nobody runs it. The recorder wallet key and database owner login move into Container
Apps secrets; whoever holds them can add seals but can't change one.
Rejected: running the recorder by hand on the operator's machine (gaps, and seal times days
after detection).
Source: docs/specs/fire-record.md
Status: active

## D16 · 2026-10-16 · Leave Trase's four permit-2024 concessions out of matching

Why: Trase's 2023–2024 map includes 4 proposed, not yet licensed, concessions with no field
marking them; the 4 with permit year 2024 (ID-WOOD-CONCESSION-0666 to 0669) are the likely
ones. A record must not name land nobody holds yet. They held 11 hotspots on 2026-10-11 to 15.
Rejected: keeping them with a "may still be proposed" label (a guess printed on a public
record), Trase's 2020–2022 map (no proposed concessions, but boundaries from older Ministry
data).
Source: docs/specs/fire-record.md
Status: active

## D17 · 2026-10-16 · Fingerprint version 2 adds the map version and every concession match

Why: the seal must also fix which concessions a hotspot was matched to and against which map, or a
match could be changed without the page showing "Does not match". As in D8, values are
ABI-encoded whole numbers so Python and TypeScript produce identical bytes: latitude and longitude
times 100,000 and FRP times 100 (FIRMS gives up to 5 and 2 decimals; 30,013 rows checked
2026-10-13), and distances in whole metres. Version 1, the detection alone, stays for
walking-skeleton rows; version 2 appends map_version and the matches as three arrays sorted by
concession ID.
Rejected: a separate seal for each match (twice the seals, and a match could be sealed apart from
its detection), hashing the matches as JSON (key order and number formatting differ between
Python and JavaScript), hashing the raw CSV line (the page holds the stored row, not the line).
Supersedes: D8
Source: docs/specs/fire-record.md
Status: active

## D18 · 2026-10-16 · Match hotspots to concessions in PostGIS

Why: one query finds every concession within 5 km and the ground distance to each edge in metres,
and the API draws the simplified boundary from the same table. The walking-skeleton stack already
picked Postgres with PostGIS for spatial queries; Neon runs PostGIS 3.5.7 on Postgres 17 (checked
2026-10-16).
Rejected: matching in Python with shapely and pyproj (27 MB of downloads, numpy included, added to
the image the API also cold-starts from).
Source: docs/specs/fire-record.md
Status: active

## D19 · 2026-10-16 · Seal one record per transaction on the deployed FireRecords, at most 40 minutes a run

Why: seal(recordId, fingerprint) already takes a version 2 fingerprint, and a real seal cost 68,329
gas, about 0.00000041 ETH (2026-10-16), so the wallet's 0.04 ETH lasts about 40 days at the busiest
day's 2,495 seals. The cap lets the 5-day backfill, about 8,000 records, drain over about 13 runs
without a run reaching the next hour.
Rejected: a new contract with a batch seal (a redeploy splits seals across two contracts to save
gas we don't need), sending every transaction before waiting for receipts (faster, but the public
RPC's lagging nodes make nonce gaps and repeat sends likely).
Source: docs/specs/fire-record.md
Status: superseded by D103

## D20 · 2026-10-16 · Watch the recorder from a scheduled GitHub workflow

Why: on-chain time only counts from the seal, so a stalled recorder loses evidence. /api/health
reports the last run and the unsealed count; a GitHub workflow checks it hourly and fails after 2
hours without a good run, or when a run sealed nothing while records wait. GitHub emails on
failure. $0.
Rejected: an Azure Monitor alert on failed job runs (billed, about $0.10 a month by Azure's price
list, unchecked here; and blind to a run that succeeds but seals nothing), no alert (a stall could
go unnoticed during judging).
Source: docs/specs/fire-record.md
Status: active

## D21 · 2026-10-16 · GitHub deploys only the API and the page; the recorder job is out of its reach

Why: the job holds the recorder wallet key (D15). An identity that can change the job's image can
ship code that reads the key, so GitHub gets Contributor on firewatch-api only, plus Reader on the
resource group, which can't read secret values. The operator updates the job's image by hand
after recorder changes.
Rejected: Contributor on the whole resource group (a compromised deploy could swap the job's image
and read the key), a custom role without secret reads (the same image swap still reads the key).
Source: docs/specs/fire-record.md
Status: active

## D22 · 2026-10-16 · Crowded fire detections draw as 3 px dots below zoom 12

Why: at zoom 9 a 375 m VIIRS pixel is 1.2 px wide, so 6–13 px dots merge into solid
patches of fire colour (296 detections within 40 px of hotspot A at zoom 11,
ID-WOOD-CONCESSION-0540, 2026-10-11 to 14). 3 px dots keep every detection at its true
position; fire-power sizes return at zoom 12, where a pixel is 10 px wide.
Rejected: pooling into an 8 px grid (83 of 1,264 detections drawn on the wrong side of
the boundary at zoom 9), open rings sized by fire power (still close into one patch
around hotspot A), fire-power sizes at every zoom (the patches O9 raised).
Source: docs/design/system-brief.md
Status: active

## D23 · 2026-10-16 · Split the spread forecast out of fire-origin

Why: the forecast brings a wind source, a model, a new kind of seal and a check against where the
fire went: a third area and at least 3 more scenarios, past the slice test's 5 scenarios and 2 areas.
fire-origin ships alone with where a fire was first seen and how it spread.
Rejected: keeping the forecast in fire-origin (fails the slice test).
Source: docs/specs/fire-origin.md
Status: active

## D24 · 2026-10-16 · Work out where a fire was first seen from sealed detections; no new seals

Why: every detection is sealed within the hour it's recorded, so anyone can redo the reading from
sealed records and a published rule. A reading changes when a pass grows a fire or joins two, so a
sealed reading would need sealing again.
Rejected: sealing each reading (proves what we said, not what the satellite saw, and needs sealing
again as fires grow or join), sealing each run's list of records (would show a missing record, but
needs a new record type and recorder work; FIRMS's public archive already lets anyone find one).
Source: docs/specs/fire-origin.md
Status: superseded by D119

## D25 · 2026-10-16 · Same fire when within 1 km and 48 hours of a detection already in it

Why: 1 km allows one missed 375 m pixel, and 48 h allows up to three passes missed under cloud. On
2026-10-12 to 15, 9 of 737 gaps between passes of one fire went over 50 h. Gives 1,451 fires.
Rejected: 750 m and 24 h (1,634 fires; splits a fire after one cloudy day, and the second piece
reads as new, possibly "first seen outside"), 1.5 km and 72 h (1,236 fires; chains separate fires,
so a big fire's first-seen point can sit far from where it crossed).
Source: docs/specs/fire-origin.md
Status: active

## D26 · 2026-10-16 · Say which side a fire was first seen on only beyond 375 m from the edge

Why: 375 m is half the widest VIIRS pixel (scan up to 0.76 km), so a detection farther than that
has its whole pixel on one side. A call a company can pick apart weakens the grievance. Calls 15 of
65 boundary crossings on 2026-10-12 to 15; the rest read "too close to the edge to tell". The page
says "first seen", never "started".
Rejected: calling by side at any distance (39 of 65 called, but the calls within a pixel can be
wrong).
Source: docs/specs/fire-origin.md
Status: active

## D27 · 2026-10-16 · Flag fires seen on 4 or more passes that never spread past 750 m

Why: a mill's boilers show up on every pass, and a grievance over one would discredit the rest.
fire-record accepted this risk because fire-origin would flag it (fire-record O4). 5 fires met the
rule on 2026-10-12 to 15. The note names both a fixed heat source and smouldering peat, since peat
fires also stay put.
Rejected: no flag (the risk stays open, and a mill could end up in a complaint).
Source: docs/specs/fire-origin.md
Status: active

## D28 · 2026-10-16 · Rank a concession's fires largest first

Why: on ID-WOOD-CONCESSION-0332, newest first put one-pass fires (18 of 34) on top and the 188- and
90-detection fires that crossed the edge lower. Largest first matches the concession list's
worst-first ranking (D14).
Rejected: newest first (one-pass fires fill the top rows), boundary-crossing fires first (a two-part
order that is harder to explain in one line).
Source: docs/specs/fire-origin.md
Status: superseded by D45

## D29 · 2026-10-16 · Tint the inside of a concession with --fw-concession on every map

Why: a dashed edge alone doesn't show which side is inside; ID-WOOD-CONCESSION-0356 has several close
outlines, and "inside, 410 m" couldn't be read off the map. Ink at 6% (light) and 7% (dark) reads as
an area and keeps fire dots at 3.8:1 and 6.3:1 against it.
Rejected: the dashed edge alone (the map can't back up an inside or outside reading), a teal accent
wash (the accent means "you can act", D4).
Source: docs/design/system-brief.md
Status: superseded by D96

## D30 · 2026-10-16 · Replay one satellite pass every 600 ms

Why: at 240 ms a 4-pass fire played in under a second, too fast to follow on screen or in the demo
video; at 600 ms it takes about 2 s, and a 28-pass fire about 17 s.
Rejected: 240 ms (too fast to see each pass land), no play button (motion tier 1; loses the moving
spread in the demo).
Source: docs/design/system-brief.md
Status: superseded by D93

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

## D33 · 2026-10-17 · A pack holds its fire as it stood when made, sealed or not

Why: a grievance must show the buyer what the investigator sent. Fires grow, and a fire loses its
key when a pass joins it to an older one (fire-origin O11). Of 1,801 fire and concession pairs to
2026-10-15, 39 grew and 1 lost its key by 2026-10-16 07:22 UTC. Detections that wait for a seal
stay in and read "Not on chain yet"; the recorder seals within the hour.
Rejected: a pack that follows the live fire (the buyer could see something the grievance doesn't
say), a count of newer detections on the pack (one more query, on a pack that records what was
sent), leaving unsealed detections out (6 of the 0332 fire's 19 waited during the backfill), no
pack until every detection is sealed (the investigator waits on the recorder).
Source: docs/specs/complaint-pack.md
Status: active

## D34 · 2026-10-17 · Only the complaint pack gets its own link, and it prints to PDF

Why: the pack is what the investigator sends a buyer, so it needs a link that opens in any
browser. A clean print lets a grievance carry it as a PDF. Other views keep their on-page back
links.
Rejected: a link for every view with Back stepping out (routing for the whole page, a third area
that fails the slice test; fire-record O10), the link with no print layout (a grievance sent as a
document loses the pack), a JSON file of the records (each raw record already opens on the page).
Source: docs/specs/complaint-pack.md
Status: superseded by D74

## D35 · 2026-10-17 · Verify FireRecords on Basescan

Why: a buyer who opens a seal's transaction should read seal(recordId, fingerprint), not raw hex.
The operator verifies the contract once, with a free Etherscan API key kept in the untracked .env.
Rejected: leaving it unverified (the transactions a pack links to show raw hex; walking-skeleton
accepted this only until complaint-pack).
Source: docs/specs/complaint-pack.md
Status: active

## D36 · 2026-10-17 · Anyone can make a pack for any fire, with its caveat on top

Why: the site has no login, and everything in a pack is public already: FIRMS detections, Trase
concession IDs and seals on Base Sepolia. A fire the record can't settle still gets a pack, with
its caveat directly under the headline, so the buyer reads it first.
Rejected: packs only with a key (a login the product doesn't have, a third area), a warning before
making such a pack (the caveat already travels with the pack), no pack for too-close, both-sides
or never-spread fires (the investigator decides what goes in a grievance).
Source: docs/specs/complaint-pack.md
Status: active

## D37 · 2026-10-17 · Cut a pack at the newest stored detection's time, carried in its link

Why: a pack must hold what the investigator saw (D33). The fire route reads the newest created_at
first and groups only detections stored by then, so the fire view and its pack read the same rows.
The link carries the concession, the fire key and that time, so nothing new is stored.
Rejected: a packs table (the API reads with a read-only role; a write route open to anyone, D36,
needs a new role and abuse limits), the time of the click (a recorder run's rows carry the time
its transaction began, before FIRMS was fetched, so a pack could gain rows committed after the
click), every record ID in the link (188 IDs make a link of about 12,000 characters).
Source: docs/specs/complaint-pack.md
Status: active

## D38 · 2026-10-17 · Read a pack's seals through Multicall3, one call per 500 records

Why: Base Sepolia's public RPC allows 25 calls a second and counts each call in a JSON-RPC batch.
A batch of 188 seal reads got 25 answers and 163 "25/second request limit reached" errors. One
aggregate3 call through Multicall3 read all 188 in 545 ms, and 0540's 488 in 505–712 ms
(2026-10-17).
Rejected: one sealOf per detection in a batch (rate-limited, as above), batches of 20 a second
(about 25 s for 0540's 488-detection fire), a batch read on FireRecords (a redeploy, which D19
rejected).
Source: docs/specs/complaint-pack.md
Status: active

## D39 · 2026-10-19 · A forecast gives when a fire is seen inside within 48 hours, or that it isn't

Why: a time is right or wrong for each fire, so a buyer can check one forecast. "Seen inside" is
fire-origin's rule (D26), so an arrival is never a detection that could be on either side of the
edge. The 31 arrivals on 2026-10-12 to 15 came 11 to 47 hours after the pass before.
Rejected: a chance of arriving (checkable only over many fires), where the front is next (says
nothing about the concession), any detection inside or within 375 m (could be on either side,
D26), 24 hours (14 of the 31 arrivals came later), 72 hours (each forecast stays open 3 days).
Source: docs/specs/spread-forecast.md
Status: active

## D40 · 2026-10-19 · Forecast every fire near a concession not yet seen inside, after each pass

Why: a fire can be seen inside on its second pass, as one on ID-WOOD-CONCESSION-0532 was, so the
forecast after its first pass counts. One forecast per concession, 278 on the quiet day to
2026-10-17 07:03 UTC, adds little to the recorder's seals (D19).
Rejected: only fires seen on 2 or more passes (misses fires seen inside on their second pass),
only fires within 1 km of the edge (misses the 0332 fire that came in from 3.1 km).
Source: docs/specs/spread-forecast.md
Status: active

## D41 · 2026-10-19 · Seal and list every forecast, "yes" or "no", with its outcome

Why: a reader can count the misses, so nobody can keep only the forecasts that came true. The seal
fixes each forecast's time before its outcome is known.
Rejected: every forecast sealed but only the newest on the page (older ones hidden on the chain),
sealing only those that say the fire comes in (a fire that came in when the forecast said no would
leave no trace).
Source: docs/specs/spread-forecast.md
Status: active

## D42 · 2026-10-19 · Measure the forecast in season-backtest, not before it ships

Why: a forecast counts only from its seal, and 5 days remain to 2026-10-24, so the forecast step
should run as soon as it can. season-backtest's 2023 replay, labelled as a replay, measures the
published rule against the naive baseline and reports the result, good or bad.
Rejected: a spike first (delays the first sealed forecast), the baseline itself as the forecast
(season-backtest could compare it only with "never comes in"), replaying the recorded week now
(forecasts sealed today prove nothing about timing, and need a replay label in this slice).
Source: docs/specs/spread-forecast.md
Status: active

## D43 · 2026-10-19 · The complaint pack doesn't carry forecasts

Why: keeps spread-forecast to 5 scenarios and two areas. A later slice can add them if the demo
needs it.
Rejected: forecasts sealed before the pack's time (one more scenario, and the pack view changes).
Source: docs/specs/spread-forecast.md
Status: active

## D44 · 2026-10-19 · Check a forecast by time, against its own fire's passes after its seal

Why: a forecast must never get credit for what the satellite had already seen, or for a fire it
joined. NOAA-20 sometimes passes twice about 100 minutes apart and FIRMS takes 2 to 3 hours, so a
pass can come before the seal yet be stored after it. From 2026-10-16 to 18, a fire not yet seen
inside joined an older fire 28 times, often one already inside. Those forecasts close unchecked
and count neither way, here and in season-backtest. The crossing point is drawn, not scored.
Rejected: counting any pass stored after the seal (credits an arrival seen before the seal),
checking against the joined fire (the 0341 fire 2,501 m out would read "seen inside" with none of
its own detections inside), scoring the crossing point's distance too (one more number to define
and test).
Source: docs/specs/spread-forecast.md
Status: active

## D45 · 2026-10-19 · Rank a concession's fires forecast to come in first, then largest first

Why: the investigator opens a concession to see which fire is about to come in; ranked largest
first, 0332's one such fire sat 18th of 34. Each group stays largest first, as D28 set: on
ID-WOOD-CONCESSION-0332, newest first put one-pass fires (18 of 34) on top, and largest first
matches the concession list's worst-first ranking (D14).
Rejected: largest first alone (a fire forecast to come in can sit far down the list), newest
first (one-pass fires fill the top rows, D28).
Supersedes: D28
Source: docs/specs/spread-forecast.md
Status: active

## D46 · 2026-10-19 · Show forecasts on the concession view, not on the concession list

Why: the investigator opens a concession to see its forecasts, so the API change stays in the
fire and concession routes.
Rejected: marking concessions on the list (the list query gains a count of waiting forecasts).
Source: docs/specs/spread-forecast.md
Status: active

## D47 · 2026-10-19 · Mark where a forecast says a fire crosses the edge

Why: near the edge the forecast line is a few pixels long: 0332's 14 Oct 20:00 forecast ran about
100 m and 0540's about 190 m, and 28 of the 31 arrivals on 2026-10-12 to 15 came from within
500 m. A mark on the edge reads at any zoom. /design-system adds it to the detections guideline
before /build.
Rejected: the dashed line alone (the crossing reads off the map only for a fire far out).
Source: docs/specs/spread-forecast.md
Status: active

## D48 · 2026-10-19 · Forecast rule version 1: the fire's advance to the nearest edge, else 375 m means the next pass

Why: on 2026-10-12 to 16, of 2,007 forecast moments with 41 fires seen inside within 48 hours, it
forecast 482 inside: all 41 came in, 441 did not. The 17 timed by the fire's advance were a median
1.0 hour off. It uses only sealed detections and the concession's edge, so anyone can redo it. It
was chosen on the week it was measured on; season-backtest measures it on 2023 (D42).
Rejected: the advance rate alone (24 of the 41 missed), within 375 m alone (timed only to the next
pass, a median 11.7 hours off), a wind-driven rule (wind isn't sealed, so it can't be redone from
the chain, and the baseline it is measured against already moves downwind).
Source: docs/specs/spread-forecast.md
Status: active

## D49 · 2026-10-19 · Make and seal forecasts in the recorder job, first in each run, as fingerprint version 3

Why: only the recorder wallet seals (D9), and a forecast's seal time is its evidence, so it goes
before the run's detection seals. About 420 forecasts a day at 5.8 s a seal fit the 40-minute run
(D19). Version 3 ABI-encodes the concession, fire key, pass, made, until and forecast times, the
two points and the rule version as whole numbers, so Python and TypeScript produce identical bytes
(D17).
Rejected: a forecast job of its own (a second job holding the wallet key), the API (read-only, no
key, D21), sealing detections first (a forecast could wait behind the backlog), a new contract (a
redeploy, D19), hashing JSON (D17).
Source: docs/specs/spread-forecast.md
Status: superseded by D105

## D50 · 2026-10-19 · Store each forecast's outcome when a run decides it, by the chain's clock

Why: a run checks waiting forecasts against the fire as it then stands, so a join and an arrival
are told apart by which came first (D44); once decided, an outcome never changes. The run takes
"now" from Base Sepolia's latest block, the clock the seals use. It closes a forecast 6 hours after
its 48 have ended, because FIRMS rows can arrive late.
Rejected: working outcomes out in the API on each request (regrouping the concession as of each
pass after the seal, several times per fire view), the job's own clock (a second clock beside the
seals', and the e2e could not stage past runs without a test hook).
Source: docs/specs/spread-forecast.md
Status: active

## D51 · 2026-10-19 · Measure the forecast against a fire moving downwind at its recent rate

Why: shape O12 named it as the naive guess, and D48 kept wind out of rule version 1 because of it.
A fire seen on one pass has no rate, so the baseline says no.
Rejected: the same plus rule version 1's 375 m step (only the direction would differ, so it is not
naive), "never comes in" (right about 96 times in 100 in 2023, while it warns of nothing).
Source: docs/specs/season-backtest.md
Status: superseded by D99

## D52 · 2026-10-19 · Replay all of 2023

Why: there are no months to argue about. FIRMS's NOAA-20 file holds 250,312 detections for 2023,
and the replay takes about 30 seconds.
Rejected: Aug–Oct (189,545 detections; invites "why those months"), Jul–Nov (222,944; the same
question).
Source: docs/specs/season-backtest.md
Status: active

## D53 · 2026-10-19 · Count every forecast once, with arrivals warned of, false alarms and hours off

Why: the live fire view lists every forecast (D41), so the replay counts the same way. The hours
off alone would hide the 3,753 "inside" forecasts that did not come in.
Rejected: each arrival once, by the last forecast before it (unlike the live view), the hours off
only (hides the false alarms).
Source: docs/specs/season-backtest.md
Status: active

## D54 · 2026-10-19 · Show the 2023 result in the forecast panel

Why: the reader weighs a forecast where it is shown. No new screen, and D34 holds.
Rejected: a page with its own link (supersedes D34 and adds a route), a section on the home page
(away from the forecasts it describes).
Source: docs/specs/season-backtest.md
Status: active

## D55 · 2026-10-19 · Publish every replay forecast as a CSV, and seal nothing

Why: anyone can recount the misses, as D41 lets them do live. A seal made in 2026 proves nothing
about 2023 (shape O9). The pinned inputs and the command let anyone redo it, and git history shows
any change.
Rejected: the totals only (the misses can't be recounted without a rerun), sealing the result's
fingerprint once (a new fingerprint version, for a seal that proves only that the file is unchanged
since 2026).
Source: docs/specs/season-backtest.md
Status: active

## D56 · 2026-10-19 · Leave out of the 2023 counts the forecasts whose 48 hours end in 2024

Why: 15 of 20,277 forecasts are made after 2023-12-29 18:00 UTC, and their 48 hours plus D50's 6
end past the 2023 file. The CSV lists them as "ends after 2023".
Rejected: reading FIRMS's 2024 file for its first 3 days (a second pinned download of about 20 MB
for 15 forecasts), judging them on 2023's passes only (a fire seen inside on 1 Jan would wrongly
read "not seen inside").
Source: docs/specs/season-backtest.md
Status: active

## D57 · 2026-10-19 · Replay 2023 as the hourly recorder would have run, each pass stored 3 hours after it was taken

Why: a forecast counts only against passes after it was made (D44), so a replay needs a made time.
FIRMS takes 2 to 3 hours, and lags of 1 to 4 hours gave identical outcomes on 2023. Each
detection's ID is the sha256 of its place and time, so every run gives the same fires and CSV.
Rejected: forecasting at the pass itself (no recorder can, as FIRMS publishes hours later), each
row's real publish time (the archive doesn't carry it), random record IDs as the recorder makes
(fire keys, and so the CSV, would change on each run).
Source: docs/specs/season-backtest.md
Status: active

## D58 · 2026-10-19 · Commit the replay's ERA5 wind, fetched once from Open-Meteo

Why: the result must come out the same on every run, and a weather service can change or refuse.
Open-Meteo serves ERA5 free, with credit, and refused the 15th request when they came 2 s apart.
The wind for 9,322 paths, 2023's moments with a rate, sits in the repo where review sees it.
Rejected: Copernicus directly (an account, a key and a NetCDF reader), fetching on every run (rate
limits, and a changed source would change the result).
Source: docs/specs/season-backtest.md
Status: active

## D59 · 2026-10-19 · Bundle the committed 2023 totals into the page

Why: the numbers change only when the replay is redone and committed, so the page needs no
request, and no loading or error state. The e2e runs the command on a cut, then reads the committed
totals on the page.
Rejected: an API route (the API's image doesn't carry the fixtures; a route for one fixed file), a
static file fetched at run time (a loading and an error state for fixed numbers), a build switch so
the e2e shows the cut's totals (an env var only a test uses).
Source: docs/specs/season-backtest.md
Status: active

## D60 · 2026-10-19 · The downwind guess forecasts on rule version 1's terms, but downwind

Why: only the direction should differ. The guess uses rule version 1's advance rate, every newest
pass detection, and its rounding to the nearest 12 hours. Exact hours made it 17.1 hours off
against 11.7, from rounding alone.
Rejected: exact hours from the detection nearest the edge (measures the rounding, not the
direction).
Source: docs/specs/season-backtest.md
Status: active

## D61 · 2026-10-20 · Estimate a fire's damage as area, CO2 and cost at the World Bank's 2015 average

Why: the shape keeps this slice for the economic-impact ask, so it needs a cost. The World Bank's
2015 figure is Indonesia's own, US$16.1 billion over 2.6 million ha, about US$6,192 per ha, and it
counts haze, health and crop losses.
Rejected: CO2 at EPA's US$190 per t (the US government stopped using it in 2025), area and CO2 only
(no cost), area only.
Source: docs/specs/damage-estimate.md
Status: active

## D62 · 2026-10-20 · Tell peat from other ground with WRI's Global Peatlands map, pinned by sha256

Why: peat changes the CO2 about 9 times, 600.6 against 66.7 t per ha. The map is CC BY 4.0, about
28 m, covers all of Indonesia, and answers for each piece of ground, also outside a concession.
Rejected: Trase's peat share per concession (no answer per detection, none outside a concession),
every detection as peat (overstates fires on other ground 9 times).
Source: docs/specs/damage-estimate.md
Status: active

## D63 · 2026-10-20 · Count a fire's ground as the joined 375 m squares of its detections

Why: ground seen on several passes counts once. The 0332 fire's 19 detections cover 209.8 ha, not
267.2.
Rejected: detections times 14.06 ha (counts the same ground again on each pass).
Source: docs/specs/damage-estimate.md
Status: superseded by D126

## D64 · 2026-10-20 · Show the estimate in the fire view and the pack, split at the concession's edge

Why: the pack is what reaches the buyer, and the buyer weighs the damage on the supplier's land.
Each piece of ground is already placed against the edge.
Rejected: a total per concession on the concession view (a third screen), the fire view only (the
buyer never sees it), one total for the whole fire.
Source: docs/specs/damage-estimate.md
Status: active

## D65 · 2026-10-20 · Seal nothing new for the damage estimate

Why: the detections are sealed, and the peat map and the factors are pinned, so anyone can redo the
estimate, as fire origin is redone (D24).
Rejected: sealing each estimate (a new fingerprint version and recorder work, for a number the
sealed inputs already fix).
Source: docs/specs/damage-estimate.md
Status: active

## D66 · 2026-10-20 · Burn ground off peat at IPCC's secondary tropical forest values

Why: it is the closest IPCC 2006 category to cleared land and acacia. 42.2 t dry matter per ha at
1,580 g CO2 per kg gives 66.7 t CO2 per ha.
Rejected: peat only (calls fires on other ground carbon-free), primary tropical forest (119.6 t per
ha, too high for plantation land).
Source: docs/specs/damage-estimate.md
Status: active

## D67 · 2026-10-20 · Show a never-spread fire's estimate, with the fixed-heat-source caveat on top

Why: a fire seen on 4 or more passes without spreading may be a mill, or peat smouldering in place
(D27). Smouldering peat is real damage, so the caveat goes on top and the numbers stay.
Rejected: withholding the estimate (smouldering peat would get none).
Source: docs/specs/damage-estimate.md
Status: active

## D68 · 2026-10-20 · Count CO2 only, and say methane and carbon monoxide are left out

Why: one gas keeps one factor for each number. Methane would add about 200 t CO2-equivalent per ha
of peat, and it needs a warming factor from one more source.
Rejected: CO2-equivalent with methane at IPCC AR6's 27 over 100 years (a third more on peat, and
one more factor to defend).
Source: docs/specs/damage-estimate.md
Status: active

## D69 · 2026-10-20 · Keep WRI's peat as polygons in PostGIS, cut to the concessions' reach

Why: the peat within 5.5 km of the 294 concessions is 38,537 polygons with 767,181 vertices. Cut
to 256 vertices a piece it is a 14 MB table, and Neon holds 36 MB today. The damage query took 1 to
7 ms for most fires and 121 ms for a 188-detection fire. Matching is already in PostGIS (D18).
Rejected: the raster in PostGIS (about 260 million pixels in reach), reading the tiles in the API
with rasterio (GDAL and 42 MB of tiles in the API image), the peat of each detection worked out
when the recorder stores it (a recorder change and a backfill, and joined squares still need the
polygons).
Source: docs/specs/damage-estimate.md
Status: active

## D70 · 2026-10-20 · Commit the peat cut, made once from the pinned tiles

Why: GFW serves the tiles only with an API key, and no key goes in the repo. The cut is 2.0 MB
gzipped. Anyone with a GFW key redoes it with `load-peat --cut`, as `--fetch-wind` redoes the wind
(D58).
Rejected: downloading the tiles on each load (every operator and the e2e would need a key),
committing the 10 tiles (42 MB).
Source: docs/specs/damage-estimate.md
Status: active

## D71 · 2026-10-20 · The API sends a fire's four hectare parts, and the page holds the factors

Why: the parts come from stored detections and the peat table. The factors are fixed numbers that
the page also cites, so one file states and applies them.
Rejected: the API also sends the CO2 and the cost (the factors in Python and in the page's text).
Source: docs/specs/damage-estimate.md
Status: active

## D72 · 2026-10-20 · Put a landing page at the site's address, with the tool one click away

Why: judges and new investigators don't know what a concession or a seal is, and the tool opens
on concession IDs. Inside the tool, a grievance still names one supplier's land, so the tool opens
on dates, then a concession list ranked by hotspots inside, worst first.
Rejected: an explainer block above the date picker (a newcomer still lands in the tool), map view
as the area (thousands of dots when zoomed out), province picker (up to 50 concessions in one
province), keeping the latest-hotspot screen beside it (two screens to explain).
Supersedes: D14
Source: docs/specs/landing-page.md
Status: active

## D73 · 2026-10-20 · Put dated facts on the landing, not live counts

Why: a number with its date stays true, and the landing then needs nothing from a server that may
be asleep. 14 Oct 2026 had 62,489 NOAA-20 detections worldwide, 9,923 around Indonesia.
Rejected: live counts from the API (a new endpoint, a second area), no numbers (the scale is half
the story).
Source: docs/specs/landing-page.md
Status: active

## D74 · 2026-10-20 · Give the tool its own link, as the complaint pack has

Why: an investigator who comes back bookmarks the tool and skips the landing. The pack keeps its
own link and prints to PDF, since it is what goes to a buyer. Other views keep their on-page back
links: one entry link is not routing for every view.
Rejected: the browser remembering a visit (a judge on a used machine never sees the landing), one
click through the landing every time, a link for every view (routing for the whole page), the
pack link with no print layout, a JSON file of the records.
Supersedes: D34
Source: docs/specs/landing-page.md
Status: active

## D75 · 2026-10-20 · Show 14 Oct 2026's fires on the globe, from a committed file

Why: the example 0332 fire burns that day, on the 06:18 and 17:20 UTC passes, so the flight ends
on a live fire. A committed day needs no server and can't change under the demo.
Rejected: 12 Oct 2026, the day the brief measured (the 0332 fire hadn't started), the latest day
(a FIRMS fetch on the server, a second area).
Source: docs/specs/landing-page.md
Status: active

## D76 · 2026-10-20 · Load the globe on its own on desktop; phones keep the flat map

Why: a judge sees the globe without looking for a button. The flat map of the same fires shows
first and holds the space, so nothing shifts. This replaces the design brief's "nothing downloads
until asked"; tier 3 stays for the globe alone (D3).
Rejected: loading on a press, as the brief's tier 3 budget said (a judge may never press it).
Source: docs/specs/landing-page.md
Status: active

## D77 · 2026-10-20 · The reader drags the globe, and one flight goes to the example fire

Why: dragging lets a judge find their own region; the flight ends the story on a record that can
be checked.
Rejected: a fixed sequence with no dragging (nothing to explore), free zoom with a card for every
fire (most to build; each record already opens in the tool).
Source: docs/specs/landing-page.md
Status: active

## D78 · 2026-10-20 · Make 0332's fire first seen outside the landing's example

Why: on the full record it was first seen on 12 Oct 2026 at 05:16 UTC, outside
ID-WOOD-CONCESSION-0332 and 3,100 m from its edge, and inside from 13 Oct: the "started outside,
spread in" case the site answers. Its 283 detections to the 17 Oct 09:00 UTC cut are all sealed.
Rejected: the fire of fire-origin scenario 1 (on the full record it reads "first seen on both
sides", so its pack opens with that caveat; it read "outside" only on a 19-row test cut).
Source: docs/specs/landing-page.md
Status: superseded by D111

## D79 · 2026-10-20 · Make the globe's data with a globe-day command, from pinned sources

Why: the landing's numbers are dated facts (D73), so anyone with a FIRMS key should get the same
three files, as load-peat --cut redoes the peat (D70). The FIRMS file, Natural Earth's land and
Trase's map are each pinned by sha256.
Rejected: committing the files with their sources described in words (no one could redo them
exactly).
Source: docs/specs/landing-page.md
Status: active

## D80 · 2026-10-20 · Fall back to the flat map when the globe runs under 30 fps

Why: the brief's budget says never below 30 fps, and no one can measure every machine. The first 2 s
after the globe shows decide; the flat map has the same fires and the same flight.
Rejected: always showing the globe on a desktop with WebGL (a weak GPU would turn it under 30 fps).
Source: docs/specs/landing-page.md
Status: active

## D81 · 2026-10-20 · Ship the landing without a flag; a revert rolls it back

Why: it is a static page, a revert redeploys the old home page in minutes, and pack links don't
change.
Rejected: a build-time flag, off by default (one more GitHub variable, and two home pages to keep
working until it is removed).
Source: docs/specs/landing-page.md
Status: active

## D82 · 2026-10-21 · Walk the example fire on the landing as a scroll story, one pass per stop

Why: the builder, reading as a newcomer, couldn't tell what Fire Watch is for; one real fire told
step by step shows it. The map holds still as the text scrolls, and each of the fire's 8 passes
has its own scroll stop, so the judge sets the pace.
Rejected: Back and Next buttons (the user chose to read by scrolling), a sequence that plays on its
own (the judge can't set the pace, as with the tool's play button), one stop that plays the 8 passes
(the judge can't stop on one pass).
Source: docs/specs/newcomer-walkthrough.md
Status: active

## D83 · 2026-10-21 · Check the example fire's 283 seals live on the landing

Why: showing a later change is a seal's one job. At the seal step the judge's browser reads all 283
from Base Sepolia, as a pack does (D7).
Rejected: a link to the pack for the check (one more click before the proof).
Source: docs/specs/newcomer-walkthrough.md
Status: active

## D84 · 2026-10-21 · Keep 0332's fire for the walkthrough, and say when each pass was sealed

Why: it is the globe's fire on 14 Oct (D75, D78), first seen outside and inside from 13 Oct. Its
first six passes, 12 to 15 Oct, were sealed on 16 Oct when recording began, 23 hours to 4 days
after the satellite; passes 7 and 8 about 3 hours after. Saying so keeps the claim true.
Rejected: 0363's fire, sealed live from its first pass (29 detections on 6 passes, first seen
16 Oct, not on the globe's day).
Source: docs/specs/newcomer-walkthrough.md
Status: active

## D85 · 2026-10-21 · Commit a copy of the example fire's pack for the walkthrough

Why: the landing needs nothing from an API that may be asleep (D73), and a pack holds its fire as it
stood at its cut (D33, D37), so a copy cut at 17 Oct 2026 09:00 UTC can't go stale. Its 283 records
are public FIRMS detections and their seals.
Rejected: reading the pack from the API on each visit (up to a minute after a quiet hour).
Source: docs/specs/newcomer-walkthrough.md
Status: active

## D86 · 2026-10-21 · Say Indonesia's pulpwood concessions are the first map, not the limit

Why: the globe shows 62,489 fires worldwide on 14 Oct 2026. Sealing them all is 25 times the
busiest day's 2,495 seals, and would spend the wallet in under 2 days at one seal per transaction
(D19). No public concession map exists outside Trase's Indonesian pulpwood map (D12).
Rejected: recording the world now (the seal volume, and no land-holder map), opening any globe
fire's raw record (new globe work for a record with no concession and no seal).
Source: docs/specs/newcomer-walkthrough.md
Status: active

## D87 · 2026-10-21 · The landing is the hero, the real case, how you use it, and the words

Why: the case tells the problem, so "Two accounts of the same fire" goes. "How it works" becomes
"How you use it", the tool's four steps, so the page says how to use the tool.
Rejected: every section kept with the case added (the problem told twice), the hero and the case
only (nothing says how to use the tool).
Source: docs/specs/newcomer-walkthrough.md
Status: active

## D88 · 2026-10-21 · The landing speaks first to a judge reading once

Why: judges read the site once before 2026-10-25, in about two minutes, and don't know what a
concession is.
Rejected: an investigator (the tool's screens serve them), anyone curious about fires near them (a
different use that changes what the tool shows).
Source: docs/specs/newcomer-walkthrough.md
Status: active

## D89 · 2026-10-21 · Keep the real case at motion tier 1; the reader's scroll is the motion

Why: the map changes at once at each scroll stop, the newest pass in full fire colour and older
passes faded, so each pass lands where the reader stopped. The brief already sets the landing
outside the globe at tier 1 (D3).
Rejected: tier 2, the map gliding between framings and new dots fading in over about 240 ms (more
to build, and the landing's motion rises from tier 1 to tier 2).
Source: docs/specs/newcomer-walkthrough.md
Status: active

## D90 · 2026-10-21 · Commit the example pack as the API's own JSON, redone by one curl line

Why: the API answers the same 156,600 bytes for the same cut (two fetches two hours apart matched,
sha256 d1a43d1e…), so one curl line redoes it exactly, and a test pins its 283 records and 8 passes.
It stays readable in git.
Rejected: a case-pack command in api/, as globe-day (D79) (more to build for a file that is one API
answer), a gzipped .bin like the globe's files (not readable in git).
Source: docs/specs/newcomer-walkthrough.md
Status: active

## D91 · 2026-10-21 · Load the seal-check code at the real case's seal step

Why: viem is 79 kB gzipped. The landing's first load stays without chain code, and the code
downloads while the step reads "Checking".
Rejected: loading it with the landing (79 kB more on every visit, mostly for readers who never
reach the seals).
Source: docs/specs/newcomer-walkthrough.md
Status: active

## D92 · 2026-10-21 · Seal the example pack's 283 records on the e2e's anvil in global setup

Why: the e2e then reads real seals through Multicall3, as production does, and sees "283 of 283".
Rejected: a canned RPC answer from Playwright (the e2e no longer runs the real read), checking only
that "Checking" shows (the count goes untested end to end).
Source: docs/specs/newcomer-walkthrough.md
Status: active

## D93 · 2026-10-21 · Replay one satellite pass every 1500 ms

Why: at 600 ms the 8-pass 0332 fire played in 4.2 s, too fast to see each pass land and read its
date; at 1500 ms it takes 10.5 s, and the longest live fire, 18 passes, 25.5 s.
Rejected: 600 ms (too fast to follow, found on 2026-10-21), 1000 ms (0332 in 7 s, still brisk),
2000 ms (34 s for an 18-pass fire), the whole replay in 12 s (an 18-pass fire drops to 0.7 s a
pass), Back and Next pass buttons (new interface; drag and the arrow keys already step one pass).
Supersedes: D30
Source: docs/specs/replay-pace.md
Status: active

## D94 · 2026-10-21 · Deeper Peatland: colour on the maps, the ground and the landing's bands

Why: on 2026-10-21 the builder found the site too grey as a newcomer; colour sat only on links,
buttons and fire dots. Peatland still ties the look to the land the product watches. Teal stays the
one accent, only for "you can act", and sits far from ember, so it never reads as fire. Ember stays
for fire marks only. Every pair passes WCAG AA in both themes.
Rejected: D4's near-grey stone (too grey for a newcomer), a new family such as Survey ink blue, Haze
indigo or Canopy green (more of the half day, and D4's reasons against each still hold), teal on
headings and icons (teal means "you can act"), colour on the maps alone (the landing's first screen
stays grey).
Supersedes: D4
Source: docs/specs/palette.md
Status: active

## D95 · 2026-10-21 · Print the pack on a white page, with its map in colour

Why: a buyer prints the pack to PDF. A tinted ground costs ink and prints only when forced, while the
map's colours carry meaning: land, water, the concession and the fire.
Rejected: full colour print (the ground and panels print only when forced, and use more ink).
Source: docs/specs/palette.md
Status: active

## D96 · 2026-10-21 · Wash the inside of a concession acacia green with --fw-concession on every map

Why: a dashed edge alone doesn't show which side is inside (D29), and the ink tint reads grey on the
new moss land. Acacia green at 14% (light) and light acacia at 13% (dark) reads as the plantation, and
keeps fire at 3.38:1 and 5.11:1 against it.
Rejected: ink at 6% and 7% (D29; grey on moss), peat brown (reads as burned ground, and sits near
ember), a teal wash (teal means "you can act", D94), the dashed edge alone (the map can't back up an
inside or outside reading).
Supersedes: D29
Source: docs/specs/palette.md
Status: active

## D97 · 2026-10-22 · Take a detection's check and seal time from the chain alone

Why: the API's `sealed_at` and `tx_hash` are the server's word. The review found that a row edited
and sealed again under a new record ID would still show its old time. It also found that a null
`tx_hash` skipped the chain read. `sealOf` already returns the block time.
Rejected: the API's `sealed_at` (the server's word, which the check exists to test), the server's
time labelled as the server's while the chain can't be reached (a second clock to explain, for a
case that Check again fixes), skipping the read when the API sends no `tx_hash` (it lets the API
switch the check off).
Source: docs/specs/honest-claims.md
Status: active

## D98 · 2026-10-22 · Say on a pack that Fire Watch's server chose its records

Why: the API picks a pack's rows again on each open (D37), and nothing on the chain proves the list
is whole. FIRMS's public archive shows a missing record (D24). "It never changes" claimed more than
that.
Rejected: only dropping "never changes" (the reader must then guess what the check covers),
waiting for complete-packs (an unsupported claim stays live until then).
Source: docs/specs/honest-claims.md
Status: active

## D99 · 2026-10-22 · Measure the forecast against the downwind, near-edge and next-pass guesses

Why: the downwind guess said yes only where rule version 1 did, 293 of 293 in 2023, so it can't
show what rule version 1 adds. The near-edge step alone shows what the advance-rate step adds: 6
more arrivals warned of, and 558 more warnings that didn't come in. The next-pass guess gives the
floor: 135 of 19,995 forecast moments came in. Its 12 hours are rule version 1 step 5's, not tuned.
The downwind guess stays because it tests wind, which D48 kept out of the rule. A fire seen on one
pass has no rate, so the downwind guess says no.
Rejected: the downwind guess alone (it can only warn of less than rule version 1), dropping the
downwind guess (it still tests wind), "never comes in" (warns of nothing, D51's reason), rule
version 1's yes with a fixed 12 hours (the same false alarms as rule version 1), every fire within
1 km (the distance is picked by hand).
Supersedes: D51
Source: docs/specs/fair-baseline.md
Status: active

## D100 · 2026-10-22 · Say in one sentence, worked out from the totals, what rule version 1's advance step adds

Why: the reader of a forecast can't easily take 6 and 558 out of a table of four methods. The
sentence holds only numbers the committed totals hold, so it can't claim more than the replay shows.
Rejected: the numbers only (the reader works out what the rule adds alone).
Source: docs/specs/fair-baseline.md
Status: active

## D101 · 2026-10-22 · Leave the bar a rule version 2 must clear to forecast-v2

Why: no rule version 2 exists yet, and on 2023 neither rule version 1 nor the near-edge step does
better on both counts. forecast-v2 picks the bar with a candidate rule in hand.
Rejected: setting it here as "no worse on both counts" (no candidate to test it on yet), one score
such as CSI here (a fourth row on the panel before anything needs it).
Source: docs/specs/fair-baseline.md
Status: active

## D102 · 2026-10-22 · Show two counts for each method in the 2023 block, and the hours off under "How this is worked out"

Why: on a 390 px phone the block's table has 303 px. The arrivals warned of, the warnings that
didn't come in and the median hours off need 368 px together, and the two counts need 293. The
hours off differ least: 11.7, 11.7, 12.4 and 11.7.
Rejected: all three numbers in the block (on a phone the table scrolls sideways in its box).
Source: docs/specs/fair-baseline.md
Status: active

## D103 · 2026-10-22 · Seal one Merkle root per run on a new contract whose recorder can be replaced

Why: one transaction per record capped a run at 40 minutes (D19). On 22 Oct 2026 the 08:00 UTC run
sealed 688 of its 1,297 records and left 609 for the next hour. FireRecords' recorder is immutable,
so a leaked key can't be taken back. One root per run seals any number of records in one
transaction, and gives complete-packs a sealed list for each run. Old seals stay on FireRecords,
and the page reads both contracts.
Rejected: one seal per record on FireRecords, as D19 chose (a busy pass waits an hour for its
seals, and the recorder key can't be replaced).
Supersedes: D19
Source: docs/specs/run-roots.md
Status: active

## D104 · 2026-10-22 · A separate owner key, kept off Azure, can replace the recorder

Why: a leaked recorder key must be replaceable without a new contract. The owner key stays in an
encrypted Foundry keystore on the operator's machine, never in `.env`, Azure or the job, so a leak
of the job's key doesn't take it too. The owner key deploys FireRuns and can then do nothing but
replace the recorder.
Rejected: a Safe multisig with 2 of 3 keys (one operator holds all three today, so it adds steps
but no second person), the owner key in `.env` (it would sit beside the recorder key).
Source: docs/specs/run-roots.md
Status: active

## D105 · 2026-10-22 · Make forecasts first in each run, as fingerprint version 3, and seal them in the run's root

Why: only the recorder seals, and a forecast's seal time is its evidence. The run makes its
forecasts before anything is sealed, and one root seals them with the run's detections in one
transaction, from the key the owner can replace (D104). Version 3 ABI-encodes the concession, fire
key, pass, made, until and forecast times, the two points and the rule version as whole numbers,
so Python and TypeScript produce identical bytes (D17). FireRecords' fixed key then seals nothing
new.
Rejected: forecasts keeping their own seals on FireRecords (553 transactions on 21 Oct 2026 from a
key that can't be replaced), a forecast job of its own (a second job holding the wallet key), the
API (read-only, no key, D21), hashing JSON (D17).
Supersedes: D49
Source: docs/specs/run-roots.md
Status: active

## D106 · 2026-10-22 · A record the API sends without its proof reads "Not on chain yet" until complete-packs

Why: the chain holds one root per run, so only a proof places a record under it, and the API sends
the proof. A record without one reads "Not on chain yet", never "Matches". complete-packs checks
each run's full list, which shows a missing record. A pack already says that Fire Watch's server
chose its records (D98). The seal time still comes from the chain alone (D97).
Rejected: "Should be sealed by now" for a record older than the newest root (an unsealed record's
time is also the API's word, so it adds a clock without closing the gap).
Source: docs/specs/run-roots.md
Status: active

## D107 · 2026-10-22 · Only FireRuns' recorder key seals, once per root, and each record keeps its random record ID

Why: a root must come from the recorder and never change. FireRuns numbers each root in order and
refuses a root it already holds. Each row keeps its random 32-byte record ID, which goes into its
leaf with its fingerprint, so no two records share a leaf. FireRecords still holds the seals made
before the switch, one per record ID, from its fixed recorder.
Rejected: open sealing (anyone could add roots, and complete-packs couldn't tell the recorder's
runs from anyone else's).
Supersedes: D9
Source: docs/specs/run-roots.md
Status: active

## D108 · 2026-10-22 · Hash each leaf twice, sort the leaves, and hash each pair in sorted order

Why: Python builds the tree and TypeScript checks it, so the format must give identical bytes in
both (D17). A leaf is keccak256 of keccak256 of the ABI-encoded record ID and fingerprint. The
second hash stops a leaf from passing for an inner node. Sorted leaves let complete-packs rebuild a
root from a run's list in any order. A pair hashed in sorted order needs no left or right flag, as
OpenZeppelin's MerkleProof checks it. An odd node at the end of a level goes up unchanged.
Rejected: OpenZeppelin's merkle-tree package (a new JavaScript dependency, and the recorder is
Python), leaves in stored order (complete-packs would need that order to rebuild the root), one
hash per leaf (a 64-byte leaf could pass for an inner node).
Source: docs/specs/run-roots.md
Status: active

## D109 · 2026-10-22 · Store each record's proof in Neon, and send proofs only in the fire route

Why: the page needs a record's proof to check it, and the fire route serves the tool's record
panel and the pack. A simulation of 0332's 283-detection pack with proofs gave about 100 KB
gzipped, against 30 KB today (2026-10-22). Proofs from one run share their upper hashes, which gzip
shrinks. The concession route opens no record, so it carries no proof.
Rejected: working out the proofs on each request (the API would read a whole run's records for each
fire), a proof route per record (one more request for each opened record, and hundreds for a pack).
Source: docs/specs/run-roots.md
Status: active

## D110 · 2026-10-22 · Store a root and its proofs before sending it, and finish a stored root before making a new one

Why: a root sealed with no stored list can never be explained, and complete-packs needs each run's
list. A run first asks FireRuns about each stored root with no run number. It fills in one that is
sealed and sends again one that isn't, and FireRuns refuses a root twice. A send that the node
refuses, such as from an empty wallet, drops its root at once, so the next run seals those records
in its own root.
Rejected: sending first and storing after (a crash between them leaves a sealed root with no stored
list), dropping a stored root whose transaction may still land (it could land later with no list).
Source: docs/specs/run-roots.md
Status: active

## D111 · 2026-10-22 · Keep 0332's fire as the landing's example, told as two fires joined on 14 Oct

Why: on the full record its first sighting is one detection on 12 Oct 05:16 UTC, 3,100 m outside
ID-WOOD-CONCESSION-0332, not seen again for 25 hours. Until 14 Oct 17:20 UTC it was two fires; the
second, first seen 13 Oct 06:37 UTC 2 m from the edge, holds every detection more than 129 m
inside before the join. So the landing says that, not "started outside, spread in". Its 283
detections to the 17 Oct 09:00 UTC cut are all sealed, and it is the globe's fire on 14 Oct (D75).
Rejected: another example (3 fires are first seen outside, unjoined, not weak and later inside;
the largest, in 0341, crossed on 22 Oct and is not on the globe's day), the fire of fire-origin
scenario 1 (on the full record it reads "first seen on both sides").
Supersedes: D78
Source: docs/specs/origin-confidence.md
Status: active

## D112 · 2026-10-22 · A first sighting is weak when it is one detection and the next pass to see the fire is more than 14 hours later

Why: NOAA-20 passes about every 12 hours, so more than 14 hours means the satellite missed the
fire at least once. 380 of 4,445 readings on 12 to 22 Oct 2026. A one-pass fire gets no note: its
Passes line already says "1, with 1 detection".
Rejected: more than 24 hours (129 readings, and 0332's 25.35 hours sits next to the line), any
one-detection first pass (490 of the 993 multi-pass readings that name a side, so the note stops
standing out).
Source: docs/specs/origin-confidence.md
Status: active

## D113 · 2026-10-22 · A weak first sighting keeps its reading and adds a note

Why: the detection was where the reading says, and the page says "first seen", never "started"
(D26). The note says why it may not be where the fire started.
Rejected: reading it as "can't say which side" (321 readings lose a side that the detection itself
supports).
Source: docs/specs/origin-confidence.md
Status: active

## D114 · 2026-10-22 · Say on each joined fire when it was joined and where each other fire was first seen

Why: 127 of 1,230 multi-pass readings on 12 to 22 Oct 2026 joined fires the satellite first saw
apart (D25), and the joined fire keeps the oldest one's first sighting. On 0332's, "Seen inside
from 13 Oct" comes from the second fire.
Rejected: a line in "How this is worked out" only (an investigator can't tell which fires are
joined).
Source: docs/specs/origin-confidence.md
Status: active

## D115 · 2026-10-22 · Name VIIRS position error on the page, and keep the 375 m margin

Why: NOAA-20's VIIRS positions are within 400 m at nadir (3-sigma), most within 200 m (Blonski,
Wang and Cao, J. Appl. Remote Sens. 17(3) 034506), and D26 counts none of it. The forecast uses the
same margin (`forecast.py:98`, `:101`), so widening it changes the sealed forecast rule and the
2023 replay.
Rejected: 575 m for first seen alone (249 readings lose their side, and the fire view and the
forecast could disagree on "seen inside").
Source: docs/specs/origin-confidence.md
Status: active

## D116 · 2026-10-22 · Show the weak and joined notes in the fire view and the pack, not the concession list

Why: the list's "Where first seen" cell already holds the reading and one line under it, and the
notes need a sentence each. It keeps the slice to the shape's scope.
Rejected: a short line under "Where first seen" in the list.
Source: docs/specs/origin-confidence.md
Status: active

## D117 · 2026-10-22 · Make the fire rule version 2 for its two new steps

Why: a pack names the rule that made it ("Version 2, in full"), and steps 9 and 10 now make two of
its notes. Steps 1 to 8 are unchanged, so every reading is the same as in version 1. Only the pack
shows this number; no seal holds it.
Rejected: keeping version 1 (a pack made with the joined list would name a rule that has no such
step).
Source: docs/specs/origin-confidence.md
Status: active

## D118 · 2026-10-22 · Walk a weak first sighting through the e2e's own records, and the join through the landing's copy

Why: the e2e's records already hold real weak first sightings in ID-WOOD-CONCESSION-0540 (one
detection, then 36 hours) and a firm one (12.7 hours), but no joined fire. `test_app.py` proves the
joined list from the API with 0332's real 283 detections, and the landing reads the API's own
answer from its committed copy.
Rejected: staging 0332's fire in the e2e database (4 of its records also match
ID-WOOD-CONCESSION-0637, which the e2e's concession cut lacks, so a new boundary fixture and loader
test changes).
Source: docs/specs/origin-confidence.md
Status: active

## D119 · 2026-10-23 · Work out readings from sealed detections, and check a pack's list against each run's sealed list

Why: a reading changes when a pass grows a fire or joins two, so a sealed reading would need
sealing again (D24's reason, which still holds). run-roots seals each run's whole list (D103) and
stores it (D110). A browser can rebuild a run's root from its records and find a detection that a
pack lacks. FIRMS's public archive still shows a detection the recorder never stored.
Rejected: sealing each reading (proves what we said, not what the satellite saw, and needs sealing
again as fires grow or join), leaving a pack's list on the server's word (a deleted detection
still leaves "N of N match the chain", D98).
Supersedes: D24
Source: docs/specs/complete-packs.md
Status: active

## D120 · 2026-10-23 · Check a pack's list against FireRuns' runs only, and say plainly that older seals can't be checked

Why: FireRecords' 17,173 detection seals have no list on the chain. Base Sepolia's public RPC
answers `eth_getLogs` for 200 blocks at most (measured 23 Oct 2026), so listing a week of seals
takes about 1,500 calls at 25 a second. FIRMS's public archive still shows whether an older
detection is missing.
Rejected: reading FireRecords' seal events in the browser (about 1,500 calls for a week), sealing
the old lists once in catch-up roots (proves only that nothing was removed after that day, and
needs recorder work).
Source: docs/specs/complete-packs.md
Status: active

## D121 · 2026-10-23 · Check that nothing is left out when the pack opens, after the seal checks

Why: a buyer gets the pack as a link or a PDF (D95), so a print must carry the result. The check
downloads every record of each run in the window: about 1 MB gzipped for 4 days, 2 MB for a week
(0341's fire, measured 23 Oct 2026).
Rejected: a button the reader taps (a print made without the tap has no result).
Source: docs/specs/complete-packs.md
Status: active

## D122 · 2026-10-23 · Send every record of a pack's runs from a run route, at most 100 runs a request

Why: the browser can rebuild a run's root only from all of its records (D108). A week's window
held 19,398 detections and 890 forecasts, 2.0 MB gzipped (measured 23 Oct 2026). A route of its own
keeps the pack's first answer as fast as today, and the check starts after the seal checks (D121).
The cap bounds what one request to the open API reads, and the page asks in steps of 100 runs.
Rejected: the records inside the fire route (every pack waits for megabytes before it shows), a
list per concession inside each root (a new tree format and a recorder change two days before the
deadline), a route per pack that works out its own window (the fire is grouped twice).
Source: docs/specs/complete-packs.md
Status: active

## D123 · 2026-10-23 · End a pack's runs at the newest run holding a detection stored by the cut, and trust the server's store time only in runs sealed after the cut

Why: the newest pass's run is sealed minutes after the pack's cut (D37), so a range of runs sealed
by the cut would never check it. A run sealed before the cut holds only records stored before it,
so there the browser ignores the server's store time. The browser refuses a range whose next run
was sealed before the cut, or that misses a run holding one of the pack's detections.
Rejected: only runs sealed by the cut (the newest pass is never checked), the server's store time
in every run (it could date a detection after the cut to drop it), no store time at all (a
detection stored after the cut, sealed with a failed run's records, would read as left out).
Source: docs/specs/complete-packs.md
Status: active

## D124 · 2026-10-23 · Find a detection left out by the fire rule's 1 km and 48 hours alone, chained from the pack's detections

Why: a detection belongs in the fire when a chain of pairs at most 1,000 m and 48 hours apart links
it to the pack's detections (`fires.py`, step 2). Only that step decides which fire a detection is
in. The page keeps `fires.py`'s haversine and limits, and both test suites read shared pairs.
Rejected: all ten steps of the fire rule again in TypeScript (a second copy of the reading, to
answer which detections are in the fire), the concession's other detections counted without the
rule (a buyer can't tell which fire they belong to).
Source: docs/specs/complete-packs.md
Status: active

## D125 · 2026-10-23 · Leave a pack that the API gives no runs as it reads today

Why: the API gives no runs to a pack whose window holds no FireRuns run. A server that withholds
them only takes the check away. The pack then says that the server chose its records and that
FIRMS's archive shows a missing one (D98), and claims nothing more.
Rejected: reading FireRuns' run 1 for every pack to catch a withheld range (a state and copy
beyond the approved interface, for a case with no false claim).
Source: docs/specs/complete-packs.md
Status: active

## D126 · 2026-10-23 · Count a fire's ground as its joined 375 m squares, and scale it by the 2023 MODIS shares for what likely burned

Why: ground seen on several passes counts once, so the 0332 fire covers 209.8 ha, not 267.2.
MODIS mapped only 14.8% of 2023's 456,345 ha of joined squares near concessions as burned, far
under the 80% at which the figures would stay. The squares stay as the ceiling.
Rejected: detections times 14.06 ha (counts the same ground again on each pass), the squares
alone as burned ground (MODIS shows that most of them did not burn), a range from the MODIS share
up to the squares (stacks on the peat factor's range), the check alone with no figure changed.
Supersedes: D63
Source: docs/specs/damage-check.md
Status: active

## D127 · 2026-10-23 · Take the shares from 2023's pieces of more than 20 joined squares: 61.1% on peat, 41.6% on other ground

Why: MODIS's 500 m pixels miss small burns. A lone square showed 6.4%, and pieces of more than
20 squares 52.5%. Peat and other ground differ, 61.1% against 41.6%, and their CO₂ differs 9
times.
Rejected: the shares of all 2023 ground, 35.8% and 8.5% (mostly MODIS's blind spot, which favours
the company), a share for each size band (puts the blind spot into each small fire), one share
for all ground (peat and other ground differ by 19.5 points).
Source: docs/specs/damage-check.md
Status: active

## D128 · 2026-10-23 · Check the squares against MODIS near concessions only, not against the ministry's national total

Why: the estimate covers only ground within 5 km of a concession, and MODIS in the same place is
like for like.
Rejected: a national line against the ministry's 1.16 Mha (a different map, over ground the
estimate never covers).
Source: docs/specs/damage-check.md
Status: active

## D129 · 2026-10-23 · Every pack, old or new, shows the current estimate method

Why: no buyer has a pack yet, and "How this is worked out" names the 2023 check, so a reader with
an older PDF sees why the figures differ.
Rejected: a method version in the pack link, with the old factors kept for old links (more code
for packs that nobody has sent).
Source: docs/specs/damage-check.md
Status: active

## D130 · 2026-10-23 · Read the 12 MODIS files from the operator's disk, each checked by its pinned sha256

Why: UMD serves the GeoTIFFs only over SFTP, with a public login, and httpx has no SFTP. Only the
command reads the files, and the page reads the command's 300-byte output.
Rejected: a committed MODIS cut (one more committed file and a --cut path, for reruns only), the
command fetching over SFTP (paramiko, one more dependency to audit).
Source: docs/specs/damage-check.md
Status: active

## D131 · 2026-10-23 · Run the check as its own command, damage-check-2023

Why: it shares only the FIRMS file and the match with the replay, and it writes one file. The
forecast replay and its outputs stay as they are.
Rejected: a --damage flag on backtest-2023 (ties the check to the forecast replay's module and run).
Source: docs/specs/damage-check.md
Status: active

## D132 · 2026-10-23 · A rule version 2 must beat the near-edge step on both counts

Why: the review's complaint is rule version 1's 3,751 warnings that didn't come in, against the
near-edge step's 3,193. A version 2 must keep the near-edge step's arrivals and cut those warnings.
Rule version 1 fails this bar.
Rejected: beating rule version 1 (a version 2 could still lose to its own step 5), the highest CSI
(the downwind guess leads at 5.0% with wind, which the rule can't use, D48).
Source: docs/specs/forecast-v2-trial.md
Status: active

## D133 · 2026-10-23 · Pick a rule version 2 on January to September 2023, and judge it once on October to December

Why: rule version 1 was chosen on the week it was measured on (D48). The split leaves 56 arrivals
to pick on and 79 to judge on, in the months when most of 2023's arrivals came.
Rejected: fixing candidates first and judging on all of 2023 (still the best of several on the same
forecasts), picking and judging on all of 2023 (a fitted rule).
Source: docs/specs/forecast-v2-trial.md
Status: active

## D134 · 2026-10-23 · Keep forecast rule version 1, and say on the panel that the 2023 candidate missed the bar

Why: the candidate warned of 63 of October to December's 79 arrivals, 2 fewer than the near-edge
step, though 1,022 of its warnings didn't come in against 1,102. D132 needs both. One sentence
lets the reader of a forecast see the attempt and its result.
Rejected: shipping the candidate (misses D132's bar), a second candidate judged after seeing
October to December (spends the hold-out, D133), the result in the spec only (a reader of a
forecast never sees it).
Source: docs/specs/forecast-v2-trial.md
Status: active

## D135 · 2026-10-23 · Lead the landing with the answer a company gives to a fire grievance

Why: a reader on 2026-10-23 had to read the example to see why Fire Watch matters. Companies answer
grievances by saying a fire came from outside their land (the first shape's O3), and the tool shows
where satellites first saw it.
Rejected: the heading that says only what the tool does (the reason waits for the example), the
company's words "the fire started outside" (honest-claims' guard bans "fire started" on the landing,
D26).
Source: docs/specs/claim-fixes.md
Status: active

## D136 · 2026-10-23 · A pack's footer says what it holds at its cut, and leaves completeness to the left-out check

Why: the footer said every pack "holds every detection" of its fire, which nothing checks on a pack
with no runs. The check panel already says whether a detection was left out, or that it can't tell.
Rejected: a footer that changes with the check's result (says it twice), keeping "every detection"
on packs with runs (true only when the check passes).
Source: docs/specs/claim-fixes.md
Status: active

## D137 · 2026-10-23 · Answer the example pack's API call in the landing e2e from the committed copy

Why: the e2e's API holds no example fire, and the committed copy is the API's own answer (D90),
whose 283 seals global setup already writes on anvil (D92).
Rejected: storing the example fire in the e2e's database (adds 283 detections to 0332 for every
other spec), a separate pack e2e for the footer (two tests for one walk).
Source: docs/specs/claim-fixes.md
Status: active

## D138 · 2026-10-24 · Say "as one detection" in a weak first sighting's headline

Why: the example pack's headline "First seen outside, 3.1 km from the edge" rests on one detection
that the satellite next saw 25 hours later. The reading stays (D113), and the headline now carries
the weak point. It applies to 380 of 4,445 readings on 12 to 22 Oct 2026.
Rejected: on any one-detection first pass (true of most fires, so the words stop standing out,
D112), the headline as it is (the weak point stays only in the note under it).
Source: docs/specs/origin-and-range.md
Status: active

## D139 · 2026-10-24 · Name cloud, smoke, canopy and smouldering peat under every fire's headline, with sources

Why: NASA FIRMS names cloud, heavy smoke and tree canopy among the reasons a fire goes unseen, and
Sofan et al. (2019) find smouldering peat hard to see for its low heat and small size. So any fire
may have burned unseen before it was first seen, on either side of the edge. Only the method,
behind a disclosure, named cloud.
Rejected: only fires read as inside or outside (the limit holds for every first sighting), only in
"How this is worked out" (a reader of the headline may not open it), "peat that smoulders below the
surface" (no source read says so).
Source: docs/specs/origin-and-range.md
Status: active

## D140 · 2026-10-24 · Lead the CO₂ figure with IPCC's 95% interval for burned peat

Why: one figure claims more than the factors know. IPCC gives a 95% interval only for peat fuel, 170
to 536 t of dry matter a hectare (2013 Wetlands Supplement, Table 2.6). Peat's gas factor comes from
one study with no interval, and other ground's standard error, 23.6 on 42.2, puts its interval at
zero. A fire with no peat keeps one figure.
Rejected: peat and other ground, with other ground from its standard error floored at zero (a fire
with no peat would read "0 to 830 t").
Source: docs/specs/origin-and-range.md
Status: active

## D141 · 2026-10-24 · Name NOAA-20, when the records begin, and the earlier sightings on the landing

Why: the landing said "satellites first saw it" on 12 Oct. The recorder reads NOAA-20 alone, its
records begin an hour before, and FIRMS shows NOAA-20 saw the ground under 1 km away on 11 Oct. The
sides hold with every satellite's detections, so the example stays (D111).
Rejected: the records' limits only (hides what the archive shows), swapping the example (the sides
hold, and a new pack and its seals don't fit the deadline).
Source: docs/specs/source-claims.md
Status: active

## D142 · 2026-10-24 · Say when a fire's first inside sighting came from a fire joined to it

Why: the example pack's "Seen inside from 13 Oct 06:37" is the joined fire's first sighting. Read
under "First seen outside", it tells the company's story.
Rejected: hiding the time on a joined fire (drops a true time), both times on two lines (needs a new
API field).
Source: docs/specs/source-claims.md
Status: active

## D143 · 2026-10-24 · Credit the burned shares to Fire Watch's own measure of NASA's map, in large patches

Why: "NASA's 2023 shares" reads as a figure NASA published. Fire Watch measured them on MODIS
MCD64A1, over large patches only (D127).
Rejected: showing the 15.1% all-ground share as the low end (supersedes D127, which chose large
patches because MODIS misses small burns).
Source: docs/specs/source-claims.md
Status: active

## D144 · 2026-10-24 · Work out a joined fire's side in the page, from the rule's shared pair test

Why: the page has every detection with its pass, and the pair test it shares with `fires.py`
through `join-vectors.json`. The API and the committed pack stay as they are, and so does the
README's sha for it (D90).
Rejected: a new API field (the committed pack must be the API's own answer, so it would need
fetching again after Deploy), a page check on `first_seen_unix` alone (misses a joined fire that went
inside after its first pass).
Source: docs/specs/source-claims.md
Status: active

## D145 · 2026-10-24 · Back the landing's earlier sightings with a pinned FIRMS cut and a test

Why: the 11 Oct and 10 Oct lines were a hand reading of FIRMS, with no file a reader could check.
Every other figure on the landing has one (D85, D90). Four FIRMS files of 10 kB hold them, and two
fetches on 2026-10-24 gave the same bytes.
Rejected: dropping the two lines (undoes D141, and hides what NASA's archive shows).
Source: docs/specs/pack-claims.md
Status: active

## D146 · 2026-10-24 · Name only the example fire's earlier sightings in its view and pack, from the pinned cut

Why: a buyer reads the pack, not the landing, and the example's pack didn't say what the landing
says about 11 Oct. Every other fire gets the general note that NASA's archive may hold earlier
detections.
Rejected: a FIRMS lookup for every pack (puts the FIRMS key on the public, read-only API, spends
FIRMS quota on each open, and a pack would change with FIRMS's answer, against D33), the general
note alone (the example's pack would still leave out what the landing names).
Source: docs/specs/pack-claims.md
Status: active

## D147 · 2026-10-24 · Backfill v1.0.0 at palette's ship, by hand and without a pentest

Why: v1.0.0 marks the product before the judge review: 11 slices, last palette on 2026-10-22
(`7da2436`). `release.py` tags only the tip of main, so the tag goes on by hand. v2.0.0's pentest
covers every change since, and the deploy runs v2's code.
Rejected: one 1.0.0 at the tip of main (hides the step the judge review made), a pentest of the
v1 tree (a day before the deadline, for code no longer deployed).
Source: /release, 2026-10-24
Status: active
