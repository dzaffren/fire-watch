import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { zeroHash, type Hex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HotspotRecord, PackDetail, PackRef } from "./api";
import type { Seal } from "./chain";
import { ComplaintPack, type LeftOutCheck, type PackSource } from "./ComplaintPack";
import { fingerprint } from "./fingerprint";
import { shortHash } from "./format";
import { leaf, rootFrom } from "./merkle";
import { enrich, FIRES, fireHotspots, fixture, inRun } from "./preview/fixture";
import { AS_PACKED, LIVE_JOINED } from "./preview/OriginConfidencePreview";

vi.mock("./FireMap", () => ({ FireMap: vi.fn(() => null) }));

// Packs of the fire-origin fixture's real fires, as of the recorder's 2026-10-17 09:00 UTC run.
const AS_OF = Date.parse("2026-10-17T09:00:00Z") / 1000;
const CONTRACT: Hex = "0x6a55489a05a9c79d2cd35212878d113557dceb2a";
const FIRE_RUNS: Hex = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
// Run 1, sealed 15 Oct 08:02 UTC, and run 2, sealed 15 Oct 21:03 UTC, by the chain's clock.
const RUN_1_AT = Date.parse("2026-10-15T08:02:00Z") / 1000;
const RUN_2_AT = Date.parse("2026-10-15T21:03:00Z") / 1000;
const RULE_URL = "https://github.com/dzaffren/fire-watch/blob/main/api/src/firewatch/fires.py";
const CANT_TELL = "The satellite record can't say which side this fire started on.";
const MISSED =
  "The satellite can miss fire under cloud, heavy smoke or thick tree canopy, and peat that smoulders with too little heat to show. This fire may have burned unseen before it was first seen, inside or outside the concession.";
const NEVER_SPREAD =
  "Seen on 5 passes without spreading. This can be a fixed heat source, such as a mill, or peat smouldering in place.";
// Scenario 3's detection, first sealed at 14.48 MW.
const EDITED = { lat_e5: -285500, lon_e5: 11272607 };

type Fire = { id: string; key: Hex };
const refOf = ({ id, key }: Fire): PackRef => ({ id, key, asOf: AS_OF });

/** One fire's pack as the API answers it; `waiting` names records the recorder hasn't sealed yet. */
function packOf({ id, key }: Fire, waiting: (h: HotspotRecord) => boolean = () => false): PackDetail {
  const d = fixture.detail[id];
  const records = fireHotspots(d.hotspots.map((h) => enrich(h, false)), key);
  return {
    ...d.fires.find((f) => f.key === key)!,
    hotspots: records.map((h) => (waiting(h) ? { ...h, tx_hash: null, sealed_at: null } : h)),
    as_of_unix: AS_OF,
    concession_id: id,
    province: d.province,
    boundary: d.boundary,
    map_version: fixture.map_version,
    rule_version: 1,
  };
}

/** The chain as Multicall3 reads it: each record's fingerprint and time as sealed on FireRecords, zeros
 *  while it waits, and for a record with a run, that run's root and time on FireRuns. */
const chainOf = (pack: PackDetail, runs = new Map<number, { root: Hex; sealedAt: number }>()) =>
  vi.fn(async (records: HotspotRecord[]) => {
    const sealed = new Map(
      pack.hotspots.map((h): [Hex, Seal] => [
        h.record_id,
        {
          contract: "FireRecords",
          fingerprint: h.tx_hash ? fingerprint(h) : zeroHash,
          sealedAt: h.tx_hash ? Date.parse(h.sealed_at!) / 1000 : 0,
        },
      ]),
    );
    return records.map((r): Seal => {
      if (r.run == null) return sealed.get(r.record_id)!;
      const { root, sealedAt } = runs.get(r.run) ?? { root: zeroHash, sealedAt: 0 };
      return { contract: "FireRuns", run: r.run, root, sealedAt };
    });
  });

function sourceOf(pack: PackDetail | null, sealsOf = chainOf(pack!)): PackSource {
  return { pack: vi.fn(async () => pack), contracts: { records: CONTRACT, runs: FIRE_RUNS }, sealsOf, fingerprint };
}

/** The 0332 fire's pack after the switch: pass 1 sealed one by one on FireRecords, passes 2 and 3 in
 *  run 1's root, and pass 4 in run 2's. `edit` changes a stored record after its run. */
function mixedPack(edit: (h: HotspotRecord) => HotspotRecord = (h) => h) {
  const pack = packOf(FIRES.outside);
  const run1 = inRun(pack.hotspots.filter((h) => h.pass === 2 || h.pass === 3), 1, RUN_1_AT, fingerprint);
  const run2 = inRun(pack.hotspots.filter((h) => h.pass === 4), 2, RUN_2_AT, fingerprint);
  const inRoot = new Map([...run1.records, ...run2.records].map((h) => [h.record_id, h]));
  const served = { ...pack, hotspots: pack.hotspots.map((h) => edit(inRoot.get(h.record_id) ?? h)) };
  const runs = new Map([
    [1, { root: run1.root, sealedAt: RUN_1_AT }],
    [2, { root: run2.root, sealedAt: RUN_2_AT }],
  ]);
  return { pack: served, chain: chainOf(pack, runs), runs };
}

/** The value beside a label in the pack's key and value lists. */
const kv = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
/** The detections table's rows, leaving out an opened record's panel. */
const detectionRows = () =>
  within(screen.getByRole("table", { name: /detections, oldest first$/ }))
    .getAllByRole("row")
    .filter((r) => r.querySelector("button[aria-expanded]"));

afterEach(() => {
  vi.useRealTimers();
});

