# Grep the lazy chunks, not the main bundle, to confirm a deploy

**Learned:** 2026-10-24 · **From:** claim-fixes ship

The first live check after claim-fixes merged grepped `index-<hash>.js` for the new landing copy. It
found 0 hits and looked like a failed deploy. The landing copy is in `/assets/Landing-<hash>.js`
and the pack's copy is in `/assets/ComplaintPack-<hash>.js`. `index-<hash>.js` only names them.
The site address is in no repo file. Read it from the Deploy run's log with `gh run view <id> --log`.

At `/ship`'s "Confirm it works" step, fetch the chunk that holds the changed page, then grep it.
