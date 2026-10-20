import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  ShapeUtils,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from "three";
import { drawFlat, EXAMPLE_FIRE, globeColours, WORLD, type GlobeData, type Point } from "./globe";

/** The tier 3 fire globe (design brief; D3, D76, D77). Loaded on its own module, so phones never download three.js. */

const DEG = Math.PI / 180;
// One turn a minute (design brief).
const TURN_PER_MS = (2 * Math.PI) / 60_000;
const FLIGHT_MS = 2400;
const FOV = 30;
// Over the 0332 fire the view is 0.6° tall, about 65 km, in earth radii from the centre.
const NEAR = 1.0195;
const FIRE_DOT = 2;
const NEAR_DOT = 5;
const MAX_PITCH = 70 * DEG;
// The texture is the flat map's land and sea, wrapped round the sphere. Over the fire a sharper patch of the same
// map covers the near box, where the world texture would be stretched a hundredfold.
const TEXTURE_WIDTH = 4096;
const PATCH_WIDTH = 2048;
// The brief's floor of 30 fps, judged over the globe's first 2 s of frames (D80).
const CHECK_MS = 2000;
const MIN_FRAMES = 60;

interface Flight {
  from: { yaw: number; pitch: number; distance: number };
  started: number;
  done: () => void;
}

export interface GlobeScene {
  /** Turns to the example fire and closes in; resolves on arrival. */
  flyTo(): Promise<void>;
  /** Turns by these degrees, from the arrow keys. */
  nudge(yaw: number, pitch: number): void;
  recolour(): void;
  dispose(): void;
}

/** A point on the sphere where SphereGeometry's texture puts it. */
function onSphere([lon, lat]: Point, r: number): [number, number, number] {
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  return [-Math.cos(phi) * Math.sin(theta) * r, Math.cos(theta) * r, Math.sin(phi) * Math.sin(theta) * r];
}

// The turn that brings a place to face the camera.
const facing = ([lon, lat]: Point) => ({ yaw: -(90 + lon) * DEG, pitch: lat * DEG });

// A token as the browser resolved it, split into a colour and its alpha.
function colourOf(css: string): { color: Color; alpha: number } {
  const [r, g, b, a] = (css.match(/[\d.]+/g) ?? []).map(Number);
  return { color: new Color(`rgb(${r}, ${g}, ${b})`), alpha: a ?? 1 };
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const part = (t: number, from: number, to: number) => Math.min(1, Math.max(0, (t - from) / (to - from)));

// An opaque disc that rounds each dot; the dots take their colour from the material.
function roundDot(): CanvasTexture {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const dx = (i % size) - size / 2 + 0.5;
    const dy = Math.floor(i / size) - size / 2 + 0.5;
    if (dx * dx + dy * dy <= (size / 2) ** 2) image.data.fill(255, i * 4, i * 4 + 4);
  }
  ctx.putImageData(image, 0, 0);
  return new CanvasTexture(canvas);
}

