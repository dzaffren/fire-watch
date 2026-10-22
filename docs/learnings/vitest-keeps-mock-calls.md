# Clear a module mock before counting its calls; vitest here keeps calls across tests

**Learned:** 2026-10-22 · **From:** honest-claims build

`vite.config.ts` sets no `clearMocks`, and `test-setup.ts` only runs `cleanup`. In `api.test.ts`,
`sealsWithTime` was called by the forecast test first, so the pack test's `toHaveBeenCalledTimes(1)`
would see 2.

Call `vi.mocked(fn).mockClear()` at the start of a test that counts calls on a `vi.mock` module
function shared by other tests.
