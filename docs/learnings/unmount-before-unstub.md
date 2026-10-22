# Unmount before unstubbing a global, and wait for the effect, not the DOM

**Learned:** 2026-10-22 · **From:** debug of RealCase's flaky test

React runs a `useEffect` after the commit, on its own schedule. `findAllByRole` resolves on the
commit, so a test can act before the effect has made what it needs. RealCase makes its
`IntersectionObserver` in such an effect, and `reach()` found none 3 runs in 20 under load.

A file's own `afterEach` runs before the setup file's `cleanup`. When it calls
`vi.unstubAllGlobals()` first, the unmount then runs any pending effect with the fake gone:
"IntersectionObserver is not defined". Call `cleanup()` at the top of that `afterEach`, and wait on
the effect's own result with `waitFor`, as `watching()` in `RealCase.test.tsx` does.
