const STORAGE_KEY = "jk-theme";
const listeners = new Set();

// The <head> init script (THEME_INIT_SCRIPT below, wired into index.html)
// runs before this module loads and already set data-theme on <html> — read
// it once here so the first render matches what's actually on screen.
let currentTheme =
  typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";

export function getTheme() {
  return currentTheme;
}

export function getServerTheme() {
  return "light";
}

export function subscribeTheme(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY, theme);
  listeners.forEach((listener) => listener());
}

// Run this exact string inline in index.html's <head>, before hydration, so
// a returning visitor's chosen theme applies before first paint.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)})==="dark"?"dark":"light";document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;