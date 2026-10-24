import { zeroHash, type Hex } from "viem";
import type { HotspotRecord, PackDetail } from "./api";
import type { LeftOutCheck } from "./ComplaintPack";
import { fingerprint, forecastFingerprint, type ForecastFields } from "./fingerprint";
import { leaf, rootOf } from "./merkle";
import { JOIN_S, joins, type Detection } from "./sameFire";

export { distanceM, JOIN_M, JOIN_S } from "./sameFire";

/** Every record of a range of FireRuns runs, as the API's run route sends it, with each detection's store time. */
export interface RunRecords {
  hotspots: (HotspotRecord & { run: number; stored_unix: number })[];
  forecasts: (ForecastFields & { record_id: Hex; run: number })[];
}

/** Checks a pack's runs against FireRuns' roots and seal times, and lists each detection the fire rule
 *  joins to the pack that the pack lacks (D119, D123, D124). Yields to the page between runs. */
export async function checkRuns(
  pack: PackDetail,
  sent: RunRecords,
  roots: Map<number, { root: Hex; sealedAt: number }>,
): Promise<LeftOutCheck> {
  const { first: F, last: L } = pack.runs!;
  const asOf = pack.as_of_unix;
  const start = Math.min(...pack.hotspots.map((h) => h.acquired_unix)) - JOIN_S;
  const chain = (run: number) => roots.get(run) ?? { root: zeroHash, sealedAt: 0 };
  const inRange = (run: number) => run >= F && run <= L;
  const unmatched = new Set<number>();
  const matching = new Set<number>();

  for (let run = F; run <= L; run++) {
    const leaves = [
      ...sent.hotspots.filter((h) => h.run === run).map((h) => leaf(h.record_id, fingerprint(h))),
      ...sent.forecasts.filter((f) => f.run === run).map((f) => leaf(f.record_id, forecastFingerprint(f))),
    ];
    if (leaves.length && rootOf(leaves) === chain(run).root) matching.add(run);
    else unmatched.add(run);
    await new Promise((r) => setTimeout(r));
  }
  if (F > 1 && chain(F - 1).sealedAt >= start) unmatched.add(F - 1);
  const next = chain(L + 1);
  if (next.root !== zeroHash && next.sealedAt <= asOf) unmatched.add(L + 1);
  for (const h of pack.hotspots) if (h.run != null && !inRange(h.run)) unmatched.add(h.run);

  const inPack = new Set(pack.hotspots.map((h) => h.record_id));
  let candidates = sent.hotspots.filter(
    (h) =>
      matching.has(h.run) &&
      h.concessions.some((c) => c.id === pack.concession_id) &&
      !inPack.has(h.record_id) &&
      !(chain(h.run).sealedAt > asOf && h.stored_unix > asOf),
  );
  const missing: HotspotRecord[] = [];
  const reached: Detection[] = [...pack.hotspots];
  while (reached.length) {
    const from = reached.pop()!;
    const joined = candidates.filter((c) => joins(from, c));
    candidates = candidates.filter((c) => !joins(from, c));
    missing.push(...joined);
    reached.push(...joined);
  }
  missing.sort((a, b) => a.acquired_unix - b.acquired_unix || a.lat_e5 - b.lat_e5 || a.lon_e5 - b.lon_e5);

  return {
    first: { run: F, sealedAt: chain(F).sealedAt },
    last: { run: L, sealedAt: chain(L).sealedAt },
    records: [...sent.hotspots, ...sent.forecasts].filter((r) => inRange(r.run)).length,
    beforeRuns: F === 1 && chain(1).sealedAt > start,
    missing,
    unmatched: [...unmatched].sort((a, b) => a - b),
  };
}
