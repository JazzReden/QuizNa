import { useDashboardReady } from "../../context/PostLoginContext";
import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../../api/client";
import { QuizAttempt } from "../../types";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { KeyRound, ArrowRight, BookOpen, ChevronRight } from "lucide-react";
import {
  PageHeading,
  EmptyState,
  StatusBadge,
} from "../../components/common/WorkspaceUi";

export const StudentDashboard: React.FC = () => {
  const [accessCode, setAccessCode] = useState("");
  const [myAttempts, setMyAttempts] = useState<QuizAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(true);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  useDashboardReady(loadingAttempts);
  useAutoRefresh(async () => {
    setMyAttempts(await api.getMyAttempts());
  });

  useEffect(() => {
    const fetchAttempts = async () => {
      try {
        const data = await api.getMyAttempts();
        setMyAttempts(data);
      } catch (err: any) {
        setError("Unable to load your quizzes. Please reload and try again.");
      } finally {
        setLoadingAttempts(false);
      }
    };
    fetchAttempts();
  }, []);

  const handleJoinQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = accessCode.trim().toUpperCase();
    if (!code) {
      setError("Please enter a valid access code");
      return;
    }

    setVerifyingCode(true);
    setError(null);

    try {
      // Check quiz validity
      await api.getQuizByAccessCode(code);
      // Navigate to Quiz taking view
      navigate(`/take/${code}`);
    } catch (err: any) {
      setError(err.message || "Quiz not found or currently unavailable");
    } finally {
      setVerifyingCode(false);
    }
  };

  return (
    <div className="qn-page qn-page-narrow qn-dashboard qn-home-dashboard qn-student-home space-y-7">
      <PageHeading
        title="My quizzes"
        description="Your quizzes, progress, and released results."
      />
      <section className="qn-join-panel" aria-labelledby="join-heading">
        <div>
          <p className="qn-eyebrow">Ready for your next quiz?</p>
          <h2
            id="join-heading"
            className="text-2xl font-semibold tracking-tight"
          >
            Join a quiz
          </h2>
          <p className="qn-description">Enter the code from your teacher.</p>
        </div>
        <form
          onSubmit={handleJoinQuiz}
          className="flex flex-col sm:flex-row gap-2"
        >
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">Quiz access code</span>
            <KeyRound
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500"
              aria-hidden="true"
            />
            <input
              type="text"
              required
              aria-label="Quiz access code"
              placeholder="Quiz code"
              autoComplete="off"
              autoCapitalize="characters"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              className="w-full pl-10 pr-3 py-3 bg-white border border-slate-300 rounded-lg text-base font-mono tracking-wider uppercase"
            />
          </label>
          <button
            type="submit"
            disabled={verifyingCode}
            className="qn-button-primary"
          >
            <span>{verifyingCode ? "Checking…" : "Join quiz"}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </form>
      </section>
      {error && (
        <p role="alert" className="qn-alert qn-alert-error">
          {error}
        </p>
      )}
      <section aria-labelledby="activity-heading" className="qn-catalog">
        <div className="qn-activity-heading flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="activity-heading" className="text-lg font-semibold">
            Recent activity
          </h2>
          <span className="text-sm text-slate-500">
            {myAttempts.length} {myAttempts.length === 1 ? "record" : "records"}
          </span>
        </div>
        {loadingAttempts ? (
          <p
            role="status"
            className="p-12 text-center text-base text-slate-500"
          >
            Loading your quizzes…
          </p>
        ) : !myAttempts.length ? (
          <EmptyState
            icon={<BookOpen size={24} />}
            title="No quizzes yet"
            description="Use a quiz code to get started. Your results will appear here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {myAttempts.map((att) => {
              const quiz = att.quiz,
                inProgress = att.status === "in_progress",
                canViewScore = att.score !== null && att.score !== undefined;
              return (
                <li
                  key={att.id}
                  className="qn-activity-row flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg break-words">
                        {quiz?.title || "Assessment"}
                      </h3>
                      <span className="text-sm text-slate-500">
                        {quiz?.exam_format === "paper"
                          ? "Paper Exam"
                          : "Online"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-500">
                      <span>Attempt #{att.attempt_number}</span>
                      {att.section_name && <span>{att.section_name}</span>}
                      <span>
                        {new Date(att.started_at).toLocaleDateString()}
                      </span>
                      {att.warning_count > 0 && (
                        <span className="text-amber-800">
                          {att.warning_count}{" "}
                          {att.warning_count === 1 ? "warning" : "warnings"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto shrink-0">
                    {inProgress ? (
                      <Link
                        to={`/take/${quiz?.access_code}`}
                        className="qn-button-primary"
                      >
                        Resume Quiz
                        <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    ) : (
                      <>
                        <div className="sm:text-right">
                          <StatusBadge
                            tone={
                              att.status === "submitted" ? "success" : "warning"
                            }
                          >
                            {att.status === "terminated_violation"
                              ? "Stopped after warnings"
                              : att.status === "timed_out"
                                ? "Time ended"
                                : "Submitted"}
                          </StatusBadge>
                          <p className="text-xl font-semibold mt-2 tabular-nums">
                            {canViewScore ? (
                              <span>
                                {att.score} / {att.max_score} pts
                              </span>
                            ) : (
                              <span className="text-sm text-slate-500 font-normal">
                                Awaiting score release
                              </span>
                            )}
                          </p>
                        </div>
                        <Link
                          to={`/result/${att.id}`}
                          className="qn-icon-button"
                          title="View results"
                          aria-label={`View results for ${quiz?.title || "assessment"}`}
                        >
                          <ChevronRight size={19} aria-hidden="true" />
                        </Link>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
