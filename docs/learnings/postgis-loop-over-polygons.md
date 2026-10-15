# Match points to big polygons by looping over the polygons

**Learned:** 2026-10-16 · **From:** fire-record build

Matching 42,871 FIRMS hotspots to 294 Trase concessions with `ST_DWithin` on geography took 67 to
92 s when the query was driven by the hotspots. The GiST index found the 21,251 candidate pairs in
0.6 s; the time went on exact distances against boundaries of up to 147k points, because
consecutive calls hit different concessions and PostGIS never reused a boundary's cached tree.

Drive the loop from the concessions instead: cast each boundary and its edge to geography once in
a materialized CTE, test a degree envelope first, and put `OFFSET 0` in the lateral subquery so
the planner keeps that order. 4.5 s, same matches (`api/src/firewatch/record_hotspots.py`).
