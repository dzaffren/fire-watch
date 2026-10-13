# Never `spawnSync` in Playwright setup while an in-process server must answer

**Learned:** 2026-10-13 · **From:** walking-skeleton build

The e2e global setup serves the FIRMS fixture from an HTTP server in its own Node process.
`spawnSync("uv", ["run", "record-latest"])` froze the event loop, so the server never
answered and the recorder timed out.

Wrong: `spawnSync(cmd, args)`. Right: `spawn` and await the `exit` event, as `run()` in
`web/e2e/global-setup.ts` does.
