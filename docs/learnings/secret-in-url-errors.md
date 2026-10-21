# Catch every HTTP error where a key rides in the URL

**Learned:** 2026-10-21 · **From:** landing-page review

FIRMS takes `FIRMS_MAP_KEY` in the URL path. `globe-day` removed the key from a changed-file
`ValueError`, but a 503 raised `httpx.HTTPStatusError`, whose message holds the full URL, and its
traceback printed the key.

Where a key is in the URL, catch `httpx.HTTPError` with the other errors and remove the key from the
message before it prints. Test it with a `MockTransport` that answers 503. The recorder's
`firms.fetch` has the same shape and doesn't do this yet.
