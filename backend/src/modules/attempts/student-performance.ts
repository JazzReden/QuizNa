import type { QuizAttempt } from "../../common/types";

type PerformanceState =
  "graded" | "awaiting_grading" | "awaiting_release" | "in_progress";
export interface PerformanceQuiz {
  id: string;
  title: string;
  format: "online" | "paper";
  subject: string | null;
  state: PerformanceState;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  attemptId: string;
  completedAt: string | null;
}
const rounded = (value: number) => Math.round(value * 100) / 100;
/** Accepts only the student's sanitized attempts. Hidden and provisional scores
 * never contribute to a total; each quiz contributes its best graded percentage. */
export function buildStudentPerformance(attempts: QuizAttempt[]) {
  const byQuiz = new Map<string, QuizAttempt[]>();
  for (const attempt of attempts) {
    if (!attempt.quiz) continue;
    const group = byQuiz.get(attempt.quiz_id) || [];
    group.push(attempt);
    byQuiz.set(attempt.quiz_id, group);
  }
  const subjects = new Map<
    string,
    { subject: string | null; quizzes: PerformanceQuiz[] }
  >();
  for (const [id, group] of byQuiz) {
    const recent = [...group].sort(
      (a, b) =>
        (b.submitted_at || b.started_at).localeCompare(
          a.submitted_at || a.started_at,
        ) || b.id.localeCompare(a.id),
    )[0];
    const graded = group
      .filter(
        (a) =>
          a.status !== "in_progress" &&
          a.is_graded &&
          typeof a.score === "number" &&
          Number.isFinite(a.score) &&
          a.max_score > 0,
      )
      .sort(
        (a, b) =>
          b.score! / b.max_score - a.score! / a.max_score ||
          (b.submitted_at || b.started_at).localeCompare(
            a.submitted_at || a.started_at,
          ) ||
          b.id.localeCompare(a.id),
      );
    const chosen = graded[0] || recent;
    const subject = recent.quiz!.subject?.trim().replace(/\s+/g, " ") || null;
    const key = subject?.toLocaleLowerCase("en") || "";
    if (!subjects.has(key)) subjects.set(key, { subject, quizzes: [] });
    subjects
      .get(key)!
      .quizzes.push({
        id,
        title: recent.quiz!.title || "Quiz",
        format: recent.quiz!.exam_format || "online",
        subject,
        state: graded.length
          ? "graded"
          : recent.status === "in_progress"
            ? "in_progress"
            : !recent.is_graded
              ? "awaiting_grading"
              : "awaiting_release",
        score: graded.length ? chosen.score! : null,
        maxScore: graded.length ? chosen.max_score : null,
        percentage: graded.length
          ? rounded((chosen.score! / chosen.max_score) * 100)
          : null,
        attemptId: chosen.id,
        completedAt: chosen.submitted_at || null,
      });
  }
  const groups = [...subjects.values()]
    .map((group) => {
      const counted = group.quizzes.filter((q) => q.state === "graded");
      const earned = counted.reduce((sum, q) => sum + q.score!, 0),
        possible = counted.reduce((sum, q) => sum + q.maxScore!, 0);
      return {
        ...group,
        quizzes: group.quizzes.sort((a, b) => a.title.localeCompare(b.title)),
        gradedCount: counted.length,
        earned: rounded(earned),
        possible: rounded(possible),
        percentage: possible ? rounded((earned / possible) * 100) : null,
      };
    })
    .sort((a, b) =>
      a.subject === null
        ? 1
        : b.subject === null
          ? -1
          : a.subject.localeCompare(b.subject),
    );
  const earned = groups.reduce((sum, g) => sum + g.earned, 0),
    possible = groups.reduce((sum, g) => sum + g.possible, 0);
  return {
    subjects: groups,
    gradedCount: groups.reduce((sum, g) => sum + g.gradedCount, 0),
    quizCount: byQuiz.size,
    percentage: possible ? rounded((earned / possible) * 100) : null,
  };
}
