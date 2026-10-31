import { EssayRubricTable, LEVEL_DESCRIPTIONS } from "./EssayRubricTable";
import { useState } from "react";
import {
  assessCriteria,
  parseCriteria,
  suggestedCriteria,
  PERFORMANCE_LEVELS,
  roundScore,
} from "../../utils/essay-rubric";
interface Props {
  guide?: string;
  points: number;
  feedback: string;
  disabled: boolean;
  onChange: (score: string | null, feedback: string) => void;
}
export function EssayCriteriaGrader({
  guide,
  points,
  feedback,
  disabled,
  onChange,
}: Props) {
  const published = parseCriteria(guide),
    criteria = published || suggestedCriteria(points);
  const [levels, setLevels] = useState<number[]>(() =>
    criteria.map((criterion) =>
      PERFORMANCE_LEVELS.findIndex((level) =>
        feedback
          .split("\n")
          .some(
            (line) =>
              line ===
              `${criterion.name}: ${roundScore(criterion.points * level.ratio)}/${criterion.points} (${level.name})`,
          ),
      ),
    ),
  );
  const result = assessCriteria(criteria, levels);
  return (
    <details className="rounded-xl border bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-indigo-700">
        {published ? "Grade by criteria" : "Suggested criteria"}
        {result ? ` · ${result.total}/${points}` : ""}
      </summary>
      <div className="mt-3 space-y-4">
        {criteria.map((criterion, index) => (
          <fieldset
            key={criterion.name}
            disabled={disabled}
            className="space-y-2"
          >
            <legend className="text-sm font-semibold">
              {criterion.name} · {criterion.points} pts
            </legend>
            <p className="text-xs text-slate-500">{criterion.description}</p>
            <div className="flex flex-wrap gap-2">
              {PERFORMANCE_LEVELS.map((level, levelIndex) => (
                <button
                  key={level.name}
                  type="button"
                  aria-pressed={levels[index] === levelIndex}
                  aria-label={`${criterion.name}: ${level.name}`}
                  onClick={() => {
                    const next = levels.map((selected, i) =>
                      i === index ? levelIndex : selected,
                    );
                    setLevels(next);
                    const assessed = assessCriteria(criteria, next);
                    onChange(
                      assessed ? String(assessed.total) : null,
                      assessed?.feedback || "",
                    );
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs ${levels[index] === levelIndex ? "border-indigo-600 bg-indigo-50 text-indigo-800" : "border-slate-200 text-slate-700"}`}
                >
                  <span className="block font-semibold">{level.name}</span>
                  {roundScore(criterion.points * level.ratio)} pts
                </button>
              ))}
            </div>
            {levels[index] >= 0 && (
              <p className="text-xs text-slate-600">
                {LEVEL_DESCRIPTIONS[levels[index]]}
              </p>
            )}
          </fieldset>
        ))}
        <EssayRubricTable criteria={criteria} />
        <p role="status" className="text-xs text-slate-500">
          {result
            ? `Criteria total: ${result.total}/${points}`
            : "Select a level for each criterion."}
        </p>
      </div>
    </details>
  );
}
