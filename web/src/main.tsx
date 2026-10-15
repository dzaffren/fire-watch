import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";

// Each page loads only its own modules: the preview runs without the chain settings HomePage needs.
const HomePage = lazy(() => import("./HomePage").then((m) => ({ default: m.HomePage })));
const FireRecordPreview = lazy(() => import("./preview/FireRecordPreview"));
const preview = new URLSearchParams(location.search).get("preview") === "fire-record";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>{preview ? <FireRecordPreview /> : <HomePage />}</Suspense>
  </StrictMode>,
);
