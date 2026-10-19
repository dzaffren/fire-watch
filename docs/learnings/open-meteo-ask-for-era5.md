# Ask Open-Meteo's archive for `models=era5` when a spec says ERA5

**Learned:** 2026-10-19 · **From:** season-backtest build

Open-Meteo's archive API blends several models by default (`best_match`). It answers for the exact
point asked, on a finer grid than ERA5's 0.25 degrees. season-backtest's scenario 3 took its wind
from that default: "from 107° at 3.5 m/s". ERA5 alone, at the nearest 0.25 degree point, said "from
127° at 3.5 m/s", and the scenario had to be corrected in /build.

Pass `models=era5` in every request that the spec calls ERA5. The result's `latitude` and
`longitude` then come back on the 0.25 degree grid, which is a quick check that the model is right.
