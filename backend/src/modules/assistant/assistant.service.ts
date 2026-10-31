import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { UserProfile } from "../../common/types";
import { ReportsService } from "../reports/reports.service";
import { TeacherInsightsService } from "../reports/teacher-insights.service";
import { AttemptsService } from "../attempts/attempts.service";
import { AssistantReportDto } from "./assistant.dto";
export interface AssistantReport {
  topic: string;
  title: string;
  summary: string;
  rows: { name: string; detail: string }[];
  checkedAt: string;
  total: number;
  truncated: boolean;
}
@Injectable()
export class AssistantService {
  constructor(
    private db: DatabaseService,
    private reports: ReportsService,
    private insights: TeacherInsightsService,
    private attempts: AttemptsService,
  ) {}
  async options(user: UserProfile) {
    if (user.role !== "teacher")
      throw new ForbiddenException("Teacher access required");
    const quizzes = await this.db.listQuizzes(user.id);
    // Only explicit safe fields, never question content or answer keys.
    return {
      quizzes: await Promise.all(
        quizzes.map(async (q) => ({
          id: q.id,
          title: q.title,
          sections: (await this.db.listSections(q.id)).map((s) => ({
            id: s.id,
            name: s.name,
            classId: s.class_section_id || null,
          })),
        })),
      ),
    };
  }
  async report(
    user: UserProfile,
    query: AssistantReportDto,
  ): Promise<AssistantReport> {
    const studentTopics = ["results", "performance"];
    if (user.role === "student") {
      if (
        !studentTopics.includes(query.topic) ||
        query.quizId ||
        query.sectionId ||
        query.classId
      )
        throw new ForbiddenException(
          "Only your own released student reports are available",
        );
      // Reuse the release-gated projection. Never query raw scores here.
      if (query.topic === "results") {
        const attempts = (await this.attempts.listForStudent(user.id)).sort(
          (a, b) =>
            (b.submitted_at || b.started_at).localeCompare(
              a.submitted_at || a.started_at,
            ),
        );
        const visible = (a: (typeof attempts)[number]) =>
          a.status !== "in_progress" &&
          a.is_graded &&
          typeof a.score === "number";
        return this.result(
          query.topic,
          "My latest quiz results",
          `${attempts.filter(visible).length} of ${attempts.length} attempts have released, fully graded scores. Most recent first.`,
          attempts.map((a) => ({
            name: a.quiz?.title || "Quiz",
            detail: visible(a)
              ? `${a.score}/${a.max_score}`
              : a.status === "in_progress"
                ? "In progress"
                : !a.is_graded
                  ? "Awaiting grading"
                  : "Awaiting score release",
          })),
        );
      }
      const data = await this.attempts.getStudentPerformance(user.id);
      return this.result(
        query.topic,
        "My subject performance",
        data.percentage === null
          ? "No released, fully graded scores yet."
          : `Overall: ${data.percentage}%. Uses your best released, fully graded score per quiz.`,
        data.subjects.map((s) => ({
          name: s.subject || "Unassigned subject",
          detail:
            s.percentage === null
              ? "No released, fully graded scores"
              : `${s.earned}/${s.possible} · ${s.percentage}% · ${s.gradedCount} graded ${s.gradedCount === 1 ? "quiz" : "quizzes"}`,
        })),
      );
    }
    if (user.role !== "teacher" || studentTopics.includes(query.topic))
      throw new ForbiddenException("Report not available for this role");
    if (query.topic === "gradebook") {
      if (!query.classId || query.quizId || query.sectionId)
        throw new BadRequestException("Choose a section for gradebook totals");
      const book = await this.insights.gradebook(query.classId, user.id);
      return this.result(
        query.topic,
        `${book.section.name} · gradebook`,
        `${book.quizzes.length} quizzes. Totals use best teacher-confirmed scores; students are ordered by last name.`,
        book.rows.map((r) => ({
          name: r.name,
          detail:
            r.total === null
              ? "No confirmed scores"
              : `${r.total}/${r.outOf} · ${r.gradedCount}/${book.quizzes.length} confirmed`,
        })),
      );
    }
    if (!query.quizId || query.classId)
      throw new BadRequestException("Choose a quiz and its section");
    // The report service checks teacher ownership and section membership before reading attempts.
    const board = await this.reports.getClassList(
      query.quizId,
      user.id,
      query.sectionId,
    );
    const scope = query.sectionId
      ? board.sections.find((s) => s.id === query.sectionId)?.name
      : "All sections";
    const title = `${board.quiz.title} · ${scope}`;
    if (query.topic === "leaderboard") {
      const ranked = board.rows
        .filter((r) => r.rank !== null && r.score !== null)
        .sort(
          (a, b) =>
            a.rank! - b.rank! ||
            a.studentLastName.localeCompare(b.studentLastName),
        );
      return this.result(
        query.topic,
        title,
        `${ranked.length} students have ranked, fully graded scores.`,
        ranked.map((r) => ({
          name: r.studentName,
          detail: `#${r.rank} · ${r.score}/${r.maxScore} · ${r.sectionName}`,
        })),
      );
    }
    const rows =
      query.topic === "grading"
        ? board.rows.filter((r) => r.pendingAttempts > 0)
        : query.topic === "not_submitted"
          ? board.rows.filter((r) => r.participation !== "submitted")
          : board.rows.filter(
              (r) =>
                r.participation ===
                {
                  submissions: "submitted",
                  not_started: "not_started",
                  in_progress: "in_progress",
                }[query.topic],
            );
    const label = {
      submissions: "Submitted",
      not_submitted: "Not submitted",
      not_started: "Not started",
      in_progress: "In progress",
      grading: "Awaiting grading",
    }[query.topic];
    return this.result(
      query.topic,
      title,
      `${board.summary.submitted} submitted · ${board.summary.in_progress} in progress · ${board.summary.not_started} not started. ${query.topic === "not_started" ? "Not started includes known section roster members only." : ""}`.trim(),
      rows.map((r) => ({
        name: r.studentName,
        detail: `${label}${query.topic === "grading" ? ` (${r.pendingAttempts} attempts)` : ""} · ${r.sectionName}`,
      })),
    );
  }
  private result(
    topic: string,
    title: string,
    summary: string,
    rows: { name: string; detail: string }[],
  ): AssistantReport {
    return {
      topic,
      title,
      summary,
      rows: rows.slice(0, 100),
      checkedAt: new Date().toISOString(),
      total: rows.length,
      truncated: rows.length > 100,
    };
  }
}
