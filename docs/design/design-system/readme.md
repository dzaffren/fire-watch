# Fire Watch design system

The one look of Fire Watch: direction A "Clear record", deeper Peatland palette, IBM Plex. Screens read
as evidence: precise, sober, trustworthy; never alarmist, playful or salesy.

- **Tokens:** `tokens/*.css`. Colours (light and dark), type, spacing, motion, fonts. `styles.css`
  imports them all, then adds the base and the primitives.
- **Primitives:** buttons, fields, status labels, record panel, table, empty and loading states,
  map markers, replay timeline, fire globe. One guideline page each in `guidelines/`.
- **Rules:** fire colour is for fire marks only, and the logo's square, which stands for a
  fire (D148). The accent means "you can act". Status labels
  always carry an icon and words. Motion is tier 1 on working screens, tier 2 for the replay,
  tier 3 only for the fire globe; the replay steps one pass every 1500 ms. Fire dots are 3 px below
  zoom 12 and size by fire power from zoom 12. A concession is a dashed edge over an acacia green
  `--fw-concession` wash, so the map shows which side is inside. Land is moss, water slate, and a
  printed page is white, with the map in colour.

Why each value is what it is: `docs/design/system-brief.md`. Decisions: D2, D3, D22, D30,
D75, D76, D77, D94, D95, D96 in `DECISIONS.md`.
