# Changelog

All notable changes to this project are documented in this file. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- See the latest fire hotspot on a map, with a check in your browser that its record still matches the seal on Base Sepolia.
- Operators record the latest NASA FIRMS hotspot and seal its fingerprint on Base Sepolia with `record-latest`.
- Pick dates and see which of Indonesia's pulpwood concessions had fire hotspots inside or within 5 km, ranked by hotspots inside.
- Open a concession to see its boundary and hotspots on the map, and check any hotspot's sealed record against Base Sepolia in your browser.
- Every hotspot near a concession is recorded and sealed on the hour by the `firewatch-recorder` job, and GitHub emails the operator when recording stalls.

### Removed

- The latest-hotspot page and `record-latest`; the fire record page and the hourly recorder replace them.
