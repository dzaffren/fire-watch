# Unroute the example pack's answer before opening a 0332 fire in the tool

**Learned:** 2026-10-24 · **From:** source-claims build

The landing e2e answers `/api/concessions/ID-WOOD-CONCESSION-0332/fires/**` from the committed
copy, since the e2e's API has no example fire (D137). The tool's own 0332 fire calls the same
route, so in the same page it would get the example pack instead of the e2e's 19 detections.

After reading the example pack, call `page.unroute` on the pattern before `page.goto("/?tool")`.
