# Integrate parallel chunks without merge commits

**Learned:** 2026-10-13 · **From:** walking-skeleton ship

Merging chunk worktrees with `git merge` left "Merge chunk B: recorder and API" on the branch.
The ship gate rejects any subject that isn't `{type}({scope}): {subject}`, so the branch had to
be replayed before the PR.

At integration, cherry-pick each chunk's commits onto the branch, or rebase the chunk branch
first and fast-forward. Don't use `git cherry-pick -q`; the flag doesn't exist.
