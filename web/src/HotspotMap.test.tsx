import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HotspotMap } from "./HotspotMap";

describe("HotspotMap", () => {
  it("names the record it is centred on", () => {
    render(<HotspotMap point={{ lat_e5: 43120, lon_e5: 10121540 }} />);

    expect(screen.getByRole("region", { name: "Map centred on 0.4312°N, 101.2154°E, with the hotspot marked" })).toBeInTheDocument();
  });

  it("shows the whole watch area when there is no record", () => {
    render(<HotspotMap point={null} />);

    expect(screen.getByRole("region", { name: "Map of the watch area in and around Indonesia" })).toBeInTheDocument();
  });

  it("zooms with the system's secondary buttons", () => {
    render(<HotspotMap point={null} />);

    expect(screen.getByRole("button", { name: "Zoom in" })).toHaveClass("fw-btn", "fw-btn--secondary");
    expect(screen.getByRole("button", { name: "Zoom out" })).toHaveClass("fw-btn", "fw-btn--secondary");
  });
});
