# Commit before an A/B check that restores files with `git checkout`

**Learned:** 2026-10-20 · **From:** landing-page build

To compare with the pause-2 globe, the build copied old files over `FireGlobe.tsx` and then ran
`git checkout` on it. That restored the last commit and wiped an uncommitted fix, so the fix's
commit went in with only its test, and the code followed in a second commit. They were squashed before the push.

Commit, or copy the working file aside, before any A/B swap. Restore from that copy.
