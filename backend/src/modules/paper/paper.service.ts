import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../../database/database.service";
import { GradingService } from "../grading/grading.service";
import { paperLayout } from "./paper-layout";
import { QuizAttempt } from "../../common/types";
import { PaperSheet } from "./paper.types";
import { IssuePaperDto, SavePaperDto } from "./paper.dto";
import { studentLastName } from "../reports/student-name";
import { hasPaperDraftChanges } from "../../common/paper-draft";

@Injectable()
export class PaperService {
  constructor(
    private db: DatabaseService,
    private grading: GradingService,
  ) {}
  private async ownQuiz(id: string, teacherId: string) {
    const quiz = await this.db.getQuizById(id);
    if (!quiz) throw new NotFoundException("Exam not found");
    if (quiz.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this exam");
    if (quiz.exam_format !== "paper")
      throw new BadRequestException("Choose a Paper Exam");
    return quiz;
  }
  private async ownSheet(id: string, teacherId: string) {
    const sheet = await this.db.getPaperSheet(id);
    if (!sheet) throw new NotFoundException("Answer sheet not found");
    const quiz = await this.ownQuiz(sheet.quiz_id, teacherId);
    // Old printed sheets keep their QR and frozen student/section identity.
    sheet.layout.subject ||= quiz.subject || undefined;
    return sheet;
  }
  async list(quizId: string, teacherId: string) {
    const quiz = await this.ownQuiz(quizId, teacherId);
    const edition = await this.db.getQuizVersion(quizId, quiz.version);
    return (await this.db.listPaperSheets(quizId)).map((s) => ({
      id: s.id,
      student: s.layout.student,
      section: s.layout.section,
      created_at: s.created_at,
      attempt_id: s.attempt_id || null,
      is_current_edition: s.quiz_version_id === edition?.id,
    }));
  }
  async get(id: string, teacherId: string) {
    return this.ownSheet(id, teacherId);
  }
  async prepareSection(quizId: string, teacherId: string, sectionId: string, paperFormat?: "a4" | "long_bond") {
    const quiz = await this.ownQuiz(quizId, teacherId);
    if (quiz.status !== "published")
      throw new BadRequestException("Publish this exam before printing");
    const edition = await this.db.getQuizVersion(quizId, quiz.version);
    if (
      hasPaperDraftChanges(quiz, await this.db.listQuestions(quizId), edition)
    )
      throw new BadRequestException(
        "Publish your question changes before preparing sheets",
      );
    const section = await this.db.getSection(sectionId);
    if (!section || section.quiz_id !== quizId || !section.class_section_id)
      throw new BadRequestException("Select a section from this exam");
    const group = await this.db.getClass(section.class_section_id);
    if (!group || group.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this section");
    const roster = (await this.db.listRoster(group.id)).sort(
      (a, b) =>
        studentLastName(a.full_name).localeCompare(
          studentLastName(b.full_name),
          "en",
          { sensitivity: "base" },
        ) ||
        a.full_name.localeCompare(b.full_name, "en", { sensitivity: "base" }),
    );
    if (!roster.length)
      throw new BadRequestException(
        "This section has no students yet. Students appear after joining a quiz in this section.",
      );
    if (roster.length > 500)
      throw new BadRequestException(
        "A section can prepare up to 500 students at a time",
      );
    const existing = await this.db.listPaperSheets(quizId);
    const sheet_ids: string[] = [];
    const skipped: { student: string; reason: string }[] = [];
    // Bounded, sequential preparation: retries reuse open sheets, never overwrite scores
    // or create surprise retakes for students whose result has already been saved.
    for (const entry of roster) {
      const profile = await this.db.getProfileByEmail(entry.email);
      if (!profile || profile.role !== "student") {
        skipped.push({
          student: entry.full_name,
          reason: "Student account not registered",
        });
        continue;
      }
      if (existing.some((s) => s.student_id === profile.id && s.attempt_id)) {
        skipped.push({
          student: entry.full_name,
          reason: "Result already saved",
        });
        continue;
      }
      try {
        const sheet = await this.issue(quizId, teacherId, {
          section_id: sectionId,
          student_email: profile.email,
          paper_format: paperFormat,
        });
        sheet_ids.push(sheet.id);
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        skipped.push({ student: entry.full_name, reason: error.message });
      }
    }
    return { sheet_ids, skipped };
  }
  async issue(
    quizId: string,
    teacherId: string,
    dto: IssuePaperDto,
  ): Promise<PaperSheet> {
    return this.db.withLock(
      `paper-issue:${quizId}:${dto.student_email}`,
      async () => {
        const quiz = await this.ownQuiz(quizId, teacherId);
        if (quiz.status !== "published")
          throw new BadRequestException("Publish this exam before printing");
        const section = await this.db.getSection(dto.section_id);
        if (!section || section.quiz_id !== quizId || !section.class_section_id)
          throw new BadRequestException("Select a section from this exam");
        const student = await this.db.getProfileByEmail(
          dto.student_email.trim().toLowerCase(),
        );
        if (!student || student.role !== "student")
          throw new BadRequestException(
            "Use a registered student account email",
          );
        const open = (await this.db.listPaperSheets(quizId)).find(
          (s) => s.student_id === student.id && !s.attempt_id,
        );
        if (open) {
          if (open.section_id !== section.id)
            throw new ConflictException(
              "This student already has an answer sheet in another section",
            );
          return open;
        }
        const history = (
          await this.db.listAttemptsByStudent(student.id)
        ).filter((a) => a.quiz_id === quizId);
        if (history.some((a) => a.section_id !== section.id))
          throw new ConflictException("Use the student’s original section");
        if (history.length >= quiz.max_attempts)
          throw new ConflictException(
            "This student has reached the attempt limit",
          );
        const version = await this.db.getQuizVersion(quizId, quiz.version);
        if (!version || version.snapshot_data.exam_format !== "paper")
          throw new BadRequestException("Publish the Paper Exam first");
        if (
          !version.snapshot_data.questions.length ||
          version.snapshot_data.questions.length > 500
        )
          throw new BadRequestException("Paper Exams support 1–500 questions");
        if (
          version.snapshot_data.questions.some(
            (q) =>
              q.type === "mcq" && (!q.options?.length || q.options.length > 8),
          )
        )
          throw new BadRequestException(
            "Paper multiple-choice questions support up to 8 choices",
          );
        const id = randomUUID();
        const rosterName = (
          await this.db.listRoster(section.class_section_id)
        ).find(
          (entry) =>
            entry.email.trim().toLowerCase() === student.email.toLowerCase(),
        )?.full_name;
        const row: PaperSheet = {
          id,
          quiz_id: quizId,
          quiz_version_id: version.id,
          student_id: student.id,
          section_id: section.id,
          token: randomBytes(16).toString("hex"),
          created_at: new Date().toISOString(),
          layout: paperLayout(
            version,
            id,
            rosterName || student.full_name,
            section.name,
            dto.paper_format,
          ),
        };
        row.layout.subject = quiz.subject || undefined;
        if (this.db.isLive)
          return this.db.paperCommand<PaperSheet>("issue", teacherId, row);
        await this.db.enrollStartedStudent(section, student);
        await this.db.putPaperSheet(row);
        return row;
      },
    );
  }
  async resolve(code: string, teacherId: string) {
    const match = /^QUIZNA:P1:([a-f0-9-]{36}):(\d{1,3}):([a-f0-9]{32})$/.exec(
      code,
    );
    if (!match)
      throw new BadRequestException(
        "This is not a QuizNa answer-sheet QR code",
      );
    const sheet = await this.ownSheet(match[1], teacherId);
    if (!timingSafeEqual(Buffer.from(sheet.token), Buffer.from(match[3])))
      throw new BadRequestException("Invalid answer-sheet QR code");
    const page = Number(match[2]);
    if (!sheet.layout.pages.some((p) => p.index === page))
      throw new BadRequestException("Invalid answer-sheet page");
    return { sheet, page };
  }
  async save(
    id: string,
    teacherId: string,
    dto: SavePaperDto,
  ): Promise<QuizAttempt | null> {
    return this.db.withLock(`paper-save:${id}`, async () => {
      const sheet = await this.ownSheet(id, teacherId);
      if (sheet.attempt_id) return this.db.getAttemptById(sheet.attempt_id);
      if (dto.reviewed !== true)
        throw new BadRequestException(
          "Review the scanned answers before saving",
        );
      const student = (await this.db.getProfile(sheet.student_id))!;
      const quiz = await this.ownQuiz(sheet.quiz_id, teacherId);
      const version = await this.db.getVersionForAttempt({
        quiz_id: sheet.quiz_id,
        quiz_version_id: sheet.quiz_version_id,
      } as any);
      const questions = version.snapshot_data.questions;
      const given = new Map(
        dto.answers.map((a) => [a.question_id, a.answer ?? null]),
      );
      if (
        given.size !== dto.answers.length ||
        given.size !== questions.length ||
        questions.some((q) => !given.has(q.id))
      )
        throw new BadRequestException("Review every question exactly once");
      for (const q of questions) {
        const value = given.get(q.id);
        if (
          value !== null &&
          (q.type === "mcq" || q.type === "true_false") &&
          !q.options?.some((o) => o.id === value)
        )
          throw new BadRequestException(
            "Choose a printed option or leave the answer blank",
          );
      }
      const history = (await this.db.listAttemptsByStudent(student.id)).filter(
        (a) => a.quiz_id === quiz.id,
      );
      if (history.length >= quiz.max_attempts)
        throw new ConflictException(
          "This student has reached the attempt limit",
        );
      if (this.db.isLive)
        return this.db.paperCommand<QuizAttempt>("save", teacherId, {
          sheet_id: id,
          answers: questions.map((q) => ({
            question_id: q.id,
            answer: given.get(q.id),
          })),
        });
      const attempt = await this.db.createAttempt({
        quiz_id: quiz.id,
        quiz_version_id: sheet.quiz_version_id,
        paper_sheet_id: id,
        student_id: student.id,
        section_id: sheet.section_id,
        attempt_number: history.length + 1,
        deadline_at: new Date().toISOString(),
        max_score: questions.reduce((sum, q) => sum + Number(q.points), 0),
        question_order: sheet.layout.questions.map((q) => q.id),
      });
      for (const q of questions)
        await this.db.saveAnswer(attempt.id, q.id, given.get(q.id));
      const final = await this.db.updateAttempt(attempt.id, {
        status: "submitted",
        submitted_at: new Date().toISOString(),
      });
      const graded = await this.grading.autoGradeAttempt(final);
      await this.db.putPaperSheet({ ...sheet, attempt_id: attempt.id });
      return graded;
    });
  }
}
