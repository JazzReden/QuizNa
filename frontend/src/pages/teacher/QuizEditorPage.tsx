import { QuizSharePanel } from "../../components/teacher/QuizSharePanel";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { Dialog } from "../../components/common/Dialog";
import { PointsInput } from "../../components/common/PointsInput";
import { PasteQuestionsDialog } from "../../components/teacher/PasteQuestionsDialog";
import { ClassSection, Question, QuestionType, QuizSection } from "../../types";
import { criteriaError, parseCriteria } from "../../utils/essay-rubric";
import { questionTypeLabel } from "../../utils/labels";
import { readPoints } from "../../utils/points";

const EssayCriteriaEditor = React.lazy(() =>
  import("../../components/teacher/EssayCriteriaEditor").then((module) => ({
    default: module.EssayCriteriaEditor,
  })),
);

export const QuizEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (id && location.state?.openPaste) {
      setShowBulkImport(true);
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      });
    }
  }, [id, location.state, location.pathname, navigate]);

  const createdQuizId = useRef<string | null>(null);
  const draftId = useRef(crypto.randomUUID());
  const saveInFlight = useRef(false);
  const [quizSections, setQuizSections] = useState<QuizSection[]>([]);
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [loadingSections, setLoadingSections] = useState(isEditing);
  const [sectionLoadError, setSectionLoadError] = useState("");
  const [sectionRetry, setSectionRetry] = useState(0);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [pointsError, setPointsError] = useState("");
  const [notice, setNotice] = useState("");
  const [requireQuizCode, setRequireQuizCode] = useState(true);
  const [publishedCode, setPublishedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [examFormat, setExamFormat] = useState<"online" | "paper">("online");
  const [formatLocked, setFormatLocked] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const subjectRoomId = new URLSearchParams(location.search).get("subjectRoom");
  const [subjectContext, setSubjectContext] = useState<{
    status: "loading" | "ready" | "error";
    message?: string;
    restricted?: boolean;
  }>(() => ({ status: subjectRoomId ? "loading" : "ready" }));
  const [subjectRetry, setSubjectRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (!subjectRoomId) {
      setSubjectContext({ status: "ready" });
      return;
    }
    setSubjectContext({ status: "loading" });
    void api
      .getSubject(subjectRoomId)
      .then((room) => {
        if (!active) return;
        if (!id) {
          setSubject(room.name);
          setSelectedClassIds([room.class_section_id]);
        }
        setSubjectContext({ status: "ready" });
      })
      .catch((e: unknown) => {
        if (!active) return;
        const status = (e as { status?: number })?.status;
        setSubjectContext({
          status: "error",
          restricted: status === 403 || status === 404,
          message:
            status === 403
              ? "This subject is not available to the signed-in teacher. Choose one of your subjects, or use the account that created it."
              : status === 404
                ? "This subject is no longer available. Choose a subject from your account."
                : "We couldn’t load this subject. Check your connection and try again.",
        });
      });
    return () => {
      active = false;
    };
  }, [subjectRoomId, id, subjectRetry]);

  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState(
    "Please remain in fullscreen mode throughout the test. Tab switching and focus loss are logged as possible violations.",
  );
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("20");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null,
  );
  const localInput = (value?: string) =>
    value
      ? new Date(
          Date.parse(value) - new Date(value).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "";
  const [maxAttempts, setMaxAttempts] = useState("1");
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [randomizeOptions, setRandomizeOptions] = useState(false);
  const [releaseScoresImmediately, setReleaseScoresImmediately] =
    useState(false);
  const [releaseAnswersImmediately, setReleaseAnswersImmediately] =
    useState(false);

  // Questions State
  const [questions, setQuestions] = useState<Question[]>([]);

  // New Question Modal / State
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [qType, setQType] = useState<QuestionType>("mcq");
  const [qPrompt, setQPrompt] = useState("");
  const [qPoints, setQPoints] = useState("2");
  const [qExplanation, setQExplanation] = useState("");
  const [qRubric, setQRubric] = useState("");
  const [qShortAnswer, setQShortAnswer] = useState("");
  const [qTfCorrect, setQTfCorrect] = useState<"opt_true" | "opt_false">(
    "opt_true",
  );
  const [qOptions, setQOptions] = useState([
    { id: "opt_1", text: "", is_correct: true },
    { id: "opt_2", text: "", is_correct: false },
    { id: "opt_3", text: "", is_correct: false },
    { id: "opt_4", text: "", is_correct: false },
  ]);

  useEffect(() => {
    if (isEditing && id) {
      const loadQuiz = async () => {
        try {
          const quiz = await api.getTeacherQuiz(id);
          setTitle(quiz.title);
          setRequireQuizCode(!!quiz.require_access_code);
          setPublishedCode(
            quiz.status === "published" ? quiz.access_code : null,
          );
          setSubject(quiz.subject || "");
          setExamFormat(quiz.exam_format || "online");
          setFormatLocked(quiz.version > 1);
          setDescription(quiz.description || "");
          setInstructions(quiz.instructions || "");
          setTimeLimitMinutes(String(quiz.time_limit_minutes));
          setMaxAttempts(String(quiz.max_attempts));
          setAvailableFrom(localInput(quiz.available_from));
          setAvailableUntil(localInput(quiz.available_until));
          setRandomizeQuestions(quiz.randomize_questions);
          setRandomizeOptions(quiz.randomize_options);
          setReleaseScoresImmediately(quiz.release_scores_immediately);
          setReleaseAnswersImmediately(quiz.release_answers_immediately);

          const qList = await api.listQuestions(id);
          setQuestions(qList);
        } catch (err: any) {
          setError(err.message || "Failed to load quiz");
        } finally {
          setLoading(false);
        }
      };
      loadQuiz();
    }
  }, [id, isEditing]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoadingSections(true);
    setSectionLoadError("");
    api
      .listSections(id)
      .then((result) => {
        if (active) {
          setQuizSections(result);
          setSelectedClassIds((current) => [
            ...new Set([
              ...current,
              ...result
                .map((section) => section.class_section_id)
                .filter((value): value is string => !!value),
            ]),
          ]);
        }
      })
      .catch(() => {
        if (active) setSectionLoadError("Unable to load sections.");
      })
      .finally(() => {
        if (active) setLoadingSections(false);
      });
    return () => {
      active = false;
    };
  }, [id, sectionRetry]);

  useEffect(() => {
    let active = true;
    setClassesLoading(true);
    api
      .listClasses()
      .then((result) => {
        const requested = new URLSearchParams(location.search).get("section");
        if (
          active &&
          !id &&
          requested &&
          result.some((section) => section.id === requested)
        )
          setSelectedClassIds((current) =>
            current.includes(requested) ? current : [...current, requested],
          );
        if (active)
          setClasses(
            result.sort((a, b) =>
              a.name.localeCompare(b.name, "en", {
                numeric: true,
                sensitivity: "base",
              }),
            ),
          );
      })
      .catch(() => {
        if (active)
          setSectionLoadError(
            "Unable to load sections. Retry before selecting sections.",
          );
      })
      .finally(() => {
        if (active) setClassesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sectionRetry]);

  const handleSaveQuiz = async (publish = false, openPaste = false) => {
    if (saving || saveInFlight.current || subjectContext.status !== "ready")
      return;
    if (!title.trim()) {
      setError("Quiz title is required");
      document.getElementById("quiz-field-1")?.focus();
      return;
    }

    if (
      !/^\d+$/.test(timeLimitMinutes) ||
      Number(timeLimitMinutes) < 1 ||
      Number(timeLimitMinutes) > 10080
    ) {
      setError("Enter a time limit from 1 to 10,080 minutes.");
      document.getElementById("quiz-field-4")?.focus();
      return;
    }
    if (
      !/^\d+$/.test(maxAttempts) ||
      Number(maxAttempts) < 1 ||
      Number(maxAttempts) > 100
    ) {
      setError("Enter an attempt limit from 1 to 100.");
      document.getElementById("quiz-field-5")?.focus();
      return;
    }

    saveInFlight.current = true;
    setSaving(true);
    setNotice("");
    setError(null);

    const payload = {
      exam_format: examFormat,
      require_access_code: examFormat === "online" && requireQuizCode,
      subject: subject.trim(),
      title,
      description,
      instructions,
      time_limit_minutes: Number(timeLimitMinutes),
      max_attempts: Number(maxAttempts),
      available_from: availableFrom
        ? new Date(availableFrom).toISOString()
        : null,
      available_until: availableUntil
        ? new Date(availableUntil).toISOString()
        : null,
      randomize_questions: randomizeQuestions,
      randomize_options: randomizeOptions,
      release_scores_immediately: releaseScoresImmediately,
      release_answers_immediately: releaseAnswersImmediately,
    };

    try {
      let savedId = id || createdQuizId.current;
      if (savedId) {
        await api.updateQuiz(savedId, payload);
      } else {
        const created = await api.createQuiz({
          ...payload,
          client_draft_id: draftId.current,
        });
        savedId = created.id;
        createdQuizId.current = savedId;
      }
      if (!savedId) throw new Error("Unable to identify the saved quiz.");
      // Keep requests bounded and retry with the same per-question identities.
      const pending = questions.flatMap((q, index) => {
        if (q.quiz_id) return [];
        const { id: client_question_id, ...data } = q;
        return [
          {
            ...data,
            quiz_id: savedId!,
            order_index: index,
            client_question_id,
          },
        ];
      });
      let batch: typeof pending = [],
        bytes = 0;
      const saveBatch = async () => {
        if (!batch.length) return;
        const submitted = batch;
        const saved = await api.saveDraftQuestions(submitted);
        setQuestions((current) =>
          current.map((q) => {
            const index = submitted.findIndex(
              (item) => item.client_question_id === q.id,
            );
            return index >= 0 ? saved[index] : q;
          }),
        );
        batch = [];
        bytes = 0;
      };
      for (const item of pending) {
        const size = new TextEncoder().encode(JSON.stringify(item)).length + 1;
        if (batch.length >= 100 || bytes + size > 400000) await saveBatch();
        batch.push(item);
        bytes += size;
      }
      await saveBatch();
      // Reload before retries so a partially saved group cannot duplicate codes.
      const existingSections = await api.listSections(savedId);
      for (const classId of selectedClassIds) {
        if (
          existingSections.some(
            (section) => section.class_section_id === classId,
          )
        )
          continue;
        existingSections.push(await api.attachClass(savedId, classId));
      }
      if (subjectRoomId) await api.attachSubjectQuiz(subjectRoomId, savedId);
      setQuizSections(existingSections);
      setSectionLoadError("");
      if (!id)
        navigate(
          `/teacher/edit/${savedId}${subjectRoomId ? "?subjectRoom=" + subjectRoomId : ""}`,
          {
            replace: true,
            state: openPaste ? { openPaste: true } : null,
          },
        );
      else if (openPaste) setShowBulkImport(true);
      if (publish && savedId) {
        const published = await api.publishQuiz(savedId);
        setFormatLocked(true);
        setPublishedCode(published.access_code);
        setNotice(
          examFormat === "paper"
            ? "Paper exam published. Open Print & scan to prepare sheets."
            : "Quiz published.",
        );
      } else setNotice("Quiz saved.");
    } catch (err: any) {
      setError(
        (createdQuizId.current && !id
          ? "Your draft is kept. Retry Save quiz to finish saving questions and sections. "
          : "") + (err.message || "Failed to save quiz"),
      );
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  const handleAddQuestion = async () => {
    if (savingQuestion) return;
    if (!qPrompt.trim()) {
      alert("Question prompt is required");
      return;
    }

    const points = readPoints(qPoints);
    if (points === null) {
      setPointsError("Enter points, such as 2 or 1.5.");
      return;
    }
    if (qType === "essay" && criteriaError(qRubric, points)) {
      setPointsError(criteriaError(qRubric, points)!);
      return;
    }
    setPointsError("");
    let correctAnswer: any = null;
    let finalOptions: any = null;

    if (qType === "mcq") {
      const validOptions = qOptions.filter((o) => o.text.trim());
      if (validOptions.length < 2) {
        alert(
          "Please provide at least 2 non-empty options for multiple choice",
        );
        return;
      }
      const selected = validOptions.find((o) => o.is_correct);
      if (!selected) {
        alert("Please designate one option as the correct answer");
        return;
      }
      correctAnswer = selected.id;
      finalOptions = validOptions.map((o) => ({ id: o.id, text: o.text }));
    } else if (qType === "true_false") {
      finalOptions = [
        { id: "opt_true", text: "True" },
        { id: "opt_false", text: "False" },
      ];
      correctAnswer = qTfCorrect;
    } else if (qType === "short_answer") {
      if (!qShortAnswer.trim()) {
        alert("Please specify the accepted correct answer");
        return;
      }
      correctAnswer = qShortAnswer.split(",").map((s) => s.trim());
    } else if (qType === "essay") {
      correctAnswer = null;
    }

    setSavingQuestion(true);
    try {
      const questionData = {
        type: qType,
        prompt: qPrompt,
        explanation: qExplanation,
        points,
        options: finalOptions,
        correct_answer: correctAnswer,
        rubric: qType === "essay" ? qRubric : "",
      };
      const editing = questions.find((q) => q.id === editingQuestionId);
      const local = !id && (!editing || !editing.quiz_id);
      const created: Question = local
        ? {
            ...questionData,
            id: editingQuestionId || crypto.randomUUID(),
            quiz_id: "",
            order_index: editing?.order_index ?? questions.length,
          }
        : editingQuestionId
          ? await api.updateQuestion(editingQuestionId, questionData)
          : await api.createQuestion({ ...questionData, quiz_id: id });
      setQuestions(
        editingQuestionId
          ? questions.map((q) => (q.id === editingQuestionId ? created : q))
          : [...questions, created],
      );
      setEditingQuestionId(null);
      setNotice(
        local
          ? "Question added. Save quiz when you’re ready."
          : "Question saved. Publish to share the latest changes.",
      );
      setShowQuestionModal(false);
      // Reset
      setQPrompt("");
      setQExplanation("");
      setQRubric("");
      setQShortAnswer("");
      setQTfCorrect("opt_true");
    } catch (err: any) {
      alert(err.message || "Failed to save question");
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!confirm("Are you sure you want to delete this question?")) return;
    try {
      if (questions.find((q) => q.id === qId)?.quiz_id)
        await api.deleteQuestion(qId);
      setQuestions(questions.filter((q) => q.id !== qId));
      setNotice("Question removed. Publish to share the latest changes.");
    } catch (err: any) {
      alert(err.message || "Failed to delete question");
    }
  };

  if (subjectContext.status === "error")
    return (
      <div className="qn-page qn-page-narrow qn-authoring">
        <section className="qn-editor-access" role="alert">
          <span className="qn-editor-access-icon" aria-hidden="true">
            <ArrowLeft size={24} />
          </span>
          <h1>Choose a subject from your account</h1>
          <p>{subjectContext.message}</p>
          <div>
            <Link className="qn-button-primary" to="/teacher">
              My subjects
            </Link>
            {!subjectContext.restricted && (
              <button
                type="button"
                className="qn-button-secondary"
                onClick={() => setSubjectRetry((n) => n + 1)}
              >
                Try again
              </button>
            )}
            <Link
              className="qn-button-secondary"
              to="/login"
              state={{ returnTo: location.pathname + location.search }}
            >
              Use another account
            </Link>
          </div>
        </section>
      </div>
    );
  if (loading || subjectContext.status === "loading") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 flex justify-center">
        <p role="status">Loading quiz workspace…</p>
      </div>
    );
  }

  return (
    <div className="qn-page qn-page-narrow qn-authoring qn-editor">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between pb-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <Link
            to={
              subjectRoomId ? `/teacher/subjects/${subjectRoomId}` : "/teacher"
            }
            aria-label="Back to subjects"
            className="qn-button-secondary"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to subjects
          </Link>
          <div>
            <h1 className="qn-title">{isEditing ? "Edit quiz" : "New quiz"}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Set the details, then add your questions.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleSaveQuiz()}
            disabled={saving}
            className={id ? "qn-button-secondary" : "qn-button-primary"}
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Saving..." : "Save quiz"}</span>
          </button>
          {id && (
            <button
              type="button"
              disabled={saving || questions.length === 0}
              onClick={() => handleSaveQuiz(true)}
              className="qn-button-primary"
            >
              Save & publish
            </button>
          )}
        </div>
      </div>
      {publishedCode &&
        examFormat === "online" &&
        !loadingSections &&
        !sectionLoadError && (
          <QuizSharePanel quizCode={publishedCode} sections={quizSections} />
        )}
      {notice && notice !== "Quiz published." && (
        <p
          role="status"
          className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Settings Grid */}
      <div className="mt-6 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
        <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
          Quiz details
        </h2>

        <fieldset
          disabled={formatLocked}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <legend className="text-xs font-semibold text-slate-700 mb-2">
            Exam format
          </legend>
          {(
            [
              ["online", "Online Exam", "Students answer in QuizNa."],
              ["paper", "Paper Exam", "Print papers and scan answer sheets."],
            ] as const
          ).map(([value, label, help]) => (
            <label
              key={value}
              className={`flex gap-3 rounded-xl border p-4 cursor-pointer ${examFormat === value ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}`}
            >
              <input
                type="radio"
                name="exam-format"
                value={value}
                checked={examFormat === value}
                onChange={() => {
                  setExamFormat(value);
                  if (!isEditing)
                    setReleaseScoresImmediately(value === "paper");
                  if (
                    instructions.startsWith("Please remain in fullscreen") ||
                    instructions ===
                      "Answer all questions on the printed answer sheet."
                  )
                    setInstructions(
                      value === "paper"
                        ? "Answer all questions on the printed answer sheet."
                        : "Please remain in fullscreen mode throughout the test. Tab switching and focus loss are logged as possible violations.",
                    );
                }}
              />
              <span>
                <strong className="block text-sm">{label}</strong>
                <span className="text-xs text-slate-500">{help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {examFormat === "online" && (
          <fieldset className="qn-quiz-entry-setting">
            <legend>Require a quiz code?</legend>
            <label>
              <input
                type="radio"
                name="quiz-entry"
                checked={requireQuizCode}
                onChange={() => setRequireQuizCode(true)}
              />
              <span>
                <strong>Yes — Require quiz code</strong>
                <small>Students enter the code before opening this quiz.</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="quiz-entry"
                checked={!requireQuizCode}
                onChange={() => setRequireQuizCode(false)}
              />
              <span>
                <strong>No — Open without code</strong>
                <small>Students in the subject can open it directly.</small>
              </span>
            </label>
          </fieldset>
        )}
        {isEditing && examFormat === "paper" && (
          <Link
            to={`/teacher/paper/${id}`}
            className="inline-block rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold"
          >
            Print & scan paper exam
          </Link>
        )}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label
              htmlFor="quiz-field-1"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Quiz Title *
            </label>
            <input
              id="quiz-field-1"
              type="text"
              required
              placeholder="e.g. Midterm Examination: Data Structures"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="quiz-subject"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Subject{" "}
              <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="quiz-subject"
              type="text"
              maxLength={120}
              placeholder="e.g. Personal Development"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2"
              aria-describedby="subject-help"
            />
            <p id="subject-help" className="text-xs text-slate-500 mt-1">
              Groups results on the student’s Performance page.
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold text-slate-700">Sections</h3>
              <Link
                to={
                  id
                    ? `/teacher/sections?quiz=${id}${quizSections[0]?.class_section_id ? "&section=" + quizSections[0].class_section_id : ""}`
                    : "/teacher/sections"
                }
                className="text-xs font-semibold text-indigo-700"
              >
                Manage sections
              </Link>
            </div>
            {classesLoading || loadingSections ? (
              <p role="status" className="text-xs text-slate-500">
                Loading sections…
              </p>
            ) : sectionLoadError ? (
              <p role="alert" className="text-xs text-rose-700">
                {sectionLoadError}{" "}
                <button
                  type="button"
                  onClick={() => setSectionRetry((n) => n + 1)}
                  className="underline"
                >
                  Retry
                </button>
              </p>
            ) : !classes.length ? (
              <p className="text-xs text-slate-500">
                Create a section in Sections, then select it here.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                {classes.map((section) => {
                  const attached = quizSections.some(
                    (link) => link.class_section_id === section.id,
                  );
                  return (
                    <label
                      key={section.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${selectedClassIds.includes(section.id) ? "border-indigo-200 bg-indigo-50" : "border-slate-200"}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedClassIds.includes(section.id)}
                        disabled={saving || attached}
                        onChange={(event) =>
                          setSelectedClassIds((current) =>
                            event.target.checked
                              ? [...current, section.id]
                              : current.filter((value) => value !== section.id),
                          )
                        }
                        className="h-4 w-4"
                      />
                      <span>
                        {section.name}
                        <span className="block text-xs text-slate-500">
                          {section.student_count || 0} students
                          {attached ? " · Assigned" : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="quiz-field-2"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Description
            </label>
            <textarea
              id="quiz-field-2"
              rows={2}
              placeholder="Brief summary of syllabus topics covered..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="quiz-field-3"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Student instructions
            </label>
            <textarea
              id="quiz-field-3"
              rows={2}
              placeholder="Instructions displayed to students before starting..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Parameters */}
        <h2 className="text-sm font-semibold text-slate-900 tracking-tight pt-4 border-t border-slate-100">
          Timing & Attempts
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="quiz-field-4"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Time Limit (Minutes)
            </label>
            <input
              id="quiz-field-4"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={5}
              placeholder="Enter minutes"
              value={timeLimitMinutes}
              onChange={(e) =>
                setTimeLimitMinutes(e.target.value.replace(/^0+(?=\d)/, ""))
              }
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <div>
            <label
              htmlFor="quiz-field-5"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Max Attempts
            </label>
            <input
              id="quiz-field-5"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              placeholder="Enter attempts"
              value={maxAttempts}
              onChange={(e) =>
                setMaxAttempts(e.target.value.replace(/^0+(?=\d)/, ""))
              }
              className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-xs font-semibold text-slate-700">
            Available from (your local time)
            <input
              aria-label="Available from"
              type="datetime-local"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              className="block w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Available until (your local time)
            <input
              aria-label="Available until"
              type="datetime-local"
              value={availableUntil}
              onChange={(e) => setAvailableUntil(e.target.value)}
              className="block w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Dates are optional. Changes apply to new attempts after publishing.
        </p>
        {/* Anti-cheat & Release Toggles */}
        <h2 className="text-sm font-semibold text-slate-900 tracking-tight pt-4 border-t border-slate-100">
          Question order & results
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={randomizeQuestions}
              onChange={(e) => setRandomizeQuestions(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500"
            />
            <div>
              <p className="text-xs font-semibold text-slate-900">
                Randomize Questions
              </p>
              <p className="text-[11px] text-slate-500">
                Shuffle question order uniquely for each student
              </p>
            </div>
          </label>

          <label className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={randomizeOptions}
              onChange={(e) => setRandomizeOptions(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500"
            />
            <div>
              <p className="text-xs font-semibold text-slate-900">
                Randomize Multiple-Choice Options
              </p>
              <p className="text-[11px] text-slate-500">
                Shuffle the choices for each student
              </p>
            </div>
          </label>

          <label className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={releaseScoresImmediately}
              onChange={(e) => setReleaseScoresImmediately(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500"
            />
            <div>
              <p className="text-xs font-semibold text-slate-900">
                Show scores after submission
              </p>
              <p className="text-[11px] text-slate-500">
                Students see objective score upon submission
              </p>
            </div>
          </label>

          <label className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={releaseAnswersImmediately}
              onChange={(e) => setReleaseAnswersImmediately(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500"
            />
            <div>
              <p className="text-xs font-semibold text-slate-900">
                Show correct answers
              </p>
              <p className="text-[11px] text-slate-500">
                Students see correct answers & explanations
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Questions Section */}
      <div className="mt-8">
        <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Questions ({questions.length})
            </h2>
            <p className="text-xs text-slate-500">
              {id
                ? "Add the questions students will answer."
                : "Add questions now. Save quiz when you’re ready."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                saving ||
                loading ||
                Boolean(createdQuizId.current && !id && error)
              }
              onClick={() => setShowBulkImport(true)}
              className="qn-button-secondary"
            >
              Paste questions
            </button>
            <button
              type="button"
              disabled={
                saving || Boolean(createdQuizId.current && !id && error)
              }
              onClick={() => {
                setEditingQuestionId(null);
                setQPrompt("");
                setQExplanation("");
                setQRubric("");
                setQShortAnswer("");
                setQTfCorrect("opt_true");
                setQOptions(
                  [1, 2, 3, 4].map((n) => ({
                    id: `opt_${n}`,
                    text: "",
                    is_correct: n === 1,
                  })),
                );
                setQType("mcq");
                setQPoints("2");
                setPointsError("");
                setShowQuestionModal(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Question</span>
            </button>
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 p-6">
            <p className="text-xs text-slate-500">
              No questions added yet. Click &quot;Add Question&quot; to build
              your assessment.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <div
                key={q.id}
                className="qn-editor-question bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">
                      Q{idx + 1}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 capitalize">
                      {questionTypeLabel(q.type)}
                    </span>
                    <span className="text-[11px] font-semibold text-indigo-600">
                      {q.points} {q.points === 1 ? "pt" : "pts"}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800">
                    {q.prompt}
                  </p>
                  {q.rubric && (
                    <p className="text-xs text-slate-500 italic">
                      Rubric:{" "}
                      {parseCriteria(q.rubric)
                        ? `${parseCriteria(q.rubric)!.length} criteria`
                        : q.rubric}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  className="text-xs font-semibold text-indigo-700"
                  disabled={
                    saving || Boolean(createdQuizId.current && !id && error)
                  }
                  onClick={() => {
                    setEditingQuestionId(q.id);
                    setQType(q.type);
                    setQPrompt(q.prompt);
                    setQPoints(String(q.points));
                    setPointsError("");
                    setQExplanation(q.explanation || "");
                    setQRubric(q.rubric || "");
                    setQShortAnswer(
                      Array.isArray(q.correct_answer)
                        ? q.correct_answer.join(", ")
                        : String(q.correct_answer || ""),
                    );
                    setQTfCorrect(
                      q.correct_answer === false ||
                        q.correct_answer === "opt_false"
                        ? "opt_false"
                        : "opt_true",
                    );
                    if (q.options?.length)
                      setQOptions(
                        q.options.map((o) => ({
                          ...o,
                          is_correct: o.id === q.correct_answer,
                        })),
                      );
                    setShowQuestionModal(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={
                    saving || Boolean(createdQuizId.current && !id && error)
                  }
                  onClick={() => handleDeleteQuestion(q.id)}
                  className="qn-editor-delete text-slate-400 hover:text-rose-600 p-1 rounded-lg"
                  title="Delete question"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showBulkImport && (
        <PasteQuestionsDialog
          quizId={id || `unsaved-${draftId.current}`}
          onSaveDraft={
            !id
              ? (added) => {
                  setQuestions((previous) => [
                    ...previous,
                    ...added.map((q, index) => ({
                      ...q,
                      id: crypto.randomUUID(),
                      quiz_id: "",
                      order_index: previous.length + index,
                    })),
                  ]);
                  setShowBulkImport(false);
                  setNotice(
                    `${added.length} questions added. Save quiz when you’re ready.`,
                  );
                }
              : undefined
          }
          onClose={() => {
            setShowBulkImport(false);
            if (id)
              void api
                .listQuestions(id)
                .then(setQuestions)
                .catch(() =>
                  setError("Unable to refresh questions. Please reload."),
                );
          }}
          onAdded={(added) => {
            setQuestions((previous) => {
              const known = new Set(previous.map((q) => q.id));
              return [...previous, ...added.filter((q) => !known.has(q.id))];
            });
            setShowBulkImport(false);
            setNotice(
              `${added.length} questions added. Publish when you’re ready.`,
            );
          }}
        />
      )}
      {/* Add Question Modal */}
      {showQuestionModal && (
        <Dialog
          label="Question editor"
          onClose={() => setShowQuestionModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
        >
          <div className="qn-question-modal bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingQuestionId ? "Edit Question" : "Add Question"}
              </h3>
              <button
                type="button"
                onClick={() => setShowQuestionModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mt-4">
              {/* Type */}
              <div>
                <label
                  htmlFor="quiz-field-6"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Question Type
                </label>
                <select
                  id="quiz-field-6"
                  value={qType}
                  onChange={(e) => setQType(e.target.value as QuestionType)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="mcq">Multiple choice</option>
                  <option value="true_false">True / False</option>
                  <option value="short_answer">Short answer</option>
                  <option value="essay">Essay</option>
                </select>
              </div>

              {/* Prompt */}
              <div>
                <label
                  htmlFor="quiz-field-7"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Prompt *
                </label>
                <textarea
                  id="quiz-field-7"
                  rows={2}
                  required
                  placeholder="Enter the question text..."
                  value={qPrompt}
                  onChange={(e) => setQPrompt(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Points */}
              <div>
                <label
                  htmlFor="quiz-field-8"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Points
                </label>
                <PointsInput
                  id="quiz-field-8"
                  value={qPoints}
                  onChange={setQPoints}
                  aria-invalid={Boolean(pointsError)}
                  aria-describedby={
                    pointsError ? "question-points-error" : undefined
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {pointsError && (
                <p
                  id="question-points-error"
                  role="alert"
                  className="text-xs text-rose-700"
                >
                  {pointsError}
                </p>
              )}
              {/* Type-specific inputs */}
              {qType === "mcq" && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Choices (select the correct answer)
                  </label>
                  {qOptions.map((opt, i) => (
                    <div
                      key={opt.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        type="radio"
                        aria-label={`Correct choice ${i + 1}`}
                        name="correct_mcq"
                        checked={opt.is_correct}
                        onChange={() => {
                          setQOptions(
                            qOptions.map((o) => ({
                              ...o,
                              is_correct: o.id === opt.id,
                            })),
                          );
                        }}
                        className="text-indigo-600"
                      />
                      <input
                        type="text"
                        aria-label={`Choice ${i + 1}`}
                        placeholder={`Choice ${i + 1}`}
                        value={opt.text}
                        onChange={(e) => {
                          const updated = [...qOptions];
                          updated[i].text = e.target.value;
                          setQOptions(updated);
                        }}
                        className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              )}

              {qType === "true_false" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Correct Answer
                  </label>
                  <div className="flex space-x-3">
                    <label className="flex items-center space-x-1.5 text-xs">
                      <input
                        type="radio"
                        name="tf_correct"
                        checked={qTfCorrect === "opt_true"}
                        onChange={() => setQTfCorrect("opt_true")}
                      />
                      <span>True</span>
                    </label>
                    <label className="flex items-center space-x-1.5 text-xs">
                      <input
                        type="radio"
                        name="tf_correct"
                        checked={qTfCorrect === "opt_false"}
                        onChange={() => setQTfCorrect("opt_false")}
                      />
                      <span>False</span>
                    </label>
                  </div>
                </div>
              )}

              {qType === "short_answer" && (
                <div>
                  <label
                    htmlFor="quiz-field-9"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Accepted Answers (Comma separated)
                  </label>
                  <input
                    id="quiz-field-9"
                    type="text"
                    placeholder="e.g. queue, Queue, FIFO Queue"
                    value={qShortAnswer}
                    onChange={(e) => setQShortAnswer(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Evaluation is case-insensitive with whitespace trimming.
                  </p>
                </div>
              )}

              {qType === "essay" && (
                <React.Suspense
                  fallback={
                    <p role="status" className="text-xs text-slate-500">
                      Loading criteria…
                    </p>
                  }
                >
                  <EssayCriteriaEditor
                    key={editingQuestionId || "new"}
                    value={qRubric}
                    points={readPoints(qPoints) ?? 0}
                    onChange={setQRubric}
                  />
                </React.Suspense>
              )}

              <div>
                <label
                  htmlFor="quiz-field-11"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Explanation (shown with correct answers)
                </label>
                <input
                  id="quiz-field-11"
                  type="text"
                  placeholder="Rationale for the correct answer..."
                  value={qExplanation}
                  onChange={(e) => setQExplanation(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingQuestion}
                  onClick={handleAddQuestion}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                >
                  Save Question
                </button>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
