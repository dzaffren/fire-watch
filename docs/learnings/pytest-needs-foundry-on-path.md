# Put `~/.foundry/bin` on PATH before the API suite

**Learned:** 2026-10-17 · **From:** complaint-pack build

`anvil` lives in `~/.foundry/bin`, which is not on the default PATH here. Without it, the 10 tests
in `api/tests/test_record_hotspots.py` error before they start, whatever the change. The e2e is
unaffected, because `web/e2e/global-setup.ts` adds the folder itself.

Run `cd api && PATH="$HOME/.foundry/bin:$PATH" uv run pytest`, and say so in every chunk brief that
runs the API suite.
