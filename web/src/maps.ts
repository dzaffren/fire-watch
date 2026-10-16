export const WATCH_AREA = { west: 95, south: -11, east: 141, north: 6 };
const WATCH_PADDING = 24;
const TILE = 256;
const MAPS_CALLBACK = "__fireWatchMapsReady";

let mapsLibrary: Promise<google.maps.MapsLibrary> | null = null;

export function loadMaps(): Promise<google.maps.MapsLibrary> {
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

// Google's stylers take six-digit hex only; the built CSS may shorten tokens to three digits, so read the resolved colour.
export function themeColour(name: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  document.body.append(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+/g) ?? [];
  probe.remove();
  return `#${rgb.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

// The catch-all geometry rule paints roads the land colour too, so roads get their own rules after it.
export function mapStyles(): google.maps.MapTypeStyle[] {
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
    // Business and other place labels name companies beside the boundaries, and records name none (shape O10).
    { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  ];
}

// Web Mercator y, in pixels at zoom 0.
function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE;
}

export interface Area {
  west: number;
  south: number;
  east: number;
  north: number;
}

// The view fitBounds would pick, set at once. Google holds fitBounds until the map first draws,
// which in a background tab is after the record has arrived and been centred.
export function fitView(div: HTMLElement, area: Area, padding = WATCH_PADDING): { center: google.maps.LatLngLiteral; zoom: number } {
  const top = mercatorY(area.north);
  const bottom = mercatorY(area.south);
  const width = ((area.east - area.west) / 360) * TILE;
  const scale = Math.min(
    (div.clientWidth - 2 * padding) / width,
    (div.clientHeight - 2 * padding) / (bottom - top),
  );
  const middle = (top + bottom) / 2 / TILE;
  return {
    center: {
      lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * middle))) * 180) / Math.PI,
      lng: (area.west + area.east) / 2,
    },
    zoom: scale > 1 ? Math.floor(Math.log2(scale)) : 0,
  };
}
