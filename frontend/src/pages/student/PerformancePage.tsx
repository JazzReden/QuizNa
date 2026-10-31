import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  RefreshCw,
  ArrowUpRight,
  TrendingUp,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "../../api/client";
import type { StudentPerformance } from "../../types";
import "../../styles/reports.css";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import {
  EmptyState,
  PageHeading,
  StatusBadge,
} from "../../components/common/WorkspaceUi";

export function PerformancePage() {
  const [params] = useSearchParams();
  const [data, setData] = useState<StudentPerformance | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await api.getStudentPerformance());
      setError("");
    } catch {
      setError("Unable to load your performance. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    api
      .getStudentPerformance()
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active)
          setError("Unable to load your performance. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useAutoRefresh(load);
  const selectedKey = params.get("subject");
  const subjectKey = (subject: string | null) =>
    subject === null ? "unassigned" : `subject:${subject}`;
  const selected = data?.subjects.find(
    (group) => subjectKey(group.subject) === selectedKey,
  );
  return (
    <div className="qn-page qn-page-narrow qn-dashboard qn-performance">
      <PageHeading
        title={
          selected ? selected.subject || "Subject not set" : "My performance"
        }
        description={
          selected
            ? "Your quiz scores and progress."
            : "Choose a subject to see your progress."
        }
        actions={
          <button
            type="button"
            className="qn-button-secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={17} aria-hidden="true" />
            Refresh
          </button>
        }
      />
      {error && (
        <div className="qn-alert qn-alert-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="underline"
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading your performance…</p>
      ) : (
        data && (
          <>
            {!data.quizCount ? (
              <EmptyState
                icon={<TrendingUp size={26} />}
                title="Your progress starts here"
                description="Take a quiz to start building your performance record."
              >
                <Link to="/student" className="qn-button-primary">
                  Go to My subjects
                </Link>
              </EmptyState>
            ) : (
              <>
                {selectedKey && (
                  <Link
                    to="/student/performance"
                    className="qn-button-secondary qn-performance-back"
                  >
                    <ArrowLeft size={17} /> All subjects
                  </Link>
                )}
                <p className="qn-performance-note">
                  Best released scores per quiz, weighted by points.
                </p>
                <div className="qn-performance-groups">
                  {!selectedKey ? (
                    <div className="qn-performance-subject-grid">
                      {data.subjects.map((group) => (
                        <Link
                          className="qn-performance-subject-card"
                          key={subjectKey(group.subject)}
                          to={`?subject=${encodeURIComponent(subjectKey(group.subject))}`}
                        >
                          <span className="qn-performance-subject-icon">
                            <BookOpen size={23} />
                          </span>
                          <span>
                            <h2>{group.subject || "Subject not set"}</h2>
                            <small>
                              {group.gradedCount} of {group.quizzes.length}{" "}
                              scores available
                            </small>
                          </span>
                          <strong>
                            {group.percentage === null
                              ? "—"
                              : `${group.percentage}%`}
                          </strong>
                          <ChevronRight size={19} />
                        </Link>
                      ))}
                    </div>
                  ) : !selected ? (
                    <EmptyState
                      title="Subject not found"
                      description="Choose a subject from your performance list."
                    />
                  ) : (
                    [selected].map((group, index) => (
                      <section
                        className="qn-performance-subject"
                        key={
                          group.subject === null
                            ? "none"
                            : `subject:${group.subject}`
                        }
                        aria-labelledby={`subject-${index}`}
                      >
                        <div className="qn-performance-subject-heading">
                          <div>
                            <h2 id={`subject-${index}`}>
                              <BookOpen size={19} aria-hidden="true" />
                              {group.subject || "Subject not set"}
                            </h2>
                            <p>
                              {group.gradedCount} of {group.quizzes.length}{" "}
                              scores available
                            </p>
                          </div>
                          <strong>
                            {group.percentage === null
                              ? "No score yet"
                              : `${group.percentage}%`}
                          </strong>
                        </div>
                        {group.percentage !== null && (
                          <div
                            className="qn-performance-meter"
                            role="meter"
                            aria-label={`${group.subject || "Unassigned subject"} score`}
                            aria-valuenow={group.percentage}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span
                              style={{
                                width: `${Math.min(100, Math.max(0, group.percentage))}%`,
                              }}
                            />
                          </div>
                        )}
                        {!group.subject && (
                          <p className="qn-performance-note">
                            Your teacher hasn’t assigned a subject to these
                            quizzes yet.
                          </p>
                        )}
                        <PerformanceChart quizzes={group.quizzes} />
                        <table className="qr-table qr-performance-table">
                          <caption className="sr-only">
                            {group.subject || "Subject not set"} quiz scores
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Quiz</th>
                              <th scope="col">Score</th>
                              <th scope="col">Status</th>
                              <th scope="col">
                                <span className="sr-only">Result</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.quizzes.map((quiz) => (
                              <tr key={quiz.id}>
                                <th scope="row">
                                  <span className="qr-question-title">
                                    {quiz.title}
                                  </span>
                                  <span className="qr-meta">
                                    {quiz.format === "paper"
                                      ? "Paper exam"
                                      : "Online quiz"}
                                    {quiz.completedAt
                                      ? ` · ${new Date(quiz.completedAt).toLocaleDateString()}`
                                      : ""}
                                  </span>
                                </th>
                                <td data-label="Score">
                                  {quiz.state === "graded" ? (
                                    <>
                                      <strong>
                                        {quiz.score}/{quiz.maxScore}
                                      </strong>
                                      <span className="qr-meta">
                                        {quiz.percentage}%
                                      </span>
                                    </>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td data-label="Status">
                                  <StatusBadge>
                                    {quiz.state === "graded"
                                      ? "Released"
                                      : quiz.state === "in_progress"
                                        ? "In progress"
                                        : quiz.state === "awaiting_grading"
                                          ? "Awaiting grading"
                                          : "Awaiting release"}
                                  </StatusBadge>
                                </td>
                                <td className="qr-result-link">
                                  {quiz.state !== "in_progress" && (
                                    <Link
                                      to={`/result/${quiz.attemptId}`}
                                      className="qn-icon-button"
                                      aria-label={`View result for ${quiz.title}`}
                                    >
                                      <ArrowUpRight
                                        size={19}
                                        aria-hidden="true"
                                      />
                                    </Link>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </section>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        )
      )}
    </div>
  );
}

/** Each point is the best released result for a quiz, ordered by completion date. */
export function PerformanceChart({
  quizzes,
}: {
  quizzes: StudentPerformance["subjects"][number]["quizzes"];
}) {
  const points = quizzes
    .filter(
      (q) =>
        q.state === "graded" &&
        q.percentage !== null &&
        Number.isFinite(q.percentage) &&
        q.completedAt &&
        Number.isFinite(Date.parse(q.completedAt)),
    )
    .sort(
      (a, b) =>
        Date.parse(a.completedAt!) - Date.parse(b.completedAt!) ||
        a.id.localeCompare(b.id),
    );
  const change =
    points.length > 1
      ? Math.round(
          (points[points.length - 1].percentage! -
            points[points.length - 2].percentage!) *
            100,
        ) / 100
      : null;
  const x = (i: number) =>
    points.length === 1 ? 334 : 52 + (i * 564) / (points.length - 1);
  const y = (value: number) => 206 - Math.min(100, Math.max(0, value)) * 1.7;
  return (
    <section className="qn-performance-chart" aria-label="Score progress">
      <div className="qn-performance-chart-heading">
        <h3>Score progress</h3>
        <span>
          {change === null
            ? "More results needed for a trend"
            : change === 0
              ? "No change from previous quiz"
              : `${change > 0 ? "Up" : "Down"} ${Math.abs(change)} percentage points from previous quiz`}
        </span>
      </div>
      {points.length ? (
        <svg
          viewBox="0 0 650 255"
          role="img"
          aria-label={`Released quiz scores in completion order: ${points.map((q) => `${q.title}: ${q.percentage}%`).join(", ")}`}
        >
          {[0, 25, 50, 75, 100].map((value) => (
            <g key={value}>
              <line
                x1="52"
                x2="616"
                y1={y(value)}
                y2={y(value)}
                className="qn-chart-grid"
              />
              <text x="40" y={y(value) + 4} textAnchor="end">
                {value}%
              </text>
            </g>
          ))}
          {points.length > 1 && (
            <polyline
              points={points
                .map((q, i) => `${x(i)},${y(q.percentage!)}`)
                .join(" ")}
              className="qn-chart-line"
            />
          )}
          {points.map((q, i) => (
            <g key={q.id}>
              <circle
                cx={x(i)}
                cy={y(q.percentage!)}
                r="5"
                className="qn-chart-point"
              >
                <title>
                  {q.title}: {q.percentage}% ·{" "}
                  {new Date(q.completedAt!).toLocaleDateString()}
                </title>
              </circle>
              {(points.length <= 8 || i === 0 || i === points.length - 1) && (
                <text x={x(i)} y="234" textAnchor="middle">
                  {i + 1}
                </text>
              )}
            </g>
          ))}
          <text x="334" y="253" textAnchor="middle">
            Quizzes in completion order
          </text>
        </svg>
      ) : (
        <p className="qn-performance-note">
          Your graph appears when dated, released scores are available.
        </p>
      )}
    </section>
  );
}
