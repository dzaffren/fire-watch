import { useEffect, useRef, useState } from "react";
import { location } from "./format";
import { MinusIcon, PlusIcon } from "./icons";

const WATCH_AREA = { west: 95, south: -11, east: 141, north: 6 };
const WATCH_PADDING = 24;
// 2^8 * 256 px / 360° ≈ 182 px per degree, the whole zoom nearest the spec's 150.
const RECORD_ZOOM = 8;
const TILE = 256;
const MAPS_CALLBACK = "__fireWatchMapsReady";

let mapsLibrary: Promise<google.maps.MapsLibrary> | null = null;

function loadMaps(): Promise<google.maps.MapsLibrary> {
  mapsLibrary ??= new Promise((resolve, reject) => {
    Object.assign(window, { [MAPS_CALLBACK]: () => resolve(google.maps.importLibrary("maps")) });
    const params = new URLSearchParams({
      key: import.meta.env.VITE_GOOGLE_MAPS_KEY,
      v: "weekly",
      loading: "async",
      callback: MAPS_CALLBACK,
    });
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => reject(new Error("Google Maps didn't load"));
    document.head.append(script);
  });
  return mapsLibrary;
}

// Google's stylers take #rrggbb only; the built CSS may shorten tokens to #fff, so read the resolved colour.
function themeColour(name: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  document.body.append(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+/g) ?? [];
  probe.remove();
  return `#${rgb.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

// The catch-all geometry rule paints roads the land colour too, so roads get their own rules after it.
function mapStyles(): google.maps.MapTypeStyle[] {
  const land = themeColour("--fw-map");
  const water = themeColour("--fw-surface");
  const line = themeColour("--fw-line");
  const muted = themeColour("--fw-muted");
  return [
    { elementType: "geometry", stylers: [{ color: land }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: water }] },
    { featureType: "road", elementType: "geometry.fill", stylers: [{ color: water }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: line }] },
    { elementType: "labels.text.fill", stylers: [{ color: muted }] },
    { elementType: "labels.text.stroke", stylers: [{ color: land }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: muted }] },
  ];
}

// Web Mercator y, in pixels at zoom 0.
function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE;
}

// The view fitBounds would pick, set at once. Google holds fitBounds until the map first draws,
// which in a background tab is after the record has arrived and been centred.
function watchAreaView(div: HTMLElement): { center: google.maps.LatLngLiteral; zoom: number } {
  const top = mercatorY(WATCH_AREA.north);
  const bottom = mercatorY(WATCH_AREA.south);
  const width = ((WATCH_AREA.east - WATCH_AREA.west) / 360) * TILE;
  const scale = Math.min(
    (div.clientWidth - 2 * WATCH_PADDING) / width,
    (div.clientHeight - 2 * WATCH_PADDING) / (bottom - top),
  );
  const middle = (top + bottom) / 2 / TILE;
  return {
    center: {
      lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * middle))) * 180) / Math.PI,
      lng: (WATCH_AREA.west + WATCH_AREA.east) / 2,
    },
    zoom: scale > 1 ? Math.floor(Math.log2(scale)) : 0,
  };
}

interface Marker {
  show(map: google.maps.Map, at: google.maps.LatLngLiteral): void;
  hide(): void;
}

function createMarker(OverlayView: typeof google.maps.OverlayView): Marker {
  class HotspotMarker extends OverlayView {
    private el = document.createElement("div");
    private at: google.maps.LatLngLiteral | null = null;

    constructor() {
      super();
      this.el.className = "hs";
      this.el.setAttribute("aria-hidden", "true");
      this.el.innerHTML = '<span class="hs-dot"></span><span class="hs-ring"></span>';
    }

    show(map: google.maps.Map, at: google.maps.LatLngLiteral) {
      this.at = at;
      if (this.getMap() !== map) this.setMap(map);
      else this.draw();
      this.el.classList.remove("landing");
      void this.el.offsetWidth;
      this.el.classList.add("landing");
    }

    hide() {
      this.setMap(null);
    }

    onAdd() {
      this.getPanes()?.overlayLayer.append(this.el);
    }

    draw() {
      const p = this.getProjection()?.fromLatLngToDivPixel(this.at);
      if (!p) return;
      this.el.style.left = `${p.x}px`;
      this.el.style.top = `${p.y}px`;
    }

    onRemove() {
      this.el.remove();
    }
  }
  return new HotspotMarker();
}

interface Props {
  point: { lat_e5: number; lon_e5: number } | null;
}

export function HotspotMap({ point }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const marker = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const lat_e5 = point?.lat_e5;
  const lon_e5 = point?.lon_e5;

  useEffect(() => {
    let live = true;
    // Without the map the record panel still works, so a failed load leaves the frame empty.
    loadMaps().then(
      ({ Map, OverlayView }) => {
        if (!live || !container.current) return;
        map.current = new Map(container.current, {
          backgroundColor: themeColour("--fw-map"),
          styles: mapStyles(),
          disableDefaultUI: true,
          clickableIcons: false,
        });
        marker.current = createMarker(OverlayView);
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
    const restyle = () => map.current?.setOptions({ styles: mapStyles() });
    scheme.addEventListener("change", restyle);
    return () => scheme.removeEventListener("change", restyle);
  }, [ready]);

  useEffect(() => {
    if (!ready || !map.current || !marker.current) return;
    if (lat_e5 === undefined || lon_e5 === undefined) {
      marker.current.hide();
      const view = watchAreaView(map.current.getDiv());
      map.current.setCenter(view.center);
      map.current.setZoom(view.zoom);
      return;
    }
    const at = { lat: lat_e5 / 1e5, lng: lon_e5 / 1e5 };
    map.current.setCenter(at);
    map.current.setZoom(RECORD_ZOOM);
    marker.current.show(map.current, at);
  }, [ready, lat_e5, lon_e5]);

  function zoomBy(step: number) {
    const zoom = map.current?.getZoom();
    if (zoom !== undefined) map.current?.setZoom(zoom + step);
  }

  const label = point
    ? `Map centred on ${location(point.lat_e5, point.lon_e5)}, with the hotspot marked`
    : "Map of the watch area in and around Indonesia";

  return (
    <section className="map-col" aria-label={label}>
      <div ref={container} className="map" />
      <div className="zoom">
        <button className="fw-btn fw-btn--secondary" type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}>
          <PlusIcon />
        </button>
        <button className="fw-btn fw-btn--secondary" type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
          <MinusIcon />
        </button>
      </div>
    </section>
  );
}
