import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { FireGlobe } from "./FireGlobe";
import { drawFlat, FLAT_WORLD, loadGlobe, type GlobeData } from "./globe";
import { startGlobe, type GlobeScene } from "./globeScene";

// jsdom draws no canvas and has no WebGL: the flat map's drawing and the 3D scene are stood in for.
vi.mock("./globe", async (original) => ({ ...(await original<typeof import("./globe")>()), loadGlobe: vi.fn(), drawFlat: vi.fn() }));
vi.mock("./globeScene", () => ({ startGlobe: vi.fn() }));

const DATA: GlobeData = {
  land: [],
  fires: new Float32Array([112.81, -3.09]),
  near: { box: [112.08, -3.59, 113.54, -2.59], fires: [[112.81, -3.09]], concession: [], land: [] },
};
const FAILED = "The map of 14 Oct 2026's fires didn't load. The rest of the page works without it.";

let scene: { [K in keyof GlobeScene]: Mock<GlobeScene[K]> };
let landed: () => void;

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.mocked(loadGlobe).mockResolvedValue(DATA);
  vi.mocked(drawFlat).mockClear();
  scene = {
    flyTo: vi.fn(() => new Promise<void>((done) => (landed = done))),
    nudge: vi.fn(),
    recolour: vi.fn(),
    dispose: vi.fn(),
  };
  vi.mocked(startGlobe).mockReset().mockReturnValue(scene);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const box = (container: HTMLElement) => container.querySelector(".globe") as HTMLElement;
const globe3d = () => screen.queryByRole("img", { name: /^Globe of the 62,489 NOAA-20 fire detections/ });
const callbacks = () => {
  const [, , , onFirstFrame, onSlow] = vi.mocked(startGlobe).mock.lastCall!;
  return { onFirstFrame, onSlow: onSlow! };
};

/** Desktop with WebGL, once the scene has drawn its first frame. */
async function showGlobe(props: Partial<Parameters<typeof FireGlobe>[0]> = {}) {
  const onArrive = vi.fn();
  const view = render(<FireGlobe atFire={false} onArrive={onArrive} flat={false} still={false} {...props} />);
  await waitFor(() => expect(startGlobe).toHaveBeenCalled());
  act(() => callbacks().onFirstFrame());
  expect(box(view.container)).toHaveAttribute("data-shown", "globe");
  return { ...view, onArrive };
}

