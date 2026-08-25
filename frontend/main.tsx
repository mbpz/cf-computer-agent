import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import { App } from "./app";

declare const document: {
  getElementById(id: string): unknown | null;
};

const root = document.getElementById("root");
if (!root) throw new Error("FRONTEND_ROOT_MISSING");
  createRoot(root as Parameters<typeof createRoot>[0]).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
