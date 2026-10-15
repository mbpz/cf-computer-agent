// Applies the stored theme before the app renders, so a dark preference never flashes
// the light palette on first paint. Mirrors frontend/lib/theme.ts: same storage key,
// same three values, same class toggle. Loaded synchronously from <head>; the CSP
// allows same-origin scripts, so this needs no inline script.
(function () {
  var mode = "system";
  try {
    var stored = window.localStorage.getItem("memory-garden-theme");
    if (stored === "light" || stored === "dark" || stored === "system") mode = stored;
  } catch (error) {
    // Storage can be unavailable; the system preference still applies.
  }
  var prefersDark = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "system" && prefersDark));
})();
