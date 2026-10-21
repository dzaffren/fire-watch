import type { PackDetail } from "./api";
import type { CaseSource } from "./RealCase";
import { checkOf } from "./RecordPanel";

/** The landing's real case: the example fire's pack as committed (D85, D90), checked against the chain (D83). */
export const caseSource: CaseSource = {
  pack: async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}case/pack-0332.json`);
    if (!res.ok) throw new Error(`case: ${res.status}`);
    return (await res.json()) as PackDetail;
  },
  // The chain code loads only once a reader reaches the seal step (D91).
  check: async (records) => {
    const [{ sealsOf }, { fingerprint }] = await Promise.all([import("./chain"), import("./fingerprint")]);
    const seals = await sealsOf(records.map((r) => r.record_id));
    return seals.map((sealed, i) => checkOf(sealed, fingerprint(records[i])));
  },
};
