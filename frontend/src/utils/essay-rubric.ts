export interface EssayCriterion {
  name: string;
  points: number;
  description: string;
}
export const CRITERIA_HEADER = "Essay criteria";
export const PERFORMANCE_LEVELS = [
  { name: "Excellent", ratio: 1 },
  { name: "Proficient", ratio: 0.75 },
  { name: "Developing", ratio: 0.5 },
  { name: "Beginning", ratio: 0.25 },
  { name: "No evidence", ratio: 0 },
] as const;
export const roundScore = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
export function suggestedCriteria(points: number): EssayCriterion[] {
  const total = Math.round(points * 100),
    content = Math.floor(total * 0.4),
    complete = Math.floor(total * 0.4);
  return [
    {
      name: "Accuracy",
      points: content / 100,
      description: "Facts and explanations are correct.",
    },
    {
      name: "Completeness",
      points: complete / 100,
      description: "Addresses every part with relevant details or examples.",
    },
    {
      name: "Clarity",
      points: (total - content - complete) / 100,
      description: "Ideas are clear, organized, and understandable.",
    },
  ];
}
export function parseCriteria(guide?: string): EssayCriterion[] | null {
  if (!guide?.startsWith(CRITERIA_HEADER + "\n")) return null;
  const lines = guide.trim().split("\n").slice(1);
  if (!lines.length || lines.length > 8) return null;
  const criteria: EssayCriterion[] = [];
  for (const line of lines) {
    const match =
      /^(.{1,80}) \((\d+(?:\.\d{1,2})?) points?\): (.{1,500})$/.exec(line);
    if (
      !match ||
      !match[1].trim() ||
      !match[3].trim() ||
      !Number.isFinite(Number(match[2])) ||
      Number(match[2]) > 99999999.99
    )
      return null;
    criteria.push({
      name: match[1].trim(),
      points: Number(match[2]),
      description: match[3].trim(),
    });
  }
  if (
    new Set(criteria.map((c) => c.name.toLowerCase())).size !== criteria.length
  )
    return null;
  return criteria;
}
export const serializeCriteria = (criteria: EssayCriterion[]) =>
  CRITERIA_HEADER +
  "\n" +
  criteria
    .map((c) => `${c.name} (${c.points} points): ${c.description}`)
    .join("\n");
export function criteriaError(guide: string, points: number): string | null {
  if (!guide.startsWith(CRITERIA_HEADER + "\n")) return null;
  const rows = parseCriteria(guide);
  if (!rows)
    return "Give each criterion a unique name, valid points, and a description.";
  return Math.round(rows.reduce((sum, row) => sum + row.points, 0) * 100) ===
    Math.round(points * 100)
    ? null
    : `Criteria must total ${points} points.`;
}
export function assessCriteria(criteria: EssayCriterion[], levels: number[]) {
  if (
    levels.length !== criteria.length ||
    levels.some(
      (level) =>
        !Number.isInteger(level) ||
        level < 0 ||
        level >= PERFORMANCE_LEVELS.length,
    )
  )
    return null;
  const scores = criteria.map((criterion, i) =>
    roundScore(criterion.points * PERFORMANCE_LEVELS[levels[i]].ratio),
  );
  const total = roundScore(scores.reduce((sum, score) => sum + score, 0));
  const feedback = criteria
    .map(
      (criterion, i) =>
        `${criterion.name}: ${scores[i]}/${criterion.points} (${PERFORMANCE_LEVELS[levels[i]].name})`,
    )
    .join("\n");
  return { total, scores, feedback };
}
export function splitCriteriaFeedback(
  feedback: string,
  criteria: EssayCriterion[],
) {
  const breakdown: string[] = [],
    notes: string[] = [];
  for (const line of feedback.split("\n")) {
    const criterion = criteria.find((row) => line.startsWith(row.name + ": "));
    const tail = criterion ? line.slice(criterion.name.length + 2) : "";
    if (
      criterion &&
      /^\d+(?:\.\d+)?\/\d+(?:\.\d+)? \((Excellent|Proficient|Developing|Beginning|No evidence)\)$/.test(
        tail,
      )
    )
      breakdown.push(line);
    else notes.push(line);
  }
  return { breakdown: breakdown.join("\n"), notes: notes.join("\n").trim() };
}
