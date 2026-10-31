import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUp, BookOpen, ChevronRight, X } from "lucide-react";
import { useAuth } from "../../context/auth-context";
import { Dialog } from "../common/Dialog";
import {
  findHelp,
  helpFor,
  needsHelpChoice,
  type HelpAnswer,
} from "./ishi-knowledge";
import "../../styles/ishi.css";
import { IshiLiveReports, type IshiLiveHandle } from "./IshiLiveReports";
import { liveIntent } from "./ishi-live";

function IshiPortrait() {
  return <span className="ishi-head-shot" aria-hidden="true" />;
}
export function KoalaHelp() {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clarify, setClarify] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const [visibleCount, setVisibleCount] = useState(6);
  const [reply, setReply] = useState<{
    question: string;
    answer: string;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const live = useRef<IshiLiveHandle>(null);
  // Reset on route/account changes: no private conversation follows another user.
  useEffect(() => {
    setOpen(false);
    setQuery("");
    setBrowse(false);
    setShowLive(false);
    setVisibleCount(6);
    setReply(null);
    setClarify(false);
  }, [pathname, user?.id]);
  if (!user || (user.role !== "teacher" && user.role !== "student"))
    return null;
  const duringQuiz = pathname.startsWith("/take/");
  const answers = helpFor(user.role, duringQuiz);
  const browseAnswers = [
    ...answers.filter((answer) => answer.role === user.role),
    ...answers.filter((answer) => answer.role === "both"),
  ];
  const matches = query.trim() ? findHelp(query, user.role, duringQuiz) : [];
  const suggestedIds = duringQuiz
    ? ["student-7", "student-8", "student-15"]
    : user.role === "teacher"
      ? pathname.includes("/paper/")
        ? ["teacher-35", "teacher-33", "teacher-37"]
        : pathname.includes("/grading/")
          ? ["teacher-26", "teacher-10", "teacher-27"]
          : pathname.includes("/analysis")
            ? ["teacher-30", "teacher-26", "teacher-10"]
            : pathname.includes("/gradebook")
              ? ["teacher-23", "teacher-24", "teacher-25"]
              : pathname.includes("/sections")
                ? ["extra-teacher-7", "teacher-3", "extra-teacher-12"]
                : pathname.includes("/class-list") ||
                    pathname.includes("/monitor/")
                  ? ["teacher-19", "teacher-20", "teacher-21"]
                  : pathname.includes("/edit/") || pathname.includes("/create")
                    ? ["extra-teacher-0", "teacher-6", "teacher-15"]
                    : ["teacher-0", "teacher-6", "teacher-22"]
      : pathname.includes("/performance")
        ? ["student-20", "student-21", "student-18"]
        : pathname.includes("/result/")
          ? ["student-18", "student-19", "student-22"]
          : ["student-0", "student-7", "student-18"];
  const suggestions = suggestedIds.flatMap((id) =>
    answers.filter((answer) => answer.id === id),
  );
  const showAnswer = (answer: HelpAnswer) => {
    setClarify(false);
    live.current?.clear();
    setShowLive(false);
    setReply({ question: answer.question, answer: answer.answer });
    setQuery("");
    setBrowse(false);
  };
  return (
    <aside
      className="ishi-helper"
      data-quizna-helper="true"
      aria-label="Koala Help"
    >
      <button
        type="button"
        className="ishi-launcher"
        aria-label="Ask Koala Help"
        aria-expanded={open}
        aria-describedby="ishi-launcher-tip"
        aria-controls={open ? "ishi-panel" : undefined}
        onClick={() => setOpen(!open)}
      >
        <span className="ishi-mascot" aria-hidden="true" />
        <span id="ishi-launcher-tip" className="ishi-tooltip" role="tooltip">
          Koala Help
        </span>
      </button>
      {open && (
        <>
          <div
            className="ishi-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <Dialog
            label="Koala Help"
            onClose={() => setOpen(false)}
            className="ishi-panel"
          >
            <div id="ishi-panel" className="ishi-panel-content">
              <header className="ishi-header">
                <span className="ishi-portrait">
                  <IshiPortrait />
                </span>
                <div>
                  <h2>Koala Help</h2>
                  <p>Your classroom guide</p>
                </div>
                <button
                  type="button"
                  className="ishi-icon"
                  aria-label="Close Koala Help"
                  onClick={() => setOpen(false)}
                >
                  <X size={19} />
                </button>
              </header>
              <div className="ishi-body">
                {!reply && !showLive && !clarify && (
                  <p className="ishi-welcome">
                    {duringQuiz
                      ? "Need help with the controls? I can help with technical issues during your quiz."
                      : "Hi! What would you like to do in QuizNa?"}
                  </p>
                )}
                {reply && (
                  <section
                    className="ishi-reply"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <h3>{reply.question}</h3>
                    <p>{reply.answer}</p>
                  </section>
                )}
                <form
                  className="ishi-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const topic = !duringQuiz && liveIntent(query, user.role);
                    if (topic) {
                      setShowLive(true);
                      setReply(null);
                      live.current?.ask(topic);
                      setQuery("");
                    } else if (matches.length) {
                      if (needsHelpChoice(query, matches)) {
                        setReply(null);
                        setShowLive(false);
                        setBrowse(false);
                        setClarify(true);
                        live.current?.clear();
                      } else showAnswer(matches[0]);
                    } else if (query.trim()) {
                      live.current?.clear();
                      setShowLive(false);
                      setReply({
                        question: query.trim(),
                        answer: duringQuiz
                          ? "I can help with saving, reconnecting, the timer and focus warnings during this quiz. For the question content, follow your teacher’s instructions."
                          : "I do not have a reliable answer to that yet. Ask about QuizNa, or open Browse help. Your teacher or administrator can help with decisions and account changes.",
                      });
                      setQuery("");
                      setBrowse(false);
                    }
                  }}
                >
                  <label htmlFor="ishi-question">Ask about QuizNa</label>
                  <div>
                    <input
                      ref={input}
                      id="ishi-question"
                      value={query}
                      maxLength={300}
                      autoComplete="off"
                      placeholder="Type a QuizNa question…"
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setClarify(false);
                        setBrowse(false);
                      }}
                    />
                    <button
                      type="submit"
                      className="ishi-send"
                      aria-label="Ask question"
                      disabled={!query.trim()}
                    >
                      <ArrowUp size={18} />
                    </button>
                  </div>
                </form>
                {!duringQuiz && (
                  <div className="ishi-records">
                    <button
                      type="button"
                      className="ishi-browse"
                      aria-expanded={showLive}
                      aria-controls="ishi-current-records"
                      onClick={() => {
                        if (showLive) live.current?.clear();
                        else setReply(null);
                        setShowLive(!showLive);
                      }}
                    >
                      {showLive ? "Hide current records" : "Current records"}
                      <span aria-hidden="true">{showLive ? "−" : "+"}</span>
                    </button>
                    <div id="ishi-current-records" hidden={!showLive}>
                      <IshiLiveReports
                        key={`${user.id}:${user.role}`}
                        ref={live}
                        role={user.role}
                        context={pathname + search}
                        onAsk={() => {
                          setReply(null);
                          setBrowse(false);
                        }}
                      />
                    </div>
                  </div>
                )}
                {(!reply || query.trim() || browse) && !showLive && (
                  <div
                    className="ishi-question-list"
                    aria-label={
                      browse ? "Help questions" : "Suggested questions"
                    }
                  >
                    <p className="ishi-list-title">
                      {clarify
                        ? "Which one do you mean?"
                        : query.trim()
                          ? "Matching questions"
                          : browse
                            ? "All questions"
                            : "Quick help"}
                    </p>
                    {(query.trim()
                      ? matches.slice(0, 3)
                      : browse
                        ? browseAnswers.slice(0, visibleCount)
                        : suggestions.slice(0, 3)
                    ).map((a) => (
                      <button
                        type="button"
                        key={a.id}
                        onClick={() => showAnswer(a)}
                      >
                        <span>{a.question}</span>
                        <ChevronRight size={15} aria-hidden="true" />
                      </button>
                    ))}
                    {query.trim() && !matches.length && (
                      <p className="ishi-no-match">
                        Try a short topic, such as “quiz code”.
                      </p>
                    )}
                  </div>
                )}
                {browse && visibleCount < answers.length && (
                  <button
                    type="button"
                    className="ishi-browse"
                    onClick={() => setVisibleCount((count) => count + 6)}
                  >
                    More questions
                  </button>
                )}
                <button
                  type="button"
                  className="ishi-browse"
                  onClick={() => {
                    setBrowse(!browse);
                    setVisibleCount(6);
                    setShowLive(false);
                    setReply(null);
                    live.current?.clear();
                    setQuery("");
                  }}
                >
                  <BookOpen size={16} aria-hidden="true" />
                  {browse ? "Show quick help" : "Browse help"}
                </button>
              </div>
              <p className="ishi-footnote">
                Only your permitted records are shown.
              </p>
            </div>
          </Dialog>
        </>
      )}
    </aside>
  );
}
