# A public RPC is not anvil: it lags and it prunes

**Learned:** 2026-10-15 · **From:** walking-skeleton first record, /debug

`sepolia.base.org` is several nodes behind one URL and keeps no blocks before 46,500,000.
anvil is one node with every block, so the tests passed and production failed twice:
`get_block` right after a receipt raised "Block with id … not found", and a timestamp search
from block 0 got error 4444 "pruned history unavailable".

Read new blocks with a short retry, and search back from the head rather than up from 0.
`api/tests/test_record_latest.py` has a `public_rpc` proxy that lags and prunes; run new chain
reads through it. When mining in tests, give blocks an interval (`anvil_mine [n, 2]`); without
one anvil stamps every block with the same second.
