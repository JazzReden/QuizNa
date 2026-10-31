import { AttemptAnswer, Question } from "../../common/types";

export interface AnalysisInput {
  version: number;
  versionId: string;
  questions: Question[];
  answers: AttemptAnswer[];
}
/** Pure worker task: no database access, authentication, or grading decisions. */
export function analyzeQuestions(data: AnalysisInput[]) {
  const groups = new Map<
    string,
    {
      id: string;
      version: number;
      order: number;
      prompt: string;
      type: string;
      points: number;
      responses: number;
      graded: number;
      pending: number;
      unanswered: number;
      fullCredit: number;
      earned: number;
      wrong: Map<string, { answer: string; count: number }>;
    }
  >();
  for (const attempt of data) {
    const answers = new Map(attempt.answers.map((a) => [a.question_id, a]));
    for (const q of attempt.questions) {
      const id = `${attempt.versionId}:${q.id}`;
      let row = groups.get(id);
      if (!row) {
        row = {
          id,
          version: attempt.version,
          order: q.order_index,
          prompt: q.prompt,
          type: q.type,
          points: Number(q.points),
          responses: 0,
          graded: 0,
          pending: 0,
          unanswered: 0,
          fullCredit: 0,
          earned: 0,
          wrong: new Map(),
        };
        groups.set(id, row);
      }
      row.responses++;
      const a = answers.get(q.id);
      const empty =
        a?.answer == null ||
        a.answer === "" ||
        (Array.isArray(a.answer) && a.answer.length === 0);
      if (empty) row.unanswered++;
      const pending =
        q.type === "essay" ? !a?.is_manually_graded : a?.score_awarded == null;
      if (pending) {
        row.pending++;
        continue;
      }
      const score = Number(a?.score_awarded ?? 0);
      row.graded++;
      row.earned += score;
      if (score >= row.points && row.points > 0) row.fullCredit++;
      if (q.type === "essay" || empty || score >= row.points) continue;
      const display = (value: unknown): string => {
        if (q.type === "mcq")
          return (
            q.options?.find((o) => o.id === String(value))?.text ||
            String(value)
          );
        if (q.type === "true_false") {
          if ([true, "true", "opt_true"].includes(value as any)) return "True";
          if ([false, "false", "opt_false"].includes(value as any))
            return "False";
        }
        return String(value);
      };
      const text = (
        Array.isArray(a.answer)
          ? a.answer.map(display).sort().join("; ")
          : display(a.answer)
      )
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ");
      const key = text.toLowerCase();
      const entry = row.wrong.get(key) || {
        answer: text.slice(0, 300),
        count: 0,
      };
      entry.count++;
      row.wrong.set(key, entry);
    }
  }
  return [...groups.values()]
    .map(({ wrong, earned, ...row }) => ({
      ...row,
      averagePercent:
        row.graded && row.points > 0
          ? Math.round((earned / (row.graded * row.points)) * 1000) / 10
          : null,
      fullCreditPercent: row.graded
        ? Math.round((row.fullCredit / row.graded) * 1000) / 10
        : null,
      commonWrong: [...wrong.values()]
        .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer))
        .slice(0, 3),
    }))
    .sort(
      (a, b) =>
        (a.averagePercent ?? 101) - (b.averagePercent ?? 101) ||
        a.version - b.version ||
        a.order - b.order ||
        a.id.localeCompare(b.id),
    );
}
