import { Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { Leaderboard, Quiz } from "../../types";

type ParticipationFilter = "all" | "submitted" | "in_progress" | "not_started";
const participationFilters = [
  { value: "all", label: "All students" },
  { value: "submitted", label: "Submitted" },
  { value: "in_progress", label: "In progress" },
  { value: "not_started", label: "Not started" },
] as const;

export function SectionResults({
  quizzes,
  view,
  lockedSection,
}: {
  quizzes: Quiz[];
  lockedSection?: string;
  view: "leaderboard" | "class-list";
}) {
  const [params] = useSearchParams();
  const [quizId, setQuizId] = useState(
    quizzes.find((q) => q.id === params.get("quiz"))?.id ||
      quizzes.find((q) => q.status === "published")?.id ||
      quizzes[0]?.id ||
      "",
  );
  const [sectionId, setSectionId] = useState(
    lockedSection || params.get("section") || "",
  );
  const [data, setData] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ParticipationFilter>("all");
  useEffect(() => setStatusFilter("all"), [quizId, sectionId, view]);
  const [assigning, setAssigning] = useState("");
  const selection = `${quizId}:${sectionId}`;
  const activeSelection = useRef(selection);
  activeSelection.current = selection;
  const requestId = useRef(0);
  const refresh = useCallback(
    async (silent = false) => {
      if (!quizId || activeSelection.current !== selection) return;
      const current = ++requestId.current;
      if (!silent) setLoading(true);
      setError("");
      try {
        const result = await (view === "class-list"
          ? api.getClassList(quizId, sectionId)
          : api.getLeaderboard(quizId, sectionId));
        if (
          current === requestId.current &&
          activeSelection.current === selection
        )
          setData(result);
      } catch (err) {
        if (
          current === requestId.current &&
          activeSelection.current === selection
        )
          setError(
            err instanceof Error ? err.message : "Unable to load scores.",
          );
      } finally {
        if (
          current === requestId.current &&
          activeSelection.current === selection
        )
          setLoading(false);
      }
    },
    [quizId, sectionId, view],
  );
  useEffect(() => {
    void refresh();
    return () => {
      ++requestId.current;
    };
  }, [refresh]);
  useAutoRefresh(() => refresh(true));
  useEffect(() => {
    if (!quizzes.some((q) => q.id === quizId)) {
      setQuizId(
        quizzes.find((q) => q.status === "published")?.id ||
          quizzes[0]?.id ||
          "",
      );
      setSectionId("");
      setData(null);
    }
  }, [quizzes, quizId]);
  const download = async (detailed = false) => {
    try {
      const exportStatus = view === "class-list" ? statusFilter : "all";
      const blob = await (detailed
          ? api.downloadCsv(quizId, sectionId, exportStatus)
          : api.downloadScorebook(quizId, sectionId, exportStatus)),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      const sectionLabel =
        sectionId === "unassigned"
          ? "Unassigned"
          : data?.sections.find((s) => s.id === sectionId)?.name ||
            "All sections";
      a.download =
        `${data?.quiz.title || "QuizNa"}_${sectionLabel}_${exportStatus === "all" ? "All students" : participationFilters.find((f) => f.value === exportStatus)?.label}_${detailed ? "detailed-results" : "scores"}.csv`.replace(
          /[<>:"/\\|?*\x00-\x1f]/g,
          "_",
        );
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to download scores.",
      );
    }
  };
  const assign = async (attemptId: string, id: string) => {
    if (assigning) return;
    setAssigning(attemptId);
    setError("");
    try {
      await api.assignSection(attemptId, id || null);
      if (activeSelection.current !== selection) return;
      setNotice("Section updated for this student’s quiz records.");
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to change section.",
      );
    } finally {
      setAssigning("");
    }
  };
  if (!quizzes.length) return null;
  let rows = (data?.rows || [])
    .filter(
      (row) => view !== "leaderboard" || (row.isGraded && row.score !== null),
    )
    .filter(
      (row) =>
        (view !== "class-list" ||
          statusFilter === "all" ||
          row.participation === statusFilter) &&
        `${row.studentName} ${row.studentEmail}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  if (view === "class-list")
    rows = rows.slice().sort(
      (a, b) =>
        a.sectionName.localeCompare(b.sectionName, "en", {
          sensitivity: "base",
          numeric: true,
        }) ||
        a.studentLastName.localeCompare(b.studentLastName, "en", {
          sensitivity: "base",
          numeric: true,
        }) ||
        a.studentName.localeCompare(b.studentName, "en", {
          sensitivity: "base",
          numeric: true,
        }) ||
        a.studentEmail.localeCompare(b.studentEmail),
    );
  return (
    <section
      aria-labelledby={lockedSection ? undefined : "scores-heading"}
      aria-label={lockedSection ? "Quiz class list" : undefined}
      className="space-y-5"
    >
      {!lockedSection && (
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 id="scores-heading" className="qn-title">
              {view === "leaderboard" ? "Leaderboard" : "Class list"}
            </h1>
            <p className="qn-description">
              {view === "leaderboard"
                ? "Best graded scores. Tied percentages share a rank."
                : "Grouped by section. Last names A–Z."}
            </p>
          </div>
          <Link
            to={`/teacher/sections?quiz=${quizId}${(data?.sections.find((s) => s.id === sectionId) || data?.sections[0])?.class_section_id ? "&section=" + (data?.sections.find((s) => s.id === sectionId) || data?.sections[0])!.class_section_id : ""}`}
            className="qn-button-secondary"
          >
            Manage sections
          </Link>
        </div>
      )}
      <div className={lockedSection ? "qn-quiz-class-tools" : "space-y-5"}>
        <div
          className={
            lockedSection
              ? "qn-quiz-class-search"
              : "grid sm:grid-cols-2 lg:grid-cols-3 gap-3"
          }
        >
          {!lockedSection && (
            <>
              <label className="text-xs font-semibold text-slate-600">
                Quiz
                <select
                  aria-label="Scores quiz"
                  value={quizId}
                  onChange={(e) => {
                    setQuizId(e.target.value);
                    setSectionId("");
                    setData(null);
                    setSearch("");
                    setNotice("");
                  }}
                  className="block mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm bg-white"
                >
                  {quizzes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Section
                <select
                  aria-label="Scores section"
                  value={sectionId}
                  onChange={(e) => {
                    setSectionId(e.target.value);
                    setLoading(true);
                    setNotice("");
                  }}
                  className="block mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm bg-white"
                >
                  <option value="">All sections</option>
                  <option value="unassigned">Unassigned</option>
                  {data?.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="text-xs font-semibold text-slate-600">
            Find a student
            <input
              type="search"
              aria-label="Find a student"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or email"
              className="block mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
            />
          </label>
        </div>
        <div
          className={`flex flex-wrap justify-end gap-3 items-center ${lockedSection ? "qn-quiz-class-export" : ""}`}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              aria-label="Refresh scores"
              className="text-slate-500"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              disabled={!data || loading}
              title="Export the selected section and student status"
              onClick={() => void download()}
              className="flex items-center gap-1 text-xs font-semibold text-indigo-700"
            >
              <Download size={15} />
              Export scores CSV
            </button>
            {view === "class-list" && (
              <button
                type="button"
                disabled={
                  !data ||
                  loading ||
                  (view === "class-list" && statusFilter === "not_started")
                }
                title={
                  view === "class-list" && statusFilter === "not_started"
                    ? "No attempts yet. Use Export scores CSV for these students."
                    : "Export attempts for the selected section and student status"
                }
                onClick={() => void download(true)}
                className="flex items-center gap-1 text-xs font-semibold text-slate-600 disabled:opacity-50"
              >
                <Download size={15} /> Detailed CSV
              </button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="p-3 rounded-lg bg-rose-50 text-rose-800 text-sm"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-indigo-800">
          {notice}
        </p>
      )}
      {quizId && !lockedSection && view === "class-list" && (
        <Link
          to={`/teacher/analysis?quiz=${quizId}`}
          className="inline-block text-sm font-semibold text-indigo-700 mb-4"
        >
          Question analysis
        </Link>
      )}
      {view === "class-list" && data?.summary && (
        <div
          role="group"
          aria-label="Filter by student status"
          className="flex flex-wrap gap-2"
        >
          {participationFilters.map(({ value, label }) => {
            const count =
              value === "all"
                ? data.summary!.submitted +
                  data.summary!.in_progress +
                  data.summary!.not_started
                : data.summary![value];
            const selected = statusFilter === value;
            return (
              <button
                key={value}
                type="button"
                aria-label={`${label}: ${count} students`}
                aria-pressed={selected}
                disabled={loading}
                onClick={() => setStatusFilter(value)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50 ${selected ? "border-indigo-200 bg-indigo-50 font-semibold text-indigo-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                <strong>{count}</strong>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
      {loading ? (
        <p role="status" className="text-sm text-slate-500 py-6 text-center">
          Loading scores…
        </p>
      ) : !rows.length ? (
        <p role="status" className="text-sm text-slate-500 py-8 text-center">
          {search
            ? "No students match these filters."
            : statusFilter === "submitted"
              ? "No students have submitted yet."
              : statusFilter === "in_progress"
                ? "No students are currently answering."
                : statusFilter === "not_started"
                  ? "No students are waiting to start."
                  : "No students in this group yet."}
        </p>
      ) : (
        <div
          role="region"
          aria-label="Student results table"
          tabIndex={0}
          className="overflow-x-auto rounded-xl border border-slate-200 bg-white"
        >
          <table className="qn-table qn-responsive-table">
            <thead className="text-xs text-slate-500 border-b border-slate-200">
              <tr>
                {view === "leaderboard" && (
                  <th scope="col" className="py-3 pr-3">
                    Rank
                  </th>
                )}
                {view === "class-list" && (
                  <th scope="col" className="py-3 pr-3">
                    Status
                  </th>
                )}
                <th scope="col" className="py-3 pr-4">
                  Student
                </th>
                {!lockedSection && (
                  <th scope="col" className="py-3 pr-4">
                    Section
                  </th>
                )}
                {view === "leaderboard" && (
                  <th scope="col" className="py-3 pr-4">
                    Score
                  </th>
                )}
                {view === "class-list" && (
                  <>
                    <th scope="col" className="py-3 pr-4">
                      Grading
                    </th>
                    <th scope="col" className="py-3">
                      Review
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.sectionId}:${r.studentId}`}
                  className="border-b border-slate-100"
                >
                  {view === "leaderboard" ? (
                    <td
                      data-label="Rank"
                      className="py-3 pr-3 font-bold text-indigo-700"
                    >
                      {r.rank === null ? "—" : `#${r.rank}`}
                    </td>
                  ) : (
                    <td data-label="Status" className="py-3 pr-3">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${r.participation === "submitted" ? "bg-emerald-50 text-emerald-800" : r.participation === "in_progress" ? "bg-indigo-50 text-indigo-800" : "bg-slate-100 text-slate-600"}`}
                      >
                        {r.participation === "submitted"
                          ? "Submitted"
                          : r.participation === "in_progress"
                            ? "In progress"
                            : "Not started"}
                      </span>
                    </td>
                  )}
                  <td data-label="Student" className="py-3 pr-4">
                    <span className="font-semibold text-slate-900">
                      {r.studentName}
                    </span>
                    {view === "class-list" && (
                      <span
                        className="block max-w-48 truncate text-xs text-slate-500"
                        title={r.studentEmail}
                      >
                        {r.studentEmail}
                      </span>
                    )}
                  </td>
                  {!lockedSection && (
                    <td data-label="Section" className="py-3 pr-4">
                      {view === "leaderboard" ? (
                        <span>{r.sectionName}</span>
                      ) : (
                        <select
                          aria-label={`Section for ${r.studentName}`}
                          value={r.sectionId || ""}
                          disabled={
                            Boolean(assigning) ||
                            !r.attemptId ||
                            r.participation === "in_progress"
                          }
                          onChange={(e) =>
                            void assign(r.attemptId, e.target.value)
                          }
                          className="border border-slate-200 rounded-lg p-1.5 text-xs max-w-44 bg-white"
                        >
                          <option value="">Unassigned</option>
                          {data?.sections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  )}
                  {view === "leaderboard" && (
                    <td
                      data-label="Score"
                      className="py-3 pr-4 whitespace-nowrap"
                    >
                      {r.score === null ? (
                        "—"
                      ) : (
                        <>
                          <strong>
                            {r.score} / {r.maxScore}
                          </strong>
                          <span className="block text-xs text-slate-500">
                            {r.percentage}%
                          </span>
                        </>
                      )}
                    </td>
                  )}
                  {view === "class-list" && (
                    <>
                      <td data-label="Grading" className="py-3 pr-4">
                        <span
                          className={`text-xs rounded-full px-2 py-1 ${r.isGraded ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
                        >
                          {r.participation === "not_started" ||
                          (r.participation === "in_progress" && !r.isGraded)
                            ? "—"
                            : r.isGraded
                              ? "Graded"
                              : "Pending"}
                        </span>
                        {r.isGraded && r.pendingAttempts > 0 && (
                          <span className="block mt-1 text-xs text-amber-800">
                            {r.pendingAttempts} pending
                          </span>
                        )}
                      </td>
                      <td data-label="Review" className="py-3">
                        {r.reviewAttemptId ? (
                          <Link
                            to={`/teacher/grading/${quizId}?${new URLSearchParams({ attempt: r.reviewAttemptId!, ...(lockedSection && params.get("section") ? { from: "section-quiz", section: params.get("section")!, ...(params.get("subjectRoom") ? { subjectRoom: params.get("subjectRoom")! } : {}) } : {}) })}`}
                            className="qn-review-answer-link"
                            aria-label={`Review answers for ${r.studentName}`}
                          >
                            Review answers
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
