# Stage past chain times on an anvil started with `--timestamp`

**Learned:** 2026-10-19 · **From:** spread-forecast build

The recorder takes "now" from the latest block (D50). A test that needs a forecast sealed before
a past pass, such as the 0332 fire's 15 Oct 18:43 pass, can't use the session `anvil` fixture:
its clock is today's, and a block can't be mined earlier than the one before it.

Start a fresh anvil with `--timestamp` before the first pass, as the `clocked` fixture in
`api/tests/test_record_hotspots.py` and `web/e2e/global-setup.ts` do. Before each run, call
`evm_mine` with the run's time, so the latest block carries it.
