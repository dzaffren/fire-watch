import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HomePage } from "./HomePage";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HomePage />
  </StrictMode>,
);
