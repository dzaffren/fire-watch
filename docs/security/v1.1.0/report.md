# Pentest v1.1.0

**Result:** pass
**Mode:** code-level
**Range:** v1.0.0..ef5fcab (206 commits)
**Date:** 2026-10-24

## Findings

| ID | Severity | Category | Where | Description |
| -- | -------- | -------- | ----- | ----------- |

No finding was proved. The pass found no sink that untrusted input reaches.

## Assessed

- A02:2025 Security Misconfiguration — the deploy workflow's new FireRuns address, infra/setup.sh, the reader role's grant on roots, Vite's fs.allow and migration 005's grant
- A03:2025 Software Supply Chain Failures — api/uv.lock, web/pnpm-lock.yaml and web/package.json unchanged; api/pyproject.toml adds one script entry
- A04:2025 Cryptographic Failures — Merkle leaf and pair hashing in merkle.py and merkle.ts, used for integrity only
- A05:2025 Injection — new SQL in app.py, record_hotspots.py, peat.py and damage_check.py, all bound parameters or constants; no shell, eval or raw-HTML sink; CLI file flags are operator input
- A06:2025 Insecure Design — the /api/runs route and the browser's left-out check, with D123's accepted limit
- A08:2025 Software or Data Integrity Failures — FireRuns access control, the recorder's store-before-send order, the chain reads; JSON only
- A09:2025 Security Logging and Alerting Failures — log lines extended in app.py and record_hotspots.py, none removed
- A10:2025 Mishandling of Exceptional Conditions — chain.py's seal_root and record_hotspots.py's _seal_root re-raise after rollback
- Secrets — only Anvil's public default keys in web/e2e and placeholders in docs and infra

## Not assessed

- A01:2025 Broken Access Control — needs a running server
- A07:2025 Authentication Failures — needs a running server
