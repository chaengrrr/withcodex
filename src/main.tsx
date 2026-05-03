import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// @ts-expect-error Vite query string busts an old development service-worker cache.
import App from "./App.tsx?v=tabbed-20260503";
import "./styles.css?v=tabbed-20260503";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

if ("serviceWorker" in navigator && import.meta.env.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
  });
}
