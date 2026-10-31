import type { EssayDraft } from "../../utils/essay-ai-review";
interface Props {
  draft: EssayDraft;
  number: number;
  disabled: boolean;
  onText: (text: string) => void;
  onChange: (draft: EssayDraft) => void;
}
export function EssayAiReview({
  draft,
  number,
  disabled,
  onText,
  onChange,
}: Props) {
  const valid =
    draft.score.trim() !== "" &&
    Number.isFinite(Number(draft.score)) &&
    Number(draft.score) >= 0 &&
    Number(draft.score) <= draft.maximum;
  return (
    <section
      className="rounded-xl border bg-white p-4 space-y-3"
      aria-label={`Essay ${number} review`}
    >
      <div className="flex justify-between gap-3">
        <h3 className="text-sm font-bold">Q{number} · Essay review</h3>
        <span
          className={`text-xs ${draft.legibility === "uncertain" ? "text-amber-800" : "text-slate-500"}`}
        >
          {draft.edited
            ? "Edited · check score"
            : draft.legibility === "uncertain"
              ? "Check handwriting"
              : "AI draft"}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <img
          src={draft.preview}
          alt={`Scanned response for question ${number}`}
          className="max-h-80 w-full object-contain border rounded-lg bg-slate-50"
        />
        <label className="text-sm font-medium">
          Transcription
          <textarea
            aria-label={`Q${number} transcription`}
            rows={6}
            maxLength={10000}
            disabled={disabled}
            value={draft.transcription}
            onChange={(e) => onText(e.target.value)}
            className="block w-full border rounded-lg p-3 mt-1"
          />
        </label>
      </div>
      {!!draft.criteria.length && (
        <details>
          <summary className="text-xs font-semibold cursor-pointer">
            {draft.basis === "published"
              ? "Exam criteria"
              : "Suggested criteria"}{" "}
            · {draft.suggestedScore}/{draft.maximum}
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {draft.criteria.map((c) => (
              <li key={c.index}>
                {c.name}: {c.score}/{c.points} · {c.level}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap gap-4 items-end">
        <label className="text-sm font-medium">
          Score / {draft.maximum}
          <input
            aria-label={`Q${number} score`}
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={draft.score}
            placeholder="Enter score"
            onChange={(e) =>
              onChange({ ...draft, score: e.target.value, accepted: false })
            }
            className="block mt-1 w-28 rounded-lg border p-2.5"
          />
        </label>
        <label className="text-sm font-medium flex-1 min-w-48">
          Feedback
          <input
            aria-label={`Q${number} feedback`}
            disabled={disabled}
            maxLength={1500}
            value={draft.feedback}
            onChange={(e) => onChange({ ...draft, feedback: e.target.value })}
            className="block w-full mt-1 rounded-lg border p-2.5"
          />
        </label>
        <label className="text-sm flex gap-2 items-center py-3">
          <input
            type="checkbox"
            disabled={disabled || !valid}
            checked={draft.accepted}
            onChange={(e) => onChange({ ...draft, accepted: e.target.checked })}
          />
          Use this score
        </label>
      </div>
    </section>
  );
}
