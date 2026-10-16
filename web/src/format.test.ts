import { describe, expect, it } from "vitest";
import {
  count,
  detected,
  detectedShort,
  distance,
  firePower,
  firstSeenLine,
  firstSeenShort,
  gap,
  location,
  whereFromEdge,
} from "./format";

const A_UNIX = 1791958680;

describe("format", () => {
  it("writes hotspot A as the record shows it", () => {
    expect(detected(A_UNIX)).toBe("2026-10-14 06:18 UTC");
    expect(detectedShort(A_UNIX)).toBe("14 Oct 06:18");
    expect(location(-358175, 10571567)).toBe("3.58175°S, 105.71567°E");
    expect(firePower(520)).toBe("5.2 MW");
    expect(firePower(303)).toBe("3.03 MW");
  });

  it("counts with thousands separators", () => {
    expect(count(1015)).toBe("1,015");
    expect(count(251385)).toBe("251,385");
    expect(count(0)).toBe("0");
  });

  it("gives distances in tens of metres under a kilometre, then tenths of a kilometre", () => {
    expect(distance(371)).toBe("370 m");
    expect(distance(3099)).toBe("3.1 km");
    expect(distance(1019)).toBe("1.0 km");
    expect(distance(994)).toBe("990 m");
    expect(distance(996)).toBe("1.0 km");
  });

  it("says which side of the edge, and when within one satellite pixel of it", () => {
    expect(whereFromEdge({ inside: true, edge_m: 3099 })).toBe("Inside, 3.1 km from the edge");
    expect(whereFromEdge({ inside: false, edge_m: 371 })).toBe(
      "Outside, 370 m from the edge, within one satellite pixel of it",
    );
    expect(whereFromEdge({ inside: false, edge_m: 375 })).toBe(
      "Outside, 380 m from the edge, within one satellite pixel of it",
    );
    expect(whereFromEdge({ inside: false, edge_m: 376 })).toBe("Outside, 380 m from the edge");
  });

  it("gives the time from detection to seal", () => {
    expect(gap(A_UNIX, "2026-10-14T09:05:00Z")).toBe("2 h 47 min");
    expect(gap(A_UNIX, "2026-10-14T06:30:00Z")).toBe("12 min");
    expect(gap(A_UNIX, "2026-10-15T08:30:00Z")).toBe("1 d 2 h");
  });

  it("reads where a fire was first seen against the edge", () => {
    expect(firstSeenLine({ reading: "outside", inside: false, edge_m: 954 })).toBe("First seen outside, 950 m from the edge");
    expect(firstSeenLine({ reading: "inside", inside: true, edge_m: 409 })).toBe("First seen inside, 410 m from the edge");
    expect(firstSeenLine({ reading: "outside", inside: false, edge_m: 4182 })).toBe("First seen outside, 4.2 km from the edge");
    expect(firstSeenLine({ reading: "edge", inside: true, edge_m: 158 })).toBe(
      "First seen 160 m inside the edge, within one satellite pixel of it",
    );
    expect(firstSeenLine({ reading: "edge", inside: false, edge_m: 64 })).toBe(
      "First seen 60 m outside the edge, within one satellite pixel of it",
    );
    expect(firstSeenLine({ reading: "both", inside: false, edge_m: 23 })).toBe("First seen on both sides of the edge");
  });

  it("shortens the reading for the fires table", () => {
    expect(firstSeenShort({ reading: "outside", inside: false, edge_m: 954 })).toBe("Outside, 950 m");
    expect(firstSeenShort({ reading: "inside", inside: true, edge_m: 1106 })).toBe("Inside, 1.1 km");
    expect(firstSeenShort({ reading: "edge", inside: true, edge_m: 158 })).toBe("Too close to tell");
    expect(firstSeenShort({ reading: "both", inside: false, edge_m: 23 })).toBe("Both sides of the edge");
  });
});
