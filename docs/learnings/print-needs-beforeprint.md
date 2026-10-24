# Fire `beforeprint` before print media in an e2e; print tokens swap only the grounds

**Learned:** 2026-10-24 · **From:** site-logo build

The `@media print` block in `tokens/colors.css` sets only the white grounds. The ink turns light
because the pack sets the light theme on `beforeprint`. `emulateMedia({ media: "print" })` alone
fires no event, so a pack open in dark kept the dark ink, and the site-logo e2e failed on a
correct page.

Dispatch the event first, as `palette.spec.ts` does:
`await page.evaluate(() => dispatchEvent(new Event("beforeprint")))`, then emulate print.
