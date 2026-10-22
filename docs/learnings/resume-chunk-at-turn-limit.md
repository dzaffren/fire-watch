# Resume a chunk agent at its turn limit with SendMessage

**Learned:** 2026-10-22 · **From:** run-roots build

Chunk C (12 web files, 9 test files) hit the chunk-builder's 60-turn limit with one commit made
and three files edited. A SendMessage to the same agent carried on from its worktree as it stood,
and it finished in 15 more minutes with its report.

Before resuming, check the worktree with `git log` and `git status`. Ask in the message for the
report fields the integration needs, such as the exact DOM text the e2e will match.
