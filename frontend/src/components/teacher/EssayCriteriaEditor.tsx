import { EssayRubricTable } from "./EssayRubricTable";
import { useState } from "react";
import { PointsInput } from "../common/PointsInput";
import {
  criteriaError,
  parseCriteria,
  suggestedCriteria,
  CRITERIA_HEADER,
} from "../../utils/essay-rubric";
interface Props {
  value: string;
  points: number;
  onChange: (value: string) => void;
}
export function EssayCriteriaEditor({ value, points, onChange }: Props) {
  const initial = parseCriteria(value);
  const [mode, setMode] = useState(Boolean(initial));
  const [rows, setRows] = useState(() =>
    (initial || suggestedCriteria(points)).map((row) => ({
      ...row,
      points: String(row.points),
    })),
  );
  const update = (next: typeof rows) => {
    setRows(next);
    onChange(
      CRITERIA_HEADER +
        "\n" +
        next
          .map(
            (row) =>
              `${row.name.replace(/\n/g, " ")} (${row.points} points): ${row.description.replace(/\n/g, " ")}`,
          )
          .join("\n"),
    );
  };
  return (
    <section className="space-y-3" aria-label="Essay grading criteria">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Essay criteria</h3>
        <button
          type="button"
          className="text-xs font-semibold text-indigo-700"
          onClick={() => {
            if (!mode) {
              const next = suggestedCriteria(points).map((row) => ({
                ...row,
                points: String(row.points),
              }));
              setMode(true);
              update(next);
            } else {
              setMode(false);
              onChange("");
            }
          }}
        >
          {mode ? "Use a simple guide" : "Use criteria"}
        </button>
      </div>
      {mode ? (
        <>
          {rows.map((row, index) => (
            <div
              key={index}
              className="rounded-xl border bg-slate-50 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <label className="flex-1 text-xs">
                  Criterion
                  <input
                    aria-label={`Criterion ${index + 1} name`}
                    value={row.name}
                    maxLength={80}
                    onChange={(e) =>
                      update(
                        rows.map((item, i) =>
                          i === index
                            ? { ...item, name: e.target.value }
                            : item,
                        ),
                      )
                    }
                    className="mt-1 block w-full rounded-lg border bg-white p-2"
                  />
                </label>
                <label className="w-24 text-xs">
                  Points
                  <PointsInput
                    aria-label={`Criterion ${index + 1} points`}
                    value={row.points}
                    onChange={(points) =>
                      update(
                        rows.map((item, i) =>
                          i === index ? { ...item, points } : item,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border bg-white p-2"
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove criterion ${index + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => update(rows.filter((_, i) => i !== index))}
                  className="mt-4 p-2 text-slate-500 disabled:opacity-30"
                >
                  ×
                </button>
              </div>
              <label className="block text-xs">
                What to look for
                <input
                  aria-label={`Criterion ${index + 1} description`}
                  value={row.description}
                  maxLength={500}
                  onChange={(e) =>
                    update(
                      rows.map((item, i) =>
                        i === index
                          ? { ...item, description: e.target.value }
                          : item,
                      ),
                    )
                  }
                  className="mt-1 block w-full rounded-lg border bg-white p-2"
                />
              </label>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              disabled={rows.length >= 8}
              onClick={() =>
                update([...rows, { name: "", points: "", description: "" }])
              }
              className="font-semibold text-indigo-700 disabled:opacity-40"
            >
              Add criterion
            </button>
            <span>Total must equal {points} points</span>
          </div>
          {parseCriteria(value) && (
            <EssayRubricTable criteria={parseCriteria(value)!} />
          )}
          {criteriaError(value, points) && (
            <p role="alert" className="text-xs text-rose-700">
              {criteriaError(value, points)}
            </p>
          )}
        </>
      ) : (
        <textarea
          aria-label="Grading guide"
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="What makes a good answer?"
          className="w-full rounded-xl border bg-slate-50 p-3 text-sm"
        />
      )}
    </section>
  );
}
