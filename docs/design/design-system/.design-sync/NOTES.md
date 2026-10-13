# design-sync notes

- This design system is CSS only (tokens, `fw-*` classes, guideline cards). The converter
  (`package-build.mjs`, `resync.mjs`) needs a JS package and does not apply. `.design-sync/build.mjs`
  assembles `ds-bundle/` instead. Run everything from `docs/design/design-system/`.
- Re-sync:
  1. Stage the validator: the skill's `cp -r ... .ds-sync/` line, then
     `(cd .ds-sync && npm i playwright typescript)`.
  2. `node .design-sync/build.mjs`, then `node .ds-sync/package-validate.mjs ./ds-bundle` (must exit 0).
  3. Screenshot every `ds-bundle/guidelines/*.html` in headless Chromium, light and dark halves. The
     validator's render check only covers `components/`, which is empty, so it checks no cards.
  4. Upload with full writes; delete any remote file under `tokens/` or `guidelines/` that the new build
     lacks (compare `list_files`). Sentinel first and last.
- No `_ds_sync.json` is uploaded, on purpose: the hand-built layout has no anchor recipe, so every sync
  re-checks all 9 cards. The validator's `_ds_sync.json absent` warning is expected.
- The validator crashes (ENOENT) if `ds-bundle/components/` is missing; `build.mjs` creates it empty.
- Cards stay in `guidelines/` with their `../styles.css` links; their first-line `@dsCard` headers come
  from the source files.

## Re-sync risks

- `conventions.md` lists class and token names by hand. After any change to `styles.css` or
  `tokens/*.css`, grep each name against the new build.
- `conventions.md` tells the agent to set Mono on inputs inline, because `.fw-input { font: inherit }`
  overrides `.fw-mono`. If `styles.css` fixes that, delete the workaround line.
- Map markers and the replay timeline exist only as inline styles in `guidelines/detections.html`, so
  designs never get them as classes.
- IBM Plex loads from Google Fonts at runtime (`tokens/fonts.css`); nothing ships in `fonts/`.
- `guidelines/motion.html` and `readme.md` point at `docs/design/system-brief.md` and `DECISIONS.md`,
  which are not uploaded.
