import { studentLastName } from "../reports/student-name";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service";
import { QuizAttempt } from "../../common/types";

@Injectable()
export class SectionsService {
  constructor(private readonly db: DatabaseService) {}
  private async ownQuiz(quizId: string, teacherId: string) {
    const quiz = await this.db.getQuizById(quizId);
    if (!quiz) throw new NotFoundException("Quiz not found");
    if (quiz.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this quiz");
    return quiz;
  }
  async list(quizId: string, teacherId: string) {
    await this.ownQuiz(quizId, teacherId);
    return this.db.listSections(quizId);
  }
  private async ownClass(id: string, teacherId: string) {
    const section = await this.db.getClass(id);
    if (!section) throw new NotFoundException("Section not found");
    if (section.teacher_id !== teacherId)
      throw new ForbiddenException("You do not own this section");
    return section;
  }
  async listClasses(teacherId: string) {
    const classes = (await this.db.listClasses(teacherId)).sort((a,b) => a.name.localeCompare(b.name,"en",{numeric:true,sensitivity:"base"}));
    return Promise.all(
      classes.map(async (section) => ({
        ...section,
        student_count: (await this.db.listRoster(section.id)).length,
      })),
    );
  }
  async createClass(teacherId: string, name: string) {
    return this.db.withLock(`classes:${teacherId}`, async () => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 80)
        throw new BadRequestException(
          "Enter a section name of up to 80 characters",
        );
      if (
        (await this.db.listClasses(teacherId)).some(
          (s) => s.name.toLowerCase() === trimmed.toLowerCase(),
        )
      )
        throw new ConflictException("A section with this name already exists");
      return this.db.createClass({
        id: randomUUID(),
        teacher_id: teacherId,
        name: trimmed,
        created_at: new Date().toISOString(),
      });
    });
  }
  async roster(classId: string, teacherId: string) {
    await this.ownClass(classId, teacherId);
    return (await this.db.listRoster(classId))
      .map((s) => ({ ...s, last_name: studentLastName(s.full_name) }))
      .sort(
        (a, b) =>
          a.last_name.localeCompare(b.last_name, "en", {
            sensitivity: "base",
          }) || a.full_name.localeCompare(b.full_name, "en", { sensitivity: "base" }) || a.email.localeCompare(b.email),
      );
  }
  async addStudents(
    classId: string,
    teacherId: string,
    students: { full_name: string; email: string }[],
  ) {
    // Validate the entire batch before touching storage. Account email is the roster identity.
    if (!students.length || students.length > 200)
      throw new BadRequestException("Add between 1 and 200 students");
    const normalized = students.map((s) => ({
      full_name: s.full_name.trim(),
      email: s.email.trim().toLowerCase(),
    }));
    if (
      normalized.some(
        (s) =>
          !s.full_name ||
          s.full_name.length > 160 ||
          s.email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email),
      )
    )
      throw new BadRequestException(
        "Each student needs a name and valid email",
      );
    return this.db.withLock(`roster:${classId}`, async () => {
      await this.ownClass(classId, teacherId);
      if (this.db.isLive)
        await this.db.classCommand("roster", teacherId, {
          class_section_id: classId,
          students: normalized,
        });
      else {
        const existing = await this.db.listRoster(classId);
        const byEmail = new Map(existing.map((s) => [s.email, s]));
        for (const value of normalized) {
          const row = {
            ...(byEmail.get(value.email) || {
              id: randomUUID(),
              class_section_id: classId,
              created_at: new Date().toISOString(),
            }),
            ...value,
          };
          await this.db.saveRosterStudent(row);
          byEmail.set(row.email, row);
        }
      }
      return this.db.listRoster(classId);
    });
  }
  async removeStudent(classId: string, teacherId: string, studentId: string) {
    return this.db.withLock(`roster:${classId}`, async () => {
      await this.ownClass(classId, teacherId);
      if (this.db.isLive)
        await this.db.classCommand("remove_student", teacherId, {
          class_section_id: classId,
          student_id: studentId,
        });
      else if (
        (await this.db.listRoster(classId)).some((s) => s.id === studentId)
      )
        await this.db.removeRosterStudent(studentId);
      return { success: true };
    });
  }
  async attach(quizId: string, teacherId: string, classId: string) {
    return this.db.withLock(`sections:${quizId}`, async () => {
      await this.ownQuiz(quizId, teacherId);
      const section = await this.ownClass(classId, teacherId);
      const prior = (await this.db.listSections(quizId)).find(
        (s) => s.class_section_id === classId,
      );
      if (prior) return prior;
      let code: string;
      do {
        code = "S-" + randomBytes(4).toString("hex").toUpperCase();
      } while (
        (await this.db.getSectionByCode(code)) ||
        (await this.db.getQuizByCode(code))
      );
      const row = {
        id: randomUUID(),
        quiz_id: quizId,
        class_section_id: classId,
        name: section.name,
        access_code: code,
        created_at: new Date().toISOString(),
      };
      if (this.db.isLive)
        return this.db.classCommand<import("../../common/types").QuizSection>(
          "attach",
          teacherId,
          { ...row },
        );
      return this.db.createSection(row);
    });
  }
  // Compatibility for saved editors and existing integrations. New quizzes select reusable sections.
  async create(quizId: string, teacherId: string, name: string) {
    await this.ownQuiz(quizId, teacherId);
    if (
      (await this.db.listSections(quizId)).some(
        (s) => s.name.toLowerCase() === name.trim().toLowerCase(),
      )
    )
      throw new ConflictException("A section with this name already exists");
    let section = (await this.db.listClasses(teacherId)).find(
      (s) => s.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (!section) {
      try {
        section = await this.createClass(teacherId, name);
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        section = (await this.db.listClasses(teacherId)).find(
          (s) => s.name.toLowerCase() === name.trim().toLowerCase(),
        );
        if (!section) throw error;
      }
    }
    return this.attach(quizId, teacherId, section.id);
  }
  async assign(
    attemptId: string,
    teacherId: string,
    sectionId: string | null,
  ): Promise<QuizAttempt> {
    if (this.db.isLive)
      return this.db.command("assign_section", teacherId, {
        attempt_id: attemptId,
        section_id: sectionId,
      });
    const original = await this.db.getAttemptById(attemptId);
    if (!original) throw new NotFoundException("Attempt not found");
    return this.db.withLock(
      `start:${original.student_id}:${original.quiz_id}`,
      async () => {
        const attempt = await this.db.getAttemptById(attemptId);
        if (!attempt) throw new NotFoundException("Attempt not found");
        await this.ownQuiz(attempt.quiz_id, teacherId);
        const attempts = (
          await this.db.listAttemptsByQuiz(attempt.quiz_id)
        ).filter((a) => a.student_id === attempt.student_id);
        if (attempts.some((a) => a.status === "in_progress"))
          throw new BadRequestException(
            "Wait until this student finishes the quiz before changing sections",
          );
        if (sectionId) {
          const section = await this.db.getSection(sectionId);
          if (!section || section.quiz_id !== attempt.quiz_id)
            throw new BadRequestException("Choose a section from this quiz");
        }
        for (const record of attempts)
          await this.db.updateAttempt(record.id, { section_id: sectionId });
        return this.db.getAttemptById(attemptId);
      },
    );
  }
}
