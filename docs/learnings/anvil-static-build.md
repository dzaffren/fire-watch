# Use Foundry's static Alpine `anvil` on this machine

**Learned:** 2026-10-13 · **From:** walking-skeleton build

The dev machine runs glibc 2.34 (EL9). Foundry's `linux_amd64` `anvil` needs glibc 2.35 and
fails to start; `forge` and `cast` from the same tarball work.

Wrong: `foundryup` or the `linux_amd64` tarball alone. Right: install the `linux_amd64`
tarball into `~/.foundry/bin`, then replace `anvil` with the one from
`foundry_<version>_alpine_amd64.tar.gz` (static-pie). CI on ubuntu-latest is unaffected.
