# Give Google Maps stylers six-digit hex colours

**Learned:** 2026-10-13 · **From:** walking-skeleton build

Google's map `stylers` only accept `#rrggbb`. The built CSS minifies `#ffffff` to `#fff`, so
reading a token straight from a CSS variable broke the water colour in production builds.

Wrong: `getComputedStyle(root).getPropertyValue("--fw-surface")`. Right: resolve the token
through an element's computed colour and write it as `#rrggbb`, as `HotspotMap.tsx` does.
