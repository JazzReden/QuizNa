import { PageHeading } from "../../components/common/WorkspaceUi";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, RefreshCw } from "lucide-react";
import { api } from "../../api/client";
import { ClassSection, SectionGradebook } from "../../types";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

export function GradebookPage({
  embeddedSection,
}: { embeddedSection?: ClassSection } = {}) {
  const [params, setParams] = useSearchParams();
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [sectionId, setSectionId] = useState(
    embeddedSection?.id || params.get("section") || "",
  );
  const [book, setBook] = useState<SectionGradebook | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSections, setLoadingSections] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState(params.get("search") || "");
  const activeSection = useRef(sectionId);
  activeSection.current = sectionId;
  useAutoRefresh(async () => {
    if (!sectionId) return;
    const data = await api.getSectionGradebook(sectionId);
    if (activeSection.current === sectionId) setBook(data);
  });
  useEffect(() => {
    if (embeddedSection) {
      setSections([embeddedSection]);
      setSectionId(embeddedSection.id);
      setLoadingSections(false);
      setSearch("");
      return;
    }
    let active = true;
    setLoadingSections(true);
    setError("");
    api
      .listClasses()
      .then((rows) => {
        if (!active) return;
        setSections(rows);
        setSectionId((id) =>
          rows.some((s) => s.id === id) ? id : rows[0]?.id || "",
        );
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoadingSections(false);
      });
    return () => {
      active = false;
    };
  }, [retry, embeddedSection?.id]);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setBook(null);
    if (!sectionId) return;
    setLoading(true);
    setError("");
    api
      .getSectionGradebook(sectionId)
      .then((data) => {
        if (active) setBook(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sectionId, refresh]);
  const exportCsv = useCallback(async () => {
    setExporting(true);
    setError("");
    try {
      const blob = await api.downloadGradebook(sectionId);
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download =
        `QuizNa_${book?.section.name || "Section"}_gradebook.csv`.replace(
          /[<>:"/\\|?*\x00-\x1f]/g,
          "_",
        );
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export gradebook.");
    } finally {
      setExporting(false);
    }
  }, [sectionId, book]);
  const rows =
    book?.rows.filter((r) =>
      `${r.name} ${r.email}`.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  return (
    <div
      className={`${embeddedSection ? "" : "qn-page "}qn-records qn-gradebook space-y-5`}
    >
      {!embeddedSection && (
        <PageHeading
          title="Section gradebook"
          description="Teacher-confirmed scores, ordered by last name."
          actions={
            <>
              <Link className="qn-button-quiet" to="/teacher/sections">
                Manage sections
              </Link>
            </>
          }
        />
      )}
      <div className="flex flex-wrap gap-4 items-end rounded-xl border border-slate-200 bg-white p-4">
        {!embeddedSection && (
          <label className="text-sm font-medium flex-1 min-w-48">
            Section
            <select
              aria-label="Gradebook section"
              value={sectionId}
              onChange={(e) => {
                setSearch("");
                setSectionId(e.target.value);
                setParams({ section: e.target.value }, { replace: true });
              }}
              className="mt-1 block w-full rounded-lg border border-slate-300 p-2.5 bg-white"
            >
              {!sections.length && <option value="">Choose a section</option>}
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm font-medium flex-1 min-w-48">
          Find a student
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setParams(
                {
                  ...Object.fromEntries(params),
                  section: sectionId,
                  ...(e.target.value ? { search: e.target.value } : {}),
                },
                { replace: true },
              );
            }}
            placeholder="Name or email"
            className="mt-1 block w-full rounded-lg border border-slate-300 p-2.5"
          />
        </label>
        <button
          type="button"
          aria-label="Refresh gradebook"
          disabled={loading || loadingSections}
          onClick={() => {
            setRetry((n) => n + 1);
            setRefresh((n) => n + 1);
          }}
          className="qn-icon-button"
        >
          <RefreshCw size={18} />
        </button>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={!book || loading || loadingSections || exporting}
          className="qn-button-primary"
        >
          <Download size={16} />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      {error && (
        <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">
          {error}
          <button
            type="button"
            onClick={() => {
              setRetry((n) => n + 1);
              setRefresh((n) => n + 1);
            }}
            className="ml-3 underline"
          >
            Try again
          </button>
        </div>
      )}
      {loading || loadingSections ? (
        <p role="status" className="py-12 text-center text-slate-500">
          Loading gradebook…
        </p>
      ) : !sections.length ? (
        <p className="bg-white border rounded-xl p-10 text-center text-slate-500">
          Create a section to begin. Students join when they start a quiz.
        </p>
      ) : (
        book && (
          <>
            <details className="qn-quiet-details">
              <summary>About totals and export</summary>
              <p>
                Totals use the best teacher-confirmed score for each quiz.
                Unconfirmed and missing scores stay blank. Select a score to
                review or correct it. CSV includes the whole section.
              </p>
            </details>
            {!book.quizzes.length && (
              <p className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-800">
                No published quizzes for this section yet. Select this section
                when creating a quiz, then publish it.
              </p>
            )}
            <div
              tabIndex={0}
              role="region"
              aria-label="Section gradebook table"
              className="qn-gradebook-sheet overflow-x-auto rounded-xl border border-slate-200 bg-white focus-visible:outline-indigo-600"
            >
              <table className="qn-table qn-gradebook-grid">
                <caption className="sr-only">
                  {book.section.name} quiz scores, ordered by last name
                </caption>
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th
                      scope="col"
                      className="qn-student-column p-4 min-w-56 sticky left-0 bg-slate-50"
                    >
                      Student
                    </th>
                    {book.quizzes.map((q) => (
                      <th scope="col" className="p-4 min-w-44" key={q.id}>
                        <span>{q.title}</span>
                      </th>
                    ))}
                    <th scope="col" className="p-4 min-w-36">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.email} className="align-top">
                      <th
                        scope="row"
                        className="qn-student-column p-4 sticky left-0 bg-white font-medium"
                      >
                        <span>{r.name}</span>
                        {!r.onRoster && (
                          <span className="block text-xs text-slate-500 mt-1">
                            Not on current roster
                          </span>
                        )}
                      </th>
                      {r.cells.map((c) => {
                        const reviewUrl = (attempt: string) =>
                          `/teacher/grading/${c.quizId}?${new URLSearchParams({ attempt, from: embeddedSection ? "section-gradebook" : "gradebook", section: sectionId, ...(search ? { search } : {}) })}`;
                        const quizTitle =
                          book.quizzes.find((q) => q.id === c.quizId)?.title ||
                          "quiz";
                        const linkStyle =
                          "rounded text-indigo-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600";
                        return (
                          <td
                            key={c.quizId}
                            data-label={
                              book.quizzes.find((q) => q.id === c.quizId)
                                ?.title || "Quiz"
                            }
                            className="p-4"
                          >
                            {c.score !== null && c.scoreAttemptId ? (
                              <Link
                                to={reviewUrl(c.scoreAttemptId)}
                                aria-label={`Review ${r.name}: ${quizTitle}, score ${c.score} out of ${c.maxScore}`}
                                className={`qn-score-link ${linkStyle}`}
                              >
                                {c.score}/{c.maxScore}
                              </Link>
                            ) : c.score !== null || !c.pending ? (
                              <span className="font-semibold tabular-nums">
                                {c.score === null
                                  ? "—"
                                  : `${c.score}/${c.maxScore}`}
                              </span>
                            ) : null}
                            {c.pending && c.gradingAttemptId ? (
                              <>
                                {c.status === "in_progress" && (
                                  <span className="block text-xs mt-1 text-amber-700">
                                    In progress
                                  </span>
                                )}
                                <Link
                                  to={reviewUrl(c.gradingAttemptId)}
                                  aria-label={`${c.awaitingConfirmation ? "Confirm" : "Grade"} ${r.name}: ${quizTitle}, ${c.awaitingConfirmation ? "awaiting confirmation" : "awaiting grading"}`}
                                  className={`block w-fit text-xs mt-1 ${linkStyle}`}
                                >
                                  {c.awaitingConfirmation
                                    ? "Confirm score"
                                    : "Grade answers"}
                                </Link>
                              </>
                            ) : (
                              <span
                                className={`block text-xs mt-1 ${c.status === "in_progress" ? "text-amber-700" : "text-slate-500"}`}
                              >
                                {c.status === "in_progress"
                                  ? "In progress"
                                  : c.status === "not_started"
                                    ? "Not started"
                                    : c.pending
                                      ? "Awaiting grading"
                                      : c.score === null
                                        ? "Submitted"
                                        : ""}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td data-label="Total" className="p-4">
                        <span className="font-bold text-indigo-700 tabular-nums">
                          {r.total === null ? "—" : `${r.total}/${r.outOf}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && (
                <p className="p-10 text-center text-slate-500">
                  {search
                    ? "No students match your search."
                    : "No students yet. Students join when they start a quiz."}
                </p>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}
