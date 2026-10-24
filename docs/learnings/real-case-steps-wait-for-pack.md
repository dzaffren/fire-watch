# Wait for the real case's 12 steps before `toStep` on a fresh landing

**Learned:** 2026-10-24 · **From:** origin-and-range build

The real case renders its steps only after `source.pack()` resolves (`web/src/RealCase.tsx:33`).
A spec that opens `/` and calls `toStep` at once fails with `Cannot read properties of null
(reading 'getBoundingClientRect')`, because `[data-step]` isn't in the page yet. The older specs
pass by luck: they click "Go to the example fire" or another link first, which gives the pack time
to load.

Before the first `toStep`, run `await expect(steps).toHaveCount(12)`: the fire, the claim, 8
passes, the seals and the pack.
