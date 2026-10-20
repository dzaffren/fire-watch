# Ask once whether the browser can draw WebGL

**Learned:** 2026-10-20 · **From:** landing-page build

`FireGlobe`'s `flat = !desktop3d()` default ran on every render, and each run made a WebGL
context. Past Chromium's limit the oldest context, the globe's own, was dropped, the check failed,
and the square globe turned into the 18:7 flat map mid-page. Unit tests passed `flat` in, so only
a browser showed it.

Keep a WebGL probe's answer for the page's life. Headless Chromium here can't screenshot a page
with live WebGL (canvases come out blank), so check the globe through the DOM: its class,
`data-shown` and box height.
