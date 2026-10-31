import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Monitor,
  FileText,
  Plus,
  Search,
  ClipboardList,
  Copy,
  Check,
  LockKeyhole,
} from "lucide-react";
import { StatusBadge } from "../common/WorkspaceUi";
import type { SubjectDetail } from "../../types";
import { CopyQuizButton } from "./CopyQuizButton";
export function SubjectQuizList({
  detail,
  teacher,
}: {
  detail: SubjectDetail;
  teacher: boolean;
}) {
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const visible = detail.quizzes.filter(
    (q) =>
      q.title.toLowerCase().includes(search.trim().toLowerCase()) &&
      (status === "all" || q.status === status),
  );
  const createUrl = `/teacher/create?section=${detail.class_section_id}&subjectRoom=${detail.id}`;
  if (!detail.quizzes.length)
    return (
      <div className="qn-course-empty">
        <div className="qn-course-empty-art" aria-hidden="true">
          <span className="qn-course-empty-orbit" />
          <ClipboardList size={46} strokeWidth={1.3} />
          <span className="qn-course-empty-plus">
            <Plus size={17} />
          </span>
        </div>
        <h2>
          {teacher ? "Create your first quiz" : "Your quizzes will appear here"}
        </h2>
        <p>
          {teacher
            ? "Build an online quiz or prepare a paper exam."
            : "Your teacher hasn’t published a quiz yet."}
        </p>
        {teacher && (
          <Link className="qn-button-primary" to={createUrl}>
            <Plus size={17} />
            New quiz
          </Link>
        )}
      </div>
    );
  return (
    <>
      <div className="qn-course-filters">
        <label className="qn-course-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Find a quiz"
            placeholder="Find a quiz…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {teacher && (
          <select
            aria-label="Quiz status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        )}
      </div>
      {copyError && (
        <p className="qn-course-share-error" role="alert">
          {copyError}
        </p>
      )}
      <div className="qn-subject-quiz-list">
        {visible.map((q) => {
          const attempts = [...(q.attempts || [])].sort(
              (a, b) => b.attempt_number - a.attempt_number,
            ),
            active = attempts.find((a) => a.status === "in_progress"),
            quizCode = q.access_code,
            paper = q.exam_format === "paper",
            Icon = paper ? FileText : Monitor;
          const canOpen = !paper && (!!active || q.can_start !== false);
          const studentUrl =
            (active || !q.require_access_code) && quizCode
              ? `/take/${quizCode}`
              : `/student/subjects/${detail.id}/quiz/${q.id}`;
          const unavailable =
            !active && q.can_start === false
              ? q.available_from && Date.parse(q.available_from) > Date.now()
                ? "Not open yet"
                : q.available_until &&
                    Date.parse(q.available_until) <= Date.now()
                  ? "Quiz closed"
                  : "Attempt limit reached"
              : "";
          return (
            <article className="qn-subject-quiz" key={q.id}>
              <span
                className={`qn-course-format-icon${paper ? " qn-course-format-paper" : ""}`}
                aria-hidden="true"
              >
                <Icon size={21} strokeWidth={1.6} />
              </span>
              <div className="qn-course-quiz-text">
                <h2>
                  {!teacher && canOpen ? (
                    <Link className="qn-course-quiz-title-link" to={studentUrl}>
                      {q.title}
                    </Link>
                  ) : (
                    q.title
                  )}
                </h2>
                <p className="qn-course-quiz-meta">
                  <span>{paper ? "Paper exam" : "Online quiz"}</span>
                  {!paper && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{q.time_limit_minutes} minutes</span>
                    </>
                  )}
                  {!paper && q.require_access_code && (
                    <span className="qn-course-code-required">
                      <LockKeyhole size={12} aria-hidden="true" /> Code required
                    </span>
                  )}
                  {!teacher && unavailable && <span>{unavailable}</span>}
                  {teacher && (
                    <StatusBadge
                      tone={q.status === "published" ? "success" : "neutral"}
                    >
                      {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                    </StatusBadge>
                  )}
                </p>
              </div>
              <div className="qn-subject-quiz-actions">
                {teacher ? (
                  <>
                    {!paper && q.status === "published" && quizCode && (
                      <div className="qn-course-share">
                        <span>Quiz code</span>
                        <button
                          type="button"
                          className="qn-course-share-button"
                          aria-label={`Copy quiz code for ${q.title}`}
                          onClick={async () => {
                            setCopyError("");
                            setCopied("");
                            try {
                              await navigator.clipboard.writeText(quizCode);
                              setCopied(`${q.id}:${quizCode}`);
                            } catch {
                              setCopyError(
                                "Unable to copy. Select the quiz code and copy it manually.",
                              );
                            }
                          }}
                        >
                          <code>{quizCode}</code>
                          {copied === `${q.id}:${quizCode}` ? (
                            <Check size={16} aria-label="Copied" />
                          ) : (
                            <Copy size={16} aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    )}
                    <Link
                      className="qn-button-secondary"
                      to={`/teacher/sections?section=${detail.class_section_id}&tab=codes&activity=${q.id}&panel=class-list&subjectRoom=${detail.id}`}
                    >
                      Open quiz
                      <ChevronRight size={15} />
                    </Link>
                    <CopyQuizButton
                      quizId={q.id}
                      title={q.title}
                      sectionId={detail.class_section_id}
                    />
                  </>
                ) : (
                  <>
                    {canOpen && (
                      <Link className="qn-button-primary" to={studentUrl}>
                        {active
                          ? "Resume quiz"
                          : attempts.length
                            ? "Take again"
                            : "Take quiz"}
                        <ChevronRight size={15} />
                      </Link>
                    )}
                    {attempts
                      .filter((a) => a.status !== "in_progress")
                      .map((a) => (
                        <Link
                          key={a.id}
                          className="qn-button-secondary"
                          to={`/result/${a.id}`}
                        >
                          Review result
                          {a.score != null
                            ? ` · ${a.score}/${a.max_score}`
                            : ""}
                        </Link>
                      ))}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <span className="sr-only" role="status">
        {copied ? "Quiz code copied." : ""}
      </span>
      {!visible.length && (
        <div className="qn-course-no-match">
          <p>No quizzes match your search.</p>
          <button
            className="qn-button-quiet"
            onClick={() => {
              setSearch("");
              setStatus("all");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </>
  );
}
