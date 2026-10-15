# Get Base Sepolia ETH through Ethereum Sepolia and the bridge

**Learned:** 2026-10-15 · **From:** walking-skeleton ship

Alchemy wanted mainnet ETH and Coinbase needed an account we couldn't get. What worked: the
Google Cloud faucet (Google sign-in, 0.05 Sepolia ETH, free), then Base's L1StandardBridge on
Sepolia, `0xfd0Bf71F60660E2f608ed56e1659C450eB113120`:

`cast send <bridge> 'depositETH(uint32,bytes)' 200000 0x --value 0.04ether --rpc-url <sepolia>`

It arrived on Base Sepolia after about 5 minutes. Google may ask for 0.001 mainnet ETH on some
wallets; pk910's proof-of-work faucet is the fallback.
