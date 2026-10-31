import { useEffect, useRef } from "react";

const changed = "quizna-results-updated";
export function announceResultsChange() {
  window.dispatchEvent(new Event(changed));
  try {
    localStorage.setItem(changed, String(Date.now()));
  } catch {
    /* Polling still refreshes other devices. */
  }
}

// Same-device updates are immediate; visible dashboards on other devices refresh
// within ten seconds. Hidden tabs do not keep polling or duplicate requests.
export function useAutoRefresh(
  refresh: () => void | Promise<void>,
  interval = 10000,
) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    let active = true,
      running = false;
    let lastStarted = -Infinity;
    const run = async () => {
      if (
        !active ||
        running ||
        document.visibilityState === "hidden" ||
        navigator.onLine === false ||
        Date.now() - lastStarted < 1000
      )
        return;
      lastStarted = Date.now();
      running = true;
      try {
        await latest.current();
      } catch {
        /* Each screen keeps its own error state. */
      } finally {
        running = false;
      }
    };
    const storage = (e: StorageEvent) => {
      if (e.key === changed) void run();
    };
    const timer = window.setInterval(() => void run(), interval);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    window.addEventListener(changed, run);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", run);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
      window.removeEventListener("online", run);
      window.removeEventListener(changed, run);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", run);
    };
  }, [interval]);
}
