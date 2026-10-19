import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ring } from "./api";
import { FireMap, type Dot } from "./FireMap";
import type { Area } from "./maps";

// Colours by token name, so a test can read which token the layer painted with.
vi.mock("./maps", async (original) => ({
  ...(await original<typeof import("./maps")>()),
  themeColour: (name: string) => name,
  themeFill: (name: string) => name,
}));

type Listener = (e?: unknown) => void;

// Like the real map, fitBounds waits for the first frame. A background tab draws late, so a
// queued fitBounds can land after the hotspot's centre.
class FirstFrameMap {
  static last: FirstFrameMap | null = null;
  center?: google.maps.LatLngLiteral;
  zoom?: number;
  private queued: (() => void) | null = null;
  private listeners = new Map<string, Listener[]>();

  constructor(
    private div: HTMLElement,
    readonly options: google.maps.MapOptions,
  ) {
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

/** Records every call the fire layer makes, with the colours, line width, opacity and dash it sets. */
function recordDrawing(): { frame(): string[] } {
  const log: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, name) => (...args: unknown[]) => {
        if (name === "setLineDash") log.push(`setLineDash ${JSON.stringify(args[0])}`);
        else log.push(name === "fill" && args[0] ? `fill ${args[0]}` : String(name));
      },
      set: (_, name, value) => {
        if (["fillStyle", "strokeStyle", "lineWidth", "globalAlpha"].includes(String(name))) log.push(`${String(name)}=${value}`);
        return true;
      },
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  // The latest draw, from the clear that starts it.
  return { frame: () => log.slice(log.lastIndexOf("clearRect")) };
}

const DIAMOND = ["moveTo", "lineTo", "lineTo", "lineTo", "closePath", "fill", "stroke"];
const diamondsAt = (frame: string[]) =>
  frame.flatMap((_, i) => (DIAMOND.every((call, j) => frame[i + j] === call) ? [i] : []));

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
// About 1 km around hotspot A, as the fire view pads a fire's detections.
const FIRE_AREA: Area = { west: 105.70667, east: 105.72467, south: -3.59075, north: -3.57275 };
// From hotspot A to the boundary's north edge, as a forecast runs to where it crosses.
const FORECAST = { from: { lat_e5: A.lat_e5, lon_e5: A.lon_e5 }, to: { lat_e5: -350000, lon_e5: A.lon_e5 } };
const FORECAST_LEGEND = "Spread forecast, to where it crosses the edge";
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

