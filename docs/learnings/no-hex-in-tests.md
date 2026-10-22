# Check colours in tests without hex literals; the drift check reads them as UI

**Learned:** 2026-10-22 · **From:** palette build and review

`check-design-drift.sh` flags any raw hex colour in a changed file, tests included. `palette.test.ts`
expected `"--fw-bg": "#ffffff"` and failed the check; `/review` caught it, and the e2e's expected map
colours needed a ledger row (O8).

In a unit test, compare a token's value through the test's own parser, such as
`expect(rgba(value)).toEqual([255, 255, 255, 1])`. Where a browser test must pin the spec's hex, add
a `Decided alone` row when the test is written, not after the review finds it.
