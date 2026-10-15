import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { FireRecordPage } from "./FireRecordPage";
import "./styles/app.css";

const today = new Date().toISOString().slice(0, 10);

// Each page loads only its own modules: the preview runs without the chain settings the API source needs.
const HomePage = lazy(() =>
  import("./api").then(({ apiSource }) => ({ default: () => <FireRecordPage source={apiSource} today={today} /> })),
);
// Development only, so the preview's made-up hashes never reach the public site.
const FireRecordPreview = import.meta.env.DEV ? lazy(() => import("./preview/FireRecordPreview")) : null;
const preview = new URLSearchParams(location.search).get("preview") === "fire-record";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>{FireRecordPreview && preview ? <FireRecordPreview /> : <HomePage />}</Suspense>
  </StrictMode>,
);
