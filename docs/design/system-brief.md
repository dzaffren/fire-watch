# Fire watch · design system brief

**Status:** Approved · **Updated:** 2026-10-20 by /spec landing-page

The look of the one product in `docs/specs/fire-watch/shape.md`. Watchdog investigators use
it at a desk to build a case: a map of fires next to a record panel. What they produce is
handed to a buyer and picked apart by the company, so the interface has to read as
evidence.

Choices were made on the directions page
(https://claude.ai/artifact/A591QqS2A6APUpDSpxRti3), built from real NASA FIRMS detections.

## Answers

| Question | Answer | From |
| --- | --- | --- |
| Must feel | precise, sober, trustworthy | user |
| Must never feel | alarmist, playful, salesy | user |
| Direction | A · Clear record | user, directions page |
| Reference | Stripe: documentation-grade clarity, and detail revealed only when asked for | user, directions page |
| Type | IBM Plex Sans + IBM Plex Mono | user, directions page |
| Palette | Peatland: stone greys with a green cast, deep teal accent | user, canvas "Palette options", 2026-10-13 |
| Motion ceiling | Tier 3, for one piece only: the fire globe | user, directions page |
| Locked brand items | None | user, confirmed 2026-10-13 |
| Accessibility floor | WCAG AA | user, confirmed 2026-10-13 |
| Scripts | English, Latin script only; no right-to-left or CJK | user, confirmed 2026-10-13 |
| Themes | Light and dark, both designed | user, confirmed 2026-10-13 (craft floor requires both) |
| Oldest target | Current desktop and phone browsers, last two versions | user, confirmed 2026-10-13 |
| Crowded detections | 3 px dots below zoom 12, fire-power sizes from zoom 12 | user, crowded detections page (https://claude.ai/artifact/DUQSyn4LBJeX9iPCi2fWpe), 2026-10-16 |
| Which side is inside | A faint ink tint inside the concession, under the dashed edge | user, fire-origin spec pause 2 (O9), 2026-10-16 |
| Replay speed | 600 ms a pass | user, fire-origin spec pause 2 (O10), 2026-10-16 |
| Globe's day | 14 Oct 2026, every NOAA-20 detection, committed | user, landing-page spec pause 1 (O5, D75), 2026-10-20 |
| Globe's loading | On its own on desktop, the flat map first; phones keep the flat map | user, landing-page spec pause 1 (O6, D76), 2026-10-20 |
| Globe's controls | Drag to turn, and one flight to the 0332 fire | user, landing-page spec pause 1 (O7, D77), 2026-10-20 |
| Landing motion | Tier 3 for the globe, tier 1 for the rest of the page | user, landing-page spec pause 2, 2026-10-20 |

## Token trace

Each token traces to an answer above.

```
"precise, sober" + Peatland palette → stone neutrals with a green cast: ink #1f2421 on #f3f3f0
                                     (dark: #e8e9e4 on #121412); controls outlined #7b827a (dark #6f776d)
                                   → 1px borders mark objects; no soft shadows on every surface
one accent that means "you can act" → deep teal #0b6e6e (dark #5cc0bb): links, buttons, focus only
fire is the data, not the brand    → ember #c2410c (dark #ff8a4c), used only for fire marks
"trustworthy" evidence states      → status colours apart from the accent: matches #2e6b2e (dark #6fcf7f),
                                     does not match #b42318 (dark #ff7b6e); always with an icon and words
IBM Plex Sans + Mono               → Mono for coordinates, timestamps, fingerprints, transaction hashes
desk use, map + panel density      → 15px base; scale 12 / 13 / 15 / 18 / 24 / 32 (12 for chips and mono values); 4px spacing scale
                                     (4, 8, 12, 16, 24, 32, 48)
Stripe-like, never "rounded-2xl"   → radius 6px on controls, 8px on panels
"never alarmist"                   → no red banners for routine states; fire colour never fills large areas
"which side is inside"             → --fw-concession: ink at 6% (light, #1f242110) and 7% (dark, #e8e9e412) inside
                                     the dashed edge; fire dots keep 3.8:1 (light) and 6.3:1 (dark) on it
375 m VIIRS pixels, crowded        → below zoom 12 (a pixel under 10 px) every detection is a 3 px dot, no edge;
                                     from zoom 12 dots size by fire power, 6 / 9 / 13 px, 1px surface edge
detail on request                  → raw record behind a disclosure, not on screen by default
motion ceiling tier 3              → tier 1: 120–240 ms, cubic-bezier(.2,.8,.2,1)
                                     tier 2: pass-by-pass replay, 600 ms a step (a 4-pass fire in about 2 s)
                                     tier 3: the globe only, inside the budget below
fire globe, no new tokens           → sea --fw-surface and land --fw-map, as on the tool's map; coast 1px
                                     --fw-faint, since dark land and sea are too close to read without it;
                                     fire dots --fw-fire, 2 px and round, one per 0.01° cell, and every
                                     detection in full near the 0332 fire; after the flight the concession
                                     is the usual dashed --fw-ink edge over --fw-concession (D29)
"never salesy"                      → the globe turns at one turn a minute, no glow, no bloom, no stars
```

## Tier 3 budget

The globe lives in the public intro and the opening of the demo video, never on the
working screens. How one fire spread over time stays on the tier 2 replay.

| | |
| --- | --- |
| Download | three.js 0.186.1 and the scene 139 kB; Natural Earth 110m land 16 kB; 14 Oct 2026's fires, one dot per 0.01° cell, 71 kB; every detection and the concession's edge near the 0332 fire, 15 kB; the component 2 kB. Gzipped as committed and measured: 244 kB. Ceiling 250 kB |
| Frame rate | 60 fps target on a laptop from the last five years, never below 30, with all 41,598 dots. Not measured: this machine draws WebGL in software, and its browser tops out at 20 fps with nothing animating |
| Phones | The flat world map with the same fires, no 3D: 104 kB |
| No 3D | Where WebGL can't run, the flat map stays in its place |
| Reduced motion | No turning on its own; flights jump straight to the place |
| Loading | The flat map shows first and holds the same space. On desktop the globe downloads on its own and swaps in, so nothing shifts (D76). Phones keep the flat map |

## Glossary

- **Token** — a named design value (a colour, a size) that every screen uses instead of a raw number.
- **WCAG AA** — the common accessibility standard: text contrast at least 4.5:1, large text 3:1.
- **Tier 1 / 2 / 3** — how much motion is allowed: small feedback, choreographed sequences, one 3D piece.
- **three.js** — the JavaScript library that draws the 3D globe in the browser.
- **Natural Earth** — a public-domain map of the world's land, at 1:110 million here.
- **WebGL** — the browser feature that draws 3D; a few old machines and locked-down browsers lack it.
