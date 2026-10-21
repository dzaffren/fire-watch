# Read a CSS time token with its unit; the build writes `600ms` as `.6s`

**Learned:** 2026-10-21 · **From:** replay-pace build

Vite's CSS minifier rewrites `--fw-replay-step: 600ms` as `.6s` in the built file. `Replay` read it
with `parseFloat`, so the live play button waited 0.6 ms a pass. The unit tests set the token as
`600ms` themselves, so only a browser test against the built CSS showed it.

When code reads a duration token, scale a value without `ms` by 1000. Check the built CSS with
`grep -o "fw-replay-step:[^;}]*" web/dist/assets/*.css`.