export function startGlobe(
  canvas: HTMLCanvasElement,
  data: GlobeData,
  still: boolean,
  onFirstFrame: () => void,
  onSlow: () => void,
): GlobeScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  const ratio = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(ratio);
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.001, 20);
  const globe = new Group();
  scene.add(globe);

  const land = document.createElement("canvas");
  land.width = TEXTURE_WIDTH;
  land.height = TEXTURE_WIDTH / 2;
  const texture = new CanvasTexture(land);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sphere = new Mesh(new SphereGeometry(1, 128, 64), new MeshBasicMaterial({ map: texture }));
  globe.add(sphere);

  const [west, south, east, north] = data.near.box;
  const local = document.createElement("canvas");
  local.width = PATCH_WIDTH;
  local.height = Math.round((PATCH_WIDTH * (north - south)) / (east - west));
  const localTexture = new CanvasTexture(local);
  localTexture.colorSpace = SRGBColorSpace;
  const patch = new Mesh(
    new SphereGeometry(
      1.0002, 32, 32, (west + 180) * DEG, (east - west) * DEG, (90 - north) * DEG, (north - south) * DEG,
    ),
    new MeshBasicMaterial({ map: localTexture }),
  );
  globe.add(patch);

  const positions: number[] = [];
  for (let i = 0; i < data.fires.length; i += 2) positions.push(...onSphere([data.fires[i], data.fires[i + 1]], 1.002));
  const dot = roundDot();
  const fires = new Points(
    new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3)),
    new PointsMaterial({ size: FIRE_DOT * ratio, sizeAttenuation: false, map: dot, alphaTest: 0.5 }),
  );
  globe.add(fires);

  // ID-WOOD-CONCESSION-0332 as on every map: a dashed edge over a faint tint inside (D29).
  // About 4 px on and 3 px off over the fire, as the flat map draws it.
  const edges = new LineDashedMaterial({ dashSize: 5.5e-5, gapSize: 4e-5 });
  const inside = new MeshBasicMaterial({ transparent: true, depthWrite: false });
  for (const ring of data.near.concession) {
    const points = ring.slice(0, -1);
    const along = new Float32BufferAttribute(ring.flatMap((p) => onSphere(p, 1.0006)), 3);
    const edge = new Line(new BufferGeometry().setAttribute("position", along), edges);
    edge.computeLineDistances();
    const faces = ShapeUtils.triangulateShape(points.map(([x, y]) => new Vector2(x, y)), []);
    const tint = new Mesh(
      new BufferGeometry()
        .setAttribute("position", new Float32BufferAttribute(points.flatMap((p) => onSphere(p, 1.0004)), 3))
        .setIndex(faces.flat()),
      inside,
    );
    globe.add(tint, edge);
  }

  function recolour() {
    const colours = globeColours();
    // About 1 px on screen, in each texture's own scale.
    drawFlat(land, data, WORLD, colours, { coast: 3 });
    drawFlat(local, data, data.near.box, colours, { coast: 2 });
    texture.needsUpdate = true;
    localTexture.needsUpdate = true;
    fires.material.color = colourOf(colours.fire).color;
    edges.color = colourOf(colours.edge).color;
    const tint = colourOf(colours.inside);
    inside.color = tint.color;
    inside.opacity = tint.alpha;
  }
  recolour();

  // It opens over Indonesia and turns as the earth does, so the ground moves east and the west comes into view.
  let { yaw, pitch } = facing([125, 0]);
  let far = 4;
  let distance = far;
  let turning = !still;
  let flight: Flight | null = null;
  let drag: { x: number; y: number } | null = null;
  let visible = true;
  let last = performance.now();
  let first = true;
  let watched = 0;
  let frames = 0;

  function fit() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // The whole globe fits the narrower side, with a small margin.
    const half = Math.min(FOV / 2, (Math.atan(Math.tan((FOV / 2) * DEG) * camera.aspect) / DEG)) * DEG;
    const fitted = 1.04 / Math.sin(half);
    if (distance === far) distance = fitted;
    far = fitted;
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(now - last, 100);
    last = now;
    if (!visible) return;
    if (flight) {
      const t = part(now - flight.started, 0, FLIGHT_MS);
      const to = facing(EXAMPLE_FIRE);
      const turn = easeInOut(part(t, 0, 0.6));
      const close = easeInOut(part(t, 0.2, 1));
      yaw = flight.from.yaw + (to.yaw - flight.from.yaw) * turn;
      pitch = flight.from.pitch + (to.pitch - flight.from.pitch) * turn;
      // Closing in on a log scale keeps the speed even as the ground comes near.
      const from = Math.log(flight.from.distance - 1);
      distance = 1 + Math.exp(from + (Math.log(NEAR - 1) - from) * close);
      fires.material.size = (FIRE_DOT + (NEAR_DOT - FIRE_DOT) * close) * ratio;
      if (t === 1) {
        flight.done();
        flight = null;
      }
    } else if (turning && !drag) {
      yaw += TURN_PER_MS * dt;
    }
    globe.rotation.set(pitch, yaw, 0);
    camera.position.set(0, 0, distance);
    renderer.render(scene, camera);
    if (first) {
      first = false;
      onFirstFrame();
    } else if (watched < CHECK_MS) {
      // Summed from the capped frame times, so a tab in the background doesn't count as slow.
      watched += dt;
      frames++;
      if (watched >= CHECK_MS && frames < MIN_FRAMES) onSlow();
    }
  }

  // Dragging moves the ground under the pointer by about as far as the pointer moved.
  const perPixel = () => (2 * (distance - 1) * Math.tan((FOV / 2) * DEG)) / (canvas.clientHeight || 1);
  const turn = (dYaw: number, dPitch: number) => {
    yaw += dYaw;
    pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch + dPitch));
  };
  const down = (e: PointerEvent) => {
    if (flight) return;
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    turn((e.clientX - drag.x) * perPixel(), (e.clientY - drag.y) * perPixel());
    drag = { x: e.clientX, y: e.clientY };
  };
  const up = () => {
    drag = null;
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  const resized = new ResizeObserver(fit);
  resized.observe(canvas);
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  seen.observe(canvas);
  fit();
  let frame = requestAnimationFrame(tick);

  return {
    flyTo() {
      turning = false;
      drag = null;
      const to = facing(EXAMPLE_FIRE);
      // The shorter way round.
      yaw = to.yaw + ((((yaw - to.yaw) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      if (still) {
        ({ yaw, pitch } = to);
        distance = NEAR;
        fires.material.size = NEAR_DOT * ratio;
        return Promise.resolve();
      }
      return new Promise((done) => {
        flight = { from: { yaw, pitch, distance }, started: performance.now(), done };
      });
    },
    nudge(dYaw, dPitch) {
      if (!flight) turn(dYaw * DEG, dPitch * DEG);
    },
    recolour,
    dispose() {
      cancelAnimationFrame(frame);
      resized.disconnect();
      seen.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      globe.traverse((o) => {
        if (o instanceof Mesh || o instanceof Line || o instanceof Points) o.geometry.dispose();
      });
      [sphere.material, patch.material, fires.material, edges, inside].forEach((m) => m.dispose());
      texture.dispose();
      localTexture.dispose();
      dot.dispose();
      renderer.dispose();
    },
  };
}
