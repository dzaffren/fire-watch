import { useEffect, useRef, useState } from "react";
import { canDraw3d, DAY_DETECTIONS, drawFlat, FLAT_WORLD, globeColours, loadGlobe, type GlobeData } from "./globe";
import type { GlobeScene } from "./globeScene";

const FLAT_DOT = 1.5;
const NEAR_FLAT_DOT = 4;
// Each arrow brings that side's ground to the middle, 10 degrees at a time.
const ARROW: Record<string, [number, number]> = {
  ArrowLeft: [10, 0],
  ArrowRight: [-10, 0],
  ArrowUp: [0, 10],
  ArrowDown: [0, -10],
};

interface Props {
  /** True once the reader asks to go to the example fire. */
  atFire: boolean;
  onArrive?: () => void;
  /** Keep the flat map: a phone, a touch screen or no 3D. */
  flat?: boolean;
  /** Nothing turns on its own, and the flight jumps there. */
  still?: boolean;
}

const desktop3d = () => matchMedia("(pointer: fine) and (min-width: 721px)").matches && canDraw3d();
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The fire globe of 14 Oct 2026 (design brief, tier 3). The flat map shows first and holds the space; on desktop the
 * globe loads on its own and takes its place (D76). */
export function FireGlobe({ atFire, onArrive, flat = !desktop3d(), still = reducedMotion() }: Props) {
  const flatCanvas = useRef<HTMLCanvasElement>(null);
  const globeCanvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<GlobeScene | null>(null);
  // The newest callback, so a parent's new function each render doesn't start the flight again.
  const arrive = useRef(onArrive);
  arrive.current = onArrive;
  const [data, setData] = useState<GlobeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [globe, setGlobe] = useState(false);

  useEffect(() => {
    let live = true;
    loadGlobe().then(
      (d) => live && setData(d),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const canvas = flatCanvas.current;
    if (!data || !canvas) return;
    const draw = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      drawFlat(canvas, data, atFire ? data.near.box : FLAT_WORLD, globeColours(), { dot: atFire ? NEAR_FLAT_DOT : FLAT_DOT });
    };
    draw();
    const resized = new ResizeObserver(draw);
    resized.observe(canvas);
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", draw);
    return () => {
      resized.disconnect();
      scheme.removeEventListener("change", draw);
    };
  }, [data, atFire]);

  useEffect(() => {
    const canvas = globeCanvas.current;
    if (!data || flat || !canvas) return;
    let live = true;
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const recolour = () => scene.current?.recolour();
    import("./globeScene").then(
      ({ startGlobe }) => {
        if (live) scene.current = startGlobe(canvas, data, still, () => live && setGlobe(true));
      },
      // Without three.js the flat map stays.
      () => {},
    );
    scheme.addEventListener("change", recolour);
    return () => {
      live = false;
      scheme.removeEventListener("change", recolour);
      scene.current?.dispose();
      scene.current = null;
      setGlobe(false);
    };
  }, [data, flat, still]);

  useEffect(() => {
    if (!atFire || !data) return;
    if (!globe) {
      arrive.current?.();
      return;
    }
    let live = true;
    scene.current?.flyTo().then(() => live && arrive.current?.());
    return () => {
      live = false;
    };
  }, [atFire, data, globe]);

  if (failed) {
    return (
      <div className="globe globe--failed">
        <p className="fw-help">The map of 14 Oct 2026's fires didn't load. The rest of the page works without it.</p>
      </div>
    );
  }

  return (
    <div className="globe" data-shown={globe ? "globe" : "flat"} aria-busy={!data}>
      {!data && <div className="globe-wait" />}
      <canvas
        ref={flatCanvas}
        className="globe-flat"
        role="img"
        aria-label={
          atFire
            ? "Map of the fires around ID-WOOD-CONCESSION-0332 on 14 Oct 2026, with the concession's edge"
            : `World map of the ${DAY_DETECTIONS.toLocaleString("en-GB")} NOAA-20 fire detections on 14 Oct 2026`
        }
        aria-hidden={globe}
      />
      {!flat && (
        <canvas
          ref={globeCanvas}
          className="globe-3d"
          tabIndex={globe ? 0 : -1}
          role="img"
          aria-label={`Globe of the ${DAY_DETECTIONS.toLocaleString("en-GB")} NOAA-20 fire detections on 14 Oct 2026. Drag it, or use the arrow keys, to turn it.`}
          aria-hidden={!globe}
          onKeyDown={(e) => {
            const step = ARROW[e.key];
            if (!step) return;
            e.preventDefault();
            scene.current?.nudge(...step);
          }}
        />
      )}
    </div>
  );
}
