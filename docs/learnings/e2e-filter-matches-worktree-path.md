# `pnpm e2e <slice>` runs every spec in a worktree named after the slice

**Learned:** 2026-10-25 · **From:** claim-gaps build

Playwright reads `pnpm e2e claim-gaps` as a regex on each spec's absolute path. In
`.claude/worktrees/claim-gaps/` every path holds `claim-gaps`, so all 34 tests ran, for about
3 minutes. Run one spec there by its file: `pnpm e2e e2e/claim-gaps.spec.ts`, or `-g "<title>"`.
