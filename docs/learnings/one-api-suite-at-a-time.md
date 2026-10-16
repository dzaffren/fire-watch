# Run one API test suite at a time across worktrees

**Learned:** 2026-10-16 · **From:** fire-origin build

Every checkout's pytest uses the same `firewatch_test` database on port 55432, and
`api/tests/conftest.py` drops it with `FORCE` when a session starts. Two suites run together, from
the main checkout and a chunk worktree, failed with `UniqueViolation` on `hotspots_id_seq`,
`DeadlockDetected`, "relation hotspots does not exist" and "database firewatch_test does not
exist". Neither change was at fault.

When chunks run in parallel, give only one of them the API suite at a time, and say so in each
brief. A run of `tests/test_fires.py` alone is safe, since it never opens the database.
