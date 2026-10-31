import confetti from "canvas-confetti";
import {
  ArrowLeft,
  Award,
  BookOpen,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";

export const QuizResultPage: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const celebrated = useRef(false);
  useEffect(() => {
    let active = true;
    let fetching = false;
    const fetchResult = async () => {
      if (!attemptId || fetching) return;
      fetching = true;
      try {
        const res = await api.getStudentResult(attemptId);
        if (!active) return;
        setData(res);
        setError(null);

        // Confetti celebration if scored well and score is visible
        if (
          !celebrated.current &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
          res.attempt.score !== null &&
          res.attempt.max_score > 0 &&
          res.attempt.score / res.attempt.max_score >= 0.75
        ) {
          celebrated.current = true;
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 },
          });
        }
      } catch (err: any) {
        if (active) setError(err.message || "Unable to load results.");
      } finally {
        fetching = false;
        if (active) setLoading(false);
      }
    };

    void fetchResult();
    const timer = window.setInterval(() => {
      if (!document.hidden) void fetchResult();
    }, 10000);
    window.addEventListener("focus", fetchResult);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", fetchResult);
    };
  }, [attemptId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-sm text-rose-600">
          {error || "Results not available"}
        </p>
        <Link
          to="/student"
          className="inline-block px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const { attempt, quiz, breakdown, receipt } = data;
  const isScoreVisible = attempt.score !== null && attempt.score !== undefined;
  const percentage =
    isScoreVisible && attempt.max_score > 0
      ? Math.round((attempt.score / attempt.max_score) * 100)
      : null;

  return (
    <div className="qn-page qn-records qn-page-reading qn-student-result space-y-6">
      {/* Return button */}
      <Link
        to="/student"
        className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>My subjects</span>
      </Link>

      {/* Main Result Hero Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
          <Award className="w-7 h-7" />
        </div>

        <h1 className="qn-title">{quiz.title}</h1>

        {/* Status Pill */}
        <div className="inline-block">
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${
              attempt.status === "terminated_violation"
                ? "bg-rose-100 text-rose-800"
                : attempt.status === "timed_out"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {attempt.status === "terminated_violation"
              ? "Stopped after warnings"
              : attempt.status === "timed_out"
                ? "Time ended"
                : attempt.status === "in_progress"
                  ? "In progress"
                  : "Submitted"}
          </span>
        </div>

        {/* Score Display */}
        {isScoreVisible ? (
          <div className="py-2">
            <p className="text-4xl font-extrabold text-slate-900">
              {attempt.score}{" "}
              <span className="text-xl text-slate-400 font-medium">
                / {attempt.max_score}
              </span>
            </p>
            <p className="text-sm font-semibold text-indigo-600 mt-1">
              Score: {percentage}%
            </p>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 max-w-md mx-auto">
            <Sparkles className="w-4 h-4 text-indigo-500 inline mr-1" />
            Submitted. Your score will appear when your teacher releases it.
          </div>
        )}

        {attempt.warning_count > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 py-1.5 px-3 rounded-lg inline-block">
            {attempt.warning_count} focus{" "}
            {attempt.warning_count === 1
              ? "incident recorded"
              : "incidents recorded"}
            .
          </p>
        )}
      </div>

      {receipt && (
        <section
          aria-labelledby="receipt-heading"
          className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="w-5 h-5" />
            <h2 id="receipt-heading" className="font-bold">
              {receipt.finalized
                ? "Submission receipt"
                : "Attempt still in progress"}
            </h2>
          </div>
          <p className="text-sm text-slate-600">
            {receipt.answeredCount} of {receipt.totalQuestions} answers saved
            {receipt.finalizedAt
              ? ` · ${new Date(receipt.finalizedAt).toLocaleString()}`
              : ""}
            .
          </p>
          {!receipt.finalized && (
            <Link
              to={`/take/${quiz.access_code}`}
              className="text-sm font-semibold text-indigo-700"
            >
              Resume quiz
            </Link>
          )}
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">Submission details</summary>
            <p className="mt-2 break-all">Reference: {receipt.reference}</p>
            <p>Deadline: {new Date(receipt.deadlineAt).toLocaleString()}</p>
          </details>
          {receipt.incidents.length > 0 && (
            <details className="text-sm border-t border-slate-100 pt-3">
              <summary className="cursor-pointer font-semibold text-slate-700">
                Recorded focus incidents
              </summary>
              <p className="text-xs text-slate-500 my-2">
                These are possible violations, not proof of cheating. Contact
                your teacher if a technical issue caused an incident.
              </p>
              <ol className="space-y-2">
                {receipt.incidents.map((i: any, idx: number) => (
                  <li
                    key={idx}
                    className="flex flex-wrap justify-between gap-2 text-xs text-slate-600"
                  >
                    <span>
                      Warning {i.warningNumber} · {i.type.replaceAll("_", " ")}
                    </span>
                    <time>{new Date(i.occurredAt).toLocaleString()}</time>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}
      {/* Question Review Breakdown */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
          <BookOpen className="w-4 h-4 text-indigo-600" />
          <span>Question Review</span>
        </h2>

        <div className="space-y-3">
          {breakdown.map((item: any, idx: number) => (
            <div
              key={item.question_id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">
                  Question {idx + 1}
                </span>
                {item.score_awarded !== null &&
                  item.score_awarded !== undefined && (
                    <span className="text-xs font-semibold text-indigo-600">
                      {item.score_awarded} / {item.points} pts
                    </span>
                  )}
              </div>

              <p className="text-sm font-medium text-slate-800">
                {item.prompt}
              </p>

              {/* Student answer */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <span className="font-semibold text-slate-500 block">
                  Your Response:
                </span>
                <span className="text-slate-900 whitespace-pre-wrap">
                  {item.student_answer
                    ? String(item.student_answer)
                    : "No answer recorded"}
                </span>
              </div>

              {/* Teacher feedback */}
              {item.teacher_feedback && (
                <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs text-indigo-900">
                  <strong className="block mb-1">Teacher feedback</strong>
                  <p className="whitespace-pre-line">{item.teacher_feedback}</p>
                </div>
              )}

              {/* Correct answer & explanation if released */}
              {item.correct_answer !== null &&
                item.correct_answer !== undefined && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                    <div>
                      <strong>Correct Answer:</strong>{" "}
                      <span className="font-mono">
                        {Array.isArray(item.correct_answer)
                          ? item.correct_answer.join(", ")
                          : String(item.correct_answer)}
                      </span>
                    </div>
                    {item.explanation && (
                      <p className="text-emerald-800 text-[11px] pt-1 border-t border-emerald-100">
                        <strong>Explanation:</strong> {item.explanation}
                      </p>
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
