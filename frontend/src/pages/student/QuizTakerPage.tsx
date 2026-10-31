import {
  AlertOctagon,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Send,
  ShieldAlert,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import {
  AutosaveBadge,
  AutosaveStatus,
} from "../../components/common/AutosaveBadge";
import { Dialog } from "../../components/common/Dialog";
import { Timer } from "../../components/common/Timer";
import { ViolationModal } from "../../components/common/ViolationModal";
import { IncidentType, QuizAttempt, StudentQuestionView } from "../../types";
import { AnswerQueue } from "../../utils/answerQueue";
import { playTerminatedTone, playWarningTone } from "../../utils/audio";

export const QuizTakerPage: React.FC = () => {
  const { accessCode } = useParams<{ accessCode: string }>();
  const navigate = useNavigate();

  // State
  const [briefing, setBriefing] = useState<{
    title?: string;
    instructions?: string;
    section_name?: string;
  }>({});
  const [saveMessage, setSaveMessage] = useState("");
  const queueRef = useRef<AnswerQueue | null>(null);
  const submitLock = useRef(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [questions, setQuestions] = useState<StudentQuestionView[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pre-quiz briefing state
  const [agreementChecked, setAgreementChecked] = useState(false);

  // Submission review modal state
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // In-exam fullscreen state
  const [isFullscreenActive, setIsFullscreenActive] = useState(true);

  // Proctoring & Violation Modal
  const [violationModalOpen, setViolationModalOpen] = useState(false);
  const [currentViolationType, setCurrentViolationType] =
    useState<IncidentType>("fullscreen_exit");
  const [warningCount, setWarningCount] = useState(0);

  // Tracking refs to avoid stale closures
  const attemptRef = useRef<QuizAttempt | null>(null);
  attemptRef.current = attempt;
  const isStartedRef = useRef(false);
  isStartedRef.current =
    hasStarted && !submitting && attempt?.status === "in_progress";
  const lastIncidentTime = useRef<number>(0);

  // Reading the briefing never consumes an attempt or starts its countdown.
  useEffect(() => {
    let disposed = false;
    api
      .getQuizByAccessCode(accessCode || "")
      .then((data) => {
        if (!disposed) setBriefing(data);
      })
      .catch((err) => {
        if (!disposed) setError(err.message);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      queueRef.current?.stop();
    };
  }, [accessCode]);

  const initializeQuiz = async () => {
    if (!accessCode) return;
    const data = await api.startOrResumeAttempt(accessCode);
    if (data.attempt.status !== "in_progress") {
      navigate(`/result/${data.attempt.id}`);
      return;
    }
    setAttempt(data.attempt);
    attemptRef.current = data.attempt;
    setQuestions(data.questions);
    setRemainingSeconds(data.remainingSeconds);
    setWarningCount(data.attempt.warning_count || 0);
    setBriefing({
      title: data.title,
      instructions: data.instructions,
      section_name: data.section_name,
    });
    const draftKey = `quizna_pending:${data.attempt.student_id}:${data.attempt.id}`;
    let pending: [string, string | null][] = [];
    try {
      pending = JSON.parse(sessionStorage.getItem(draftKey) || "[]");
    } catch {
      /* damaged local draft */
    }
    const known = new Set(data.questions.map((q: StudentQuestionView) => q.id));
    pending = pending.filter(([id]) => known.has(id));
    setAnswers({ ...data.savedAnswers, ...Object.fromEntries(pending) });
    queueRef.current?.stop();
    const queue = new AnswerQueue(
      async (id, value) => {
        const result = await api.autosaveAnswer(data.attempt.id, id, value);
        if (result.status !== "saved") {
          isStartedRef.current = false;
          queue.stop(true);
          navigate(`/result/${data.attempt.id}`);
          throw new Error("Attempt finalized");
        }
      },
      setAutosaveStatus,
      (entries) => {
        try {
          if (entries.length)
            sessionStorage.setItem(draftKey, JSON.stringify(entries));
          else sessionStorage.removeItem(draftKey);
        } catch {
          /* server saves still work when browser storage is unavailable */
        }
      },
    );
    queueRef.current = queue;
    queue.restore(pending);
    setHasStarted(true);
  };

  const saveAnswer = (questionId: string, answerValue: string | null) => {
    queueRef.current?.enqueue(questionId, answerValue);
  };

  useEffect(() => {
    const retry = () => void queueRef.current?.flush();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queueRef.current?.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("online", retry);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  const handleAnswerChange = (questionId: string, val: any) => {
    if (!isStartedRef.current || submitLock.current) return;
    setAnswers((prev) => ({
      ...prev,
      [questionId]: val,
    }));
    saveAnswer(questionId, val);
  };

  // Manual submission waits for acknowledged saves. Expiry uses only server-saved answers.
  const executeSubmit = async (isTimeout = false) => {
    if (!attemptRef.current || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setShowSubmitModal(false);
    isStartedRef.current = false;
    try {
      if (!isTimeout && !(await queueRef.current?.flush())) {
        throw new Error(
          "Some answers have not reached QuizNa. Reconnect and retry submission.",
        );
      }
      const finished = await api.submitAttempt(
        attemptRef.current.id,
        isTimeout,
      );
      queueRef.current?.stop(true);
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => {});
      navigate(`/result/${finished.id}`);
    } catch (err: any) {
      setSaveMessage(
        err.message || "Submission failed. Your saved answers are preserved.",
      );
      setSubmitting(false);
      submitLock.current = false;
      isStartedRef.current = true;
    }
  };

  // Telemetry & Proctoring incident reporter
  const reportIncident = useCallback(async (type: IncidentType) => {
    if (!isStartedRef.current || !attemptRef.current) return;

    const now = Date.now();
    if (now - lastIncidentTime.current < 2000) {
      return;
    }
    lastIncidentTime.current = now;

    try {
      const res = await api.reportIncident(attemptRef.current.id, type);
      if (res.deduplicated) return;

      setWarningCount(res.warning_number);
      setCurrentViolationType(type);
      setViolationModalOpen(true);

      if (res.action_taken === "terminated") {
        playTerminatedTone();
        isStartedRef.current = false;
        submitLock.current = true;
        queueRef.current?.stop(true);
        setSubmitting(true);
      } else {
        playWarningTone();
      }
    } catch (err) {
      console.error("Failed to report monitoring incident", err);
    }
  }, []);

  // The grace window is tied to this fullscreen transition. Cleanup removes every listener.
  useEffect(() => {
    if (!hasStarted) return;
    const graceUntil = Date.now() + 3000;
    const emit = (type: IncidentType) => {
      if (Date.now() >= graceUntil) void reportIncident(type);
    };
    const visibility = () => {
      if (document.hidden) emit("tab_hidden");
    };
    const blur = () => emit("window_blur");
    const fullscreen = () => {
      setIsFullscreenActive(Boolean(document.fullscreenElement));
      if (!document.fullscreenElement) emit("fullscreen_exit");
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    document.addEventListener("fullscreenchange", fullscreen);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      document.removeEventListener("fullscreenchange", fullscreen);
    };
  }, [hasStarted, reportIncident]);

  // Keyboard shortcut listener (Ctrl/Cmd+Enter for next/submit, numbers for options)
  useEffect(() => {
    if (!hasStarted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.closest("[data-quizna-helper]")) return;
      if (violationModalOpen || showSubmitModal || submitting) return;
      // Don't intercept typing in short answer or essay fields
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      const isInputFocused = activeTag === "input" || activeTag === "textarea";

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (currentIndex < questions.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          setShowSubmitModal(true);
        }
        return;
      }

      if (!isInputFocused && ["1", "2", "3", "4"].includes(e.key)) {
        const q = questions[currentIndex];
        if (q && q.type === "mcq" && q.options) {
          const optIdx = parseInt(e.key, 10) - 1;
          if (q.options[optIdx]) {
            handleAnswerChange(q.id, q.options[optIdx].id);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    hasStarted,
    currentIndex,
    questions,
    violationModalOpen,
    showSubmitModal,
    submitting,
  ]);

  // Fullscreen requires a user gesture, so request it before the network operation.
  const handleStartExam = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setSaveMessage("");
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreenActive(true);
      await initializeQuiz();
    } catch (err: any) {
      setSaveMessage(
        err.message ||
          "Fullscreen could not start. Please try again in a supported browser.",
      );
    } finally {
      submitLock.current = false;
    }
  };

  const handleRestoreFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen().catch(() => {});
        setIsFullscreenActive(true);
      }
    } catch (e) {}
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400 mx-auto"></div>
          <p className="text-xs text-slate-400">
            Loading secure examination...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="qn-briefing min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Unable to Start Assessment
          </h2>
          <p className="text-xs text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/student")}
            className="w-full py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Pre-Quiz Briefing & System Check Screen
  if (!hasStarted) {
    return (
      <div className="qn-briefing min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 space-y-6">
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-200">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                QuizNa
              </span>
              <h1 className="text-xl font-semibold text-slate-900">
                Before you start
              </h1>
            </div>
          </div>

          <div className="text-sm text-slate-700 space-y-2">
            <h2 className="font-bold">{briefing.title}</h2>
            {briefing.section_name && (
              <p className="text-xs text-indigo-800">{briefing.section_name}</p>
            )}
            <p className="whitespace-pre-wrap">
              {briefing.instructions || "Read each question carefully."}
            </p>
          </div>
          {saveMessage && (
            <p role="alert" className="text-sm text-amber-800">
              {saveMessage}
            </p>
          )}
          {/* Interactive Readiness Checklist */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-600">Quiz rules</h2>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <p className="text-sm font-semibold text-slate-900">
                Monitoring rules and limitations
              </p>
              <p className="text-sm text-slate-600">
                Focus changes are possible violations, not proof of cheating.
                Device prompts can trigger them. QuizNa cannot monitor other
                devices or prevent all cheating. Contact your teacher about
                technical issues.
              </p>
              <ul className="text-sm text-slate-600 space-y-1 list-disc pl-4">
                <li>Remain in fullscreen mode throughout the test.</li>
                <li>
                  Tab switching, window unfocusing, and exiting fullscreen are
                  logged.
                </li>
                <li>
                  <strong>
                    Warning 1 → final warning → automatic submission.
                  </strong>{" "}
                  Your saved answers are kept.
                </li>
              </ul>
            </div>

            {/* Acknowledgment Checkbox */}
            <label className="flex items-start space-x-3 p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={agreementChecked}
                onChange={(e) => setAgreementChecked(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-indigo-600 rounded-sm focus:ring-indigo-500"
              />
              <span className="text-xs text-indigo-800">
                I understand the monitoring rules.
              </span>
            </label>
          </div>

          {/* Action button */}
          <button
            type="button"
            disabled={!agreementChecked}
            onClick={handleStartExam}
            className="qn-button-primary w-full"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Start Quiz · Enter Fullscreen</span>
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const currentAnswer = currentQ ? answers[currentQ.id] : undefined;
  const answeredCount = Object.keys(answers).filter(
    (k) =>
      answers[k] !== undefined &&
      answers[k] !== null &&
      String(answers[k]).trim() !== "",
  ).length;

  const unansweredIndices = questions
    .map((q, i) =>
      answers[q.id] === undefined ||
      answers[q.id] === null ||
      String(answers[q.id]).trim() === ""
        ? i + 1
        : null,
    )
    .filter((idx) => idx !== null) as number[];

  return (
    <div className="qn-taking min-h-screen bg-slate-50 flex flex-col">
      {/* Urgent Fullscreen Exit Banner */}
      {!isFullscreenActive && (
        <button
          type="button"
          onClick={handleRestoreFullscreen}
          className="bg-rose-600 text-white text-xs font-bold py-2 px-4 text-center cursor-pointer flex items-center justify-center space-x-2 z-50"
        >
          <AlertOctagon className="w-4 h-4" />
          <span>
            Fullscreen ended. Return to fullscreen to continue under the quiz
            rules.
          </span>
        </button>
      )}

      {/* Top Fixed Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-sm font-bold text-slate-900 line-clamp-1">
              Quiz in progress
            </h1>
            <p className="text-[11px] text-slate-500">
              Question {currentIndex + 1} of {questions.length} • (
              {answeredCount} answered)
            </p>
          </div>
        </div>

        {/* Right: Timer & Finish Button */}
        <div className="flex items-center space-x-3">
          <Timer
            initialSeconds={remainingSeconds}
            onExpire={() => executeSubmit(true)}
          />

          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            disabled={submitting}
            className="qn-button-primary"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Submit quiz</span>
          </button>
        </div>
      </header>

      {saveMessage && (
        <p role="alert" className="p-4 bg-amber-50 text-amber-900">
          {saveMessage}
        </p>
      )}
      <div
        role="status"
        aria-live="polite"
        className="px-4 py-2 bg-slate-100 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600"
      >
        <AutosaveBadge status={autosaveStatus} />
        <span>Focus warnings: {warningCount} of 3</span>

        {autosaveStatus === "error" && (
          <button
            type="button"
            onClick={() => void queueRef.current?.flush()}
            className="font-semibold text-indigo-700 underline"
          >
            Retry saving
          </button>
        )}
      </div>
      {/* Main Taking Container */}
      <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Question Content (3 cols) */}
        <div className="lg:col-span-3 space-y-5">
          <fieldset disabled={submitting || warningCount >= 3}>
            {currentQ && (
              <div className="qn-taking-question bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
                {/* Question header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <span className="text-xs font-extrabold text-indigo-700 tracking-wider uppercase">
                    Question {currentIndex + 1}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {currentQ.points}{" "}
                    {currentQ.points === 1 ? "Point" : "Points"}
                  </span>
                </div>

                {/* Prompt */}
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">
                  {currentQ.prompt}
                </h2>

                {/* Answer options by question type */}
                <div className="space-y-3 pt-2">
                  {/* MCQ */}
                  {currentQ.type === "mcq" && (
                    <div className="space-y-2.5">
                      {currentQ.options?.map((opt, optIndex) => (
                        <label
                          key={opt.id}
                          className={`flex items-center space-x-3.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                            currentAnswer === opt.id
                              ? "bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-500/20 text-slate-900"
                              : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                            {optIndex + 1}
                          </span>
                          <input
                            type="radio"
                            name={`q_${currentQ.id}`}
                            checked={currentAnswer === opt.id}
                            onChange={() =>
                              handleAnswerChange(currentQ.id, opt.id)
                            }
                            className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium">
                            {opt.text}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* True/False */}
                  {currentQ.type === "true_false" && (
                    <div className="grid grid-cols-2 gap-3">
                      {["opt_true", "opt_false"].map((val) => {
                        const isTrue = val === "opt_true";
                        return (
                          <label
                            key={val}
                            className={`flex items-center justify-center p-5 rounded-2xl border transition-all cursor-pointer text-center font-bold text-sm ${
                              currentAnswer === val
                                ? "bg-indigo-50 border-indigo-500 text-indigo-900 ring-2 ring-indigo-500/20"
                                : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`q_${currentQ.id}`}
                              checked={currentAnswer === val}
                              onChange={() =>
                                handleAnswerChange(currentQ.id, val)
                              }
                              className="sr-only"
                            />
                            <span>{isTrue ? "True" : "False"}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Short Answer */}
                  {currentQ.type === "short_answer" && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                        Your Answer:
                      </label>
                      <input
                        type="text"
                        aria-label="Your answer"
                        placeholder="Type your concise response here..."
                        value={currentAnswer || ""}
                        onChange={(e) =>
                          handleAnswerChange(currentQ.id, e.target.value)
                        }
                        className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                      />
                    </div>
                  )}

                  {/* Essay */}
                  {currentQ.type === "essay" && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                        Written Response:
                      </label>
                      <textarea
                        aria-label="Written response"
                        rows={7}
                        placeholder="Type your detailed explanation or essay response..."
                        value={currentAnswer || ""}
                        onChange={(e) =>
                          handleAnswerChange(currentQ.id, e.target.value)
                        }
                        className="w-full p-4 text-sm bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono leading-relaxed"
                      />
                      <p className="text-[11px] text-slate-400 mt-1 text-right">
                        {(currentAnswer || "").length} characters
                      </p>
                    </div>
                  )}
                </div>

                {/* Navigation buttons with hotkey hint */}
                <div className="qn-question-navigation flex items-center justify-between pt-6 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={currentIndex === 0}
                    onClick={() =>
                      setCurrentIndex((prev) => Math.max(0, prev - 1))
                    }
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-30 flex items-center space-x-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>

                  <div className="hidden sm:flex items-center text-[11px] text-slate-400 space-x-1">
                    <span>Press</span>
                    <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[10px]">
                      Ctrl+Enter
                    </kbd>
                    <span>for Next</span>
                  </div>

                  <button
                    type="button"
                    disabled={currentIndex === questions.length - 1}
                    onClick={() =>
                      setCurrentIndex((prev) =>
                        Math.min(questions.length - 1, prev + 1),
                      )
                    }
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors disabled:opacity-30 flex items-center space-x-1 cursor-pointer"
                  >
                    <span>Next Question</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </fieldset>
        </div>

        {/* Side Question Palette (1 col) */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Question Navigator
          </h3>

          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-3 gap-2">
            {questions.map((q, idx) => {
              const isAnswered =
                answers[q.id] !== undefined &&
                answers[q.id] !== null &&
                String(answers[q.id]).trim() !== "";
              const isCurrent = idx === currentIndex;

              return (
                <button
                  type="button"
                  key={q.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-10 rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                    isCurrent
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 ring-2 ring-indigo-600 ring-offset-2"
                      : isAnswered
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-300"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2 text-[11px] text-slate-500">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-indigo-600"></span>
              <span>Current Question</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-emerald-100 border border-emerald-400"></span>
              <span>Answered ({answeredCount})</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-slate-100 border border-slate-300"></span>
              <span>Unanswered ({questions.length - answeredCount})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Submission Review & Confirmation Modal */}
      {showSubmitModal && (
        <Dialog
          label="Confirm quiz submission"
          onClose={() => setShowSubmitModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
              <Send className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">Submit quiz?</h3>
              <p className="text-xs text-slate-500 mt-1">
                You cannot change answers after submitting.
              </p>
            </div>

            {/* Answer tally status */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-600">Total Questions:</span>
                <span className="text-slate-900">{questions.length}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-600">Answered:</span>
                <span className="text-emerald-600">{answeredCount}</span>
              </div>

              {unansweredIndices.length > 0 && (
                <div className="pt-2 border-t border-slate-200 text-xs text-amber-700 font-medium">
                  ⚠️ Unanswered Questions:{" "}
                  {unansweredIndices.map((i) => `Q${i}`).join(", ")}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Keep reviewing
              </button>
              <button
                type="button"
                onClick={() => executeSubmit(false)}
                disabled={submitting}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit quiz"}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Violation Modal */}
      <ViolationModal
        isOpen={violationModalOpen}
        warningCount={warningCount}
        incidentType={currentViolationType}
        onAcknowledge={async () => {
          setViolationModalOpen(false);
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        }}
        onViewResults={() => {
          if (attempt) navigate(`/result/${attempt.id}`);
        }}
      />
    </div>
  );
};
