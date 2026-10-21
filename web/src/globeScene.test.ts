import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlobeData } from "./globe";
import { startGlobe, type GlobeScene } from "./globeScene";

// jsdom has no WebGL and no 2D canvas: the renderer and the texture drawing are stood in for, and the test hands out
// the frames itself.
vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  WebGLRenderer: class {
    capabilities = { getMaxAnisotropy: () => 1 };
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() {}
  },
}));
vi.mock("./globe", async (original) => ({
  ...(await original<typeof import("./globe")>()),
  drawFlat: vi.fn(),
  globeColours: () => ({ sea: "rgb(255, 255, 255)", land: "rgb(231, 235, 228)", coast: "rgb(139, 145, 137)", fire: "rgb(194, 65, 12)", edge: "rgb(31, 36, 33)", inside: "rgba(31, 36, 33, 0.06)" }),
}));

const DATA: GlobeData = {
  land: [],
  fires: new Float32Array([112.81, -3.09]),
  near: { box: [112.08, -3.59, 113.54, -2.59], fires: [[112.81, -3.09]], concession: [], land: [] },
};

let tick: FrameRequestCallback;
let scene: GlobeScene;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => ((tick = callback), 1));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  scene.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Starts the globe and draws its first frame, then hands out frames at these gaps in ms. */
function run(gaps: number[]) {
  const onFirstFrame = vi.fn();
  const onSlow = vi.fn();
  scene = startGlobe(document.createElement("canvas"), DATA, false, onFirstFrame, onSlow);
  let now = performance.now();
  const frames = (more: number[]) => more.forEach((gap) => tick((now += gap)));
  tick(now);
  frames(gaps);
  return { onFirstFrame, onSlow, frames };
}

describe("startGlobe's 30 fps check (D80)", () => {
  it("calls onSlow once when its first 2 s run at 20 fps", () => {
    const { onFirstFrame, onSlow, frames } = run(Array(39).fill(50));
    expect(onFirstFrame).toHaveBeenCalledOnce();
    expect(onSlow).not.toHaveBeenCalled();

    frames(Array(100).fill(50));

    expect(onSlow).toHaveBeenCalledOnce();
  });

  it("leaves the globe alone at 30 fps", () => {
    const { onSlow } = run(Array(120).fill(1000 / 30));

    expect(onSlow).not.toHaveBeenCalled();
  });

  it("doesn't count a tab in the background as slow: a frame counts 100 ms at most (O13)", () => {
    const { onSlow } = run([...Array(30).fill(16), 10_000, ...Array(120).fill(16)]);

    expect(onSlow).not.toHaveBeenCalled();
  });
});
