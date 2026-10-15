# Building with Fire Watch

Fire Watch is a CSS design system: tokens and `fw-*` classes, no JS components. `window.FireWatch` is
empty. Build screens from plain HTML/JSX elements with these classes, and use `var(--fw-*)` tokens for
your own layout. Never hard-code a colour, size or font that has a token.

## Setup

- Load `styles.css`. It imports every token file (`tokens/*.css`) and styles `body` (background, ink,
  IBM Plex Sans 15px). Without it nothing is styled.
- Themes: light by default, dark follows the system. Force one with `data-theme="light"` or
  `data-theme="dark"` on `<html>` or on any wrapper; tokens re-resolve inside it. A wrapper needs
  its own `background: var(--fw-bg); color: var(--fw-ink)`, since only `body` gets them.
- Icons: no icon set ships. Use inline SVG, 24 viewBox, `fill="none" stroke="currentColor"
  stroke-width="2"`, 12px in chips, 16px in buttons and errors.

## Classes

| Family | Classes |
| --- | --- |
| Buttons | `fw-btn` (primary, one per view), `fw-btn fw-btn--secondary`, `fw-link` (leaves the app) |
| Fields | `fw-field` wraps `label`/`legend` + `fw-input` (also on `select`) + `fw-help` or `fw-error`; invalid = `aria-invalid="true"` |
| Status | `fw-chip` + `fw-chip--ok` (matches), `--bad` (does not match), `--pending` (not on chain yet), `--checking`; always icon + words |
| Record | `fw-panel` (surface, 1px border, 8px radius), `fw-kv` on a `dl` of `dt`/`dd` |
| Table | `fw-table`; selected row = `tr aria-selected="true"` |
| States | `fw-empty` (add to a `fw-panel`), `fw-skeleton` bars inside `aria-busy="true"` |
| Text | `fw-label` (uppercase section label), `fw-mono` (coordinates, timestamps, fingerprints, hashes) |

`fw-input` resets its font, so `fw-mono` on an input does nothing; set
`style="font-family: var(--fw-font-mono)"` on the input instead.

## Tokens

- Colour: `--fw-bg`, `--fw-surface`, `--fw-ink`, `--fw-muted`, `--fw-faint`, `--fw-line`,
  `--fw-control`, `--fw-accent`, `--fw-accent-hover`, `--fw-accent-fg`, `--fw-accent-tint`,
  `--fw-fire`, `--fw-ok`, `--fw-bad`, `--fw-map`.
- Space: `--fw-space-1`…`--fw-space-7` (4, 8, 12, 16, 24, 32, 48px). Radius: `--fw-radius-chip`,
  `--fw-radius-control`, `--fw-radius-panel`.
- Type: `--fw-font-sans`, `--fw-font-mono`, `--fw-text-xs`…`--fw-text-2xl` (12–32px),
  `--fw-weight-regular|medium|semibold`.
- Motion: `--fw-dur-fast`, `--fw-dur`, `--fw-dur-slow`, `--fw-ease`, `--fw-replay-step`.

## Rules

- `--fw-fire` is for fire marks on the map only, never for UI or large fills.
- `--fw-accent` means "you can act": buttons, links, focus, selected rows. Nothing decorative.
- Mark objects with 1px `--fw-line` borders, not shadows. No red banners for routine states.
- Working screens animate only transform and opacity with the tier 1 durations.
- Map markers and the replay timeline have no classes. Copy their markup and styles from
  `guidelines/detections.html`.
- Fire dots below zoom 12 are 3 px with no edge, and the legend reads "Fire detection. Zoom in for
  fire power". From zoom 12 they are 6, 9 or 13 px by fire power with a 1px `--fw-surface` edge.

Read `styles.css`, `tokens/*.css` and the cards in `guidelines/` before styling; they are the source.

## Example

```html
<aside class="fw-panel" style="max-width: 360px">
  <div style="display: flex; justify-content: space-between; gap: var(--fw-space-3)">
    <h2 style="font-size: var(--fw-text-lg)">Hotspot record</h2>
    <span class="fw-chip fw-chip--ok"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>Matches the chain</span>
  </div>
  <dl class="fw-kv">
    <dt>Detected</dt><dd>2026-10-12 06:57 UTC</dd>
    <dt>Location</dt><dd class="fw-mono">3.68605°S, 105.68251°E</dd>
  </dl>
  <button class="fw-btn" type="button">Check record</button>
</aside>
```
