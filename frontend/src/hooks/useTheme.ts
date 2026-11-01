import { useLocation } from "react-router-dom";
import { useLayoutEffect, useSyncExternalStore } from "react";
export type Theme = "light" | "dark";
const storageKey = "quizna_theme";
const eventName = "quizna:theme";
let publicIsLight = false;
function preferredTheme(): Theme {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* Storage may be blocked. */
  }
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
function currentTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : preferredTheme();
}
function applyTheme(theme: Theme) {
  if (publicIsLight) theme = "light";
  if (document.documentElement.dataset.theme === theme) return;
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(eventName));
}
/** Keep system preference changes active even on the focused quiz screen. */
export function ThemeController() {
  const { pathname } = useLocation();
  useTheme();
  useLayoutEffect(() => {
    publicIsLight = /^\/(?:welcome|login|guide|auth\/confirm)?\/?$/.test(pathname);
    applyTheme(publicIsLight ? "light" : preferredTheme());
    return () => {
      publicIsLight = false;
    };
  }, [pathname]);
  return null;
}
function subscribe(change: () => void) {
  const update = () => change();
  const storage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null)
      applyTheme(preferredTheme());
  };
  const media =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : undefined;
  const system = () => {
    let explicit = false;
    try {
      explicit = ["light", "dark"].includes(
        localStorage.getItem(storageKey) || "",
      );
    } catch {}
    if (!explicit) applyTheme(preferredTheme());
  };
  window.addEventListener(eventName, update);
  window.addEventListener("storage", storage);
  media?.addEventListener?.("change", system);
  return () => {
    window.removeEventListener(eventName, update);
    window.removeEventListener("storage", storage);
    media?.removeEventListener?.("change", system);
  };
}
export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    currentTheme,
    () => "light" as Theme,
  );
  const toggle = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(storageKey, next);
    } catch {}
    applyTheme(next);
  };
  return { theme, toggle };
}
