# Import only self-contained `src` files into an e2e spec; `format.ts` fails `tsc -b`

**Learned:** 2026-10-22 · **From:** honest-claims build

`tsconfig.node.json` type-checks `e2e/**/*.ts` without JSX or Vite's `import.meta.env`. An e2e spec
that imported `detected` from `src/format.ts` pulled in `src/api.ts` through its type import, and
`tsc -b` failed on `ComplaintPack.tsx`, `FireRecordPage.tsx` and `chain.ts`.

`global-setup.ts` imports `src/fingerprint.ts`, which has no app imports, so it is safe. For anything
else, write the few lines the spec needs inline, and run `npx tsc -b` before the e2e.
