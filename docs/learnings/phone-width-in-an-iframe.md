# Check a phone width in a 390 px iframe, not by resizing Chrome

**Learned:** 2026-10-21 · **From:** newcomer-walkthrough spec, pause 2

`resize_window` to 390 by 844 reported success, but the page still measured 1432 by 583: the
Chrome window here won't go below its screen size. The phone layout was checked by replacing the
page body with a same-origin `<iframe>` 390 px wide and scripting inside it through
`contentWindow` and `contentDocument`.

Read `innerWidth` after any resize before trusting a phone check. A touch-target check still needs
the e2e's phone context: the iframe keeps the desktop's fine pointer.