describe("ComplaintPack", () => {
  it("reads the site, dates and basis of the 0332 fire", async () => {
    const pack = packOf(FIRES.outside);
    render(<ComplaintPack source={sourceOf(pack)} packRef={refOf(FIRES.outside)} />);

    expect(await screen.findByRole("heading", { level: 1, name: "First seen outside, 950 m from the edge" })).toBeInTheDocument();
    expect(screen.getByText("Complaint pack, as of 2026-10-17 09:00 UTC")).toBeInTheDocument();
    expect(screen.getByText("ID-WOOD-CONCESSION-0332, Kalimantan Tengah")).toBeInTheDocument();
    expect(
      screen.getByText("Fire Watch's records begin 38 hours before this fire was first seen, so it may have been burning earlier. NASA's archive may hold detections from before then."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Recording had started/)).toBeNull();
    expect(await screen.findByRole("heading", { name: "19 of 19 detections match the chain" })).toBeInTheDocument();

    expect(kv("Concession")).toBe("ID-WOOD-CONCESSION-0332");
    expect(kv("Province")).toBe("Kalimantan Tengah");
    expect(kv("First detection")).toBe("2.8517°S, 112.72527°E");
    expect(kv("Boundaries")).toBe("Trase pulpwood concessions 2023–2024, v2026-02-20");
    expect(kv("First seen")).toBe("2026-10-13 17:37 UTC");
    expect(kv("Seen inside from")).toBe("2026-10-15 18:43 UTC");
    expect(screen.queryByText("Seen outside from")).toBeNull();
    expect(kv("Last seen")).toBe("2026-10-15 18:43 UTC");
    expect(kv("Passes")).toBe("4, with 19 detections");
    expect(screen.getByRole("link", { name: "Version 1, in full" })).toHaveAttribute("href", RULE_URL);
    expect(screen.getByText(/^A detection joins a fire when it is within 1 km and 48 hours/)).toBeInTheDocument();

    const passes = within(screen.getByRole("table", { name: "Spread, pass by pass" })).getAllByRole("row").slice(1);
    expect(passes.map((r) => r.children[1].textContent)).toEqual(["13 Oct 17:37", "14 Oct 06:18", "14 Oct 17:20", "15 Oct 18:43"]);

    // Every detection opens its record, with its record ID and the transaction that sealed it.
    expect(detectionRows()).toHaveLength(19);
    for (const [i, h] of pack.hotspots.entries()) {
      fireEvent.click(within(detectionRows()[i]).getByRole("button"));
      const record = screen.getByRole("article", { name: "Hotspot record" });
      expect(within(record).getByText(new RegExp(`"record_id": "${h.record_id}"`))).toBeInTheDocument();
      expect(within(record).getByRole("link", { name: /^View transaction/ })).toHaveAttribute(
        "href",
        `https://sepolia.basescan.org/tx/${h.tx_hash}`,
      );
    }

    expect(
      screen.getByText(
        "Your browser worked out each detection's fingerprint and checked it on Base Sepolia, a test network. An older detection has a seal of its own on FireRecords. A newer one is under its recorder run's root on FireRuns. Fire Watch's server chose which records to send. NASA FIRMS's public archive shows whether one is missing.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This pack holds this fire as Fire Watch had stored it by 2026-10-17 09:00 UTC. Passes after that are not in it.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/never changes|only sent the records|every detection of this fire/);
    const records = screen.getByRole("link", { name: /^View FireRecords/ });
    expect(records).toHaveAttribute("href", `https://sepolia.basescan.org/address/${CONTRACT}#code`);
    expect(kv("FireRecords")).toBe("0x6a55489a…dceb2a");
    expect(screen.queryByText("FireRuns", { selector: "dt" })).toBeNull();
    expect(screen.getByText(/Company names are left out on purpose\./)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bPT\b|\bTbk\b/);
  });

  it("13 of 19, then 19 of 19", async () => {
    // Made while the fire's last pass, 6 detections, waited for its seal.
    const before = sourceOf(packOf(FIRES.outside, (h) => h.pass === 4));
    const { unmount } = render(<ComplaintPack source={before} packRef={refOf(FIRES.outside)} />);

    expect(
      await screen.findByRole("heading", { name: "13 of 19 detections match the chain. 6 are not on the chain yet." }),
    ).toBeInTheDocument();
    expect(detectionRows().filter((r) => within(r).queryByText("Not on chain yet"))).toHaveLength(6);
    expect(screen.getByText("The recorder seals new detections each hour. Open this pack again later to check the rest.")).toBeInTheDocument();
    expect(before.sealsOf).toHaveBeenCalledTimes(1);
    expect(vi.mocked(before.sealsOf).mock.calls[0][0]).toHaveLength(19);
    unmount();

    // Opened again after the next recorder run.
    const after = sourceOf(packOf(FIRES.outside));
    render(<ComplaintPack source={after} packRef={refOf(FIRES.outside)} />);

    expect(await screen.findByRole("heading", { name: "19 of 19 detections match the chain" })).toBeInTheDocument();
    expect(detectionRows().filter((r) => within(r).queryByText("Matches the chain"))).toHaveLength(19);
    expect(after.sealsOf).toHaveBeenCalledTimes(1);
  });

  it("lists the changed detection first", async () => {
    const pack = packOf(FIRES.outside);
    const chain = chainOf(pack);
    const edited = {
      ...pack,
      hotspots: pack.hotspots.map((h) => (h.lat_e5 === EDITED.lat_e5 && h.lon_e5 === EDITED.lon_e5 ? { ...h, frp_e2: 145 } : h)),
    };
    render(<ComplaintPack source={sourceOf(edited, chain)} packRef={refOf(FIRES.outside)} />);

    expect(await screen.findByRole("heading", { name: "18 of 19 detections match the chain. 1 does not." })).toBeInTheDocument();
    expect(
      screen.getByText("A detection that doesn't match was changed after it was sealed. It is listed first below."),
    ).toBeInTheDocument();
    const first = detectionRows()[0];
    expect(within(first).getByRole("button").textContent).toBe("14 Oct 06:18Pass 2");
    expect(within(first).getByText("Does not match the chain")).toBeInTheDocument();
    expect(detectionRows().filter((r) => within(r).queryByText("Does not match the chain"))).toHaveLength(1);

    fireEvent.click(within(first).getByRole("button"));
    expect(kv("Location")).toBe("2.855°S, 112.72607°E");
    expect(kv("Fire power")).toBe("1.45 MW");
  });

  it("takes a detection's Sealed time from the chain, not the API's sealed_at", async () => {
    const pack = packOf(FIRES.outside);
    const chain = chainOf(pack);
    const first = pack.hotspots[0].record_id;
    // The API says 17 Oct 00:00; the chain sealed the first detection 16 Oct 02:37:38.
    chain.mockImplementation(async (records) =>
      records.map((r): Seal => ({
        contract: "FireRecords",
        fingerprint: fingerprint(r),
        sealedAt: r.record_id === first ? 1792118258 : Date.parse(r.sealed_at!) / 1000,
      })),
    );
    const served = { ...pack, hotspots: pack.hotspots.map((h, i) => (i === 0 ? { ...h, sealed_at: "2026-10-17T00:00:00Z" } : h)) };
    render(<ComplaintPack source={sourceOf(served, chain)} packRef={refOf(FIRES.outside)} />);

    expect(await screen.findByRole("heading", { name: "19 of 19 detections match the chain" })).toBeInTheDocument();
    fireEvent.click(within(detectionRows()[0]).getByRole("button"));
    expect(kv("Sealed")).toBe("2026-10-16 02:37 UTC2 d 9 h after detection");
  });

  it("checks old seals on FireRecords and run roots on FireRuns in one read", async () => {
    const { pack, chain } = mixedPack();
    render(<ComplaintPack source={sourceOf(pack, chain)} packRef={refOf(FIRES.outside)} />);

    expect(await screen.findByRole("heading", { name: "19 of 19 detections match the chain" })).toBeInTheDocument();
    expect(detectionRows().filter((r) => within(r).queryByText("Matches the chain"))).toHaveLength(19);
    expect(chain).toHaveBeenCalledOnce();
    expect(chain.mock.calls[0][0]).toHaveLength(19);

    // A contract row for each contract the pack's records use, each linking to Basescan.
    expect(kv("FireRecords")).toBe("0x6a55489a…dceb2a");
    expect(kv("FireRuns")).toBe("0xe7f1725e…3f0512");
    expect(screen.getByRole("link", { name: /^View FireRecords/ })).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/address/${CONTRACT}#code`,
    );
    expect(screen.getByRole("link", { name: /^View FireRuns/ })).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/address/${FIRE_RUNS}#code`,
    );

    // An old detection keeps its own seal time on FireRecords.
    fireEvent.click(within(detectionRows()[0]).getByRole("button"));
    expect(kv("Sealed in")).toBe("FireRecords, in a seal of its own");
    expect(kv("Sealed")).toBe("2026-10-13 20:24 UTC2 h 47 min after detection");

    // A detection of the last pass is under run 2's root, sealed at run 2's time.
    fireEvent.click(within(detectionRows()[18]).getByRole("button"));
    expect(kv("Sealed in")).toBe("FireRuns, run 2's root");
    expect(kv("Sealed")).toBe("2026-10-15 21:03 UTC2 h 20 min after detection");
    const record = screen.getByRole("article", { name: "Hotspot record" });
    expect(within(record).getByRole("link", { name: /^View transaction/ })).toHaveAttribute(
      "href",
      `https://sepolia.basescan.org/tx/${pack.hotspots[18].tx_hash}`,
    );
  });

  it("lists a changed detection in run 2's root first; the rest of run 2 still matches", async () => {
    // The last pass's detection at 2.83405°S, 112.7192°E, sealed in run 2 at 4.67 MW, now stored at 1.23 MW.
    const changed = (h: HotspotRecord) => h.lat_e5 === -283405 && h.lon_e5 === 11271920;
    const { pack, chain, runs } = mixedPack((h) => (changed(h) ? { ...h, frp_e2: 123 } : h));
    render(<ComplaintPack source={sourceOf(pack, chain)} packRef={refOf(FIRES.outside)} />);

    expect(await screen.findByRole("heading", { name: "18 of 19 detections match the chain. 1 does not." })).toBeInTheDocument();
    const runTwo = pack.hotspots.filter((h) => h.run === 2);
    expect(runTwo).toHaveLength(6);
    const first = detectionRows()[0];
    expect(within(first).getByText("Does not match the chain")).toBeInTheDocument();
    expect(detectionRows().filter((r) => within(r).queryByText("Does not match the chain"))).toHaveLength(1);
    expect(detectionRows().filter((r) => within(r).queryByText("Pass 4") && within(r).queryByText("Matches the chain"))).toHaveLength(5);

    fireEvent.click(within(first).getByRole("button"));
    const h = pack.hotspots.find(changed)!;
    const rootNow = rootFrom(leaf(h.record_id, fingerprint(h)), h.proof!);
    const short = (x: Hex) => shortHash(x.slice(2), 10, 6);
    expect(kv("Fire power")).toBe("1.23 MW");
    expect(kv("Fingerprint now")).toBe(short(fingerprint(h)));
    expect(kv("Run root on chain")).toBe(short(runs.get(2)!.root));
    expect(kv("Run root now")).toBe(short(rootNow));
    expect(kv("Sealed in")).toBe("FireRuns, run 2's root");
    const raw = screen.getByRole("article", { name: "Hotspot record" }).querySelector("details p");
    expect(raw).toHaveTextContent(new RegExp(`Run 2's root, worked out from it and the ${h.proof!.length} proof hash(es)? above: ${rootNow.slice(2)}$`));
  });

  it("names only FireRuns when every record is in a run's root", async () => {
    const pack = packOf(FIRES.outside);
    const all = inRun(pack.hotspots, 3, RUN_2_AT, fingerprint);
    const served = { ...pack, hotspots: all.records };
    render(
      <ComplaintPack
        source={sourceOf(served, chainOf(served, new Map([[3, { root: all.root, sealedAt: RUN_2_AT }]])))}
        packRef={refOf(FIRES.outside)}
      />,
    );

    expect(await screen.findByRole("heading", { name: "19 of 19 detections match the chain" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^View FireRuns/ })).toBeInTheDocument();
    expect(screen.queryByText("FireRecords", { selector: "dt" })).toBeNull();
  });

  it("reads a run not sealed yet as not on the chain yet", async () => {
    const pack = packOf(FIRES.outside);
    const waiting = inRun(pack.hotspots.filter((h) => h.pass === 4), 5, RUN_2_AT, fingerprint);
    const byId = new Map(waiting.records.map((h) => [h.record_id, h]));
    const served = { ...pack, hotspots: pack.hotspots.map((h) => byId.get(h.record_id) ?? h) };
    render(<ComplaintPack source={sourceOf(served, chainOf(served))} packRef={refOf(FIRES.outside)} />);

    expect(
      await screen.findByRole("heading", { name: "13 of 19 detections match the chain. 6 are not on the chain yet." }),
    ).toBeInTheDocument();
  });

  it("too close to tell", async () => {
    render(<ComplaintPack source={sourceOf(packOf(FIRES.edge))} packRef={refOf(FIRES.edge)} />);

    const title = await screen.findByRole("heading", {
      level: 1,
      name: "First seen 160 m inside the edge, within one satellite pixel of it",
    });
    const head = title.closest("header")!;
    expect([...head.querySelectorAll("h1, p")].map((e) => e.textContent)).toEqual([
      "Complaint pack, as of 2026-10-17 09:00 UTC",
      "First seen 160 m inside the edge, within one satellite pixel of it",
      "ID-WOOD-CONCESSION-0540, Sumatera Selatan",
      CANT_TELL,
      MISSED,
    ]);
  });

  it("never spread", async () => {
    render(<ComplaintPack source={sourceOf(packOf(FIRES.still))} packRef={refOf(FIRES.still)} />);

    const title = await screen.findByRole("heading", { level: 1 });
    expect(within(title.closest("header")!).getByText(NEVER_SPREAD)).toBeInTheDocument();
  });

  it("puts one detection in the heading, and the one-detection, joined and missed notes on top", async () => {
    // 0332's fire cut at 17 Oct 09:00 UTC: one detection on 12 Oct 05:16, then 25 hours; one join on 14 Oct.
    render(<ComplaintPack source={sourceOf({ ...packOf(FIRES.largest), ...AS_PACKED })} packRef={refOf(FIRES.largest)} />);

    const title = await screen.findByRole("heading", {
      level: 1,
      name: "First seen outside, 3.1 km from the edge, as one detection",
    });
    const head = title.closest("header")!;
    expect([...head.querySelectorAll("h1, p")].map((e) => e.textContent)).toEqual([
      "Complaint pack, as of 2026-10-17 09:00 UTC",
      "First seen outside, 3.1 km from the edge, as one detection",
      "ID-WOOD-CONCESSION-0332, Kalimantan Tengah",
      "The satellite didn't see this fire again for 25 hours, so that detection may be a separate fire.",
      "Fire Watch joined another fire to this one on 14 Oct 17:20 UTC, when they came within 1 km. First seen above is the older of the two. The other was first seen on 13 Oct 06:37 UTC, on both sides of the edge.",
      "Fire Watch's records begin 1 hour before this fire was first seen, so it may have been burning earlier. NASA's archive may hold detections from before then. In NASA's FIRMS archive, NOAA-20 saw fire under 1 km from this fire's first detection on 11 Oct, also outside the concession.",
      MISSED,
    ]);
    expect(screen.queryByText(/fires joined to this one$/)).toBeNull();
  });

  it("gives a weak first sighting its note when it is the pack's only caveat", async () => {
    // 0356's fire has no other caveat; here its next pass came 36 hours after one detection.
    render(<ComplaintPack source={sourceOf({ ...packOf(FIRES.inside), first_alone_h: 36 })} packRef={refOf(FIRES.inside)} />);

    const title = await screen.findByRole("heading", { level: 1 });
    expect(title).toHaveTextContent("First seen inside, 410 m from the edge, as one detection");
    expect(
      within(title.closest("header")!).getByText(
        "The satellite didn't see this fire again for 36 hours, so that detection may be a separate fire.",
      ),
    ).toBeInTheDocument();
  });

  it("lists the fires joined to this one under Basis, in full so it prints", async () => {
    render(
      <ComplaintPack
        source={sourceOf({ ...packOf(FIRES.largest), ...AS_PACKED, joined: LIVE_JOINED })}
        packRef={refOf(FIRES.largest)}
      />,
    );

    const title = await screen.findByRole("heading", { level: 1 });
    expect(
      within(title.closest("header")!).getByText(
        "Fire Watch joined 7 other fires to this one, the first time on 14 Oct 17:20 UTC, as they came within 1 km. First seen above is the oldest of them. They are listed under Basis.",
      ),
    ).toBeInTheDocument();
    const basis = screen.getByRole("region", { name: "Basis" });
    expect(within(basis).getByRole("heading", { level: 3, name: "The 7 fires joined to this one" })).toBeInTheDocument();
    const table = within(basis).getByRole("table", { name: "The 7 fires joined to this one" });
    expect(table.closest("details")).toBeNull();
    const [head, ...rows] = within(table).getAllByRole("row");
    expect([...head.children].map((c) => c.textContent)).toEqual(["Joined (UTC)", "First seen (UTC)", "Where first seen"]);
    expect(rows.map((r) => [...r.children].map((c) => c.textContent))).toEqual([
      ["14 Oct 17:20", "13 Oct 06:37", "Both sides of the edge"],
      ["17 Oct 18:04", "17 Oct 05:23", "Outside, 2.6 km"],
      ["18 Oct 06:44", "17 Oct 18:04", "Outside, 4.5 km"],
      ["18 Oct 17:45", "16 Oct 18:21", "Both sides of the edge"],
      ["18 Oct 17:45", "16 Oct 18:21", "Both sides of the edge"],
      ["22 Oct 05:27", "18 Oct 17:45", "Outside, 1.3 km"],
      ["22 Oct 05:27", "21 Oct 18:30", "Outside, 630 m"],
    ]);
  });

  it("names joins, position error and the edges' source under Basis, and the rule's version", async () => {
    render(<ComplaintPack source={sourceOf({ ...packOf(FIRES.inside), rule_version: 2 })} packRef={refOf(FIRES.inside)} />);

    await screen.findByRole("heading", { level: 1, name: "First seen inside, 410 m from the edge" });
    expect([...document.querySelectorAll(".pack-caveats p")].map((p) => p.textContent)).toEqual([MISSED]);
    const basis = screen.getByRole("region", { name: "Basis" });
    expect(
      within(basis).getByText(
        "A fire that comes within 1 km of another is joined to it, so one fire here can be several that the satellite first saw apart. First seen is the oldest one's.",
      ),
    ).toBeInTheDocument();
    expect(
      within(basis).getByText(
        "A detection's position can be off as well. Straight below the satellite, NOAA-20 places almost every pixel within 400 m of where it belongs, and most within 200 m (Blonski and others, 2023, doi 10.1117/1.JRS.17.034506). A fire can also sit anywhere in its 375 m pixel. The 375 m margin allows for neither. Concession edges come from Trase's map, which gives no accuracy for its lines.",
      ),
    ).toBeInTheDocument();
    expect(
      within(basis).getByText(/^NOAA-20 passes about twice a day, so a fire may burn for hours before it is first seen\. NASA FIRMS names cloud, heavy smoke and tree canopy/),
    ).toBeInTheDocument();
    expect(within(basis).getByRole("link", { name: "Version 2, in full" })).toHaveAttribute("href", RULE_URL);
    expect(within(basis).queryByText(/fires joined to this one$/)).toBeNull();
  });

  it("holds the damage estimate at the 2023 shares, with its working and the 2023 check in full", async () => {
    // The 0332 fire's four parts from its 19 detections, as the damage query works them out.
    const damage = { inside_peat_ha: 59.21, inside_other_ha: 0, outside_peat_ha: 144.31, outside_other_ha: 6.3 };
    render(<ComplaintPack source={sourceOf({ ...packOf(FIRES.outside), damage })} packRef={refOf(FIRES.outside)} />);

    const section = await screen.findByRole("region", { name: "Damage estimate" });
    const figures = section.querySelector("dl")!;
    const value = (label: string) => within(figures).getByText(label, { selector: "dt" }).nextElementSibling!.textContent;
    expect(value("Ground in its pixels")).toMatch(/^About 210\sha59\sha of it inside the concession\.$/);
    expect(value("Likely burned")).toMatch(
      /^About 130\shaAt the shares Fire Watch measured on NASA's 2023 burned-area map, in large patches: 62% of peat, 42% of other ground\. 37\sha of it inside the concession\.$/,
    );
    expect(value("CO₂ released")).toMatch(
      /^37,000 to 110,000\stAbout 76,000\st at IPCC's average\. 11,000 to 33,000\st of it inside the concession\.$/,
    );

    // Shown in full, so a printed pack carries it.
    expect(section.querySelector("details")).toBeNull();
    expect(within(section).getByRole("heading", { level: 3, name: "How this is worked out" })).toBeInTheDocument();
    const parts = within(section).getByRole("table", { name: "How this is worked out" });
    expect(within(parts).getAllByRole("row").slice(1).map((r) => [...r.children].map((c) => c.textContent))).toEqual([
      ["Inside the concession", "59.21 ha", "0.00 ha"],
      ["Outside", "144.31 ha", "6.30 ha"],
    ]);
    const check = within(section).getByRole("table", { name: /^Fire Watch checked the squares of every 2023 detection within 5 km of a concession against NASA's MODIS/ });
    expect(within(check).getAllByRole("row").slice(1).map((r) => [...r.children].map((c) => c.textContent))).toEqual([
      ["Peat, in large patches", "31,915 ha", "61.8%"],
      ["Other ground, in large patches", "25,536 ha", "42.2%"],
      ["All ground", "456,345 ha", "15.1%"],
    ]);
    expect(within(section).getByText(/^A large patch is more than 20 squares that touch\./)).toBeInTheDocument();
    expect(within(section).getByText(/^Methane and carbon monoxide are left out\. This estimate is not sealed\./)).toBeInTheDocument();
    expect(within(section).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "IPCC 2013 Wetlands Supplement, Tables 2.6 and 2.7",
      "IPCC 2006 Guidelines, Volume 4, Tables 2.4 and 2.5",
      "World Bank, The Cost of Fire (2016)",
      "WRI Global Peatlands, v20230315, CC BY 4.0",
      "The peat map's tiles and their sha256",
      "NASA MODIS Burned Area, MCD64A1 Collection 6.1",
      "The 2023 check, its files and their sha256",
    ]);
    expect(within(section).getByRole("link", { name: "The peat map's tiles and their sha256" })).toHaveAttribute(
      "href",
      "https://github.com/dzaffren/fire-watch/blob/main/api/src/firewatch/peat.py",
    );
  });

  it("has no damage section when the API sends no damage", async () => {
    render(<ComplaintPack source={sourceOf(packOf(FIRES.outside))} packRef={refOf(FIRES.outside)} />);

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: "Damage estimate" })).toBeNull();
  });

  it("reads Checking on every detection until the chain answers", async () => {
    // Every text the page ever showed, so a state that lasts one render still counts.
    const shown: string[] = [];
    const keep = (records: MutationRecord[]) => {
      for (const r of records) {
        if (r.oldValue) shown.push(r.oldValue);
        r.removedNodes.forEach((n) => n.textContent && shown.push(n.textContent));
      }
    };
    const watch = new MutationObserver(keep);
    watch.observe(document.body, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
    render(<ComplaintPack source={sourceOf(packOf(FIRES.outside), vi.fn(() => new Promise<never>(() => {})))} packRef={refOf(FIRES.outside)} />);

    expect(await screen.findByRole("heading", { name: "Checking 19 detections against the chain" })).toBeInTheDocument();
    expect(detectionRows().filter((r) => within(r).queryByText("Checking"))).toHaveLength(19);
    keep(watch.takeRecords());
    watch.disconnect();
    expect(shown.filter((t) => /0 of 0|Matches the chain/.test(t))).toEqual([]);
  });

  it("marks every detection Couldn't check when the chain doesn't answer, and checks again", async () => {
    const pack = packOf(FIRES.outside);
    const chain = chainOf(pack);
    chain.mockRejectedValueOnce(new Error("Base Sepolia unreachable"));
    render(<ComplaintPack source={sourceOf(pack, chain)} packRef={refOf(FIRES.outside)} />);

    expect(await screen.findByRole("heading", { name: "Couldn't check 19 of 19 detections" })).toBeInTheDocument();
    expect(screen.getByText("Couldn't reach Base Sepolia to check every detection.")).toBeInTheDocument();
    expect(detectionRows().filter((r) => within(r).queryByText("Couldn't check"))).toHaveLength(19);

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("heading", { name: "19 of 19 detections match the chain" })).toBeInTheDocument();
    expect(chain).toHaveBeenCalledTimes(2);
  });

  it("shows the skeleton, then says the server is starting after 3 s", () => {
    vi.useFakeTimers();
    const source = sourceOf(null);
    source.pack = () => new Promise(() => {});
    render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

    expect(screen.getByLabelText("Loading the pack")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByText(/Starting the server/)).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(
      screen.getByText("Starting the server after a quiet spell. This can take up to a minute; the pack loads on its own."),
    ).toBeInTheDocument();
  });

  it("says it couldn't load the pack and tries again", async () => {
    const pack = packOf(FIRES.outside);
    const source = sourceOf(pack);
    vi.mocked(source.pack).mockRejectedValueOnce(new Error("API answered 503"));
    render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

    expect(await screen.findByRole("heading", { name: "Couldn't load this pack" })).toBeInTheDocument();
    expect(screen.getByText("The server didn't answer. Try again in a moment.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "First seen outside, 950 m from the edge" })).toBeInTheDocument();
  });

  it("says a link with a part missing doesn't open a pack", () => {
    const source = sourceOf(null);
    render(<ComplaintPack source={source} packRef={null} />);

    expect(screen.getByRole("heading", { name: "This link doesn't open a pack" })).toBeInTheDocument();
    expect(screen.getByText("Part of the link may be missing. Ask whoever sent it for the whole link.")).toBeInTheDocument();
    expect(source.pack).not.toHaveBeenCalled();
  });

  it("says a link the API knows no fire for doesn't open a pack", async () => {
    render(<ComplaintPack source={sourceOf(null)} packRef={refOf(FIRES.outside)} />);

    expect(await screen.findByRole("heading", { name: "This link doesn't open a pack" })).toBeInTheDocument();
  });

  describe("Copy link", () => {
    const writeText = vi.fn();

    afterEach(() => {
      delete (navigator as { clipboard?: unknown }).clipboard;
    });

    async function showPack() {
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      render(<ComplaintPack source={sourceOf(packOf(FIRES.outside))} packRef={refOf(FIRES.outside)} />);
      await screen.findByRole("heading", { name: "19 of 19 detections match the chain" });
      vi.useFakeTimers();
    }

    it("copies the page's link and reads Link copied for 2 s", async () => {
      writeText.mockResolvedValue(undefined);
      await showPack();

      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy link" })));
      expect(writeText).toHaveBeenCalledWith(window.location.href);
      expect(screen.getByRole("button", { name: "Link copied" })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    });

    it("says so when the browser blocks the copy", async () => {
      writeText.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
      await showPack();

      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy link" })));
      expect(screen.getByText("Couldn't copy. Copy the link from the address bar instead.")).toBeInTheDocument();
    });
  });

  it("prints light whatever the screen's theme", async () => {
    document.documentElement.dataset.theme = "dark";
    render(<ComplaintPack source={sourceOf(packOf(FIRES.outside))} packRef={refOf(FIRES.outside)} />);
    await screen.findByRole("heading", { level: 1 });

    window.dispatchEvent(new Event("beforeprint"));
    expect(document.documentElement.dataset.theme).toBe("light");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    delete document.documentElement.dataset.theme;
  });

  describe("left out", () => {
    // Runs 407 to 412: run 407 sealed 46 hours before the fire was first seen, run 412 after its last pass.
    const RUN_407 = { run: 407, sealedAt: Date.parse("2026-10-11T19:37:00Z") / 1000 };
    const RUN_412 = { run: 412, sealedAt: Date.parse("2026-10-15T21:47:00Z") / 1000 };
    const WHOLE: LeftOutCheck = { first: RUN_407, last: RUN_412, records: 9412, beforeRuns: false, missing: [], unmatched: [] };
    const METHOD =
      "Fire Watch sent all 9,412 records these runs sealed. Your browser rebuilt each run's root from them and compared it with FireRuns. The runs start 48 hours before this fire was first seen and end at the pack's cut.";
    const NONE_JOINED = "No run holds a detection that the fire rule joins to this fire and this pack leaves out.";
    const JOINED =
      "The fire rule joins each detection below to this fire, through detections at most 1 km and 48 hours apart, but this pack leaves it out. Each one sits in a run whose root matches FireRuns.";
    const SEAL_NOTE =
      "Your browser worked out each detection's fingerprint and checked it on Base Sepolia, a test network. An older detection has a seal of its own on FireRecords. A newer one is under its recorder run's root on FireRuns. Fire Watch's server chose which records to send.";
    // Pass 3's detections at 2.8428°S, 112.7215°E, 200 m outside 0332, and 2.8422°S, 112.71781°E, which the
    // server leaves out.
    const DROPPED = [
      { lat_e5: -284280, lon_e5: 11272150 },
      { lat_e5: -284220, lon_e5: 11271781 },
    ];

    /** The 0332 fire's pack with `runs` in its window, less the `dropped` detections, and its left-out check. */
    function withRuns(leftOut: () => Promise<LeftOutCheck>, runs = { first: 407, last: 412 }, dropped: typeof DROPPED = []) {
      const pack = packOf(FIRES.outside);
      const gone = (h: HotspotRecord) => dropped.some((d) => d.lat_e5 === h.lat_e5 && d.lon_e5 === h.lon_e5);
      const served = { ...pack, hotspots: pack.hotspots.filter((h) => !gone(h)), runs };
      const source: PackSource = { ...sourceOf(served), leftOut: vi.fn(leftOut) };
      return { source, left: pack.hotspots.filter(gone).map((h) => ({ ...h, run: 411 })) };
    }

    const panel = (name: string) => screen.findByRole("region", { name });

    it("reads Checking until the runs are checked", async () => {
      const { source } = withRuns(() => new Promise<never>(() => {}));
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      const checking = await panel("Checking runs 407 to 412 for a detection left out");
      expect(within(checking).getByText("Checking")).toBeInTheDocument();
      expect(
        within(checking).getByText(
          "Your browser reads every record these runs sealed and rebuilds each root, so this can take a few seconds.",
        ),
      ).toBeInTheDocument();
      expect(within(checking).queryByRole("button")).toBeNull();
    });

    it("reads that nothing is left out of runs 407 to 412, with their seal times", async () => {
      const { source } = withRuns(async () => WHOLE);
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      const whole = await panel("No detection of this fire is left out of runs 407 to 412");
      expect(within(whole).getByText("Nothing left out")).toBeInTheDocument();
      expect(within(whole).getByText(METHOD)).toBeInTheDocument();
      expect(within(whole).getByText(NONE_JOINED)).toBeInTheDocument();
      expect(within(whole).queryByText(/each have a seal of their own/)).toBeNull();
      expect(within(whole).queryByRole("table")).toBeNull();
      expect(kv("Runs checked")).toBe("407 to 412, with 9,412 records");
      expect(kv("First run sealed")).toBe("2026-10-11 19:37 UTC");
      expect(kv("Last run sealed")).toBe("2026-10-15 21:47 UTC");
      expect(screen.queryByText("Not matching", { selector: "dt" })).toBeNull();
    });

    it("names the one run it checked and its seal time", async () => {
      const { source } = withRuns(async () => ({ ...WHOLE, first: RUN_412, records: 1 }), { first: 412, last: 412 });
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      await panel("No detection of this fire is left out of run 412");
      expect(kv("Runs checked")).toBe("412, with 1 record");
      expect(kv("Run sealed")).toBe("2026-10-15 21:47 UTC");
      expect(screen.queryByText("First run sealed", { selector: "dt" })).toBeNull();
      expect(screen.queryByText("Last run sealed", { selector: "dt" })).toBeNull();
    });

    it("lists the detection the server left out, with its time, place and run", async () => {
      const { source, left } = withRuns(async () => ({ ...WHOLE, missing: left }), undefined, DROPPED.slice(0, 1));
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      const leftOut = await panel("1 detection of this fire is left out of this pack");
      expect(within(leftOut).getByText("Left out")).toBeInTheDocument();
      expect(within(leftOut).getByText(METHOD)).toBeInTheDocument();
      expect(within(leftOut).getByText(JOINED)).toBeInTheDocument();
      expect(within(leftOut).queryByText(NONE_JOINED)).toBeNull();
      const [head, ...rows] = within(leftOut).getAllByRole("row");
      expect([...head.children].map((c) => c.textContent)).toEqual(["Detected (UTC)", "Where", "Sealed in"]);
      expect(rows.map((r) => [...r.children].map((c) => c.textContent))).toEqual([
        ["14 Oct 17:20", "Outside, 200 m2.8428°S, 112.7215°E", "Run 411"],
      ]);
      expect(screen.getByRole("heading", { name: "18 of 18 detections match the chain" })).toBeInTheDocument();
    });

    it("says 2 detections are left out", async () => {
      const { source, left } = withRuns(async () => ({ ...WHOLE, missing: left }), undefined, DROPPED);
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      const leftOut = await panel("2 detections of this fire are left out of this pack");
      expect(within(leftOut).getAllByRole("row").slice(1)).toHaveLength(2);
    });

    it("can't say nothing is left out when run 411's records don't rebuild its root", async () => {
      const { source } = withRuns(async () => ({ ...WHOLE, unmatched: [411] }));
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      const cantSay = await panel("Can't show that nothing is left out of runs 407 to 412");
      expect(within(cantSay).getByText("Does not match the chain")).toBeInTheDocument();
      expect(within(cantSay).getByText(METHOD)).toBeInTheDocument();
      expect(
        within(cantSay).getByText(
          "Fire Watch's records for run 411 don't rebuild its root on FireRuns. A record was removed or changed after its run was sealed, or Fire Watch holds no list for that root. So this pack can't show that nothing is left out.",
        ),
      ).toBeInTheDocument();
      expect(within(cantSay).queryByText(NONE_JOINED)).toBeNull();
      expect(kv("Not matching")).toBe("411");
      // Each detection keeps its own check.
      expect(screen.getByRole("heading", { name: "19 of 19 detections match the chain" })).toBeInTheDocument();
    });

    it("names both runs whose records don't rebuild their roots", async () => {
      const runs = { first: 21, last: 40 };
      const check = { ...WHOLE, first: { ...RUN_407, run: 21 }, last: { ...RUN_412, run: 40 }, unmatched: [31, 33] };
      const { source } = withRuns(async () => check, runs);
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      const cantSay = await panel("Can't show that nothing is left out of runs 21 to 40");
      expect(
        within(cantSay).getByText(
          "Fire Watch's records for runs 31 and 33 don't rebuild their roots on FireRuns. A record was removed or changed after its run was sealed, or Fire Watch holds no list for that root. So this pack can't show that nothing is left out.",
        ),
      ).toBeInTheDocument();
      expect(kv("Not matching")).toBe("31, 33");
    });

    it("says left out, with both notes, when a detection is left out and a run doesn't match", async () => {
      const { source, left } = withRuns(async () => ({ ...WHOLE, missing: left, unmatched: [411] }), undefined, DROPPED.slice(0, 1));
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      const leftOut = await panel("1 detection of this fire is left out of this pack");
      expect(within(leftOut).getByText("Left out")).toBeInTheDocument();
      expect(within(leftOut).queryByText("Does not match the chain")).toBeNull();
      expect(within(leftOut).getByText(JOINED)).toBeInTheDocument();
      expect(within(leftOut).getByText(/^Fire Watch's records for run 411 don't rebuild its root on FireRuns\./)).toBeInTheDocument();
      expect(kv("Not matching")).toBe("411");
    });

    it("says it couldn't check the runs, and Check again reruns only this check", async () => {
      const { source } = withRuns(async () => WHOLE);
      vi.mocked(source.leftOut!).mockRejectedValueOnce(new Error("runs unreachable"));
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      const failed = await panel("Couldn't check runs 407 to 412 for a detection left out");
      expect(within(failed).getByText("Couldn't read the runs from Fire Watch's server or Base Sepolia.")).toBeInTheDocument();
      expect(failed.querySelector(".fw-chip")).toBeNull();
      expect(screen.getAllByRole("button", { name: "Check again" })).toHaveLength(1);

      fireEvent.click(within(failed).getByRole("button", { name: "Check again" }));
      expect(await panel("No detection of this fire is left out of runs 407 to 412")).toBeInTheDocument();
      expect(source.leftOut).toHaveBeenCalledTimes(2);
      expect(source.sealsOf).toHaveBeenCalledTimes(1);
    });

    it("keeps a keyboard user's focus in the panel when Check again is pressed", async () => {
      const { source } = withRuns(async () => WHOLE);
      vi.mocked(source.leftOut!).mockRejectedValueOnce(new Error("runs unreachable"));
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      const failed = await panel("Couldn't check runs 407 to 412 for a detection left out");
      const again = within(failed).getByRole("button", { name: "Check again" });
      again.focus();
      fireEvent.click(again);
      expect(again).not.toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Checking runs 407 to 412 for a detection left out" }));

      // Still focusable once the result is in, so the browser doesn't drop focus to the page.
      await panel("No detection of this fire is left out of runs 407 to 412");
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "No detection of this fire is left out of runs 407 to 412" }));
      expect(document.activeElement).toHaveAttribute("tabindex", "-1");
    });

    it("says detections sealed before run 1 each have a seal of their own on FireRecords", async () => {
      const check = { ...WHOLE, first: { run: 1, sealedAt: RUN_1_AT }, last: { run: 2, sealedAt: RUN_2_AT }, beforeRuns: true };
      const { source } = withRuns(async () => check, { first: 1, last: 2 });
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      const whole = await panel("No detection of this fire is left out of runs 1 to 2");
      expect(
        within(whole).getByText(
          "Detections sealed before 2026-10-15 08:02 UTC each have a seal of their own on FireRecords. The chain holds no list of them, so NASA FIRMS's public archive is the way to find one left out.",
        ),
      ).toBeInTheDocument();
    });

    it.each([null, undefined])("shows no panel for a pack with runs %s, and keeps the FIRMS line", async (runs) => {
      const pack = { ...packOf(FIRES.outside), runs };
      const source: PackSource = { ...sourceOf(pack), leftOut: vi.fn(async () => WHOLE) };
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      await screen.findByRole("heading", { name: "19 of 19 detections match the chain" });
      expect(screen.getByText(`${SEAL_NOTE} NASA FIRMS's public archive shows whether one is missing.`)).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: /left out/ })).toBeNull();
      expect(source.leftOut).not.toHaveBeenCalled();
    });

    it("says the check below shows whether the server left one out", async () => {
      const { source } = withRuns(async () => WHOLE);
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      await panel("No detection of this fire is left out of runs 407 to 412");
      expect(screen.getByText(`${SEAL_NOTE} The check below shows whether it left one out.`)).toBeInTheDocument();
      expect(screen.queryByText(/NASA FIRMS's public archive shows whether one is missing/)).toBeNull();
    });

    it("asks for the left-out check only after the seal checks", async () => {
      const { source } = withRuns(async () => WHOLE);
      let answer = () => {};
      const seals = vi.mocked(source.sealsOf);
      const chain = seals.getMockImplementation()!;
      seals.mockImplementationOnce((records) => new Promise<void>((done) => (answer = done)).then(() => chain(records)));
      render(<ComplaintPack source={source} packRef={refOf(FIRES.outside)} />);

      expect(await screen.findByRole("heading", { name: "Checking 19 detections against the chain" })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Checking runs 407 to 412 for a detection left out" })).toBeInTheDocument();
      expect(source.leftOut).not.toHaveBeenCalled();

      await act(async () => answer());
      expect(await panel("No detection of this fire is left out of runs 407 to 412")).toBeInTheDocument();
      expect(source.leftOut).toHaveBeenCalledOnce();
      expect(vi.mocked(source.leftOut!).mock.calls[0][0].hotspots).toHaveLength(19);
    });
  });
});