  it("puts its overlay, such as the replay, before the zoom buttons in tab order, as it sits left of them", () => {
    render(
      <FireMap label="Map">
        <button type="button">Play the spread, pass by pass</button>
      </FireMap>,
    );

    expect(screen.getAllByRole("button").map((b) => b.textContent || b.getAttribute("aria-label"))).toEqual([
      "Play the spread, pass by pass",
      "Zoom in",
      "Zoom out",
    ]);
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

  it.each([
    ["the concession view", {}],
    ["the fire view", { area: FIRE_AREA, fire: true }],
  ])("tints the concession inside its dashed edge on %s", async (_, view) => {
    mapSize(991, 536);
    const drawing = recordDrawing();
    render(<FireMap label="Map" boundary={BOUNDARY} dots={[A]} {...view} />);
    await mapReady();

    await waitFor(() => expect(drawing.frame()).toContain("arc"));
    const frame = drawing.frame();
    const tint = frame.indexOf("fillStyle=--fw-concession");
    const dash = frame.indexOf("setLineDash [5,4]");
    // Even-odd, so a hole ring in the boundary stays untinted, as the record calls it outside.
    expect(frame.slice(tint, tint + 2)).toEqual(["fillStyle=--fw-concession", "fill evenodd"]);
    // Tint, then the dashed edge over it, then the detections over both.
    expect(tint).toBeGreaterThan(-1);
    expect(frame[dash + 1]).toBe("stroke");
    expect(dash).toBeGreaterThan(tint);
    expect(frame.indexOf("arc")).toBeGreaterThan(dash);
    expect(screen.getByText("Concession: dashed edge, tint inside")).toBeInTheDocument();
  });

  it("draws the first pass as first-seen diamonds on top of the other detections", async () => {
    mapSize(991, 536);
    const drawing = recordDrawing();
    const later = { ...STRONG, alpha: 1 };
    const dots = [{ ...A, first: true }, { ...WEAK, first: true }, later];
    render(<FireMap label="Map" boundary={BOUNDARY} dots={dots} area={FIRE_AREA} fire />);
    await mapReady();

    await waitFor(() => expect(diamondsAt(drawing.frame())).toHaveLength(2));
    const frame = drawing.frame();
    expect(frame.filter((call) => call === "arc")).toHaveLength(1);
    expect(diamondsAt(frame)[0]).toBeGreaterThan(frame.lastIndexOf("arc"));
    expect(screen.getByText("First seen")).toBeInTheDocument();
  });

  it("fades the detections older to newer", async () => {
    mapSize(991, 536);
    const drawing = recordDrawing();
    const pass = (alpha: number, lon_e5: number): Dot => ({ ...A, lon_e5, alpha });
    const dots = [pass(0.3, 10571000), pass(0.65, 10572000), pass(1, 10573000)];
    render(<FireMap label="Map" boundary={BOUNDARY} dots={dots} area={FIRE_AREA} fire />);
    await mapReady();

    await waitFor(() => expect(drawing.frame().filter((call) => call === "arc")).toHaveLength(3));
    const frame = drawing.frame();
    const alphaBefore = (i: number) => frame.slice(0, i).reverse().find((call) => call.startsWith("globalAlpha="));
    const arcs = frame.flatMap((call, i) => (call === "arc" ? [alphaBefore(i)] : []));
    expect(arcs).toEqual(["globalAlpha=0.3", "globalAlpha=0.65", "globalAlpha=1"]);
    expect(screen.getByText("Older to newer")).toBeInTheDocument();
  });

  it("leaves Older to newer out of the legend when no detection is faded, as on a detection's record", () => {
    render(<FireMap label="Map" boundary={BOUNDARY} dots={[{ ...A, first: true }, STRONG]} area={FIRE_AREA} fire />);

    expect(screen.getByText("First seen")).toBeInTheDocument();
    expect(screen.queryByText("Older to newer")).toBeNull();
  });

  it("draws the forecast as a dashed accent line, with a crossing mark on the edge above it", async () => {
    mapSize(991, 536);
    const drawing = recordDrawing();
    render(<FireMap label="Map" boundary={BOUNDARY} dots={[A]} area={FIRE_AREA} fire forecast={FORECAST} />);
    await mapReady();

    await waitFor(() => expect(drawing.frame()).toContain("strokeStyle=--fw-accent"));
    const frame = drawing.frame();
    const line = frame.indexOf("strokeStyle=--fw-accent");
    expect(frame.slice(line, line + 8)).toEqual([
      "strokeStyle=--fw-accent",
      "lineWidth=1.5",
      "setLineDash [5,4]",
      "beginPath",
      "moveTo",
      "lineTo",
      "stroke",
      "setLineDash []",
    ]);
    // The dot, under the line.
    expect(frame.indexOf("arc")).toBeLessThan(line);
    const mark = frame.lastIndexOf("arc");
    expect(mark).toBeGreaterThan(line);
    expect(frame.slice(line + 8, mark + 3)).toEqual([
      "fillStyle=--fw-surface",
      "strokeStyle=--fw-accent",
      "lineWidth=1.5",
      "beginPath",
      "arc",
      "fill",
      "stroke",
    ]);
    expect(screen.getByText(FORECAST_LEGEND)).toBeInTheDocument();
  });

  it("draws the crossing mark at 5 px where the line ends, smaller than the picked detection's 7 px ring", async () => {
    mapSize(991, 536);
    const shapes = recordShapes();
    render(<FireMap label="Map" boundary={BOUNDARY} dots={[A]} area={FIRE_AREA} selected={0} fire forecast={FORECAST} />);
    const map = await mapReady();
    await waitFor(() => expect(map.zoom).toBe(14));

    // The dot, the crossing mark, then the picked detection's ring on top.
    await waitFor(() => expect(shapes.slice(-3)).toEqual([[4.5, "fill", "stroke"], [5, "fill", "stroke"], [7, "stroke"]]));
  });

  it("draws neither the line nor the mark without a forecast", async () => {
    mapSize(991, 536);
    const drawing = recordDrawing();
    render(<FireMap label="Map" boundary={BOUNDARY} dots={[A]} area={FIRE_AREA} fire forecast={null} />);
    await mapReady();

    await waitFor(() => expect(drawing.frame()).toContain("arc"));
    const frame = drawing.frame();
    expect(frame).not.toContain("strokeStyle=--fw-accent");
    // Only the concession's dashed edge.
    expect(frame.filter((call) => call === "setLineDash [5,4]")).toHaveLength(1);
    expect(frame.filter((call) => call === "arc")).toHaveLength(1);
    expect(screen.queryByText(FORECAST_LEGEND)).toBeNull();
  });

  it("frames the fire's area, at most zoom 14, and stays on it when a detection is picked", async () => {
    mapSize(991, 536);
    const { rerender } = render(<FireMap label="Map" boundary={BOUNDARY} dots={[A]} area={FIRE_AREA} fire />);
    const map = await mapReady();

    await waitFor(() => expect(map.zoom).toBe(14));
    expect(map.center?.lng).toBeCloseTo(105.71567, 5);
    expect(map.center?.lat).toBeCloseTo(-3.58175, 3);

    rerender(<FireMap label="Map" boundary={BOUNDARY} dots={[A]} area={FIRE_AREA} selected={0} fire />);
    map.drawFirstFrame();
    expect(map.zoom).toBe(14);
    expect(map.center?.lng).toBeCloseTo(105.71567, 5);
  });

  it("frames a wider fire at the zoom that fits it", async () => {
    mapSize(991, 536);
    render(<FireMap label="Map" boundary={BOUNDARY} dots={[A]} area={{ west: 105.6, east: 105.8, south: -3.65, north: -3.55 }} fire />);
    const map = await mapReady();

    await waitFor(() => expect(map.zoom).toBe(12));
    expect(map.center?.lng).toBeCloseTo(105.7, 5);
  });

  it("turns Google's place labels off", async () => {
    render(<FireMap label="Map" boundary={BOUNDARY} />);
    const map = await mapReady();
    await waitFor(() => expect(map.zoom).toBeDefined());

    expect(map.options.styles).toContainEqual({ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] });
    expect(map.options.clickableIcons).toBe(false);
  });
});
