# Never name a scratch script after a standard library module

**Learned:** 2026-10-23 · **From:** damage-check build

A scratch script named `inspect.py` sat next to a later script in the scratchpad. Python puts the
script's folder first on `sys.path`, so `import rasterio` loaded it as `inspect` and failed with
"partially initialized module 'inspect'".

Give scratch scripts names no module has, and run them with `uv run python -I`, which leaves the
script's folder off `sys.path`.
