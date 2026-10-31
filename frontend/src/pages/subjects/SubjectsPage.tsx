import { SubjectAccessPanel } from "../../components/subjects/SubjectAccessPanel";
import { SubjectLeaderboard } from "../../components/subjects/SubjectLeaderboard";
import { SubjectQuizList } from "../../components/subjects/SubjectQuizList";
import { useCallback, useEffect, useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BookOpen, ChevronRight, Plus, ArrowLeft, Trophy } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../context/auth-context";
import { useDashboardReady } from "../../context/PostLoginContext";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { PageHeading, EmptyState } from "../../components/common/WorkspaceUi";
import type {
  SubjectRoom,
  SubjectDetail,
  SubjectRanking,
  ClassSection,
  Quiz,
} from "../../types";

export function SubjectsPage() {
  const { user } = useAuth(),
    teacher = user?.role === "teacher",
    base = teacher ? "/teacher" : "/student",
    { subjectId } = useParams(),
    navigate = useNavigate();
  const [rooms, setRooms] = useState<SubjectRoom[]>([]),
    [detail, setDetail] = useState<SubjectDetail | null>(null),
    [classes, setClasses] = useState<ClassSection[]>([]),
    [quizzes, setQuizzes] = useState<Quiz[]>([]),
    [ranking, setRanking] = useState<SubjectRanking[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState(false),
    [tab, setTab] = useState("quizzes");
  const [name, setName] = useState(""),
    [sectionName, setSectionName] = useState(""),
    [code, setCode] = useState(""),
    [selectedQuiz, setSelectedQuiz] = useState("");
  useDashboardReady(loading);
  const requestSequence = useRef(0);
  const creatingSubject = useRef(false);
  const normalizeSection = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  const existingSection = classes.find(
    (c) => normalizeSection(c.name) === normalizeSection(sectionName),
  );
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (subjectId) {
      const value = await api.getSubject(subjectId);
      const rows =
        value.leaderboard_enabled || teacher
          ? await api.subjectLeaderboard(subjectId)
          : [];
      if (sequence !== requestSequence.current) return;
      setDetail(value);
      setRanking(rows);
      if (!teacher && !value.leaderboard_enabled) setTab("quizzes");
    } else {
      const rows = await api.listSubjects();
      if (sequence === requestSequence.current) setRooms(rows);
    }
  }, [subjectId, teacher]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setTab("quizzes");
    setDetail(null);
    setForm(false);
    void load()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      requestSequence.current++;
    };
  }, [load]);
  useEffect(() => {
    if (teacher)
      void Promise.all([api.listClasses(), api.listTeacherQuizzes()])
        .then(([c, q]) => {
          setClasses(c);
          setQuizzes(q);
        })
        .catch((e) => setError(e.message));
  }, [teacher, subjectId]);
  useAutoRefresh(load);
  const action = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const linked = new Set(rooms.flatMap((r) => r.quiz_ids || []));
  const unassigned = quizzes.filter((q) => !linked.has(q.id));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(detail!.access_code);
      setNotice("Subject code copied.");
    } catch {
      setError("Select and copy the subject code.");
    }
  };
  return (
    <div className="qn-page qn-subject-page">
      {subjectId ? (
        <nav className="qn-course-breadcrumb" aria-label="Breadcrumb">
          <Link to={base}>
            <ArrowLeft size={16} />
            Subjects
          </Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span>{detail?.name || "Subject"}</span>
        </nav>
      ) : (
        <PageHeading
          title={teacher ? "Subjects" : "My subjects"}
          description={
            teacher
              ? "Your classes, organized by subject."
              : "Join your subject to see quizzes and results."
          }
          actions={
            teacher ? (
              <button
                className="qn-button-primary"
                onClick={() => setForm(!form)}
              >
                <Plus size={17} />
                New subject
              </button>
            ) : undefined
          }
        />
      )}
      {error && (
        <div role="alert" className="qn-alert qn-alert-error">
          {error}
          <button className="qn-button-quiet" onClick={() => void action(load)}>
            Retry
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="qn-alert">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading subjects…</p>
      ) : subjectId && detail ? (
        <>
          <header className="qn-course-header">
            <div className="qn-course-identity">
              <span className="qn-course-emblem" aria-hidden="true">
                <BookOpen size={30} strokeWidth={1.5} />
              </span>
              <div>
                <p className="qn-course-section">{detail.section_name}</p>
                <h1>{detail.name}</h1>
              </div>
            </div>
            {teacher && detail.quizzes.length > 0 && (
              <Link
                className="qn-button-primary"
                to={`/teacher/create?section=${detail.class_section_id}&subjectRoom=${detail.id}`}
              >
                <Plus size={17} />
                New quiz
              </Link>
            )}
          </header>
          <div
            className={`qn-course-layout${teacher ? "" : " qn-course-layout-student"}`}
          >
            <section className="qn-course-work" aria-label="Subject workspace">
              <div
                className="qn-subject-tabs"
                role="tablist"
                aria-label="Subject pages"
              >
                <button
                  role="tab"
                  aria-selected={tab === "quizzes"}
                  onClick={() => setTab("quizzes")}
                >
                  Quizzes
                  {detail.quizzes.length > 0 && (
                    <span className="qn-course-tab-count">
                      {detail.quizzes.length}
                    </span>
                  )}
                </button>
                {(teacher || detail.leaderboard_enabled) && (
                  <button
                    role="tab"
                    aria-selected={tab === "leaderboard"}
                    onClick={() => setTab("leaderboard")}
                  >
                    <Trophy size={16} />
                    Leaderboard
                  </button>
                )}
              </div>
              {tab === "leaderboard" ? (
                <SubjectLeaderboard rows={ranking} />
              ) : (
                <>
                  <SubjectQuizList detail={detail} teacher={teacher} />
                  {teacher && (
                    <details className="qn-subject-existing">
                      <summary>Add an existing quiz</summary>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void action(async () => {
                            await api.attachSubjectQuiz(
                              detail.id,
                              selectedQuiz,
                            );
                            setSelectedQuiz("");
                            await load();
                          });
                        }}
                      >
                        <label>
                          Quiz
                          <select
                            required
                            value={selectedQuiz}
                            onChange={(e) => setSelectedQuiz(e.target.value)}
                          >
                            <option value="">Select a quiz</option>
                            {quizzes
                              .filter(
                                (q) =>
                                  !detail.quizzes.some((d) => d.id === q.id),
                              )
                              .map((q) => (
                                <option key={q.id} value={q.id}>
                                  {q.title}
                                </option>
                              ))}
                          </select>
                        </label>
                        <button disabled={busy} className="qn-button-secondary">
                          Add to subject
                        </button>
                      </form>
                      <p className="qn-description">
                        The quiz must be assigned to {detail.section_name}.
                      </p>
                    </details>
                  )}
                </>
              )}
            </section>
            {teacher && (
              <SubjectAccessPanel
                detail={detail}
                busy={busy}
                onCopy={() => void copy()}
                onVisibility={(enabled) => {
                  void action(async () => {
                    await api.setSubjectLeaderboard(detail.id, enabled);
                    await load();
                  });
                }}
              />
            )}
          </div>
        </>
      ) : (
        <>
          {!teacher && (
            <form
              className="qn-subject-join"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  const r = await api.joinSubject(code.trim().toUpperCase());
                  navigate(`${base}/subjects/${r.id}`);
                });
              }}
            >
              <label htmlFor="subject-code">Subject code</label>
              <div>
                <input
                  id="subject-code"
                  required
                  maxLength={16}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  placeholder="SUB-XXXXXXXXXXXX"
                />
                <button disabled={busy} className="qn-button-primary">
                  {busy ? "Joining…" : "Join subject"}
                </button>
              </div>
            </form>
          )}
          {teacher && form && (
            <form
              className="qn-subject-create"
              onSubmit={(e) => {
                e.preventDefault();
                if (busy || creatingSubject.current) return;
                creatingSubject.current = true;
                void action(async () => {
                  const subjectName = name.trim().replace(/\s+/g, " ");
                  const className = sectionName.trim().replace(/\s+/g, " ");
                  if (!subjectName || !className)
                    throw new Error("Enter a subject and section name.");
                  let selected = existingSection;
                  if (!selected) {
                    try {
                      selected = await api.createClass(className);
                    } catch (error) {
                      // A concurrent create or a retry after a lost response can already have saved it.
                      if (!(
                        error instanceof Error &&
                        "status" in error &&
                        error.status === 409
                      ))
                        throw error;
                      const refreshed = await api.listClasses();
                      setClasses(refreshed);
                      selected = refreshed.find(
                        (c) =>
                          normalizeSection(c.name) ===
                          normalizeSection(className),
                      );
                      if (!selected) throw error;
                    }
                    const saved = selected;
                    setClasses((current) =>
                      current.some((c) => c.id === saved.id)
                        ? current
                        : [...current, saved].sort((a, b) =>
                            a.name.localeCompare(b.name, "en", {
                              numeric: true,
                              sensitivity: "base",
                            }),
                          ),
                    );
                  }
                  setSectionName(selected.name);
                  const r = await api.createSubject(subjectName, selected.id);
                  navigate(`${base}/subjects/${r.id}`);
                }).finally(() => {
                  creatingSubject.current = false;
                });
              }}
            >
              <label>
                Subject name
                <input
                  required
                  maxLength={120}
                  disabled={busy}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Practical Research"
                />
              </label>
              <label>
                Section
                {sectionName.trim() && !existingSection && (
                  <span className="qn-subject-new-section" aria-hidden="true">
                    New section
                  </span>
                )}
                <input
                  aria-label="Section"
                  list="subject-sections"
                  required
                  maxLength={80}
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  placeholder="Choose or type a section"
                  autoComplete="off"
                  disabled={busy}
                />
                <datalist id="subject-sections">
                  {classes.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </label>
              <div className="qn-subject-create-actions">
                <button disabled={busy} className="qn-button-primary">
                  Create subject
                </button>
              </div>
            </form>
          )}
          <div className="qn-subject-grid">
            {rooms.map((r) => (
              <Link
                className="qn-subject-card"
                to={`${base}/subjects/${r.id}`}
                key={r.id}
                aria-label={[r.name, r.section_name].filter(Boolean).join(", ")}
              >
                <span className="qn-subject-icon">
                  <BookOpen size={27} />
                </span>
                <span>
                  <strong>{r.name}</strong>
                  <small>{r.section_name}</small>
                </span>
                <ChevronRight size={19} />
              </Link>
            ))}
          </div>
          {!rooms.length && (
            <EmptyState
              title={teacher ? "Create your first subject" : "No subjects yet"}
              description={
                teacher
                  ? "Choose an existing section or type a new one with your subject."
                  : "Enter the subject code from your teacher."
              }
            />
          )}
          {!teacher && (
            <Link className="qn-button-quiet" to="/student/activity">
              Quiz code or previous activity
            </Link>
          )}
          {teacher && unassigned.length > 0 && (
            <details className="qn-subject-existing">
              <summary>Unassigned quizzes ({unassigned.length})</summary>
              <p className="qn-description">Add these quizzes to a subject.</p>
              {unassigned.map((q) => (
                <div className="qn-subject-legacy" key={q.id}>
                  <span>{q.title}</span>
                  <Link
                    className="qn-button-secondary"
                    to={`/teacher/edit/${q.id}`}
                  >
                    Edit quiz
                  </Link>
                </div>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}
