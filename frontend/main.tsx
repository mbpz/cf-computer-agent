import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

declare const document: {
  getElementById(id: string): unknown | null;
};

function App() {
  return <main data-frontend-shell="react">Memory Garden</main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("FRONTEND_ROOT_MISSING");
  createRoot(root as Parameters<typeof createRoot>[0]).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
