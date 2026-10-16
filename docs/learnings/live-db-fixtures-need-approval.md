# Ask before committing a fixture read from the live database

**Learned:** 2026-10-16 · **From:** fire-origin build

`fixtures/fires/scenarios.json` was read from the live Neon database through the read-only role.
The commit was blocked as production data, although every field is public: FIRMS detections, Trase
concession IDs and record IDs already on Base Sepolia. The user approved it once asked.

When a plan says a fixture comes from the live database, ask the user before the commit. Offer
the public route as the other choice: fetch from the FIRMS API and match against the pinned Trase
file in local PostGIS.
