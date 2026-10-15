// Stands in for https://maps.googleapis.com/maps/api/js in e2e, so tests never load the real
// map or need a key. It covers only what FireMap uses, with Web Mercator pixel maths so the
// fire layer draws where the real map would. The last view is exposed as window.__fakeMap.
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

  const unproject = ({ x, y }, zoom) => {
    const scale = TILE * 2 ** zoom;
    return new LatLng((Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) * 180) / Math.PI, (x / scale) * 360 - 180);
  };

  class LatLng {
    constructor(lat, lng) {
      this._lat = lat;
      this._lng = lng;
    }
    lat() {
      return this._lat;
    }
    lng() {
      return this._lng;
    }
  }

  class LatLngBounds {
    constructor(sw, ne) {
      this.sw = sw;
      this.ne = ne;
    }
    getSouthWest() {
      return this.sw;
    }
    getNorthEast() {
      return this.ne;
    }
    contains(at) {
      const lat = typeof at.lat === "function" ? at.lat() : at.lat;
      const lng = typeof at.lng === "function" ? at.lng() : at.lng;
      return lat >= this.sw.lat() && lat <= this.ne.lat() && lng >= this.sw.lng() && lng <= this.ne.lng();
    }
  }

  class Map {
    constructor(div, options = {}) {
      this.div = div;
      this.center = { lat: 0, lng: 0 };
      this.zoom = 0;
      this.overlays = new Set();
      this.listeners = new Map();
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
      this.emit("zoom_changed");
      this.changed();
    }
    getZoom() {
      return this.zoom;
    }
    getDiv() {
      return this.div;
    }
    getBounds() {
      const c = project(this.center, this.zoom);
      const w = this.div.clientWidth / 2;
      const h = this.div.clientHeight / 2;
      return new LatLngBounds(unproject({ x: c.x - w, y: c.y + h }, this.zoom), unproject({ x: c.x + w, y: c.y - h }, this.zoom));
    }
    addListener(name, fn) {
      this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
      return { remove: () => this.listeners.set(name, this.listeners.get(name).filter((f) => f !== fn)) };
    }
    emit(name) {
      for (const fn of this.listeners?.get(name) ?? []) fn();
    }
    changed() {
      window.__fakeMap = { center: this.center, zoom: this.zoom, styles: this.options?.styles ?? [] };
      for (const o of this.overlays ?? []) o.draw();
      this.emit("bounds_changed");
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
    LatLng,
    LatLngBounds,
    importLibrary: async (name) => {
      if (name !== "maps") throw new Error(`fake google.maps has no "${name}" library`);
      return { Map, OverlayView };
    },
  };
  window.google = { maps };

  const callback = new URL(document.currentScript.src).searchParams.get("callback");
  if (callback) setTimeout(() => window[callback]());
})();
