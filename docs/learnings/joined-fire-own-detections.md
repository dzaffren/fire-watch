# Measure from a joined fire's own detections, not its whole first pass

**Learned:** 2026-10-24 · **From:** pack-claims build

The plan said the pinned FIRMS cut held two 10 Oct detections inside and seven outside, under 1 km
from "the second fire's first pass". That count measured from all 35 detections of the example's
pass 2. Nineteen of them belong to the first fire, and a MODIS detection 569 m from one of those was
the seventh. From the second fire's own 16, the cut gives two inside and six outside.

When a check names one fire of a joined pair, split the shared pass first. Its detections that the
first detection reaches through the pass with `joins` are the first fire's; the rest are the other's.
