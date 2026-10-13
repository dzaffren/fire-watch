# Check every action tag exists before the first push

**Learned:** 2026-10-13 · **From:** walking-skeleton ship

`astral-sh/setup-uv` publishes no floating major tag, so `astral-sh/setup-uv@v10` failed at
"Unable to resolve action" on GitHub, three seconds into the job. YAML parses and nothing
local can catch it.

Before the first push, check each `uses:` ref:
`gh api repos/<owner>/<repo>/git/ref/tags/<ref>`. Missing → pin the full release, here
`astral-sh/setup-uv@v10.3.0`.
