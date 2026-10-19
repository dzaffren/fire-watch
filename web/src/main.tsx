import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { FireRecordPage } from "./FireRecordPage";
import "./styles/app.css";

const today = new Date().toISOString().slice(0, 10);
const params = new URLSearchParams(location.search);

// Each page loads only its own modules: the preview runs without the chain settings the API source needs.
const HomePage = lazy(() =>
  import("./api").then(({ apiSource }) => ({ default: () => <FireRecordPage source={apiSource} today={today} /> })),
);
// A complaint pack's public link (D34).
const PackPage = lazy(() =>
  Promise.all([import("./api"), import("./ComplaintPack")]).then(([{ packRef, packSource }, { ComplaintPack }]) => ({
    default: () => <ComplaintPack source={packSource} packRef={packRef(params)} />,
  })),
);
// Development only, so the previews' made-up hashes never reach the public site.
const PREVIEWS = import.meta.env.DEV
  ? {
      "fire-origin": lazy(() => import("./preview/FireOriginPreview")),
      "complaint-pack": lazy(() => import("./preview/ComplaintPackPreview")),
      "spread-forecast": lazy(() => import("./preview/SpreadForecastPreview")),
      "season-backtest": lazy(() => import("./preview/SeasonBacktestPreview")),
    }
  : null;
const Preview = PREVIEWS?.[params.get("preview") as keyof typeof PREVIEWS] ?? null;
const Page = Preview ?? (params.has("pack") ? PackPage : HomePage);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
);
