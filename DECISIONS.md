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
Status: active

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
Status: active

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
Status: active

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
Status: active

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
Status: active

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
Status: active

## D29 · 2026-10-16 · Tint the inside of a concession with --fw-concession on every map

Why: a dashed edge alone doesn't show which side is inside; ID-WOOD-CONCESSION-0356 has several close
outlines, and "inside, 410 m" couldn't be read off the map. Ink at 6% (light) and 7% (dark) reads as
an area and keeps fire dots at 3.8:1 and 6.3:1 against it.
Rejected: the dashed edge alone (the map can't back up an inside or outside reading), a teal accent
wash (the accent means "you can act", D4).
Source: docs/design/system-brief.md
Status: active

## D30 · 2026-10-16 · Replay one satellite pass every 600 ms

Why: at 240 ms a 4-pass fire played in under a second, too fast to follow on screen or in the demo
video; at 600 ms it takes about 2 s, and a 28-pass fire about 17 s.
Rejected: 240 ms (too fast to see each pass land), no play button (motion tier 1; loses the moving
spread in the demo).
Source: docs/design/system-brief.md
Status: active

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
Status: active

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
