import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./auth-context";
import { chooseLoadingQuote, POST_LOGIN_MIN_MS, type LoadingQuote } from "../config/loadingQuotes";
import "../styles/post-login.css";

const PostLoginContext = createContext<{ begin: () => void; ready: () => void } | null>(null);
export const usePostLogin = () => useContext(PostLoginContext);

/** Dashboard data settles under the welcome overlay, including normal error states. */
export function useDashboardReady(loading: boolean) {
  const ready = usePostLogin()?.ready;
  useEffect(() => { if (!loading) ready?.(); }, [loading, ready]);
}
export function PostLoginProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const { pathname } = useLocation();
  const [active, setActive] = useState(false);
  const [elapsed, setElapsed] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [quote, setQuote] = useState<LoadingQuote | null>(null);
  const selected = useRef(false);
  const status = useRef<HTMLDivElement>(null);
  const begin = useCallback(() => {
    selected.current = false;
    setQuote(null); setElapsed(false); setDataReady(false); setActive(true);
  }, []);
  const ready = useCallback(() => { if (active) setDataReady(true); }, [active]);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setElapsed(true), POST_LOGIN_MIN_MS);
    return () => window.clearTimeout(timer);
  }, [active]);
  useEffect(() => {
    if (active && user && !selected.current) {
      selected.current = true;
      setQuote(chooseLoadingQuote(user.role));
    }
  }, [active, user]);
  useEffect(() => {
    // Existing protected deep links retain their own page-specific loading states.
    if (active && pathname !== "/" && pathname !== "/login" && pathname !== "/teacher" && pathname !== "/student") ready();
  }, [active, pathname, ready]);
  useEffect(() => {
    if (!active || !elapsed || !dataReady || isLoading || !user) return;
    setActive(false);
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [active, elapsed, dataReady, isLoading, user]);
  useEffect(() => {
    if (!active) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    status.current?.focus();
    return () => { document.body.style.overflow = overflow; };
  }, [active]);
  // Never keep a signed-out user behind an overlay.
  const visible = active && !!user;
  return <PostLoginContext.Provider value={{ begin, ready }}>
    <div inert={visible} aria-hidden={visible || undefined}>{children}</div>
    {visible && <div ref={status} tabIndex={-1} className="qn-post-login" role="status" aria-live="polite" aria-atomic="true">
      <div className="qn-post-login-stack">
        <img className="qn-post-login-koala" src="/assistant/koala-full-body.png" alt="QuizNa koala holding a notebook and pen" width="120" height="160" />
        {quote && <div className="qn-post-login-quote">
          <p>{quote.text}</p>
          <span>{quote.category === "education" ? `- ${quote.source}` : quote.source}</span>
        </div>}
        <span className="sr-only">Preparing your {user.role === "teacher" ? "teacher" : "student"} dashboard.</span>
        <div className="qn-post-login-progress" aria-hidden="true"><span /></div>
      </div>
    </div>}
  </PostLoginContext.Provider>;
}
