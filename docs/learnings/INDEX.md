# Learnings

- Use Foundry's static Alpine `anvil` on this machine (glibc 2.34) — [anvil-static-build](anvil-static-build.md)
- Build Docker images here with `--network=host` — [docker-build-host-network](docker-build-host-network.md)
- Never `spawnSync` in Playwright setup while an in-process server must answer — [e2e-setup-no-spawnsync](e2e-setup-no-spawnsync.md)
- Give Google Maps stylers six-digit hex colours — [google-maps-hex-colours](google-maps-hex-colours.md)
- Check every workflow `uses:` tag exists before the first push — [actions-refs-must-exist](actions-refs-must-exist.md)
- Integrate chunk worktrees by cherry-pick or fast-forward, not merge commits — [integrate-chunks-without-merge-commits](integrate-chunks-without-merge-commits.md)
- Write formats in specs as `<name>`, not `{name}` — [spec-angle-brackets](spec-angle-brackets.md)
- Get Base Sepolia ETH from the Google faucet plus the bridge — [base-sepolia-eth-via-bridge](base-sepolia-eth-via-bridge.md)
- Run chain reads through the lagging, pruning `public_rpc` proxy, not bare anvil — [public-rpc-lag-and-pruning](public-rpc-lag-and-pruning.md)
