import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Point, Ring } from "./api";
import { fitView, loadMaps, mapStyles, themeColour, themeFill, WATCH_AREA, type Area } from "./maps";
import { MinusIcon, PlusIcon } from "./icons";

export interface Dot {
  lat_e5: number;
  lon_e5: number;
  frp_e2: number;
  /** Older to newer in a fire's replay: 1, 0.65 or 0.3. */
  alpha?: number;
  /** On the fire's first pass, drawn as the first-seen diamond. */
  first?: boolean;
}

// Fire power under 5, 5–20 and over 20 MW: 6, 9 and 13 px across, as on the detections guideline.
const radius = (frp_e2: number) => (frp_e2 < 500 ? 3 : frp_e2 <= 2000 ? 4.5 : 6.5);
// Below zoom 12 a 375 m pixel is under 10 px wide, so every detection is a 3 px dot (D22).
const FIRE_POWER_ZOOM = 12;
const CROWDED_RADIUS = 1.5;
const RING_RADIUS = 7;
// The detections guideline's first-seen diamond: an 8 px square turned 45 degrees.
const DIAMOND_HALF = 4 * Math.SQRT2;
const HIT_PX = 10;
// About 5 km, so hotspots just outside the edge stay in view.
const EDGE_PAD_DEG = 0.05;
// About 1,450 px per degree: a hotspot 3 km from the edge sits about 40 px from it, and
// neighbouring 375 m detections are about 5 px apart instead of overlapping.
const HOTSPOT_ZOOM = 11;
// A one-detection fire would otherwise fill the map with a single pixel.
const MAX_FIT_ZOOM = 14;

function areaOf(rings: Ring[]): Area {
  const area = { west: 180, south: 90, east: -180, north: -90 };
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      area.west = Math.min(area.west, lng - EDGE_PAD_DEG);
      area.east = Math.max(area.east, lng + EDGE_PAD_DEG);
      area.south = Math.min(area.south, lat - EDGE_PAD_DEG);
      area.north = Math.max(area.north, lat + EDGE_PAD_DEG);
    }
  }
  return area;
}

/** The detections guideline's spread forecast: a dashed accent line to where it crosses the edge. */
export interface ForecastLine {
  from: Point;
  to: Point;
}

interface LayerData {
  boundary: Ring[];
  dots: Dot[];
  selected: number | null;
  forecast: ForecastLine | null;
}

interface Layer {
  setMap(map: google.maps.Map): void;
  setData(data: LayerData): void;
  draw(): void;
  hit(at: google.maps.LatLng): number | null;
}

