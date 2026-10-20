# Add a dependency group that runs with secrets to CI's advisory audit

**Learned:** 2026-10-20 · **From:** damage-estimate review

CI's `pip-audit` read `uv export --no-dev`, so the new `cut` group's rasterio, numpy, affine and
pyparsing went unaudited. `load-peat --cut` runs them where `GFW_API_KEY` and the owner
`DATABASE_URL` are set. The review confirmed it as an A03 finding.

When a new uv dependency group runs on an operator's machine with secrets, add `--group <name>`
to the audit's `uv export` in `.github/workflows/ci.yml` in the same branch.
