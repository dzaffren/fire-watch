# Put back every e2e database edit in a `finally`

**Learned:** 2026-10-23 · **From:** complete-packs build

`fire-record.spec.ts` edited a run 2 detection's match in its last test and left it, since later
tests in that file didn't read it. Spec files run in order on one database, and a pack now checks
that each run in its window rebuilds its root. So `palette.spec.ts`, which runs later, read "Can't
show that nothing is left out" on 0332's pack.

Restore each edit to a stored record in a `finally`, even in a file's last test.
