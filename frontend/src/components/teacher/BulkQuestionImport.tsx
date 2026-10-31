import { questionTypeLabel } from "../../utils/labels";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ClipboardPaste, Trash2, X } from "lucide-react";
import { Dialog } from "../common/Dialog";
import { PointsInput } from "../common/PointsInput";
import { readPoints } from "../../utils/points";
import {
  parseMultipleChoice,
  PastedQuestion,
} from "../../utils/parseMultipleChoice";
import { api, ApiError } from "../../api/client";
import { Question } from "../../types";

type Draft = Omit<PastedQuestion, "points"> & { points: string };
type SavedDraft = {
  source: string;
  drafts: Draft[] | null;
  defaultPoints: string;
  importId: string;
  locked: boolean;
};
function restoreDraft(key: string): SavedDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 1000000) return null;
    const value = JSON.parse(raw);
    if (
      typeof value.source !== "string" ||
      typeof value.defaultPoints !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(value.importId) ||
      typeof value.locked !== "boolean"
    )
      return null;
    if (
      value.drafts !== null &&
      (!Array.isArray(value.drafts) ||
        value.drafts.length > 100 ||
        !value.drafts.every(
          (q: Draft) =>
            typeof q.prompt === "string" &&
            typeof q.points === "string" &&
            typeof q.correctAnswer === "string" &&
            Array.isArray(q.notes) &&
            q.notes.every((n) => typeof n === "string") &&
            Array.isArray(q.options) &&
            q.options.length <= 8 &&
            q.options.every(
              (o) =>
                typeof o.id === "string" &&
                typeof o.label === "string" &&
                typeof o.text === "string",
            ),
        ))
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

const example = `1. Which planet do we live on?
A. Earth   B. Mars   C. Venus   D. Jupiter
Answer: A

2) What is 5 + 3?
a) 6
b) 8
c) 10
d) 12

Answer key: 2. B`;

export function BulkQuestionImport({
  quizId,
  onAdded,
  onSaveDraft,
  onClose,
}: {
  quizId: string;
  onAdded: (questions: Question[]) => void;
  onSaveDraft?: (questions: Pick<Question, "type" | "prompt" | "points" | "options" | "correct_answer">[]) => void;
  onClose: () => void;
}) {
  const storageKey = `quizna-paste:${quizId}`;
  const [restored] = useState(() => restoreDraft(storageKey));
  const [source, setSource] = useState(restored?.source || "");
  const [drafts, setDrafts] = useState<Draft[] | null>(
    restored?.drafts ?? null,
  );
  const [defaultPoints, setDefaultPoints] = useState(
    restored?.defaultPoints || "1",
  );
  const [notices, setNotices] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(restored?.locked || false);
  const importId = useRef(restored?.importId || crypto.randomUUID());
  useEffect(() => {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          source,
          drafts,
          defaultPoints,
          locked,
          importId: importId.current,
        }),
      );
    } catch {
      /* Pasting still works if browser draft storage is unavailable. */
    }
  }, [source, drafts, defaultPoints, locked, storageKey]);
  const busy = useRef(false);
  const update = (index: number, changes: Partial<Draft>) => {
    setDrafts((previous) =>
      previous!.map((q, i) => (i === index ? { ...q, ...changes } : q)),
    );
  };
  const valid = (q: Draft) =>
    q.prompt.trim() &&
    q.prompt.length <= 10000 &&
    readPoints(q.points) !== null &&
    (q.type === "essay" ||
      (q.options.length >= 2 &&
        q.options.length <= 8 &&
        q.options.every((o) => o.text.trim() && o.text.length <= 4000) &&
        q.options.some((o) => o.id === q.correctAnswer)));
  const unfinished = drafts?.filter((q) => !valid(q)).length || 0;
  const prepare = () => {
    setError("");
    const points = readPoints(defaultPoints);
    if (points === null) {
      setError("Enter points, such as 1 or 1.5.");
      return;
    }
    try {
      const result = parseMultipleChoice(source);
      if (!result.questions.length) {
        setError(
          "No questions found. Paste your questions and any answer keys.",
        );
        return;
      }
      setDrafts(
        result.questions.map((q) => ({
          ...q,
          points: String(q.points ?? points),
        })),
      );
      setNotices(result.notices);
      importId.current = crypto.randomUUID();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to organize this text.",
      );
    }
  };
  const save = async () => {
    if (busy.current || !drafts?.length || unfinished) return;
    const payload = drafts.map((q) => ({
      type: q.type || "mcq",
      prompt: q.prompt.trim(),
      points: readPoints(q.points)!,
      options: q.options.map(({ id, text }) => ({ id, text: text.trim() })),
      correct_answer: q.type === "essay" ? null : q.correctAnswer,
    }));
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 450000) {
      setError(
        "This list is too large. Split it into smaller groups of questions.",
      );
      return;
    }
    busy.current = true;
    setSaving(true);
    setLocked(true);
    setError("");
    try {
      if (onSaveDraft) {
        onSaveDraft(payload);
        try { sessionStorage.removeItem(storageKey); } catch { /* Optional draft storage. */ }
        return;
      }
      const questions = await api.importQuestions(
        quizId,
        importId.current,
        payload,
      );
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* No saved draft to remove. */
      }
      onAdded(questions);
    } catch (err) {
      const canCorrect =
        err instanceof ApiError && [400, 413].includes(err.status);
      if (canCorrect) setLocked(false);
      setError(
        `${err instanceof Error ? err.message : "Unable to confirm saving."} ${canCorrect ? "Review the highlighted details and try again." : "Retry to check the same questions without adding duplicates."}`,
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <Dialog
      label="Paste questions"
      onClose={() => {
        if (!busy.current) onClose();
      }}
      className="qn-authoring fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="p-5 sm:px-6 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {drafts ? "Review your questions" : "Paste questions"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {drafts
                ? "Check the text, points, and correct answers."
                : "Paste the whole list. We’ll separate the questions and choices."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close paste questions"
            disabled={saving}
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-6 space-y-4">
          {error && (
            <p
              role="alert"
              className="text-sm p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl"
            >
              {error}
            </p>
          )}
          {!drafts ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm font-semibold text-slate-700">
                  Points per question
                  <PointsInput
                    aria-label="Points per pasted question"
                    value={defaultPoints}
                    onChange={setDefaultPoints}
                    className="block mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 w-32"
                  />
                </label>
                <span className="text-xs text-slate-500 pb-2">
                  You can change individual points in the preview.
                </span>
              </div>
              <label
                className="block text-sm font-semibold text-slate-700"
                htmlFor="pasted-questions"
              >
                Questions and choices
              </label>
              <textarea
                id="pasted-questions"
                value={source}
                maxLength={100000}
                onChange={(e) => setSource(e.target.value)}
                rows={12}
                placeholder={example}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed focus:bg-white"
              />
              <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                <span>
                  Multiple choice, true/false, and essay. Up to 100 questions.
                </span>
                <button
                  type="button"
                  onClick={() => setSource(example)}
                  className="font-semibold text-indigo-700"
                >
                  Try an example
                </button>
              </div>
              <details className="text-xs text-slate-600">
                <summary className="cursor-pointer font-semibold">
                  Adding correct answers
                </summary>
                <p className="mt-2">
                  Include “Answer: B” after each question, or an “Answer key: 1.
                  B, 2. C” at the end. Missing answers can be selected in the
                  preview. This formatter organizes text locally; it does not
                  generate or guess answers.
                </p>
              </details>
            </>
          ) : (
            <>
              <div
                role="status"
                className="rounded-xl bg-indigo-50 text-indigo-900 p-3 text-sm"
              >
                <strong>{drafts.length} questions found.</strong>{" "}
                {unfinished
                  ? `${unfinished} need a correct answer or other details.`
                  : "All questions are ready to add."}
              </div>
              {notices.map((note, i) => (
                <p key={i} className="text-xs text-amber-800">
                  {note}
                </p>
              ))}
              {drafts.map((q, index) => (
                <fieldset
                  key={index}
                  disabled={locked}
                  className="border border-slate-200 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-800">
                      Question {index + 1} ·{" "}
                      {questionTypeLabel(q.type || "mcq")}
                    </h3>
                    <button
                      type="button"
                      aria-label={`Remove pasted question ${index + 1}`}
                      onClick={() =>
                        setDrafts(drafts.filter((_, i) => i !== index))
                      }
                      className="p-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <textarea
                    aria-label={`Pasted question ${index + 1}`}
                    value={q.prompt}
                    maxLength={10000}
                    rows={2}
                    onChange={(e) => update(index, { prompt: e.target.value })}
                    className="w-full p-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg"
                  />
                  {q.notes.length > 0 && (
                    <p className="text-xs text-amber-800">
                      {q.notes.join(" ")}
                    </p>
                  )}
                  {q.type === "essay" ? (
                    <p className="text-xs text-slate-500">
                      Teacher-graded written answer
                    </p>
                  ) : (
                    <p
                      className={`text-xs font-semibold ${q.correctAnswer ? "text-slate-500" : "text-amber-800"}`}
                    >
                      {q.correctAnswer
                        ? "Correct answer selected"
                        : "Select the correct answer"}
                    </p>
                  )}
                  {q.options.map((option, optionIndex) => (
                    <div
                      key={option.id}
                      className={`flex items-center gap-2 rounded-lg p-2 border ${q.correctAnswer === option.id ? "bg-emerald-50 border-emerald-200" : "border-slate-200"}`}
                    >
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                        <input
                          type="radio"
                          name={`pasted-key-${index}`}
                          aria-label={`Question ${index + 1}, correct answer ${option.label}`}
                          checked={q.correctAnswer === option.id}
                          onChange={() =>
                            update(index, { correctAnswer: option.id })
                          }
                        />
                        {option.label}
                      </label>
                      <textarea
                        rows={1}
                        aria-label={`Question ${index + 1}, choice ${option.label}`}
                        value={option.text}
                        hidden={q.type === "true_false"}
                        readOnly={q.type === "true_false"}
                        maxLength={4000}
                        onChange={(e) =>
                          update(index, {
                            options: q.options.map((o, i) =>
                              i === optionIndex
                                ? { ...o, text: e.target.value }
                                : o,
                            ),
                          })
                        }
                        className="w-full min-w-0 p-1.5 text-sm bg-transparent rounded"
                      />
                      <button
                        type="button"
                        hidden={q.type === "true_false"}
                        aria-label={`Remove question ${index + 1} choice ${option.label}`}
                        onClick={() =>
                          update(index, {
                            options: q.options.filter(
                              (o) => o.id !== option.id,
                            ),
                            correctAnswer:
                              q.correctAnswer === option.id
                                ? ""
                                : q.correctAnswer,
                          })
                        }
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {(q.type || "mcq") === "mcq" && q.options.length < 8 && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-indigo-700"
                      onClick={() => {
                        const label = "ABCDEFGH"
                          .split("")
                          .find(
                            (letter) =>
                              !q.options.some((o) => o.label === letter),
                          )!;
                        update(index, {
                          options: [
                            ...q.options,
                            { id: crypto.randomUUID(), label, text: "" },
                          ],
                        });
                      }}
                    >
                      + Add a choice
                    </button>
                  )}
                  <label className="block text-xs font-semibold text-slate-600">
                    Points
                    <PointsInput
                      aria-label={`Points for pasted question ${index + 1}`}
                      value={q.points}
                      onChange={(points) => update(index, { points })}
                      aria-invalid={readPoints(q.points) === null}
                      className="block w-28 mt-1 p-2 border border-slate-200 rounded-lg"
                    />
                  </label>
                </fieldset>
              ))}
            </>
          )}
        </div>
        <div className="p-4 sm:px-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            {(source || drafts) && (
              <button
                type="button"
                disabled={saving}
                className="text-xs text-slate-500 underline"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Clear this pasted draft? Questions already added to your quiz will stay.",
                    )
                  )
                    return;
                  importId.current = crypto.randomUUID();
                  setSource("");
                  setDrafts(null);
                  setDefaultPoints("1");
                  setLocked(false);
                  setError("");
                  setNotices([]);
                }}
              >
                Start over
              </button>
            )}
            {drafts ? (
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  setDrafts(null);
                  setError("");
                }}
                className="flex items-center gap-1 text-sm text-slate-600 disabled:opacity-50"
              >
                <ArrowLeft size={16} />
                Back to paste
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-slate-600"
              >
                Cancel
              </button>
            )}
          </div>
          <button
            type="button"
            disabled={
              saving ||
              (drafts ? !drafts.length || unfinished > 0 : !source.trim())
            }
            onClick={drafts ? save : prepare}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            <ClipboardPaste size={16} />
            {saving
              ? "Adding…"
              : drafts
                ? `${locked ? "Retry adding" : "Add"} ${drafts.length} ${drafts.length === 1 ? "question" : "questions"}`
                : "Organize & preview"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
