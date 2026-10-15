// Stands in for https://maps.googleapis.com/maps/api/js in e2e, so tests never load the real
// map or need a key. It covers only what HotspotMap uses, with Web Mercator pixel maths so the
// marker lands where the real map would put it. The last view is exposed as window.__fakeMap.
(() => {
  const TILE = 256;

  const project = ({ lat, lng }, zoom) => {
    const scale = TILE * 2 ** zoom;
    const sin = Math.sin((lat * Math.PI) / 180);
    return {
      x: ((lng + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    };
  };

  class Map {
    constructor(div, options = {}) {
      this.div = div;
      this.center = { lat: 0, lng: 0 };
      this.zoom = 0;
      this.overlays = new Set();
      div.style.background = options.backgroundColor ?? "";
      const overlayLayer = document.createElement("div");
      overlayLayer.style.cssText = "position:absolute;left:50%;top:50%";
      div.append(overlayLayer);
      this.panes = { overlayLayer };
      this.projection = {
        fromLatLngToDivPixel: (at) => {
          const p = project(at, this.zoom);
          const c = project(this.center, this.zoom);
          return { x: p.x - c.x, y: p.y - c.y };
        },
      };
      this.setOptions(options);
    }
    setOptions(options) {
      this.options = { ...this.options, ...options };
      this.changed();
    }
    setCenter(center) {
      this.center = center;
      this.changed();
    }
    getCenter() {
      return this.center;
    }
    setZoom(zoom) {
      this.zoom = zoom;
      this.changed();
    }
    getZoom() {
      return this.zoom;
    }
    getDiv() {
      return this.div;
    }
    changed() {
      window.__fakeMap = { center: this.center, zoom: this.zoom, styles: this.options?.styles ?? [] };
      for (const o of this.overlays ?? []) o.draw();
    }
  }

  class OverlayView {
    setMap(map) {
      if (this.map) {
        this.map.overlays.delete(this);
        this.onRemove();
      }
      this.map = map;
      if (map) {
        map.overlays.add(this);
        this.onAdd();
        this.draw();
      }
    }
    getMap() {
      return this.map ?? null;
    }
    getPanes() {
      return this.map?.panes ?? null;
    }
    getProjection() {
      return this.map?.projection ?? null;
    }
  }

  const maps = {
    Map,
    OverlayView,
    importLibrary: async (name) => {
      if (name !== "maps") throw new Error(`fake google.maps has no "${name}" library`);
      return { Map, OverlayView };
    },
  };
  window.google = { maps };

  const callback = new URL(document.currentScript.src).searchParams.get("callback");
  if (callback) setTimeout(() => window[callback]());
})();
