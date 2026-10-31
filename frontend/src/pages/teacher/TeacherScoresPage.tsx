import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { SectionResults } from "../../components/teacher/SectionResults";
import { SectionManager } from "../../components/teacher/SectionManager";
import { Quiz } from "../../types";

export function TeacherScoresPage({
  view,
}: {
  view: "leaderboard" | "class-list" | "sections";
}) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .listTeacherQuizzes()
      .then((result) => {
        if (active) setQuizzes(result);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Unable to load quizzes.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  return (
    <div className={`qn-page qn-records${view === "class-list" ? " qn-class-list" : ""}`}>
      {loading ? (
        <p role="status" className="text-center py-12 text-slate-500">
          Loading quizzes…
        </p>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-800"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetry((n) => n + 1)}
            className="mt-3 font-semibold underline"
          >
            Try again
          </button>
        </div>
      ) : view === "sections" ? (
        <SectionManager quizzes={quizzes} />
      ) : quizzes.length ? (
        <SectionResults quizzes={quizzes} view={view} />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <h1 className="text-xl font-bold">
            {view === "leaderboard" ? "Leaderboard" : "Class list"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Create a quiz to manage sections and view student scores.
          </p>
          <Link
            to="/teacher/create"
            className="inline-block mt-5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Create quiz
          </Link>
        </div>
      )}
    </div>
  );
}
