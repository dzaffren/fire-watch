import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { zeroHash, type Hex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HotspotRecord, PackDetail, PackRef } from "./api";
import { ComplaintPack, type PackSource } from "./ComplaintPack";
import { fingerprint } from "./fingerprint";
import { enrich, FIRES, fireHotspots, fixture } from "./preview/fixture";

vi.mock("./FireMap", () => ({ FireMap: vi.fn(() => null) }));

// Packs of the fire-origin fixture's real fires, as of the recorder's 2026-10-17 09:00 UTC run.
const AS_OF = Date.parse("2026-10-17T09:00:00Z") / 1000;
const CONTRACT: Hex = "0x6a55489a05a9c79d2cd35212878d113557dceb2a";
const RULE_URL = "https://github.com/dzaffren/fire-watch/blob/main/api/src/firewatch/fires.py";
const CANT_TELL = "The satellite record can't say which side this fire started on.";
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

/** FireRecords as Multicall3 reads it: each record's fingerprint as sealed, zero while it waits. */
const chainOf = (pack: PackDetail) =>
  vi.fn(async (records: HotspotRecord[]) => {
    const sealed = new Map(pack.hotspots.map((h) => [h.record_id, h.tx_hash ? fingerprint(h) : zeroHash]));
    return records.map((r) => sealed.get(r.record_id)!);
  });

function sourceOf(pack: PackDetail | null, sealsOf = chainOf(pack!)): PackSource {
  return { pack: vi.fn(async () => pack), contract: CONTRACT, sealsOf, fingerprint };
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
        "This pack holds every detection of this fire that Fire Watch had stored by 2026-10-17 09:00 UTC. It never changes, so passes after that are not in it.",
      ),
    ).toBeInTheDocument();
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
    ]);
  });

  it("never spread", async () => {
    render(<ComplaintPack source={sourceOf(packOf(FIRES.still))} packRef={refOf(FIRES.still)} />);

    const title = await screen.findByRole("heading", { level: 1 });
    expect(within(title.closest("header")!).getByText(NEVER_SPREAD)).toBeInTheDocument();
  });

  it("holds the damage estimate with its working in full", async () => {
    // The 0332 fire's four parts from its 19 detections, as the damage query works them out.
    const damage = { inside_peat_ha: 59.21, inside_other_ha: 0, outside_peat_ha: 144.31, outside_other_ha: 6.3 };
    render(<ComplaintPack source={sourceOf({ ...packOf(FIRES.outside), damage })} packRef={refOf(FIRES.outside)} />);

    const section = await screen.findByRole("region", { name: "Damage estimate" });
    const value = (label: string) => within(section).getByText(label, { selector: "dt" }).nextElementSibling!.textContent;
    expect(value("Ground in its pixels")).toMatch(/^About 210\sha59\sha of it inside the concession\.$/);
    expect(value("CO₂ released")).toMatch(/^About 120,000\st/);

    // Shown in full, so a printed pack carries it.
    expect(section.querySelector("details")).toBeNull();
    expect(within(section).getByRole("heading", { level: 3, name: "How this is worked out" })).toBeInTheDocument();
    const parts = within(section).getByRole("table", { name: "How this is worked out" });
    expect(within(parts).getAllByRole("row").slice(1).map((r) => [...r.children].map((c) => c.textContent))).toEqual([
      ["Inside the concession", "59.21 ha", "0.00 ha"],
      ["Outside", "144.31 ha", "6.30 ha"],
    ]);
    expect(within(section).getByText(/^Methane and carbon monoxide are left out\. This estimate is not sealed\./)).toBeInTheDocument();
    expect(within(section).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "IPCC 2013 Wetlands Supplement, Tables 2.6 and 2.7",
      "IPCC 2006 Guidelines, Volume 4, Tables 2.4 and 2.5",
      "World Bank, The Cost of Fire (2016)",
      "WRI Global Peatlands, v20230315, CC BY 4.0",
      "The peat map's tiles and their sha256",
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
    render(<ComplaintPack source={sourceOf(packOf(FIRES.outside), vi.fn(() => new Promise<Hex[]>(() => {})))} packRef={refOf(FIRES.outside)} />);

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
});
