import { useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Check,
  Plus,
  Trash2,
  Users,
  ChevronRight,
  Search,
  RefreshCw,
  ChartNoAxesColumn,
} from "lucide-react";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import "../../styles/sections.css";
import { SectionResults } from "./SectionResults";
import { QuestionAnalysisPage } from "../../pages/teacher/QuestionAnalysisPage";
import { GradebookPage } from "../../pages/teacher/GradebookPage";
import { api } from "../../api/client";
import { ClassSection, Quiz, QuizSection, RosterStudent } from "../../types";

export function SectionManager({ quizzes }: { quizzes: Quiz[] }) {
  const [params, setParams] = useSearchParams();
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true),
    [rosterLoading, setRosterLoading] = useState(false);
  const [tab, setTab] = useState<"students" | "codes" | "gradebook">(
    params.get("tab") === "gradebook"
      ? "gradebook"
      : params.get("tab") === "codes" || params.has("quiz")
        ? "codes"
        : "codes",
  );
  useEffect(() => {
    const value = params.get("tab");
    setTab(
      value === "gradebook"
        ? "gradebook"
        : value === "codes" || (!value && params.has("quiz"))
          ? "codes"
          : value === "students"
            ? "students"
            : "codes",
    );
  }, [params]);
  const [quizId, setQuizId] = useState(
    params.get("quiz") || quizzes[0]?.id || "",
  );
  const [link, setLink] = useState<QuizSection | null>(null),
    [codeLoading, setCodeLoading] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [copied, setCopied] = useState(false);
  const [revision, setRevision] = useState(0);
  const [sectionSearch, setSectionSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const selected = classes.find((c) => c.id === params.get("section"));
  const selectedRef = useRef(selected?.id);
  selectedRef.current = selected?.id;
  const sortClasses = (value: ClassSection[]) =>
    [...value].sort((a, b) =>
      a.name.localeCompare(b.name, "en", {
        numeric: true,
        sensitivity: "base",
      }),
    );
  const shownClasses = classes.filter((c) =>
    c.name.toLowerCase().includes(sectionSearch.trim().toLowerCase()),
  );
  const shownStudents = roster.filter((s) =>
    `${s.full_name} ${s.email}`
      .toLowerCase()
      .includes(studentSearch.trim().toLowerCase()),
  );
  useAutoRefresh(async () => {
    if (busy || loading || rosterLoading) return;
    const id = selectedRef.current;
    const [all, students] = await Promise.all([
      api.listClasses(),
      id ? api.listRoster(id) : Promise.resolve([]),
    ]);
    setClasses(sortClasses(all));
    if (id === selectedRef.current) setRoster(students);
  }, 20000);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .listClasses()
      .then((value) => {
        if (active)
          setClasses(
            value.sort((a, b) =>
              a.name.localeCompare(b.name, "en", {
                numeric: true,
                sensitivity: "base",
              }),
            ),
          );
      })
      .catch((e) => {
        if (active) setError(e.message || "Unable to load sections.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setRosterLoading(true);
    setRoster([]);
    setNotice("");
    setStudentSearch("");
    setError("");
    api
      .listRoster(selected.id)
      .then((value) => {
        if (active) setRoster(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setRosterLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected?.id, revision]);
  useEffect(() => {
    if (!selected || !quizId || tab !== "codes") {
      setLink(null);
      return;
    }
    let active = true;
    setCodeLoading(true);
    setLink(null);
    setCopied(false);
    api
      .listSections(quizId)
      .then((value) => {
        if (active)
          setLink(
            value.find((s) => s.class_section_id === selected.id) || null,
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setCodeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected?.id, quizId, revision, tab]);
  const remove = async (student: RosterStudent) => {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.removeRosterStudent(selected.id, student.id);
      setRoster((current) => current.filter((s) => s.id !== student.id));
      setClasses((current) =>
        current.map((c) =>
          c.id === selected.id
            ? { ...c, student_count: Math.max(0, roster.length - 1) }
            : c,
        ),
      );
      setNotice("Removed from roster. Quiz submissions are preserved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove student.");
    } finally {
      setBusy(false);
    }
  };
  const attach = async () => {
    if (!selected || !quizId || busy) return;
    setBusy(true);
    setError("");
    try {
      setLink(await api.attachClass(quizId, selected.id));
      setNotice("Section assigned to this quiz.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to assign section.");
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.access_code);
      setCopied(true);
    } catch {
      setError("Select the code and copy it manually.");
    }
  };
  return (
    <section
      aria-labelledby={params.get("activity") ? undefined : "sections-heading"}
      aria-label={params.get("activity") ? "Section quiz workspace" : undefined}
      className="qn-sections space-y-6"
    >
      {!selected && (
        <div className="qn-sections-heading">
          <div>
            <h1 id="sections-heading" className="qn-title">
              Sections
            </h1>
            <p className="qn-description">
              Students, quizzes, and scores in one place.
            </p>
          </div>
          <div className="qn-section-actions">
            <button
              type="button"
              className="qn-button-secondary"
              disabled={loading || rosterLoading || busy}
              onClick={() => setRevision((n) => n + 1)}
              aria-label="Refresh sections"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}{" "}
          <button
            onClick={() => setRevision((n) => n + 1)}
            className="underline"
          >
            Retry
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-indigo-700">
          {notice}
        </p>
      )}
      {!selected && !loading && classes.length > 0 && (
        <>
          <label className="qn-section-search">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Search sections"
              placeholder="Find a section"
              value={sectionSearch}
              onChange={(e) => setSectionSearch(e.target.value)}
            />
          </label>
          <div className="qn-section-grid" aria-label="Your sections">
            {shownClasses.map((c) => (
              <button
                type="button"
                key={c.id}
                className="qn-section-card"
                aria-label={`Open ${c.name}`}
                disabled={busy}
                onClick={() => {
                  setParams({ section: c.id, tab: "codes" });
                  setError("");
                }}
              >
                <span className="qn-section-card-icon">
                  <Users size={26} aria-hidden="true" />
                </span>
                <span className="qn-section-card-copy">
                  <strong>{c.name}</strong>
                  <span>{c.student_count ?? 0} students</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
          {!shownClasses.length && (
            <p className="qn-description" role="status">
              No matching sections.
            </p>
          )}
        </>
      )}
      {loading ? (
        <p role="status" className="py-6 text-center text-sm text-slate-500">
          Loading sections…
        </p>
      ) : selected ? (
        <>
          {!params.get("activity") && (
            <>
              <button
                className="qn-return-button"
                type="button"
                onClick={() => {
                  setParams({});
                  setError("");
                  setNotice("");
                }}
              >
                <ArrowLeft size={18} aria-hidden="true" />
                Back to sections
              </button>
              <div className="qn-section-roster-heading">
                <div>
                  <h1 id="sections-heading" className="qn-title">
                    {selected.name}
                  </h1>
                  <p>
                    {tab === "students"
                      ? "Students by last name · A–Z"
                      : tab === "codes"
                        ? "Quizzes assigned to this section"
                        : "Quiz scores and totals"}
                  </p>
                </div>
                <Link
                  className="qn-button-primary"
                  to={`/teacher/create?section=${encodeURIComponent(selected.id)}`}
                >
                  <Plus size={16} aria-hidden="true" />
                  New quiz
                </Link>
              </div>
              <div className="flex gap-2 border-b border-slate-100 pb-3">
                {(["codes", "students"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={tab === value}
                    onClick={() => {
                      setTab(value);
                      setParams({
                        ...Object.fromEntries(params),
                        section: selected.id,
                        tab: value,
                      });
                    }}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === value ? "bg-indigo-50 text-indigo-700" : "text-slate-500"}`}
                  >
                    {value === "students"
                      ? `Students (${roster.length})`
                      : value === "codes"
                        ? "Quizzes"
                        : "Gradebook"}
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === "students" ? (
            <>
              <label className="qn-section-search">
                <Search size={17} aria-hidden="true" />
                <input
                  aria-label="Search students"
                  placeholder="Find a student"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
              </label>
              {rosterLoading ? (
                <p
                  role="status"
                  className="py-6 text-center text-sm text-slate-500"
                >
                  Loading students…
                </p>
              ) : !shownStudents.length ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  {roster.length
                    ? "No matching students."
                    : "No students yet. Students appear here after starting a section quiz or receiving a paper answer sheet."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="qn-table qn-responsive-table">
                    <thead className="border-b text-xs text-slate-500">
                      <tr>
                        <th className="py-3">Student</th>
                        <th>Email</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownStudents.map((student) => (
                        <tr
                          key={student.id}
                          className="border-b border-slate-100"
                        >
                          <td
                            data-label="Student"
                            className="py-3 pr-3 font-medium"
                          >
                            {student.full_name}
                          </td>
                          <td
                            data-label="Email"
                            className="pr-3 text-slate-500"
                          >
                            {student.email}
                          </td>
                          <td data-label="Actions">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void remove(student)}
                              aria-label={`Remove ${student.full_name} from roster`}
                              className="rounded-lg p-2 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : tab === "gradebook" ? (
            <GradebookPage key={selected.id} embeddedSection={selected} />
          ) : (
            <div className="space-y-4">
              <SectionQuizzes
                quizzes={quizzes}
                sectionId={selected.id}
                sectionName={selected.name}
                revision={revision}
                onAssigned={link}
              />
              {!params.get("activity") && (
                <details className="qn-quiet-details">
                  <summary>Assign an existing quiz</summary>
                  {quizzes.length ? (
                    <>
                      <label className="block max-w-xl text-sm font-semibold text-slate-600">
                        Quiz
                        <select
                          aria-label="Section quiz codes"
                          value={quizId}
                          disabled={busy}
                          onChange={(e) => setQuizId(e.target.value)}
                          className="block w-full mt-1 rounded-xl border bg-white p-2.5 text-sm"
                        >
                          {quizzes.map((q) => (
                            <option key={q.id} value={q.id}>
                              {q.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      {quizzes.find((q) => q.id === quizId)?.exam_format ===
                      "paper" ? (
                        <Link
                          to={`/teacher/paper/${quizId}?section=${selected.id}`}
                          className="inline-block rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold"
                        >
                          Print & scan paper exam
                        </Link>
                      ) : codeLoading ? (
                        <p role="status" className="text-sm text-slate-500">
                          Loading code…
                        </p>
                      ) : link ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <code className="select-all rounded-lg bg-slate-100 px-4 py-3 font-semibold">
                            {link.access_code}
                          </code>
                          <button
                            type="button"
                            onClick={() => void copy()}
                            className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700"
                          >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                            {copied ? "Copied" : "Copy code"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void attach()}
                          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                        >
                          Assign section to quiz
                        </button>
                      )}
                      {quizzes.find((q) => q.id === quizId)?.status !==
                        "published" && (
                        <p className="text-xs text-amber-800">
                          Publish the quiz before sharing its code.
                        </p>
                      )}
                      <Link
                        to="/teacher/class-list"
                        className="inline-block text-sm font-semibold text-indigo-700"
                      >
                        View class progress →
                      </Link>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Create a quiz and select this section to get a quiz code.
                    </p>
                  )}
                </details>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500">
          {classes.length ? (
            params.has("section") ? (
              "Section unavailable. Choose a section above."
            ) : (
              "Choose a section to view its quizzes."
            )
          ) : (
            <>
              <span>Add a section while creating a subject.</span>
              <br />
              <Link to="/teacher" className="qn-button-primary mt-3">
                Go to Subjects
              </Link>
            </>
          )}
        </p>
      )}
    </section>
  );
}

function SectionQuizzes({
  quizzes,
  sectionId,
  sectionName,
  revision,
  onAssigned,
}: {
  quizzes: Quiz[];
  sectionId: string;
  sectionName: string;
  revision: number;
  onAssigned: QuizSection | null;
}) {
  const [params, setParams] = useSearchParams();
  const [assigned, setAssigned] = useState<
    { quiz: Quiz; section: QuizSection }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setAssigned([]);
    const load = async () => {
      const rows: { quiz: Quiz; section: QuizSection }[] = [];
      let index = 0;
      await Promise.all(
        Array.from({ length: Math.min(4, quizzes.length) }, async () => {
          while (index < quizzes.length) {
            const quiz = quizzes[index++];
            const sections = await api.listSections(quiz.id);
            const section = sections.find(
              (s) => s.class_section_id === sectionId,
            );
            if (section) rows.push({ quiz, section });
          }
        }),
      );
      if (active)
        setAssigned(
          rows.sort(
            (a, b) =>
              (a.quiz.subject || "").localeCompare(b.quiz.subject || "") ||
              a.quiz.title.localeCompare(b.quiz.title),
          ),
        );
    };
    void load()
      .catch(() => {
        if (active)
          setError("Unable to load assigned quizzes. Refresh to try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [quizzes, sectionId, revision, onAssigned]);
  if (loading) return <p role="status">Loading section quizzes…</p>;
  if (error) return <p role="alert">{error}</p>;
  const opened = assigned.find((row) => row.quiz.id === params.get("activity"));
  const panel = params.get("panel") === "analysis" ? "analysis" : "class-list";
  if (opened)
    return (
      <section className="space-y-5 qn-section-activity">
        {params.get("subjectRoom") ? (
          <Link
            className="qn-return-button"
            to={`/teacher/subjects/${encodeURIComponent(params.get("subjectRoom")!)}`}
          >
            <ArrowLeft size={18} />
            Back to subject
          </Link>
        ) : (
          <button
            type="button"
            className="qn-return-button"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("activity");
              next.delete("panel");
              setParams(next);
            }}
          >
            <ArrowLeft size={18} aria-hidden="true" /> Back to section quizzes
          </button>
        )}
        <header className="qn-quiz-workspace-heading">
          <div className="qn-quiz-workspace-title">
            <p>
              {sectionName}
              {opened.quiz.subject ? ` · ${opened.quiz.subject}` : ""}
            </p>
            <h1>{opened.quiz.title}</h1>
            <span>
              {opened.quiz.exam_format === "paper"
                ? "Paper exam"
                : "Online quiz"}{" "}
              · {opened.quiz.status === "published" ? "Published" : "Draft"}
            </span>
          </div>
          <div className="qn-section-actions">
            <Link
              className="qn-button-secondary"
              to={`/teacher/edit/${opened.quiz.id}${params.get("subjectRoom") ? "?subjectRoom=" + encodeURIComponent(params.get("subjectRoom")!) : ""}`}
            >
              Edit questions
            </Link>
            {opened.quiz.exam_format === "paper" && (
              <Link
                className="qn-button-primary"
                to={`/teacher/paper/${opened.quiz.id}?section=${opened.section.id}`}
              >
                Print & scan
              </Link>
            )}
          </div>
        </header>
        <nav className="qn-quiz-view-tabs" aria-label="Quiz views">
          {(["class-list", "analysis"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={panel === value}
              onClick={() =>
                setParams({ ...Object.fromEntries(params), panel: value })
              }
            >
              {value === "class-list" ? (
                <Users size={19} aria-hidden="true" />
              ) : (
                <ChartNoAxesColumn size={19} aria-hidden="true" />
              )}
              <span>{value === "class-list" ? "Class list" : "Analysis"}</span>
            </button>
          ))}
        </nav>
        {panel === "analysis" ? (
          <QuestionAnalysisPage
            key={opened.quiz.id}
            context={{ quiz: opened.quiz, sectionId: opened.section.id }}
          />
        ) : (
          <SectionResults
            key={opened.quiz.id}
            quizzes={[opened.quiz]}
            view="class-list"
            lockedSection={opened.section.id}
          />
        )}
      </section>
    );
  return (
    <div className="qn-section-quiz-list">
      {assigned.length ? (
        assigned.map(({ quiz, section }) => (
          <article className="qn-section-quiz" key={quiz.id}>
            <div>
              <span className="qn-description">
                {quiz.subject || "Subject not set"} ·{" "}
                {quiz.exam_format === "paper" ? "Paper exam" : "Online quiz"}
              </span>
              <h3>{quiz.title}</h3>
              <span className="qn-description">
                {quiz.status === "published" ? "Published" : "Draft"}
              </span>
            </div>
            <div className="qn-section-actions">
              {quiz.status === "published" && quiz.exam_format !== "paper" && (
                <button
                  className="qn-button-secondary"
                  type="button"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(section.access_code)
                      .then(() => setCopied(quiz.id))
                      .catch(() =>
                        setError(
                          "Unable to copy. Use the code under Assign an existing quiz.",
                        ),
                      )
                  }
                >
                  <Copy size={15} />
                  {copied === quiz.id ? "Copied" : section.access_code}
                </button>
              )}
              <button
                type="button"
                className="qn-button-primary"
                onClick={() =>
                  setParams({
                    ...Object.fromEntries(params),
                    section: sectionId,
                    tab: "codes",
                    activity: quiz.id,
                    panel: "class-list",
                  })
                }
              >
                Open quiz <ChevronRight size={16} />
              </button>
            </div>
          </article>
        ))
      ) : (
        <p className="qn-description">
          No quizzes assigned yet. Create a quiz for this section or assign an
          existing quiz below.
        </p>
      )}
    </div>
  );
}
