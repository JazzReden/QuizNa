import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { ReportsService } from "./reports.service";
import { BoundedWorkerPoolService } from "../workers/bounded-worker-pool.service";
import { studentLastName } from "./student-name";
import { AnalysisInput, analyzeQuestions } from "./question-analysis";
import { ClassListRow } from "./class-list";

@Injectable()
export class TeacherInsightsService {
  constructor(
    private db: DatabaseService,
    private reports: ReportsService,
    private pool: BoundedWorkerPoolService,
  ) {}

  async gradebook(classId: string, teacherId: string) {
    const section = await this.db.getClass(classId);
    if (!section) throw new NotFoundException("Section not found");
    if (section.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this section");
    const students = new Map<
      string,
      {
        name: string;
        email: string;
        onRoster: boolean;
        cells: Record<string, ClassListRow>;
      }
    >();
    const emailKey = (email: string) => email.trim().toLowerCase();
    for (const s of await this.db.listRoster(classId))
      students.set(emailKey(s.email), {
        name: s.full_name,
        email: s.email,
        onRoster: true,
        cells: {},
      });
    const quizzes: { id: string; title: string }[] = [];
    const owned = (await this.db.listQuizzes(teacherId))
      .filter((q) => q.status !== "draft")
      .sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      );
    for (const quiz of owned) {
      const linked = (await this.db.listSections(quiz.id)).filter(
        (s) => s.class_section_id === classId,
      );
      if (!linked.length) continue;
      quizzes.push({ id: quiz.id, title: quiz.title });
      for (const link of linked) {
        const board = await this.reports.getClassList(
          quiz.id,
          teacherId,
          link.id,
          true,
        );
        for (const r of board.rows) {
          const key = emailKey(r.studentEmail);
          const student = students.get(key) || {
            name: r.studentName,
            email: r.studentEmail,
            onRoster: false,
            cells: {},
          };
          student.cells[quiz.id] = r;
          students.set(key, student);
        }
      }
    }
    const rows = [...students.values()]
      .map((s) => {
        const cells = quizzes.map((q) => {
          const r = s.cells[q.id];
          return {
            quizId: q.id,
            score: r?.score ?? null,
            maxScore: r?.score != null ? r.maxScore : null,
            status: r?.participation || "not_started",
            pending: (r?.pendingAttempts ?? 0) > 0,
            awaitingConfirmation: r?.awaitingConfirmation ?? false,
            scoreAttemptId: r?.score != null ? r.scoreAttemptId || null : null,
            gradingAttemptId:
              (r?.pendingAttempts ?? 0) > 0 ? r?.reviewAttemptId || null : null,
          };
        });
        const graded = cells.filter((c) => c.score !== null);
        return {
          name: s.name,
          email: s.email,
          onRoster: s.onRoster,
          cells,
          total: graded.length
            ? Math.round(graded.reduce((sum, c) => sum + c.score!, 0) * 100) /
              100
            : null,
          outOf:
            Math.round(graded.reduce((sum, c) => sum + c.maxScore!, 0) * 100) /
            100,
          gradedCount: graded.length,
        };
      })
      .sort(
        (a, b) =>
          studentLastName(a.name).localeCompare(studentLastName(b.name), "en", {
            sensitivity: "base",
            numeric: true,
          }) ||
          a.name.localeCompare(b.name) ||
          a.email.localeCompare(b.email),
      );
    return { section: { id: section.id, name: section.name }, quizzes, rows };
  }

  async gradebookCsv(classId: string, teacherId: string) {
    const book = await this.gradebook(classId, teacherId);
    return this.pool.runTask(`gradebook_${classId}`, book, (data) => {
      const escape = (value: unknown) => {
        let s = String(value ?? "");
        if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      };
      const header = ["Student", ...data.quizzes.map((q) => q.title), "Total"];
      const rows = data.rows.map((r) => [
        r.name,
        ...r.cells.map((c) =>
          c.score !== null
            ? `${c.score}/${c.maxScore}`
            : c.status === "in_progress"
              ? "In progress"
              : c.status === "not_started"
                ? "Not started"
                : c.awaitingConfirmation
                  ? "Awaiting confirmation"
                  : "Awaiting grading",
        ),
        r.total === null ? "" : `${r.total}/${r.outOf}`,
      ]);
      return [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    });
  }

  async questionAnalysis(
    quizId: string,
    teacherId: string,
    sectionId?: string,
  ) {
    const quiz = await this.db.getQuizById(quizId);
    if (!quiz) throw new NotFoundException("Quiz not found");
    if (quiz.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this quiz");
    const sections = await this.db.listSections(quizId);
    if (
      sectionId &&
      sectionId !== "unassigned" &&
      !sections.some((s) => s.id === sectionId)
    )
      throw new BadRequestException("Choose a section from this quiz");
    const attempts = (await this.db.listAttemptsByQuiz(quizId))
      .filter(
        (a) =>
          a.status !== "in_progress" &&
          (!sectionId ||
            (sectionId === "unassigned"
              ? !a.section_id
              : a.section_id === sectionId)),
      )
      .sort(
        (a, b) =>
          Date.parse(b.submitted_at || b.started_at) -
            Date.parse(a.submitted_at || a.started_at) ||
          b.attempt_number - a.attempt_number ||
          a.id.localeCompare(b.id),
      );
    const seen = new Set<string>();
    const input: AnalysisInput[] = [];
    for (const a of attempts) {
      const key = JSON.stringify([a.section_id || null, a.student_id]);
      if (seen.has(key)) continue;
      seen.add(key);
      const version = await this.db.getVersionForAttempt(a);
      input.push({
        version: version.version_number,
        versionId: version.id,
        questions: await this.db.getAttemptQuestions(a),
        answers: await this.db.getAnswersByAttempt(a.id),
      });
    }
    const rows = await this.pool.runTask(
      `analysis_${quizId}`,
      input,
      analyzeQuestions,
    );
    return {
      quiz: { id: quiz.id, title: quiz.title },
      sections,
      submittedCount: input.length,
      rows,
    };
  }
}
