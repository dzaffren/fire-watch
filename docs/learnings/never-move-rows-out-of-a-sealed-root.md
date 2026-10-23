# Never move a record out of a sealed run root in e2e staging

**Learned:** 2026-10-23 · **From:** complete-packs build

Global setup sealed run 1's root over 0332's first pass, then set those three rows' `root_id` to
NULL and sealed them on FireRecords. Each record still checked, but run 1's stored list no longer
rebuilt its root, so complete-packs' check rightly read "Not matching 1" on every e2e pack.

Stage a pre-switch record before the root that would hold it. A run from a key that FireRuns
refuses stores and forecasts, then drops its root (D110). Seal its rows on FireRecords, then run
the real recorder.
