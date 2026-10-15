import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HotspotMap } from "./HotspotMap";

// Like the real map, fitBounds waits for the first frame. A background tab draws late, so a
// queued fitBounds can land after the record's centre.
class FirstFrameMap {
  static last: FirstFrameMap | null = null;
  center?: google.maps.LatLngLiteral;
  zoom?: number;
  private queued: (() => void) | null = null;

  constructor(private div: HTMLElement) {
    FirstFrameMap.last = this;
  }
  setOptions() {}
  setCenter(center: google.maps.LatLngLiteral) {
    this.center = center;
  }
  setZoom(zoom: number) {
    this.zoom = zoom;
  }
  getZoom() {
    return this.zoom;
  }
  getDiv() {
    return this.div;
  }
  fitBounds(b: google.maps.LatLngBoundsLiteral) {
    this.queued = () => {
      this.center = { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
      this.zoom = 4;
    };
  }
  drawFirstFrame() {
    this.queued?.();
    this.queued = null;
  }
}

class StillOverlay {
  setMap() {}
  getMap() {
    return null;
  }
}

async function mapReady(): Promise<FirstFrameMap> {
  FirstFrameMap.last = null;
  vi.stubGlobal("google", { maps: { importLibrary: async () => ({ Map: FirstFrameMap, OverlayView: StillOverlay }) } });
  vi.stubGlobal("matchMedia", () => ({ addEventListener() {}, removeEventListener() {} }));
  (window as unknown as Record<string, () => void>).__fireWatchMapsReady();
  await waitFor(() => expect(FirstFrameMap.last).not.toBeNull());
  return FirstFrameMap.last!;
}

function mapSize(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height);
}

describe("HotspotMap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it("frames the watch area at the zoom Google's fitBounds picks", async () => {
    mapSize(991, 536);
    render(<HotspotMap point={null} />);
    const map = await mapReady();

    await waitFor(() => expect(map.zoom).toBe(4));
    expect(map.center?.lat).toBeCloseTo(-2.53, 1);
    expect(map.center?.lng).toBe(118);
  });

  it("frames the watch area one zoom out on a phone", async () => {
    mapSize(360, 320);
    render(<HotspotMap point={null} />);
    const map = await mapReady();

    await waitFor(() => expect(map.zoom).toBe(3));
  });

  it("stays on the record when the map first draws after the record arrived", async () => {
    mapSize(991, 536);
    const { rerender } = render(<HotspotMap point={null} />);
    const map = await mapReady();
    rerender(<HotspotMap point={{ lat_e5: -347582, lon_e5: 10203603 }} />);
    await waitFor(() => expect(map.zoom).toBe(8));

    map.drawFirstFrame();

    expect(map.zoom).toBe(8);
    expect(map.center).toEqual({ lat: -3.47582, lng: 102.03603 });
  });
});
