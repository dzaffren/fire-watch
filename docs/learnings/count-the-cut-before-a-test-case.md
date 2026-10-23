# Count a cut's matched detections before writing a test the plan described

**Learned:** 2026-10-23 · **From:** forecast-v2-trial build

The plan said that removing one detection from 0332's 14 Oct 05:46 pass in the 2023 cut would make
the pass a lone detection. In the cut, 34 detections near 0332 fall in that pass's 48 hours, and
the pass holds two of its own. The test could never pass. A scratch run of `backtest.detections()`
and `replay()` on the cut found a real lone pass, 0264's 1 Oct 17:32, in a minute.

When a plan names a cut case for a new rule, list the cut's matched detections around it before
writing the test. Prefer a real case from the cut to one built by hand.
