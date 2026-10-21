# Move a branch stacked on another slice with `git rebase --onto` once that slice merges

**Learned:** 2026-10-21 · **From:** replay-pace ship

GitHub merges this repo's PRs with "Rebase and merge", which gives every commit a new SHA on
`main`. replay-pace was built on `feat/newcomer-walkthrough`, so after PR 13 merged its base
commit `fa2f4c0` was not on `main`, though `main`'s tree was the same.

Check the trees first with `git diff --stat <old base> origin/main`; empty means the same. Then
run `git rebase --onto origin/main <old base> <branch>`. Rename every commit SHA the spec names,
because the rebase changes them too.
