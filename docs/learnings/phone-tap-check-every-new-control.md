# Give each new link and row control a phone tap check, disclosures open

**Learned:** 2026-10-19 · **From:** spread-forecast review

Four slices in a row shipped a control under 44 px on a touch screen: fire-record's transaction
link and Trase credit, complaint-pack's pack-foot link, and spread-forecast's rule link and
forecast rows. Reading the CSS missed the forecast rows. A row button that holds only its first
line, with the second line outside it, misses the row's middle.

For each new panel, add a phone e2e that opens every disclosure and runs the `tooSmall()` check
from `web/e2e/fire-record.spec.ts`. Put a row's second line inside its `row-btn`. Grow an inline
link under `(pointer: coarse)`, as `.credit .fw-link` does.
