# Answer a cross-origin API call with `route.fulfill` and no CORS header

**Learned:** 2026-10-23 · **From:** claim-fixes build

The landing e2e answers the example pack's API call from the committed copy. The page runs on port
4173 and the API on 8001, so the call is cross-origin. The walk passed with and without an
`access-control-allow-origin` header on the fulfilled answer, so Playwright doesn't need it.

When an e2e answers an API call with `route.fulfill`, give it `path` and `contentType` only.
