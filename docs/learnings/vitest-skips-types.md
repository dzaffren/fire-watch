# Run `tsc -b` after a new unit test; vitest doesn't check types

**Learned:** 2026-10-24 · **From:** source-claims build

`sameFire.test.ts` passed all 10 tests in vitest, but `tsc -b` failed on `pack.joined[0]`, since
`joined` is optional in `FireDetail`. vitest strips types without checking them, and `pnpm build`
runs `tsc -b` first, so CI's build would fail.

After writing a test file, run `npx tsc -b` in `web/` as well as `pnpm test`.
