# Write formats in specs with angle brackets, not braces

**Learned:** 2026-10-13 · **From:** walking-skeleton ship

The ship gate reads any `{lowercase}` in a spec as an unfilled placeholder. It failed on
`basescan.org/tx/{hash}`, `001_hotspots.{up,down}.sql` and the FIRMS URL's `{date}`.

Write `tx/<hash>`, and spell out both file names.
