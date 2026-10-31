import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { api } from "../../api/client";
import type { SubjectQuizView } from "../../types";

export function QuizEntryPage() {
  const { subjectId, quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<SubjectQuizView | null>(null);
  const [section, setSection] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setQuiz(null);
    setSection("");
    setCode("");
    if (!subjectId || !quizId) return;
    api
      .getSubject(subjectId)
      .then((detail) => {
        if (!active) return;
        const selected = detail.quizzes.find((q) => q.id === quizId);
        if (!selected || selected.exam_format === "paper")
          throw Error("This online quiz is not available in this subject.");
        if (!selected.require_access_code && selected.access_code) {
          navigate(`/take/${selected.access_code}`, { replace: true });
          return;
        }
        setQuiz(selected);
        setSection(detail.section_name || "");
      })
      .catch(() => {
        if (active)
          setError(
            "This quiz is unavailable. Return to your subject and try again.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subjectId, quizId, navigate]);
  return (
    <div className="qn-page qn-quiz-entry-page">
      <Link
        to={`/student/subjects/${subjectId}`}
        className="qn-button-secondary"
      >
        <ArrowLeft size={17} /> Back to subject
      </Link>
      <section className="qn-quiz-entry-card" aria-label="Quiz code entry">
        <span className="qn-quiz-entry-icon">
          <LockKeyhole size={25} aria-hidden="true" />
        </span>
        {loading ? (
          <p role="status">Loading quiz…</p>
        ) : (
          <>
            <h1>{quiz?.title || "Quiz unavailable"}</h1>
            {section && <p className="qn-description">{section}</p>}
            {quiz && (
              <p className="qn-quiz-entry-description">
                Enter the quiz code from your teacher.
              </p>
            )}
            {error && (
              <p
                id="quiz-code-error"
                className="qn-alert qn-alert-error"
                role="alert"
              >
                {error}
              </p>
            )}
            {quiz && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (busy || !subjectId || !quizId || !code.trim()) return;
                  setBusy(true);
                  setError("");
                  try {
                    const result = await api.enterSubjectQuiz(
                      subjectId,
                      quizId,
                      code.trim().toUpperCase(),
                    );
                    navigate(`/take/${result.access_code}`, { replace: true });
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "Unable to check this code. Try again.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label htmlFor="quiz-entry-code">Quiz code</label>
                <input
                  id="quiz-entry-code"
                  required
                  maxLength={12}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={code}
                  disabled={busy}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase())
                  }
                  placeholder="Enter quiz code"
                  aria-describedby={error ? "quiz-code-error" : undefined}
                />
                <button
                  className="qn-button-primary"
                  disabled={busy || !code.trim()}
                >
                  {busy ? "Checking…" : "Continue"}
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
