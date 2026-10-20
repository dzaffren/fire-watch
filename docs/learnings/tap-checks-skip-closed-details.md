# Filter tap checks with `checkVisibility()`, not `offsetParent`

**Learned:** 2026-10-20 · **From:** damage-estimate build

The damage panel's five source links sit in a closed `<details>`. Chromium gives them an
`offsetParent` and a 44 px box while they are hidden, but `elementFromPoint` never finds them.
The fire record and forecast tap checks listed all five as too small.

In a tap check, keep only controls where `el.checkVisibility()` is true. Measure a disclosure's
links in a separate check that opens it first.
