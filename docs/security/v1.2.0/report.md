# Pentest v1.2.0

**Result:** pass
**Mode:** code-level
**Range:** v1.1.0..2a677eb (26 commits)
**Date:** 2026-11-02

## Findings

| ID | Severity | Category | Where | Description |
| -- | -------- | -------- | ----- | ----------- |

## Assessed

- A02:2025 Security Misconfiguration — 3 icon links in web/index.html; one dev-only preview route in web/src/main.tsx
- A03:2025 Software Supply Chain Failures — no lockfile, manifest or CI file changed
- A05:2025 Injection — RecordPanel.tsx sealLag renders as React text; no raw-HTML sink in the range
- A05:2025 Injection (SVG) — 23 new SVGs hold no script, event handler, href, use, foreignObject or entity
- Secrets — no key, token or password in the range diff
- Path traversal and unsafe file writes — no file read or write code in the range
- Untrusted text that steers a tool — no skill, agent, hook or .claude file changed

## Not assessed

- A01:2025 Broken Access Control — needs a running server
- A07:2025 Authentication Failures — needs a running server
- A04:2025 Cryptographic Failures — no hashing, signing or token code changed
- A06:2025 Insecure Design — no new flow or trust boundary
- A08:2025 Software or Data Integrity Failures — no deserialisation, update, plugin or CI path changed
- A09:2025 Security Logging and Alerting Failures — no auth or security event changed
- A10:2025 Mishandling of Exceptional Conditions — no error handling added
