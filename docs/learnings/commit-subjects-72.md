# Check each commit subject is 72 characters or fewer when you write it

**Learned:** 2026-10-17 · **From:** complaint-pack ship (also fire-origin ship)

The ship gate fails any subject over 72 characters, but only at `/ship`. By then every later commit
sits on top, so a reword renames the whole branch, and each spec line that cites a commit ID has to
be pointed at its new commit. Both fire-origin and complaint-pack hit it, through long
`docs(spec):` subjects written at the spec pauses.

Before each `git commit`, count the subject: `printf %s "<subject>" | wc -m`.
