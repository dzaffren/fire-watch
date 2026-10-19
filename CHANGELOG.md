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
- See a concession's fires, largest first, and open one to read where the satellite first saw it against the concession's edge, or that the record can't tell, then replay its spread pass by pass.
- Make a complaint pack from any fire: a page with its own link that holds the fire's site, dates and basis as of when it was made, checks every detection against Base Sepolia in the reader's browser, and prints to PDF.
- After each satellite pass, every fire near a concession and not yet seen inside gets a forecast, sealed on Base Sepolia, of whether and when it will be seen inside within 48 hours. Open a fire to see each forecast, checked in your browser, with how it turned out.

### Changed

- A concession's fires forecast to be seen inside come first, then the largest.

### Removed

- The latest-hotspot page and `record-latest`; the fire record page and the hourly recorder replace them.
