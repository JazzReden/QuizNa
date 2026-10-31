import {
  PERFORMANCE_LEVELS,
  roundScore,
  type EssayCriterion,
} from "../../utils/essay-rubric";
export const LEVEL_DESCRIPTIONS = [
  "Meets the criterion completely.",
  "Mostly meets it, with minor gaps.",
  "Partly meets it, with several gaps.",
  "Shows limited relevant evidence.",
  "Missing, irrelevant, or incorrect.",
];
export function EssayRubricTable({ criteria }: { criteria: EssayCriterion[] }) {
  return (
    <details className="rounded-xl border bg-white p-3">
      <summary className="cursor-pointer text-xs font-semibold text-indigo-700">
        Rubric table
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="qn-responsive-table w-full min-w-[650px] border-collapse text-xs">
          <caption className="sr-only">
            Essay criteria and performance levels
          </caption>
          <thead>
            <tr>
              <th className="border bg-slate-50 p-2 text-left">Criterion</th>
              {PERFORMANCE_LEVELS.map((level) => (
                <th key={level.name} className="border bg-slate-50 p-2">
                  {level.name}
                  <span className="block font-normal">
                    {level.ratio * 100}%
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criteria.map((criterion) => (
              <tr key={criterion.name}>
                <th className="border p-2 text-left align-top">
                  {criterion.name}
                  <span className="mt-1 block font-normal text-slate-600">
                    {criterion.description}
                  </span>
                </th>
                {PERFORMANCE_LEVELS.map((level, index) => (
                  <td
                    data-label={level.name}
                    key={level.name}
                    className="border p-2 align-top"
                  >
                    <strong>
                      {roundScore(criterion.points * level.ratio)} pts
                    </strong>
                    <p className="mt-1 text-slate-600">
                      {LEVEL_DESCRIPTIONS[index]}
                    </p>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
