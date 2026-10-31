import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { api } from "../../api/client";
import { PageHeading, StatusBadge } from "../../components/common/WorkspaceUi";
import "../../styles/reports.css";
import { QuestionAnalysis, Quiz, QuizSection } from "../../types";

export function QuestionAnalysisPage({
  context,
}: { context?: { quiz: Quiz; sectionId: string } } = {}) {
  const [params, setParams] = useSearchParams();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizId, setQuizId] = useState(
    context?.quiz.id || params.get("quiz") || "",
  );
  const [sectionId, setSectionId] = useState(
    context?.sectionId || params.get("section") || "",
  );
  const [data, setData] = useState<QuestionAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [sections, setSections] = useState<QuizSection[]>([]);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (context) {
      setQuizzes([context.quiz]);
      setLoadingQuizzes(false);
      return;
    }
    let active = true;
    setError("");
    setLoadingQuizzes(true);
    api
      .listTeacherQuizzes()
      .then((rows) => {
        if (!active) return;
        const available = rows.filter((q) => q.status !== "draft");
        setQuizzes(available);
        setQuizId((id) =>
          available.some((q) => q.id === id) ? id : available[0]?.id || "",
        );
      })
      .catch(() => {
        if (active) setError("Unable to load analysis. Please try again.");
      })
      .finally(() => {
        if (active) setLoadingQuizzes(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    setData(null);
    if (!quizId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api
      .getQuestionAnalysis(quizId, sectionId)
      .then((result) => {
        if (active) {
          setData(result);
          setSections(result.sections);
        }
      })
      .catch(() => {
        if (active) setError("Unable to load analysis. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [quizId, sectionId, refresh]);
  const types: Record<string, string> = {
    mcq: "Multiple choice",
    true_false: "True / False",
    short_answer: "Short answer",
    essay: "Essay",
  };
  return (
    <div
      className={`${context ? "" : "qn-page "}qn-records qn-analysis space-y-5`}
    >
      {!context && (
        <PageHeading
          title="Question analysis"
          description="See which questions need a review."
          actions={
            <Link to="/teacher/gradebook" className="qn-button-secondary">
              Section gradebook
            </Link>
          }
        />
      )}
      <div className="qr-filters">
        {!context && (
          <>
            <label>
              Quiz
              <select
                aria-label="Analysis quiz"
                value={quizId}
                disabled={loadingQuizzes}
                onChange={(e) => {
                  setSectionId("");
                  setSections([]);
                  setQuizId(e.target.value);
                  setParams({ quiz: e.target.value }, { replace: true });
                }}
              >
                {!quizzes.length && <option value="">Choose a quiz</option>}
                {quizzes.map((q) => (
                  <option value={q.id} key={q.id}>
                    {q.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Section
              <select
                aria-label="Analysis section"
                value={sectionId}
                disabled={!quizId}
                onChange={(e) => {
                  setSectionId(e.target.value);
                  setParams(
                    {
                      quiz: quizId,
                      ...(e.target.value ? { section: e.target.value } : {}),
                    },
                    { replace: true },
                  );
                }}
              >
                <option value="">All sections</option>
                <option value="unassigned">Unassigned</option>
                {sections.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button
          type="button"
          aria-label="Refresh analysis"
          disabled={loading || loadingQuizzes}
          onClick={() => setRefresh((n) => n + 1)}
          className="qn-button-secondary"
        >
          <RefreshCw size={18} aria-hidden="true" />
          Refresh
        </button>
      </div>
      {error && (
        <div role="alert" className="qn-alert qn-alert-error">
          {error}
          <button
            type="button"
            onClick={() => setRefresh((n) => n + 1)}
            className="ml-3 underline"
          >
            Try again
          </button>
        </div>
      )}
      {loading || loadingQuizzes ? (
        <p role="status" className="qr-note">
          Loading analysis…
        </p>
      ) : !data?.rows.length ? (
        <div className="qr-panel p-8 qr-note">
          {quizzes.length
            ? "No submitted answers for this selection yet."
            : "Publish a quiz and collect answers to see question analysis."}
        </div>
      ) : (
        <>
          <div className="qr-summary">
            <div>
              <span>Students submitted</span>
              <strong>{data.submittedCount}</strong>
            </div>
            <div>
              <span>Questions</span>
              <strong>{data.rows.length}</strong>
            </div>
            <div>
              <span>Below 50% average</span>
              <strong>
                {
                  data.rows.filter(
                    (q) => q.averagePercent !== null && q.averagePercent < 50,
                  ).length
                }
              </strong>
            </div>
            <div>
              <span>Answers to grade</span>
              <strong>
                {data.rows.reduce((sum, q) => sum + q.pending, 0)}
              </strong>
            </div>
          </div>
          <p className="qr-note">
            Hardest questions first. Latest submission per student and section;
            editions stay separate. Averages exclude ungraded answers.
          </p>
          <div className="qr-panel">
            <table className="qr-table qr-analysis-table">
              <caption className="sr-only">
                Question analysis for {data.quiz.title}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Question</th>
                  <th scope="col">Full credit</th>
                  <th scope="col">Unanswered</th>
                  <th scope="col">Average</th>
                  <th scope="col">To grade</th>
                  <th scope="col">Common wrong answers</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((q) => (
                  <tr key={q.id}>
                    <th scope="row">
                      <span className="qr-question-title">
                        <strong>Q{q.order + 1}</strong> ·{" "}
                        {types[q.type] || q.type}
                      </span>
                      <span className="qr-meta">
                        Edition {q.version} · {q.points}{" "}
                        {q.points === 1 ? "point" : "points"}
                      </span>
                      <details>
                        <summary>View question</summary>
                        <p className="whitespace-pre-wrap">{q.prompt}</p>
                      </details>
                    </th>
                    <td data-label="Full credit">
                      {q.graded ? (
                        <>
                          <strong>
                            {q.fullCredit}/{q.graded}
                          </strong>
                          <span className="qr-meta">graded answers</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="Unanswered">{q.unanswered}</td>
                    <td data-label="Average">
                      <span
                        className={
                          q.averagePercent !== null && q.averagePercent < 50
                            ? "qr-review"
                            : "font-semibold"
                        }
                      >
                        {q.averagePercent === null
                          ? "—"
                          : `${q.averagePercent}%`}
                      </span>
                    </td>
                    <td data-label="To grade">
                      {q.pending ? (
                        <StatusBadge>{q.pending} pending</StatusBadge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="Common wrong answers">
                      {q.type === "essay" ? (
                        <span className="qr-meta">Teacher-graded</span>
                      ) : q.commonWrong.length ? (
                        q.commonWrong.map((wrong, index) => (
                          <div className="qr-wrong-answer" key={index}>
                            {wrong.answer}
                            <span className="qr-meta">
                              {wrong.count}{" "}
                              {wrong.count === 1 ? "student" : "students"}
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className="qr-meta">None recorded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
