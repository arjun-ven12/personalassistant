import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AgentApp } from "./AgentApp.js";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) {
  throw new Error("Application root is missing");
}

createRoot(root).render(
  <StrictMode>
    <AgentApp />
  </StrictMode>,
);