describe("FireGlobe", () => {
  it("holds the globe's space with a skeleton while the data loads", () => {
    vi.mocked(loadGlobe).mockReturnValue(new Promise(() => {}));
    const { container } = render(<FireGlobe atFire={false} flat={false} still={false} />);

    expect(box(container)).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".globe-wait")).toBeInTheDocument();
  });

  it("says the map didn't load when its data fails", async () => {
    vi.mocked(loadGlobe).mockRejectedValue(new Error("fires-2026-10-14.bin: 404"));
    render(<FireGlobe atFire={false} flat={false} still={false} />);

    expect(await screen.findByText(FAILED)).toBeInTheDocument();
  });

  it("still arrives when the map didn't load, so the example fire's story and pack show", async () => {
    vi.mocked(loadGlobe).mockRejectedValue(new Error("fires-2026-10-14.bin: 404"));
    const onArrive = vi.fn();
    const { rerender } = render(<FireGlobe atFire={false} onArrive={onArrive} flat={false} still={false} />);
    await screen.findByText(FAILED);

    rerender(<FireGlobe atFire onArrive={onArrive} flat={false} still={false} />);

    expect(onArrive).toHaveBeenCalledOnce();
  });

  it("keeps the flat map on a phone or without 3D, and never starts the 3D scene", async () => {
    const { container } = render(<FireGlobe atFire={false} flat still={false} />);

    await waitFor(() => expect(drawFlat).toHaveBeenCalled());
    expect(vi.mocked(drawFlat).mock.lastCall![2]).toBe(FLAT_WORLD);
    expect(box(container)).toHaveClass("globe--flat");
    expect(globe3d()).not.toBeInTheDocument();
    expect(startGlobe).not.toHaveBeenCalled();
  });

  it("arrives at once on the flat map, drawn over the example fire", async () => {
    const onArrive = vi.fn();
    render(<FireGlobe atFire flat still={false} onArrive={onArrive} />);

    await waitFor(() => expect(onArrive).toHaveBeenCalledOnce());
    expect(vi.mocked(drawFlat).mock.lastCall![2]).toBe(DATA.near.box);
  });

  it("fades the globe in after its first frame, and turns it with the arrow keys", async () => {
    await showGlobe();

    fireEvent.keyDown(globe3d()!, { key: "ArrowLeft" });
    fireEvent.keyDown(globe3d()!, { key: "ArrowUp" });
    expect(scene.nudge.mock.calls).toEqual([[10, 0], [0, 10]]);
  });

  it("asks once whether the browser can draw 3D, however often the globe redraws", async () => {
    vi.stubGlobal("matchMedia", (media: string) => ({
      matches: media.includes("pointer: fine"),
      media,
      addEventListener() {},
      removeEventListener() {},
    }));
    const probe = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as WebGL2RenderingContext);
    const onArrive = vi.fn();
    const { container, rerender } = render(<FireGlobe atFire={false} onArrive={onArrive} />);
    await waitFor(() => expect(startGlobe).toHaveBeenCalled());
    act(() => callbacks().onFirstFrame());

    rerender(<FireGlobe atFire onArrive={onArrive} />);
    await act(async () => landed());

    expect(onArrive).toHaveBeenCalledOnce();
    expect(probe.mock.calls.filter(([type]) => type === "webgl2")).toHaveLength(1);
    expect(box(container)).not.toHaveClass("globe--flat");
    expect(box(container)).toHaveAttribute("data-shown", "globe");
    probe.mockRestore();
  });

  it("starts the scene still when the reader asks for reduced motion", async () => {
    render(<FireGlobe atFire={false} flat={false} still />);

    await waitFor(() => expect(startGlobe).toHaveBeenCalled());
    expect(vi.mocked(startGlobe).mock.lastCall![2]).toBe(true);
  });

  it("arrives when the globe's flight ends", async () => {
    const { rerender, onArrive } = await showGlobe();

    rerender(<FireGlobe atFire onArrive={onArrive} flat={false} still={false} />);
    expect(scene.flyTo).toHaveBeenCalledOnce();
    expect(onArrive).not.toHaveBeenCalled();
    await act(async () => landed());
    expect(onArrive).toHaveBeenCalledOnce();
  });

  it("keeps the flat map over the fire when the reader gets there before the globe shows", async () => {
    const onArrive = vi.fn();
    const { container, rerender } = render(<FireGlobe atFire={false} onArrive={onArrive} flat={false} still={false} />);
    await waitFor(() => expect(startGlobe).toHaveBeenCalled());

    rerender(<FireGlobe atFire onArrive={onArrive} flat={false} still={false} />);
    act(() => callbacks().onFirstFrame());

    expect(onArrive).toHaveBeenCalledOnce();
    expect(scene.flyTo).not.toHaveBeenCalled();
    expect(scene.dispose).toHaveBeenCalledOnce();
    expect(box(container)).toHaveAttribute("data-shown", "flat");
    expect(globe3d()).not.toBeInTheDocument();
    expect(vi.mocked(drawFlat).mock.lastCall![2]).toBe(DATA.near.box);
  });

  it("goes back to the flat map for good when the globe runs under 30 fps (D80)", async () => {
    const { container } = await showGlobe();

    act(() => callbacks().onSlow());

    expect(scene.dispose).toHaveBeenCalledOnce();
    expect(box(container)).toHaveAttribute("data-shown", "flat");
    expect(box(container)).not.toHaveClass("globe--flat");
    expect(globe3d()).not.toBeInTheDocument();
    expect(startGlobe).toHaveBeenCalledOnce();
  });

  it("still arrives when the globe goes back to the flat map mid-flight", async () => {
    const { rerender, onArrive } = await showGlobe();
    rerender(<FireGlobe atFire onArrive={onArrive} flat={false} still={false} />);

    act(() => callbacks().onSlow());

    expect(onArrive).toHaveBeenCalledOnce();
    expect(vi.mocked(drawFlat).mock.lastCall![2]).toBe(DATA.near.box);
  });
});
