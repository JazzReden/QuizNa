import { ArrowLeft, Sparkles } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { PointsInput } from "../../components/common/PointsInput";
import { announceResultsChange } from "../../hooks/useAutoRefresh";
import {
  parseCriteria,
  splitCriteriaFeedback,
  suggestedCriteria,
} from "../../utils/essay-rubric";
import { questionTypeLabel } from "../../utils/labels";
import { readPoints } from "../../utils/points";

const EssayCriteriaGrader = React.lazy(() =>
  import("../../components/teacher/EssayCriteriaGrader").then((module) => ({
    default: module.EssayCriteriaGrader,
  })),
);

export const GradingPage: React.FC = () => {
  const { quizId } = useParams<{ quizId: string }>();
  const [searchParams] = useSearchParams();
  const detailRequest = useRef(0);
  const dataRequest = useRef(0);
  const requestedAttemptId = searchParams.get("attempt");
  const fromGradebook = ["gradebook", "section-gradebook"].includes(
    searchParams.get("from") || "",
  );
  const fromSectionQuiz = searchParams.get("from") === "section-quiz";
  const backUrl = fromSectionQuiz
    ? `/teacher/sections?${new URLSearchParams({ section: searchParams.get("section") || "", tab: "codes", activity: quizId || "", panel: "class-list", ...(searchParams.get("subjectRoom") ? { subjectRoom: searchParams.get("subjectRoom")! } : {}) })}`
    : fromGradebook
      ? `${searchParams.get("from") === "section-gradebook" ? "/teacher/sections" : "/teacher/gradebook"}?${new URLSearchParams({ ...(searchParams.get("from") === "section-gradebook" ? { tab: "gradebook" } : {}), ...(searchParams.get("section") ? { section: searchParams.get("section")! } : {}), ...(searchParams.get("search") ? { search: searchParams.get("search")! } : {}) })}`
      : "/teacher";
  const [sectionFilter, setSectionFilter] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [quiz, setQuiz] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  const [attemptAnswers, setAttemptAnswers] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingGrade, setSavingGrade] = useState(false);
  const [confirmingScore, setConfirmingScore] = useState(false);
  const [notice, setNotice] = useState("");
  const [scoreErrors, setScoreErrors] = useState<Record<string, string>>({});
  const [criteriaReset, setCriteriaReset] = useState<Record<string, number>>(
    {},
  );
  const [criteriaFeedback, setCriteriaFeedback] = useState<
    Record<string, string>
  >({});
  const [releasing, setReleasing] = useState(false);
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});
  const [feedbackInputs, setFeedbackInputs] = useState<Record<string, string>>(
    {},
  );

  const fetchGradingData = async (selectRequested = false) => {
    if (!quizId) return;
    const current = ++dataRequest.current;
    try {
      const q = await api.getTeacherQuiz(quizId);
      if (current !== dataRequest.current) return;
      setQuiz(q);
      const atts = await api.listQuizAttempts(quizId);
      if (current !== dataRequest.current) return;
      const submitted = atts.filter((a: any) => a.status !== "in_progress");
      setAttempts(
        requestedAttemptId
          ? submitted.filter(
              (attempt: any) => attempt.id === requestedAttemptId,
            )
          : submitted,
      );

      if (selectRequested || !selectedAttempt) {
        const target = requestedAttemptId
          ? submitted.find((a: any) => a.id === requestedAttemptId)
          : submitted[0];
        if (target) {
          if (selectRequested && (fromGradebook || fromSectionQuiz))
            setSectionFilter(target.section_name || "Unassigned");
          await loadAttemptDetail(target);
        } else if (requestedAttemptId) {
          setNotice(
            "This submission is unavailable. Return to the class list to choose a student.",
          );
        }
      }
    } catch (err: any) {
      if (current === dataRequest.current)
        setNotice(err.message || "Unable to load submissions.");
    } finally {
      if (current === dataRequest.current) setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setSelectedAttempt(null);
    setAttemptAnswers([]);
    setQuestions([]);
    setSectionFilter("");
    setStudentSearch("");
    setNotice("");
    void fetchGradingData(true);
    return () => {
      ++dataRequest.current;
      ++detailRequest.current;
    };
  }, [quizId, requestedAttemptId]);

  const loadAttemptDetail = async (attempt: any) => {
    const requestId = ++detailRequest.current;
    setSelectedAttempt(attempt);
    setAttemptAnswers([]);
    setQuestions([]);
    try {
      const detail = await api.getAttempt(attempt.id);
      const answers = await api.getAttemptAnswers(attempt.id);
      if (requestId !== detailRequest.current) return;
      setSelectedAttempt(detail);
      setQuestions(detail.quiz?.questions || []);
      setAttemptAnswers(answers);

      // Populate input states
      const scores: Record<string, string> = {};
      const feedbacks: Record<string, string> = {};
      const breakdowns: Record<string, string> = {};
      answers.forEach((ans) => {
        scores[ans.id] =
          ans.score_awarded !== undefined && ans.score_awarded !== null
            ? String(ans.score_awarded)
            : "";
        const question = detail.quiz?.questions?.find(
          (q: any) => q.id === ans.question_id,
        );
        const saved =
          question?.type === "essay"
            ? splitCriteriaFeedback(
                ans.teacher_feedback || "",
                parseCriteria(question.rubric) ||
                  suggestedCriteria(question.points),
              )
            : { notes: ans.teacher_feedback || "", breakdown: "" };
        feedbacks[ans.id] = saved.notes;
        breakdowns[ans.id] = saved.breakdown;
      });
      setCriteriaReset({});
      setCriteriaFeedback(breakdowns);
      setScoreInputs(scores);
      setFeedbackInputs(feedbacks);
    } catch (err: any) {
      alert(err.message || "Failed to load attempt answers");
    }
  };

  const handleSaveAnswerGrade = async (answerId: string, maxPoints: number) => {
    const score = readPoints(scoreInputs[answerId] ?? "", maxPoints);
    if (score === null) {
      setScoreErrors((previous) => ({
        ...previous,
        [answerId]: `Enter 0–${maxPoints}, with up to two decimal places.`,
      }));
      return;
    }

    setSavingGrade(true);
    try {
      await api.gradeAnswer(
        answerId,
        score,
        [criteriaFeedback[answerId], feedbackInputs[answerId]]
          .filter(Boolean)
          .join("\n\n"),
      );
      announceResultsChange();
      setNotice("Grade saved.");
      // Refresh
      await fetchGradingData();
      if (selectedAttempt) {
        await loadAttemptDetail(selectedAttempt);
      }
    } catch (err: any) {
      alert(err.message || "Failed to save grade");
    } finally {
      setSavingGrade(false);
    }
  };

  const toggleReleaseScores = async (
    field: "release_scores_immediately" | "release_answers_immediately",
  ) => {
    if (!quiz) return;
    if (releasing) return;
    const newState = !quiz[field];
    setReleasing(true);
    try {
      await api.updateQuiz(quiz.id, { [field]: newState });
      announceResultsChange();
      setQuiz({ ...quiz, [field]: newState });
      setNotice(
        `${field === "release_scores_immediately" ? "Scores" : "Correct answers"} ${newState ? "released." : "hidden."}`,
      );
    } catch (err: any) {
      setNotice(err.message || "Unable to update result visibility.");
    } finally {
      setReleasing(false);
    }
  };

  const unsavedGrades = attemptAnswers.some((answer) => {
    const score = scoreInputs[answer.id] ?? "";
    const feedback = [criteriaFeedback[answer.id], feedbackInputs[answer.id]]
      .filter(Boolean)
      .join("\n\n");
    return (
      (answer.score_awarded == null
        ? score !== ""
        : score === "" || Number(score) !== Number(answer.score_awarded)) ||
      feedback.trim() !== (answer.teacher_feedback || "").trim()
    );
  });
  const confirmScore = async () => {
    if (!selectedAttempt || confirmingScore || savingGrade || unsavedGrades)
      return;
    setConfirmingScore(true);
    try {
      const updated = await api.confirmScore(
        selectedAttempt.id,
        selectedAttempt.updated_at,
        selectedAttempt.score_revision || 0,
      );
      setSelectedAttempt((current: any) => ({ ...current, ...updated }));
      announceResultsChange();
      setNotice("Score confirmed. The gradebook is updated.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to confirm score. Refresh and try again.",
      );
    } finally {
      setConfirmingScore(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const visibleAttempts = attempts.filter(
    (a) =>
      (requestedAttemptId ||
        !sectionFilter ||
        (a.section_name || "Unassigned") === sectionFilter) &&
      `${a.student_profile?.full_name || ""} ${a.student_profile?.email || ""}`
        .toLowerCase()
        .includes(studentSearch.toLowerCase()),
  );
  const answersByQuestion = new Map(
    attemptAnswers.map((answer) => [answer.question_id, answer]),
  );

  return (
    <div
      className={`qn-page qn-records qn-grading ${requestedAttemptId ? "qn-single-review" : ""}`}
    >
      <div className="qn-review-navigation">
        <Link to={backUrl} className="qn-return-button">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>
            {fromSectionQuiz
              ? "Back to class list"
              : fromGradebook
                ? "Back to gradebook"
                : "Back to quizzes"}
          </span>
        </Link>
      </div>
      <div className="qn-review-page-heading">
        <div>
          <h1 className="qn-title">Review student answers</h1>
          <p className="qn-description">{quiz?.title}</p>
        </div>

        {/* Release scores button */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={releasing}
            aria-pressed={Boolean(quiz?.release_answers_immediately)}
            onClick={() => toggleReleaseScores("release_answers_immediately")}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
          >
            {quiz?.release_answers_immediately
              ? "Hide correct answers"
              : "Release correct answers"}
          </button>
          <button
            type="button"
            disabled={releasing}
            aria-pressed={Boolean(quiz?.release_scores_immediately)}
            onClick={() => toggleReleaseScores("release_scores_immediately")}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all flex items-center space-x-1.5 ${
              quiz?.release_scores_immediately
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>
              {quiz?.release_scores_immediately
                ? "Hide scores"
                : "Release scores"}
            </span>
          </button>
        </div>
      </div>
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900"
        >
          {notice}
        </p>
      )}

      {!requestedAttemptId && (
        <div className="flex flex-wrap gap-3 mt-4">
          <label className="text-xs font-semibold text-slate-600">
            Section
            <select
              aria-label="Grading section"
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="block mt-1 p-2 rounded-lg border border-slate-200 bg-white"
            >
              <option value="">All sections</option>
              {[...new Set(attempts.map((a) => a.section_name || "Unassigned"))]
                .sort()
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Find a student
            <input
              type="search"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="block mt-1 p-2 rounded-lg border border-slate-200"
            />
          </label>
        </div>
      )}
      {visibleAttempts.length === 0 ? (
        <div className="mt-8 bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <p className="text-sm text-slate-500">
            {requestedAttemptId
              ? "No answers available for this submission."
              : "No submissions yet."}
          </p>
        </div>
      ) : (
        <div
          className={`qn-grading-layout grid gap-6 mt-6 ${requestedAttemptId ? "qn-single-review-layout" : "grid-cols-1 lg:grid-cols-3"}`}
        >
          {/* Attempt Selector List */}
          {!requestedAttemptId && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Student Submissions ({visibleAttempts.length})
              </h2>

              <div
                className="qn-submissions-list space-y-2"
                role="region"
                aria-label="Student submissions"
                tabIndex={0}
              >
                {visibleAttempts.map((att) => (
                  <button
                    type="button"
                    key={att.id}
                    disabled={savingGrade}
                    onClick={() => loadAttemptDetail(att)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      selectedAttempt?.id === att.id
                        ? "bg-indigo-50/70 border-indigo-300 shadow-xs ring-1 ring-indigo-400"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900">
                        {att.student_profile?.full_name || "Student"}
                        <span className="block text-xs font-normal text-slate-500">
                          {att.section_name || "Unassigned"}
                        </span>
                      </p>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          att.is_graded
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {att.is_graded ? "Graded" : "Pending Review"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                      <span>
                        Score:{" "}
                        <strong className="text-slate-800">
                          {att.score || 0}
                        </strong>{" "}
                        / {att.max_score}
                      </span>
                      <span className="capitalize text-[11px]">
                        {att.status === "terminated_violation"
                          ? "Stopped"
                          : att.status === "timed_out"
                            ? "Time ended"
                            : "Submitted"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Grading Editor for Selected Attempt */}
          <div
            className={`${requestedAttemptId ? "" : "lg:col-span-2"} space-y-4`}
          >
            {(!selectedAttempt ||
              !visibleAttempts.some((a) => a.id === selectedAttempt.id)) && (
              <p className="p-6 rounded-xl bg-white border border-slate-200 text-sm text-slate-500">
                Choose a student to review.
              </p>
            )}
            {selectedAttempt &&
              visibleAttempts.some((a) => a.id === selectedAttempt.id) && (
                <>
                  <div className="qn-review-summary bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Reviewing: {selectedAttempt.student_profile?.full_name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Submitted:{" "}
                        {selectedAttempt.submitted_at
                          ? new Date(
                              selectedAttempt.submitted_at,
                            ).toLocaleString()
                          : "In Progress"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Total Score</p>
                      <p className="text-xl font-extrabold text-indigo-700">
                        {selectedAttempt.score || 0} /{" "}
                        {selectedAttempt.max_score} pts
                      </p>
                    </div>
                  </div>

                  <div className="qn-score-confirmation">
                    <div>
                      <strong>
                        {selectedAttempt.score_confirmed_at
                          ? "Score confirmed"
                          : "Confirm this result"}
                      </strong>
                      <p>
                        {selectedAttempt.score_confirmed_at
                          ? "Included in the section gradebook."
                          : unsavedGrades
                            ? "Save your grade changes before confirming."
                            : !selectedAttempt.is_graded
                              ? "Finish grading all answers before confirming."
                              : "Review the answers, then confirm the score for the gradebook."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="qn-button-primary"
                      disabled={
                        !!selectedAttempt.score_confirmed_at ||
                        !selectedAttempt.is_graded ||
                        confirmingScore ||
                        savingGrade ||
                        unsavedGrades
                      }
                      onClick={() => void confirmScore()}
                    >
                      {selectedAttempt.score_confirmed_at
                        ? "Confirmed"
                        : confirmingScore
                          ? "Confirming…"
                          : "Confirm score"}
                    </button>
                  </div>

                  {/* Answers List */}
                  <div className="space-y-4">
                    {questions.map((q, idx) => {
                      const ans = answersByQuestion.get(q.id);

                      return (
                        <div
                          key={q.id}
                          className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3"
                        >
                          {/* Question Prompt */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-slate-400">
                                Q{idx + 1}
                              </span>
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 capitalize">
                                {questionTypeLabel(q.type)}
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-slate-600">
                              Max: {q.points} pts
                            </span>
                          </div>

                          <p className="text-sm font-medium text-slate-800">
                            {q.prompt}
                          </p>

                          {/* Rubric if essay */}
                          {q.rubric && !parseCriteria(q.rubric) && (
                            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900">
                              <strong>Rubric:</strong> {q.rubric}
                            </div>
                          )}

                          {/* Student Response Display */}
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                            <p className="text-xs font-semibold text-slate-500 mb-1">
                              Response:
                            </p>
                            <p className="text-sm text-slate-900 whitespace-pre-wrap">
                              {ans?.answer !== null && ans?.answer !== undefined
                                ? q.options?.find(
                                    (o: any) => o.id === ans.answer,
                                  )?.text || String(ans.answer)
                                : "No response"}
                            </p>
                          </div>

                          {q.type === "essay" && ans && (
                            <React.Suspense
                              fallback={
                                <p
                                  role="status"
                                  className="text-xs text-slate-500"
                                >
                                  Loading criteria…
                                </p>
                              }
                            >
                              <EssayCriteriaGrader
                                key={`${ans.id}:${ans.updated_at || ""}:${criteriaReset[ans.id] || 0}`}
                                guide={q.rubric}
                                points={q.points}
                                feedback={
                                  criteriaReset[ans.id]
                                    ? ""
                                    : ans.teacher_feedback || ""
                                }
                                disabled={savingGrade}
                                onChange={(score, feedback) => {
                                  setScoreInputs((previous) => ({
                                    ...previous,
                                    [ans.id]: score ?? "",
                                  }));
                                  setCriteriaFeedback((previous) => ({
                                    ...previous,
                                    [ans.id]: feedback,
                                  }));
                                  setScoreErrors((previous) => ({
                                    ...previous,
                                    [ans.id]: "",
                                  }));
                                }}
                              />
                            </React.Suspense>
                          )}

                          {/* Grading Inputs */}
                          {ans && (
                            <div className="qn-grade-controls pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-end sm:items-center justify-between gap-3">
                              <div className="qn-grade-fields flex items-center space-x-3 w-full sm:w-auto">
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Score (out of {q.points})
                                  </label>
                                  <PointsInput
                                    aria-label={`Score for question ${idx + 1}`}
                                    placeholder="Enter score"
                                    aria-invalid={Boolean(scoreErrors[ans.id])}
                                    aria-describedby={
                                      scoreErrors[ans.id]
                                        ? `score-error-${ans.id}`
                                        : undefined
                                    }
                                    value={
                                      scoreInputs[ans.id] !== undefined
                                        ? scoreInputs[ans.id]
                                        : ""
                                    }
                                    onChange={(value) => {
                                      setCriteriaFeedback((previous) => ({
                                        ...previous,
                                        [ans.id]: "",
                                      }));
                                      setCriteriaReset((previous) => ({
                                        ...previous,
                                        [ans.id]: (previous[ans.id] || 0) + 1,
                                      }));
                                      setScoreInputs((previous) => ({
                                        ...previous,
                                        [ans.id]: value,
                                      }));
                                      setScoreErrors((previous) => ({
                                        ...previous,
                                        [ans.id]: "",
                                      }));
                                    }}
                                    className="w-24 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                                  />
                                  {scoreErrors[ans.id] && (
                                    <p
                                      id={`score-error-${ans.id}`}
                                      role="alert"
                                      className="text-xs text-rose-700 mt-1 max-w-44"
                                    >
                                      {scoreErrors[ans.id]}
                                    </p>
                                  )}
                                </div>

                                <div className="flex-1 sm:w-64">
                                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Feedback
                                  </label>
                                  <input
                                    aria-label={`Feedback for question ${idx + 1}`}
                                    type="text"
                                    placeholder="Optional feedback"
                                    value={feedbackInputs[ans.id] || ""}
                                    onChange={(e) =>
                                      setFeedbackInputs({
                                        ...feedbackInputs,
                                        [ans.id]: e.target.value,
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white"
                                  />
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleSaveAnswerGrade(ans.id, q.points)
                                }
                                disabled={savingGrade}
                                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors shrink-0"
                              >
                                Save Grade
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
          </div>
        </div>
      )}
    </div>
  );
};
