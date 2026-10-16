import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ring } from "./api";
import { FireMap, type Dot } from "./FireMap";

type Listener = (e?: unknown) => void;

// Like the real map, fitBounds waits for the first frame. A background tab draws late, so a
// queued fitBounds can land after the hotspot's centre.
class FirstFrameMap {
  static last: FirstFrameMap | null = null;
  center?: google.maps.LatLngLiteral;
  zoom?: number;
  private queued: (() => void) | null = null;
  private listeners = new Map<string, Listener[]>();

  constructor(private div: HTMLElement) {
    FirstFrameMap.last = this;
  }
  setOptions() {}
  setCenter(center: google.maps.LatLngLiteral) {
    this.center = center;
    this.emit("bounds_changed");
  }
  setZoom(zoom: number) {
    this.zoom = zoom;
    this.emit("zoom_changed");
    this.emit("bounds_changed");
  }
  getZoom() {
    return this.zoom;
  }
  getDiv() {
    return this.div;
  }
  // The top-left corner sits at pixel 0, 0 of FlatOverlay's projection.
  getBounds() {
    return { getNorthEast: () => ({ lat: () => -3 }), getSouthWest: () => ({ lng: () => 105 }) };
  }
  addListener(name: string, fn: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
  }
  click(lat: number, lng: number) {
    this.emit("click", { latLng: { lat: () => lat, lng: () => lng } });
  }
  private emit(name: string, e?: unknown) {
    this.listeners.get(name)?.forEach((fn) => fn(e));
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

// Projects one degree to 100 px, enough to tell dots apart.
class FlatOverlay {
  private map: FirstFrameMap | null = null;
  setMap(map: FirstFrameMap) {
    this.map = map;
    (this as unknown as { onAdd(): void }).onAdd();
  }
  getMap() {
    return this.map;
  }
  getPanes() {
    return { overlayLayer: document.createElement("div") };
  }
  getProjection() {
    return { fromLatLngToDivPixel: ({ lat, lng }: google.maps.LatLngLiteral) => ({ x: (lng - 105) * 100, y: (-3 - lat) * 100 }) };
  }
}

/** Records each round shape the fire layer draws: its radius, then whether it was filled or stroked. */
function recordShapes(): (string | number)[][] {
  const shapes: (string | number)[][] = [];
  let open: (string | number)[] | null = null;
  const ctx = new Proxy(
    {},
    {
      get: (_, name) => (...args: number[]) => {
        if (name === "beginPath") open = null;
        else if (name === "arc") shapes.push((open = [args[2]]));
        else if ((name === "fill" || name === "stroke") && open) open.push(name);
      },
      set: () => true,
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as CanvasRenderingContext2D);
  return shapes;
}

async function mapReady(): Promise<FirstFrameMap> {
  FirstFrameMap.last = null;
  vi.stubGlobal("google", {
    maps: { Map: FirstFrameMap, importLibrary: async () => ({ Map: FirstFrameMap, OverlayView: FlatOverlay }) },
  });
  vi.stubGlobal("matchMedia", () => ({ addEventListener() {}, removeEventListener() {} }));
  (window as unknown as Record<string, () => void>).__fireWatchMapsReady();
  await waitFor(() => expect(FirstFrameMap.last).not.toBeNull());
  return FirstFrameMap.last!;
}

function mapSize(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height);
}

const BOUNDARY: Ring[] = [[[105.5, -3.5], [105.9, -3.5], [105.9, -3.8], [105.5, -3.8], [105.5, -3.5]]];
const A: Dot = { lat_e5: -358175, lon_e5: 10571567, frp_e2: 520 };
const STRONG: Dot = { lat_e5: -360000, lon_e5: 10575000, frp_e2: 5423 };
const WEAK: Dot = { lat_e5: -359000, lon_e5: 10573000, frp_e2: 192 };
const CROWDED = "Fire detection. Zoom in for fire power";
const FIRE_POWER = "Fire power: under 5, 5–20, over 20 MW";

describe("FireMap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("zooms with the system's secondary buttons", () => {
    render(<FireMap label="Map" />);

    expect(screen.getByRole("button", { name: "Zoom in" })).toHaveClass("fw-btn", "fw-btn--secondary");
    expect(screen.getByRole("button", { name: "Zoom out" })).toHaveClass("fw-btn", "fw-btn--secondary");
  });

  it("frames the watch area at the zoom Google's fitBounds picks", async () => {
    mapSize(991, 536);
    render(<FireMap label="Map" />);
    const map = await mapReady();

    await waitFor(() => expect(map.zoom).toBe(4));
    expect(map.center?.lat).toBeCloseTo(-2.53, 1);
    expect(map.center?.lng).toBe(118);
  });

  it("stays on the picked hotspot when the map first draws after it was picked", async () => {
    mapSize(991, 536);
    const { rerender } = render(<FireMap label="Map" boundary={BOUNDARY} dots={[A]} />);
    const map = await mapReady();
    rerender(<FireMap label="Map" boundary={BOUNDARY} dots={[A]} selected={0} />);
    await waitFor(() => expect(map.zoom).toBe(11));

    map.drawFirstFrame();

    expect(map.zoom).toBe(11);
    expect(map.center).toEqual({ lat: -3.58175, lng: 105.71567 });
  });

  it("draws every detection as a 3 px dot with no edge below zoom 12", async () => {
    mapSize(991, 536);
    const shapes = recordShapes();
    render(<FireMap label="Map" boundary={BOUNDARY} dots={[A, STRONG]} selected={0} />);
    const map = await mapReady();
    await waitFor(() => expect(map.zoom).toBe(11));

    expect(screen.getByText(CROWDED)).toBeInTheDocument();
    expect(screen.queryByText(FIRE_POWER)).toBeNull();
    // Both dots, then the selected ring.
    await waitFor(() => expect(shapes.slice(-3)).toEqual([[1.5, "fill"], [1.5, "fill"], [7, "stroke"]]));
  });

  it("sizes dots by fire power, with a surface-coloured edge, from zoom 12", async () => {
    mapSize(991, 536);
    const shapes = recordShapes();
    render(<FireMap label="Map" boundary={BOUNDARY} dots={[STRONG, A, WEAK]} selected={1} />);
    const map = await mapReady();
    await waitFor(() => expect(map.zoom).toBe(11));

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(map.zoom).toBe(12);
    expect(screen.getByText(FIRE_POWER)).toBeInTheDocument();
    expect(screen.queryByText(CROWDED)).toBeNull();
    // Weakest first so the strongest sits on top, the picked one last, then its ring.
    await waitFor(() =>
      expect(shapes.slice(-4)).toEqual([[3, "fill", "stroke"], [6.5, "fill", "stroke"], [4.5, "fill", "stroke"], [7, "stroke"]]),
    );
  });

  it("picks the detection nearest a click, up to 10 px away", async () => {
    mapSize(991, 536);
    const onSelect = vi.fn();
    render(<FireMap label="Map" boundary={BOUNDARY} dots={[A, STRONG]} selected={0} onSelect={onSelect} />);
    const map = await mapReady();
    await waitFor(() => expect(map.zoom).toBe(11));

    // A is about 4 px from STRONG; nothing is within 10 px of the third click.
    map.click(-3.5818, 105.7157);
    expect(onSelect).toHaveBeenLastCalledWith(0);
    map.click(-3.6005, 105.7505);
    expect(onSelect).toHaveBeenLastCalledWith(1);
    map.click(-3.7, 105.9);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});
