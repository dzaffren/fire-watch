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
Status: active

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
