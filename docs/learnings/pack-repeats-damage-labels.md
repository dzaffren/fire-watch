# Scope a pack test's damage figures to the first `dl`

**Learned:** 2026-10-23 · **From:** damage-check build

The pack shows "How this is worked out" in full, so the factors list repeats a figure's label:
"Likely burned" is a `dt` twice. `getByText("Likely burned", { selector: "dt" })` then fails
with "Found multiple elements".

Look up a figure inside `section.querySelector("dl")`, the figures list, as `Damage.test.tsx`
does with `panel().querySelector("dl")`.
