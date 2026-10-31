import { studentLastName } from "./student-name";
import { QuizAttempt } from "../../common/types";
export interface ScoreRow {
  studentId: string;
  studentName: string;
  studentLastName: string;
  studentEmail: string;
  sectionId: string | null;
  sectionName: string;
  attemptId: string;
  reviewAttemptId: string;
  scoreAttemptId: string;
  attemptNumber: number;
  attemptCount: number;
  pendingAttempts: number;
  score: number | null;
  maxScore: number;
  percentage: number | null;
  rank: number | null;
  status: string;
  isGraded: boolean;
  awaitingConfirmation?: boolean;
}
/** One best fully graded submission per student; unfinished grading never earns a rank. */
export function buildLeaderboard(
  attempts: QuizAttempt[],
  confirmedOnly = false,
): ScoreRow[] {
  const groups = new Map<string, QuizAttempt[]>();
  for (const a of attempts) {
    if (a.status === "in_progress") continue;
    const list = groups.get(a.student_id) || [];
    list.push(a);
    groups.set(a.student_id, list);
  }
  const percentage = (a: QuizAttempt) =>
    a.max_score > 0
      ? Math.round((Number(a.score || 0) / a.max_score) * 10000) / 100
      : 0;
  const rows: ScoreRow[] = [];
  for (const [studentId, list] of groups) {
    const graded = list
      .filter(
        (a) =>
          a.is_graded &&
          (!confirmedOnly || !!a.score_confirmed_at) &&
          a.score !== null &&
          a.score !== undefined,
      )
      .sort(
        (a, b) =>
          percentage(b) - percentage(a) ||
          Date.parse(a.submitted_at || a.started_at) -
            Date.parse(b.submitted_at || b.started_at) ||
          a.id.localeCompare(b.id),
      );
    const pending = list
      .filter((a) => !a.is_graded || (confirmedOnly && !a.score_confirmed_at))
      .sort(
        (a, b) =>
          Date.parse(b.submitted_at || b.started_at) -
          Date.parse(a.submitted_at || a.started_at),
      );
    const best = graded[0] || pending[0] || list[0];
    rows.push({
      studentId,
      studentName: best.student_profile?.full_name || "Student",
      studentLastName: studentLastName(
        best.student_profile?.full_name || "Student",
      ),
      studentEmail: best.student_profile?.email || "",
      sectionId: best.section_id || null,
      sectionName: best.section_name || "Unassigned",
      attemptId: best.id,
      scoreAttemptId: graded[0]?.id || "",
      reviewAttemptId: pending[0]?.id || best.id,
      attemptNumber: best.attempt_number,
      attemptCount: list.length,
      pendingAttempts: pending.length,
      score: graded.length ? Number(best.score) : null,
      maxScore: best.max_score,
      percentage: graded.length ? percentage(best) : null,
      rank: null,
      status: best.status,
      isGraded: graded.length > 0,
      awaitingConfirmation: confirmedOnly
        ? !!pending[0]?.is_graded
        : list.some((a) => a.is_graded && !a.score_confirmed_at),
    });
  }
  rows.sort(
    (a, b) =>
      (b.percentage ?? -1) - (a.percentage ?? -1) ||
      a.studentName.localeCompare(b.studentName) ||
      a.studentId.localeCompare(b.studentId),
  );
  let prior: number | null = null,
    rank = 0;
  rows.forEach((row, index) => {
    if (row.percentage === null) return;
    if (row.percentage !== prior) rank = index + 1;
    row.rank = rank;
    prior = row.percentage;
  });
  return rows;
}
