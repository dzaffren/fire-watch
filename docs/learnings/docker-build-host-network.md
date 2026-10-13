# Build Docker images here with `--network=host`

**Learned:** 2026-10-13 · **From:** walking-skeleton build

Containers started by `docker build` on this machine have no DNS, so `pip` and `uv` inside a
build fail with "Temporary failure in name resolution". Running containers are fine.

Wrong: `docker build -t firewatch-api:dev api`. Right:
`docker build --network=host -t firewatch-api:dev api`. CI builds are unaffected.
