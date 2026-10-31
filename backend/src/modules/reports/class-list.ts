import { QuizAttempt, QuizSection, RosterStudent } from "../../common/types";
import { ScoreRow } from "./leaderboard";
import { studentLastName } from "./student-name";

export type Participation = "submitted" | "in_progress" | "not_started";
export interface ClassListRow extends ScoreRow {
  participation: Participation;
  rosterMember: boolean;
}

/** Roster entries are expected students; unrostered attempts remain visible.
 * Email links an expected student to a registered account, within the quiz section.
 */
export function buildClassList(
  scores: ScoreRow[],
  attempts: QuizAttempt[],
  sections: QuizSection[],
  roster: RosterStudent[],
): ClassListRow[] {
  const key = (section: string | null | undefined, email: string) =>
    `${section || ""}:${email.trim().toLowerCase()}`;
  const rows = new Map<string, ClassListRow>();
  for (const section of sections) {
    for (const student of roster.filter(
      (s) => s.class_section_id === section.class_section_id,
    )) {
      rows.set(key(section.id, student.email), {
        studentId: `roster:${student.id}`,
        studentName: student.full_name,
        studentLastName: studentLastName(student.full_name),
        studentEmail: student.email,
        sectionId: section.id,
        sectionName: section.name,
        attemptId: "",
        reviewAttemptId: "",
        scoreAttemptId: "",
        attemptNumber: 0,
        attemptCount: 0,
        pendingAttempts: 0,
        score: null,
        maxScore: 0,
        percentage: null,
        rank: null,
        status: "not_started",
        isGraded: false,
        participation: "not_started",
        rosterMember: true,
      });
    }
  }
  for (const score of scores) {
    const id = key(score.sectionId, score.studentEmail),
      expected = rows.get(id);
    rows.set(id, {
      ...score,
      ...(expected
        ? {
            studentName: expected.studentName,
            studentLastName: expected.studentLastName,
          }
        : {}),
      participation: "submitted",
      rosterMember: !!expected,
    });
  }
  const names = new Map(sections.map((s) => [s.id, s.name]));
  for (const attempt of attempts.filter((a) => a.status === "in_progress")) {
    const profile = attempt.student_profile;
    if (!profile) continue;
    const id = key(attempt.section_id, profile.email),
      prior = rows.get(id);
    rows.set(id, {
      ...(prior || {
        studentName: profile.full_name,
        studentLastName: studentLastName(profile.full_name),
        studentEmail: profile.email,
        sectionId: attempt.section_id || null,
        sectionName: names.get(attempt.section_id) || "Unassigned",
        scoreAttemptId: "",
        attemptCount: 0,
        pendingAttempts: 0,
        score: null,
        maxScore: attempt.max_score,
        percentage: null,
        rank: null,
        isGraded: false,
        rosterMember: false,
      }),
      studentId: attempt.student_id,
      attemptId: attempt.id,
      reviewAttemptId: prior?.reviewAttemptId || "",
      attemptNumber: attempt.attempt_number,
      status: attempt.status,
      participation: "in_progress",
    });
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.sectionName.localeCompare(b.sectionName, "en", {
        sensitivity: "base",
        numeric: true,
      }) ||
      a.studentLastName.localeCompare(b.studentLastName, "en", {
        sensitivity: "base",
        numeric: true,
      }) ||
      a.studentName.localeCompare(b.studentName, "en", {
        sensitivity: "base",
      }) ||
      a.studentEmail.localeCompare(b.studentEmail),
  );
}
