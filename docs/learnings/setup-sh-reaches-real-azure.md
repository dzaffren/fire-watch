# Test infra/setup.sh with a fake az, never by running it

**Learned:** 2026-10-16 · **From:** fire-record review

To test a new guard in `setup.sh`, the review ran it under `env -i PATH=/nonexistent-az:/usr/bin:/bin`
with dummy values, expecting `az` to be missing. `az` lives in `/usr/bin` and was logged in, so the
case that passed the guard ran the script against the real subscription until Azure refused the
recorder job's dummy image. The activity log showed only a resource-group rewrite and a workspace
update, both to values it already had.

A PATH prefix hides nothing that is already on the PATH. Put a fake `az` (and `gh`) script first on
PATH and make sure `/usr/bin` cannot supply the real one, or check only the lines before the first
`az` call.
