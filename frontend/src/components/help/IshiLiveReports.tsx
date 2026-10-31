import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { api } from "../../api/client";
import {
  liveLabels,
  startIshiRefresh,
  type LiveOptions,
  type LivePlan,
  type LiveReport,
  type LiveTopic,
} from "./ishi-live";
export interface IshiLiveHandle {
  ask: (topic: LiveTopic) => void;
  clear: () => void;
}
export const IshiLiveReports = forwardRef<
  IshiLiveHandle,
  { role: "teacher" | "student"; context: string; onAsk?: () => void }
>(function IshiLiveReports({ role, context, onAsk }, ref) {
  const [options, setOptions] = useState<LiveOptions>({ quizzes: [] });
  const [loading, setLoading] = useState(role === "teacher");
  const [quizId, setQuizId] = useState(""),
    [sectionId, setSectionId] = useState("");
  const [plans, setPlans] = useState<LivePlan[]>([]),
    [reports, setReports] = useState<LiveReport[]>([]);
  const [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const alive = useRef(true);
  const sections = options.quizzes.find((q) => q.id === quizId)?.sections || [];
  useEffect(() => {
    alive.current = true;
    if (role !== "teacher")
      return () => {
        alive.current = false;
      };
    const request = new AbortController();
    setLoading(true);
    api
      .getIshiOptions(request.signal)
      .then((data) => {
        if (request.signal.aborted) return;
        setOptions(data);
        const preferred = data.quizzes.find((q) => context.includes(q.id));
        setQuizId(preferred?.id || data.quizzes[0]?.id || "");
        setError("");
      })
      .catch((e) => {
        if (!request.signal.aborted)
          setError(e.message || "Unable to load your quizzes.");
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => {
      alive.current = false;
      request.abort();
    };
  }, [role, context]);
  useEffect(() => {
    setPlans([]);
    setReports([]);
    setError("");
  }, [quizId, sectionId]);
  const ask = (topic: LiveTopic) => {
    if (loading) {
      setError("Your quizzes are loading. Please try again.");
      return;
    }
    let plan: LivePlan = { topic };
    if (role === "teacher") {
      if (!quizId) {
        setError("Create a quiz first, then open live reports.");
        return;
      }
      if (topic === "gradebook") {
        const classId = sections.find((s) => s.id === sectionId)?.classId;
        if (!classId) {
          setError("Choose a linked section above to see its totals.");
          return;
        }
        plan = { topic, classId };
      } else plan = { topic, quizId, ...(sectionId ? { sectionId } : {}) };
    }
    setError("");
    setReports([]);
    onAsk?.();
    setShowAllRows(false);
    setPlans([plan]);
    setRefresh((n) => n + 1);
  };
  useImperativeHandle(ref, () => ({
    ask,
    clear: () => {
      setPlans([]);
      setReports([]);
      setError("");
      setBusy(false);
    },
  }));
  useEffect(() => {
    if (!plans.length) return;
    return startIshiRefresh({
      load: async (signal) => {
        if (alive.current) setBusy(true);
        return Promise.all(
          plans.map((plan) => api.getIshiReport(plan, signal)),
        );
      },
      apply: (data) => {
        setReports((old) =>
          JSON.stringify(old) === JSON.stringify(data) ? old : data,
        );
        setError("");
        setBusy(false);
      },
      error: (cause) => {
        setReports([]);
        setBusy(false);
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to refresh live reports.",
        );
      },
    });
  }, [plans, refresh]);
  const topics: LiveTopic[] =
    role === "teacher"
      ? [
          "submissions",
          "not_started",
          "in_progress",
          "grading",
          "leaderboard",
          "gradebook",
        ]
      : ["results", "performance"];
  return (
    <section className="ishi-live" aria-label="Live dashboard reports">
      <h3>Live dashboard</h3>
      {role === "teacher" && (
        <div className="ishi-scope">
          <label>
            Quiz
            <select
              aria-label="Ishi report quiz"
              value={quizId}
              disabled={loading}
              onChange={(e) => {
                setQuizId(e.target.value);
                setSectionId("");
              }}
            >
              <option value="">
                {loading ? "Loading quizzes…" : "Choose quiz"}
              </option>
              {options.quizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Section
            <select
              aria-label="Ishi report section"
              value={sectionId}
              disabled={!quizId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">All sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="ishi-live-topics">
        {topics.map((topic) => (
          <button key={topic} type="button" onClick={() => ask(topic)}>
            {liveLabels[topic]}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="ishi-live-error">
          {error}
        </p>
      )}
      {plans.length > 0 && (
        <div className="ishi-live-status">
          <span role="status">{busy ? "Checking…" : "Live updates on"}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRefresh((n) => n + 1)}
          >
            Refresh
          </button>
        </div>
      )}
      <div aria-live="polite" aria-relevant="additions text">
        {reports.map((report) => (
          <article key={report.topic} className="ishi-live-report">
            <h4>{liveLabels[report.topic as LiveTopic]}</h4>
            {report.title !== liveLabels[report.topic as LiveTopic] && (
              <p className="ishi-live-context">{report.title}</p>
            )}
            <p>{report.summary}</p>
            {report.rows.length ? (
              <ul>
                {(showAllRows ? report.rows : report.rows.slice(0, 5)).map(
                  (row, i) => (
                    <li key={`${row.name}-${i}`}>
                      <strong>{row.name}</strong>
                      <span>{row.detail}</span>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p>No matching records.</p>
            )}
            {report.rows.length > 5 && (
              <button
                type="button"
                className="ishi-browse"
                onClick={() => setShowAllRows(!showAllRows)}
              >
                {showAllRows
                  ? "Show fewer"
                  : `Show ${report.rows.length - 5} more`}
              </button>
            )}
            {report.truncated && (
              <p>
                Showing 100 of {report.total}. Open the full dashboard for the
                complete list.
              </p>
            )}
            <small>
              Checked{" "}
              <time dateTime={report.checkedAt}>
                {new Date(report.checkedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </small>
          </article>
        ))}
      </div>
    </section>
  );
});
