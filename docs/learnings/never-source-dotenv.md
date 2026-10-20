# Read one key from `.env` with grep; never `source` it

**Learned:** 2026-10-20 · **From:** landing-page build

`set -a && . .env` ran each unquoted value through the shell. The Neon URLs hold a `&`, so the
shell sent part of each line to the background and printed both database URLs, passwords and all,
into the session.

Read only the key a command needs:
`FIRMS_MAP_KEY=$(grep '^FIRMS_MAP_KEY=' ../.env | cut -d= -f2-) uv run globe-day`, or use
`uv run --env-file ../.env`.
