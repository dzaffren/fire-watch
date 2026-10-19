# Put `--` straight after `cast abi-encode` when an argument is negative

**Learned:** 2026-10-19 · **From:** spread-forecast build

Fingerprint vectors are checked against Foundry's `cast` as a second encoder. A latitude such as
`-284220` read as a flag and failed. With `--` placed before it among the arguments, it was
counted as an extra argument.

Right: `cast abi-encode -- "f(uint8,int32)" 3 -284220`, then `cast keccak` on the output.
