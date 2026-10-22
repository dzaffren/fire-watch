# A Playwright click on a locator that matches nothing waits out the whole test

**Learned:** 2026-10-22 · **From:** run-roots build

`playwright.config.ts` sets no `actionTimeout`, so a `click()` waits for its element until the
test's 30 s timeout. The only error printed was `browserContext.close: Target page, context or
browser has been closed` from the `finally` block, which names no step. The cause was a row filter
on "14.48 MW": a pack's detection table has only Detected, Where and Chain columns.

When a test times out at a cleanup line, rerun it alone with `--timeout=120000`. If it still times
out, suspect a click or fill on a locator that matches nothing. Read `error-context.md` with care:
its snapshot can be another page in the test, such as the tool behind the pack.
