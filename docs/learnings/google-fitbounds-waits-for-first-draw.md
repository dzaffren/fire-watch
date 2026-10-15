# Google's fitBounds waits for the map's first draw

**Learned:** 2026-10-15 · **From:** walking-skeleton live check, /debug

`map.fitBounds()` on a map that hasn't drawn yet is held until it does. A tab opened in the
background draws only when shown, so a held fitBounds ran after the record's `setCenter` and
`setZoom(8)` and put the page back on the whole watch area. `setCenter` and `setZoom` apply at
once, so calls made before the first draw take effect straight away.

Don't call fitBounds before data that will move the camera has arrived. HotspotMap now
sets the watch-area view itself. To reproduce, build against a slow API and load it in a hidden
tab; the e2e fake map can't show it.
