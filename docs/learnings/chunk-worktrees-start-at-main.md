# Chunk worktrees start at main, not the slice branch

**Learned:** 2026-10-16 · **From:** fire-record build

All three fire-record chunk agents got worktrees at main's head (ef318a2), without the spec, the
recorded decisions or the shared fixtures that were on `feat/fire-record`. Each noticed and
fast-forwarded only because the brief named the expected head commit.

Name the slice branch's head in every chunk brief and tell the agent to fast-forward to it before
writing anything. Two of the three chunks also hit the agent's 60-turn limit; a chunk with more
than about six tests should be split.
