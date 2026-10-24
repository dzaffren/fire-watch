# Rerun the web unit suite before blaming a branch for a timing failure

**Learned:** 2026-10-24 · **From:** pack-claims ship

Two web unit tests fail now and then on a full `pnpm test`, in files the branch didn't touch the
code of. `FireMap.test.tsx` threw `google is not defined` from `FireLayer.draw`, since an animation
frame drew after the test unstubbed `google`. `ComplaintPack.test.tsx` "asks for the left-out check
only after the seal checks" took 1,099 ms against `findByRole`'s 1 s wait. The branch failed 2 of 13
runs and main 0 of 6, with the same durations.

When one of these fails at a gate, run the suite again, and on the base branch in a worktree, before
you change code for it.