// One canvas over the map for every boundary and hotspot: a concession can hold over a thousand
// hotspots in a week, too many for one element each.
function createLayer(OverlayView: typeof google.maps.OverlayView): Layer {
  class FireLayer extends OverlayView implements Layer {
    private canvas = document.createElement("canvas");
    private data: LayerData = { boundary: [], dots: [], selected: null, forecast: null };
    private origin = { x: 0, y: 0 };

    constructor() {
      super();
      this.canvas.className = "fire-layer";
      this.canvas.setAttribute("aria-hidden", "true");
    }

    onAdd() {
      this.getPanes()?.overlayLayer.append(this.canvas);
    }

    onRemove() {
      this.canvas.remove();
    }

    setData(data: LayerData) {
      this.data = data;
      this.draw();
    }

    private pixel(lng: number, lat: number): [number, number] | null {
      const p = this.getProjection()?.fromLatLngToDivPixel({ lat, lng });
      return p ? [p.x - this.origin.x, p.y - this.origin.y] : null;
    }

    draw() {
      const map = this.getMap();
      const bounds = map instanceof google.maps.Map ? map.getBounds() : undefined;
      const corner = bounds && this.getProjection()?.fromLatLngToDivPixel({
        lat: bounds.getNorthEast().lat(),
        lng: bounds.getSouthWest().lng(),
      });
      if (!(map instanceof google.maps.Map) || !corner) return;
      const { clientWidth: w, clientHeight: h } = map.getDiv();
      const dpr = window.devicePixelRatio || 1;
      this.origin = { x: corner.x, y: corner.y };
      Object.assign(this.canvas.style, { left: `${corner.x}px`, top: `${corner.y}px`, width: `${w}px`, height: `${h}px` });
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      const ctx = this.canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const ink = themeColour("--fw-ink");
      // The inside tint shows which side of the dashed edge is the concession; even-odd leaves its
      // holes untinted.
      ctx.beginPath();
      for (const ring of this.data.boundary) {
        ring.forEach(([lng, lat], i) => {
          const p = this.pixel(lng, lat);
          if (p) (i ? ctx.lineTo : ctx.moveTo).call(ctx, p[0], p[1]);
        });
        ctx.closePath();
      }
      ctx.fillStyle = themeFill("--fw-concession");
      ctx.fill("evenodd");
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // From zoom 12, smallest first so the strongest fires sit on top; a surface-coloured edge
      // keeps neighbouring detections apart instead of merging into one patch of fire colour.
      const firePower = (map.getZoom() ?? 0) >= FIRE_POWER_ZOOM;
      ctx.fillStyle = themeColour("--fw-fire");
      ctx.strokeStyle = themeColour("--fw-surface");
      ctx.lineWidth = 1;
      const order = this.data.dots.map((_, i) => i).sort((a, b) => this.data.dots[a].frp_e2 - this.data.dots[b].frp_e2);
      for (const i of [...order.filter((i) => i !== this.data.selected), ...(this.data.selected === null ? [] : [this.data.selected])]) {
        const dot = this.data.dots[i];
        const p = this.pixel(dot.lon_e5 / 1e5, dot.lat_e5 / 1e5);
        if (!p || p[0] < -RING_RADIUS || p[1] < -RING_RADIUS || p[0] > w + RING_RADIUS || p[1] > h + RING_RADIUS) continue;
        if (dot.first) continue;
        ctx.globalAlpha = dot.alpha ?? 1;
        ctx.beginPath();
        ctx.arc(p[0], p[1], firePower ? radius(dot.frp_e2) : CROWDED_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
        if (firePower) ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = themeColour("--fw-surface");
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      for (const dot of this.data.dots) {
        if (!dot.first) continue;
        const p = this.pixel(dot.lon_e5 / 1e5, dot.lat_e5 / 1e5);
        if (!p) continue;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1] - DIAMOND_HALF);
        ctx.lineTo(p[0] + DIAMOND_HALF, p[1]);
        ctx.lineTo(p[0], p[1] + DIAMOND_HALF);
        ctx.lineTo(p[0] - DIAMOND_HALF, p[1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Over the dots, so the line still reads where it runs through the fire.
      const line = this.data.forecast;
      const start = line && this.pixel(line.from.lon_e5 / 1e5, line.from.lat_e5 / 1e5);
      const end = line && this.pixel(line.to.lon_e5 / 1e5, line.to.lat_e5 / 1e5);
      if (start && end) {
        ctx.strokeStyle = themeColour("--fw-accent");
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(...start);
        ctx.lineTo(...end);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (this.data.selected !== null) {
        const dot = this.data.dots[this.data.selected];
        const p = dot && this.pixel(dot.lon_e5 / 1e5, dot.lat_e5 / 1e5);
        if (p) {
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p[0], p[1], RING_RADIUS, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
    }

    hit(at: google.maps.LatLng): number | null {
      const target = this.pixel(at.lng(), at.lat());
      if (!target) return null;
      let best: number | null = null;
      let bestDistance = HIT_PX;
      this.data.dots.forEach((dot, i) => {
        const p = this.pixel(dot.lon_e5 / 1e5, dot.lat_e5 / 1e5);
        const d = p ? Math.hypot(p[0] - target[0], p[1] - target[1]) : Infinity;
        if (d <= bestDistance) {
          best = i;
          bestDistance = d;
        }
      });
      return best;
    }
  }
  return new FireLayer();
}

interface Props {
  label: string;
  boundary?: Ring[];
  dots?: Dot[];
  selected?: number | null;
  onSelect?: (index: number) => void;
  /** Frame this area instead of the boundary, as the fire view does for its detections. */
  area?: Area;
  /** Adds the first-seen row to the legend, and the older-to-newer row while a detection is faded. */
  fire?: boolean;
  /** The picked forecast, drawn while the replay is at or after the pass it followed. */
  forecast?: ForecastLine | null;
  /** Overlaid at the top of the map, as the fire view's replay is. */
  children?: ReactNode;
}

export function FireMap({ label, boundary, dots, selected = null, onSelect, area, fire = false, forecast = null, children }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const layer = useRef<Layer | null>(null);
  const select = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(0);

  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let live = true;
    // Without the map the record column still works, so a failed load leaves the frame empty.
    loadMaps().then(
      ({ Map, OverlayView }) => {
        if (!live || !container.current) return;
        const m = new Map(container.current, {
          backgroundColor: themeColour("--fw-map"),
          styles: mapStyles(),
          disableDefaultUI: true,
          clickableIcons: false,
        });
        const l = createLayer(OverlayView);
        l.setMap(m);
        let frame = 0;
        m.addListener("bounds_changed", () => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => l.draw());
        });
        m.addListener("zoom_changed", () => setZoom(m.getZoom() ?? 0));
        m.addListener("click", (e: google.maps.MapMouseEvent) => {
          const i = e.latLng && l.hit(e.latLng);
          if (i !== null && i !== undefined) select.current?.(i);
        });
        m.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
          const over = select.current && e.latLng && l.hit(e.latLng) !== null;
          m.setOptions({ draggableCursor: over ? "pointer" : null });
        });
        map.current = m;
        layer.current = l;
        setReady(true);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const restyle = () => {
      map.current?.setOptions({ styles: mapStyles(), backgroundColor: themeColour("--fw-map") });
      layer.current?.draw();
    };
    scheme.addEventListener("change", restyle);
    // A complaint pack prints light whatever the screen's theme.
    addEventListener("beforeprint", restyle);
    addEventListener("afterprint", restyle);
    return () => {
      scheme.removeEventListener("change", restyle);
      removeEventListener("beforeprint", restyle);
      removeEventListener("afterprint", restyle);
    };
  }, [ready]);

  const focus = selected === null ? undefined : dots?.[selected];

  useEffect(() => {
    if (!ready || !map.current) return;
    // Inside a fire the view stays on the fire, so its picked detection is ringed in place.
    if (focus && !area) {
      map.current.setCenter({ lat: focus.lat_e5 / 1e5, lng: focus.lon_e5 / 1e5 });
      map.current.setZoom(HOTSPOT_ZOOM);
      return;
    }
    const view = fitView(map.current.getDiv(), area ?? (boundary?.length ? areaOf(boundary) : WATCH_AREA));
    map.current.setCenter(view.center);
    map.current.setZoom(Math.min(view.zoom, MAX_FIT_ZOOM));
  }, [ready, boundary, focus, area]);

  useEffect(() => {
    layer.current?.setData({ boundary: boundary ?? [], dots: dots ?? [], selected, forecast });
  }, [ready, boundary, dots, selected, forecast]);

  function zoomBy(step: number) {
    const zoom = map.current?.getZoom();
    if (zoom !== undefined) map.current?.setZoom(zoom + step);
  }

  return (
    <section className="map-col" aria-label={label}>
      <div ref={container} className="map" />
      {/* Before the zoom buttons, so tab order runs left to right along the top. */}
      {children}
      <div className="zoom">
        <button className="fw-btn fw-btn--secondary" type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}>
          <PlusIcon />
        </button>
        <button className="fw-btn fw-btn--secondary" type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
          <MinusIcon />
        </button>
      </div>
      {boundary && (
        <div className="fw-panel map-legend" aria-hidden="true">
          {zoom >= FIRE_POWER_ZOOM ? (
            <div className="legend-row">
              <span className="legend-key">
                <span className="legend-dot sm" />
                <span className="legend-dot md" />
                <span className="legend-dot lg" />
              </span>
              Fire power: under 5, 5–20, over 20 MW
            </div>
          ) : (
            <div className="legend-row">
              <span className="legend-key">
                <span className="legend-dot xs" />
              </span>
              Fire detection. Zoom in for fire power
            </div>
          )}
          {fire && (
            <div className="legend-row">
              <span className="legend-key">
                <span className="legend-diamond" />
              </span>
              First seen
            </div>
          )}
          {fire && dots?.some((d) => (d.alpha ?? 1) < 1) && (
            <div className="legend-row">
              <span className="legend-key">
                <span className="legend-dot md" style={{ opacity: 0.3 }} />
                <span className="legend-dot md" style={{ opacity: 0.65 }} />
                <span className="legend-dot md" />
              </span>
              Older to newer
            </div>
          )}
          {forecast && (
            <div className="legend-row">
              <span className="legend-key legend-forecast" />
              Spread forecast, to where it crosses the edge
            </div>
          )}
          <div className="legend-row">
            <span className="legend-key legend-area" />
            Concession: dashed edge, tint inside
          </div>
        </div>
      )}
    </section>
  );
}
