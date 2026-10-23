# Give the db's Docker bridge back `172.19.0.1/16` when Postgres resets connections

**Learned:** 2026-10-22 · **From:** palette build

The e2e's global setup failed with `read ECONNRESET` at its first Postgres query. `pg_isready` in the
container said it accepted connections, and port 55432 opened. But the bridge `br-4f6b8ed739a0` was up
with no IPv4 address, so docker-proxy could not reach the container at `172.19.0.2`.

Check with `ip -br addr show br-4f6b8ed739a0`. When it shows no address, the user runs
`sudo ip addr add 172.19.0.1/16 dev br-4f6b8ed739a0` in their own terminal, not with `!`: `sudo` needs a password, and `!` gives it no terminal to ask in.
Don't `docker compose down` to rebuild the network: the db has no named volume, so its data would go.
