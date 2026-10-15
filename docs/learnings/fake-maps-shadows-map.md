# The fake google.maps `Map` class shadows JavaScript's `Map`

**Learned:** 2026-10-16 · **From:** fire-record build

In `web/e2e/fake-google-maps.js`, `new Map()` inside the fake `class Map` builds another fake map,
which throws without a div, so `window.__fakeMap` is never set and the e2e fails on the map's view
rather than on the line at fault. Use `new globalThis.Map()` for a built-in map in that file.
