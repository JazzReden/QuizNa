import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service";
import { UserProfile, QuizAttempt } from "../../common/types";
import { AttemptsService } from "../attempts/attempts.service";
import { SubjectRoom, SubjectMember, SubjectQuiz } from "./subjects.types";
import { studentLastName } from "../reports/student-name";
@Injectable()
export class SubjectsService {
  constructor(
    private db: DatabaseService,
    private attempts: AttemptsService,
  ) {}
  async room(id: string) {
    const [room] = await this.db.subjectRecords<SubjectRoom>("subjects", {
      id,
    });
    if (!room) throw new NotFoundException("Subject not found");
    return room;
  }
  async own(id: string, teacher: string) {
    const room = await this.room(id);
    if (room.teacher_id !== teacher)
      throw new ForbiddenException("You do not own this subject");
    return room;
  }
  async list(user: UserProfile) {
    const rooms =
      user.role === "teacher"
        ? await this.db.subjectRecords<SubjectRoom>("subjects", {
            teacher_id: user.id,
          })
        : await Promise.all(
            (
              await this.db.subjectRecords<SubjectMember>("subjectMembers", {
                student_id: user.id,
              })
            ).map((m) => this.room(m.subject_id)),
          );
    return Promise.all(
      rooms
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (room) => {
          const links = await this.db.subjectRecords<SubjectQuiz>(
            "subjectQuizzes",
            { subject_id: room.id },
          );
          return {
            ...room,
            section_name: (await this.db.getClass(room.class_section_id))?.name,
            ...(user.role === "teacher"
              ? {
                  quiz_count: links.length,
                  quiz_ids: links.map((q) => q.quiz_id),
                }
              : {}),
          };
        }),
    );
  }
  async create(user: UserProfile, name: string, classId: string) {
    if (user.role !== "teacher") throw new ForbiddenException();
    const section = await this.db.getClass(classId);
    if (!section || section.teacher_id !== user.id)
      throw new ForbiddenException("Choose your own section");
    const normalized = name.trim().replace(/\s+/g, " ");
    if (!normalized || normalized.length > 120)
      throw new BadRequestException("Enter a subject name");
    return this.db.withLock(`subjects:${user.id}`, async () => {
      const existing = await this.db.subjectRecords<SubjectRoom>("subjects", {
        teacher_id: user.id,
        class_section_id: classId,
      });
      if (
        existing.some((s) => s.name.toLowerCase() === normalized.toLowerCase())
      )
        throw new ConflictException(
          "This subject already exists in this section",
        );
      return this.db.saveSubjectRecord("subjects", {
        id: randomUUID(),
        teacher_id: user.id,
        class_section_id: classId,
        name: normalized,
        access_code: "SUB-" + randomBytes(6).toString("hex").toUpperCase(),
        leaderboard_enabled: false,
        created_at: new Date().toISOString(),
      });
    });
  }
  async join(user: UserProfile, code: string) {
    if (user.role !== "student")
      throw new ForbiddenException("Only students can join subjects");
    const [room] = await this.db.subjectRecords<SubjectRoom>("subjects", {
      access_code: code.trim().toUpperCase(),
    });
    if (!room) throw new NotFoundException("Subject code not found");
    await this.db.withLock(`join-subject:${room.id}`, async () => {
      if (this.db.isLive) {
        await this.db.joinSubjectLive(room.id, user.id);
        return;
      }
      if (
        !(
          await this.db.subjectRecords<SubjectMember>("subjectMembers", {
            subject_id: room.id,
            student_id: user.id,
          })
        ).length
      )
        await this.db.saveSubjectRecord("subjectMembers", {
          id: randomUUID(),
          subject_id: room.id,
          student_id: user.id,
          created_at: new Date().toISOString(),
        });
      const roster = await this.db.listRoster(room.class_section_id);
      if (
        !roster.some((s) => s.email.toLowerCase() === user.email.toLowerCase())
      )
        await this.db.saveRosterStudent({
          id: randomUUID(),
          class_section_id: room.class_section_id,
          full_name: user.full_name.slice(0, 160),
          email: user.email.trim().toLowerCase(),
          created_at: new Date().toISOString(),
        });
    });
    return { id: room.id };
  }
  async access(id: string, user: UserProfile) {
    const room = await this.room(id);
    if (user.role === "teacher") {
      if (room.teacher_id !== user.id)
        throw new ForbiddenException(
          "This subject is not available to your teacher account.",
        );
    } else if (
      !(
        await this.db.subjectRecords<SubjectMember>("subjectMembers", {
          subject_id: id,
          student_id: user.id,
        })
      ).length
    )
      throw new ForbiddenException("Join this subject first");
    return room;
  }
  async attach(id: string, quizId: string, user: UserProfile) {
    return this.db.withLock(`subject-quiz:${id}`, async () => {
      const room = await this.own(id, user.id),
        quiz = await this.db.getQuizById(quizId);
      if (!quiz || quiz.teacher_id !== user.id)
        throw new ForbiddenException("Choose your own quiz");
      if (
        !(await this.db.listSections(quiz.id)).some(
          (s) => s.class_section_id === room.class_section_id,
        )
      )
        throw new BadRequestException(
          "Assign this quiz to the subject’s section first",
        );
      const prior = await this.db.subjectRecords<SubjectQuiz>(
        "subjectQuizzes",
        { subject_id: id, quiz_id: quizId },
      );
      if (prior.length) return prior[0];
      return this.db.saveSubjectRecord("subjectQuizzes", {
        id: randomUUID(),
        subject_id: id,
        quiz_id: quizId,
        class_section_id: room.class_section_id,
        created_at: new Date().toISOString(),
      });
    });
  }
  async settings(id: string, user: UserProfile, enabled: boolean) {
    return this.db.withLock(`subject:${id}`, async () => {
      const room = await this.own(id, user.id);
      return this.db.saveSubjectRecord("subjects", {
        ...room,
        leaderboard_enabled: enabled,
      });
    });
  }
  private async quizInRoom(quizId: string, room: SubjectRoom) {
    const quiz = await this.db.getQuizById(quizId);
    if (!quiz || quiz.teacher_id !== room.teacher_id) return null;
    const section = (await this.db.listSections(quiz.id)).find(
      (s) => s.class_section_id === room.class_section_id,
    );
    return section ? { quiz, section } : null;
  }
  async detail(id: string, user: UserProfile) {
    const room = await this.access(id, user),
      links = await this.db.subjectRecords<SubjectQuiz>("subjectQuizzes", {
        subject_id: id,
      });
    const mine =
      user.role === "student"
        ? await this.attempts.listForStudent(user.id)
        : [];
    const quizzes = [];
    for (const link of links) {
      const context = await this.quizInRoom(link.quiz_id, room);
      if (
        !context ||
        (user.role === "student" && context.quiz.status !== "published")
      )
        continue;
      const { quiz: q, section } = context;
      const ownAttempts = mine.filter(
        (a) => a.quiz_id === q.id && a.section_id === section.id,
      );
      const allQuizAttempts = mine.filter((a) => a.quiz_id === q.id);
      const available =
        (!q.available_from || Date.parse(q.available_from) <= Date.now()) &&
        (!q.available_until || Date.parse(q.available_until) > Date.now());
      quizzes.push({
        id: q.id,
        title: q.title,
        exam_format: q.exam_format || "online",
        status: q.status,
        require_access_code: !!q.require_access_code,
        ...(!q.require_access_code ||
        user.role === "teacher" ||
        ownAttempts.some((a) => a.status === "in_progress")
          ? { access_code: section.access_code }
          : {}),
        available_from: q.available_from,
        available_until: q.available_until,
        time_limit_minutes: q.time_limit_minutes,
        can_start:
          available &&
          (allQuizAttempts.some((a) => a.status === "in_progress") ||
            allQuizAttempts.length < q.max_attempts),
        attempts: ownAttempts,
      });
    }
    return {
      ...room,
      section_name: (await this.db.getClass(room.class_section_id))?.name,
      quizzes,
    };
  }
  async enterQuiz(id: string, quizId: string, code: string, user: UserProfile) {
    if (user.role !== "student")
      throw new ForbiddenException("Student account required");
    const room = await this.access(id, user);
    const linked = await this.db.subjectRecords<SubjectQuiz>("subjectQuizzes", {
      subject_id: id,
      quiz_id: quizId,
    });
    if (!linked.length)
      throw new NotFoundException("Quiz is not available in this subject");
    const context = await this.quizInRoom(quizId, room);
    if (!context || context.quiz.status !== "published")
      throw new NotFoundException("Quiz is not available in this subject");
    if (context.quiz.exam_format === "paper")
      throw new BadRequestException("This exam is taken on paper.");
    if (code.trim().toUpperCase() !== context.section.access_code)
      throw new ForbiddenException(
        "That code does not match this quiz and section. Check the code from your teacher.",
      );
    // This only checks entry. Starting an attempt still enforces deadlines and attempt limits.
    return { access_code: context.section.access_code };
  }
  async leaderboard(id: string, user: UserProfile) {
    const room = await this.access(id, user);
    if (!room.leaderboard_enabled && user.role === "student")
      throw new ForbiddenException(
        "Your teacher has not opened the leaderboard",
      );
    const members = await this.db.subjectRecords<SubjectMember>(
      "subjectMembers",
      { subject_id: id },
    );
    const allowed = new Set(members.map((m) => m.student_id));
    const totals = new Map<
      string,
      { student_id: string; name: string; score: number; max_score: number }
    >();
    for (const link of await this.db.subjectRecords<SubjectQuiz>(
      "subjectQuizzes",
      { subject_id: id },
    )) {
      const context = await this.quizInRoom(link.quiz_id, room);
      if (
        !context ||
        context.quiz.status !== "published" ||
        !context.quiz.release_scores_immediately
      )
        continue;
      const { quiz, section } = context;
      const best = new Map<string, QuizAttempt>();
      for (const a of await this.db.listAttemptsByQuiz(quiz.id)) {
        if (
          !allowed.has(a.student_id) ||
          a.section_id !== section.id ||
          a.status === "in_progress" ||
          !a.is_graded ||
          !a.score_confirmed_at ||
          a.score == null
        )
          continue;
        if (!best.has(a.student_id) || a.score > best.get(a.student_id).score)
          best.set(a.student_id, a);
      }
      for (const a of best.values()) {
        let row = totals.get(a.student_id);
        if (!row) {
          const p = await this.db.getProfile(a.student_id);
          if (!p) continue;
          row = {
            student_id: a.student_id,
            name: p.full_name,
            score: 0,
            max_score: 0,
          };
          totals.set(a.student_id, row);
        }
        row.score += a.score;
        row.max_score += a.max_score;
      }
    }
    const rows = [...totals.values()].sort(
      (a, b) =>
        b.score - a.score ||
        studentLastName(a.name).localeCompare(studentLastName(b.name)) ||
        a.name.localeCompare(b.name),
    );
    let rank = 0,
      last: number | undefined;
    return rows.map((row, i) => {
      if (row.score !== last) rank = i + 1;
      last = row.score;
      return { rank, ...row };
    });
  }
}
