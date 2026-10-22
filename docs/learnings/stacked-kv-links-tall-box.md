# Give stacked `fw-kv` links a tall box on a phone; their tap overlays cover each other

**Learned:** 2026-10-22 · **From:** run-roots build

`.fw-kv a.fw-link::after` grows an inline link's tap area to 44 px with an overlay that doesn't
move the row. The complaint pack's FireRecords and FireRuns rows sit one above the other, so the
FireRuns overlay covered the lower half of the FireRecords link. The pack's phone tap check listed
"View FireRecords … on Basescan": a tap 21 px below its middle landed on FireRuns.

When a `fw-kv` list holds links in two rows next to each other, add its links to the
`(pointer: coarse)` rule that makes each one an `inline-flex` box with `min-height` of the touch
target, as `.pack-check .fw-link` now does.
