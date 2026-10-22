import { describe, expect, it } from "vitest";
import {
  count,
  detected,
  detectedShort,
  distance,
  duration,
  firePower,
  firstSeenLine,
  firstSeenShort,
  gap,
  location,
  seenWhere,
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

  it("gives a duration in words for a sentence, to the minute under 48 hours", () => {
    // Scenario 2: sealed 14 Oct 20:02, seen inside 15 Oct 18:43; forecast 05:20.
    expect(duration(22 * 3600 + 41 * 60)).toBe("22 hours 41 minutes");
    expect(duration(13 * 3600 + 23 * 60)).toBe("13 hours 23 minutes");
    expect(duration(-(13 * 3600 + 23 * 60))).toBe("13 hours 23 minutes");
    expect(duration(120)).toBe("2 minutes");
    expect(duration(60)).toBe("1 minute");
    expect(duration(3600)).toBe("1 hour");
    expect(duration(3600 + 60)).toBe("1 hour 1 minute");
    expect(duration(47 * 3600 + 59 * 60)).toBe("47 hours 59 minutes");
    expect(duration(48 * 3600)).toBe("2 days");
    expect(duration(49 * 3600 + 30 * 60)).toBe("2 days 1 hour");
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

  it("says where a first pass saw a fire, to follow a date in a sentence", () => {
    expect(seenWhere({ reading: "both", inside: false, edge_m: 2 })).toBe("on both sides of the edge");
    expect(seenWhere({ reading: "edge", inside: true, edge_m: 158 })).toBe("160 m inside the edge, within one satellite pixel of it");
    expect(seenWhere({ reading: "edge", inside: false, edge_m: 64 })).toBe("60 m outside the edge, within one satellite pixel of it");
    expect(seenWhere({ reading: "inside", inside: true, edge_m: 409 })).toBe("inside, 410 m from the edge");
    expect(seenWhere({ reading: "outside", inside: false, edge_m: 2576 })).toBe("outside, 2.6 km from the edge");
  });

  it("shortens the reading for the fires table", () => {
    expect(firstSeenShort({ reading: "outside", inside: false, edge_m: 954 })).toBe("Outside, 950 m");
    expect(firstSeenShort({ reading: "inside", inside: true, edge_m: 1106 })).toBe("Inside, 1.1 km");
    expect(firstSeenShort({ reading: "edge", inside: true, edge_m: 158 })).toBe("Too close to tell");
    expect(firstSeenShort({ reading: "both", inside: false, edge_m: 23 })).toBe("Both sides of the edge");
  });
});
