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
- The forecast panel shows how the forecast rule did on a replay of 2023, next to a downwind guess, and links to every replayed forecast. `backtest-2023` redoes the replay byte for byte from pinned files.
- Each fire and complaint pack gives an estimate of the ground in the fire's pixels, the CO₂ it released and its cost, split at the concession's edge, from WRI's peat map and IPCC and World Bank factors. Operators load the peat map with `load-peat`.
- The site opens on a landing page that says what Fire Watch is, for someone new to plantation fires, with a globe of 14 Oct 2026's fires that flies to a real fire and its complaint pack. The tool moves to `/?tool`, and operators redo the globe's data with `globe-day`.
- The landing says who uses Fire Watch and how, and walks one real fire as you scroll: where the satellite first saw it, each pass in turn, and its 283 records checked against Base Sepolia in your browser.
- A complaint pack checks in your browser, against the recorder runs sealed on Base Sepolia, that Fire Watch's server left no detection of the fire out, and lists any it did; it says plainly that detections sealed before the runs began can't be checked.

### Changed

- A concession's fires forecast to be seen inside come first, then the largest.
- Play in a fire's replay holds each satellite pass for 1.5 s, not 0.6 s, so the spread is easier to follow.
- Every screen takes colour from a deeper Peatland palette: moss land, slate water and an acacia green wash inside each concession on the maps and the globe, a moss page ground, and moss and peat bands on the landing. A printed complaint pack is a white page with its map in colour.
- A detection's seal time comes from Base Sepolia's clock, and the page reads its seal from the chain even when the server says it isn't sealed. The landing, the tool and the complaint pack claim only what the chain or the data shows, and a pack says Fire Watch's server chose its records.
- The forecast panel's 2023 replay shows rule version 1 next to three guesses: its near-edge step alone, every fire by the next pass, and the downwind guess. One sentence says what the rule's advance step adds. `backtest-2023` writes both new guesses' totals and a column for each in the CSV.
- Each recorder run seals all its new detections and forecasts under one Merkle root on a new contract, FireRuns, in one transaction, so no run leaves seals for the next hour. An owner key kept off Azure can replace a leaked recorder key. The tool, the forecast panel and the complaint pack check a newer record against its run's root and an older one on FireRecords, in one read.
- A fire and its complaint pack say when the fire was first seen as one detection and then not seen for more than 14 hours, and when Fire Watch joined other fires to it, with where each was first seen. "How this is worked out" names joins, NOAA-20's position error and that Trase gives no accuracy for its concession edges. The landing tells its example fire as one detection, then a second fire joined on 14 Oct.
- The damage estimate adds the ground that likely burned: 61.8% of the peat and 42.2% of the other ground in a fire's pixels, the shares NASA's MODIS burned-area map found burned near concessions in 2023. The CO₂ and the cost follow it. `damage-check-2023` redoes the check byte for byte from pinned files.
- The forecast panel's 2023 replay says a rule version 2 was tried. Picked on January to September 2023, it warned of 63 of October to December's 79 arrivals, 2 fewer than the near-edge step, so rule version 1 stays. "How this is worked out" gives the rule and both parts' counts, and `backtest-2023` writes them, with a CSV column for its time.

### Removed

- The latest-hotspot page and `record-latest`; the fire record page and the hourly recorder replace them.

### Fixed

- Play in a fire's replay no longer jumps almost straight to the last pass; the built page read its 600 ms step as 0.6 ms.

### Security

- The API and the hourly recorder no longer use certifi 2026.7.22, which has advisory PYSEC-2026-4320; they take 2026.10.19.
- When FIRMS answers with an error, the hourly recorder no longer stores or prints the FIRMS map key in its run record and log.
