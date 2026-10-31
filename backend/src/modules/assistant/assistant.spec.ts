import { ConfigService } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DatabaseService } from "../../database/database.service";
import { ReportsService } from "../reports/reports.service";
import { TeacherInsightsService } from "../reports/teacher-insights.service";
import { BoundedWorkerPoolService } from "../workers/bounded-worker-pool.service";
import { AttemptsService } from "../attempts/attempts.service";
import { GradingService } from "../grading/grading.service";
import { AssistantService } from "./assistant.service";
import { AssistantController } from "./assistant.controller";
import { AssistantReportDto } from "./assistant.dto";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AuthGuard } from "../../common/guards/auth.guard";
const quiz = "c0000000-0000-0000-0000-000000000001",
  classId = "10000000-0000-4000-8000-000000000001",
  sectionId = "20000000-0000-4000-8000-000000000001";
describe("Ishi authorized live reports (isolated memory database)", () => {
  let db: DatabaseService,
    service: AssistantService,
    pool: BoundedWorkerPoolService,
    teacher: any,
    student: any;
  beforeEach(async () => {
    db = new DatabaseService(new ConfigService({ NODE_ENV: "test" }));
    pool = new BoundedWorkerPoolService();
    const reports = new ReportsService(db, pool),
      attempts = new AttemptsService(db, new GradingService(db));
    service = new AssistantService(
      db,
      reports,
      new TeacherInsightsService(db, reports, pool),
      attempts,
    );
    teacher = await db.getProfile("a0000000-0000-0000-0000-000000000001");
    student = await db.getProfile("b0000000-0000-0000-0000-000000000002");
    await db.createClass({
      id: classId,
      teacher_id: teacher.id,
      name: "STEM A",
      created_at: new Date().toISOString(),
    } as any);
    await db.createSection({
      id: sectionId,
      quiz_id: quiz,
      class_section_id: classId,
      name: "STEM A",
      access_code: "STEMCODE",
      created_at: new Date().toISOString(),
    } as any);
    await db.saveRosterStudent({
      id: "r1",
      class_section_id: classId,
      full_name: student.full_name,
      email: student.email,
      created_at: new Date().toISOString(),
    });
  });
  afterEach(() => pool.onModuleDestroy());
  const add = async (score = 8, graded = true) =>
    db.createAttempt({
      quiz_id: quiz,
      student_id: student.id,
      deadline_at: new Date(Date.now() + 60000).toISOString(),
      max_score: 10,
      question_order: [],
      section_id: sectionId,
      status: "submitted",
      score,
      is_graded: graded,
      submitted_at: new Date().toISOString(),
    });
  it("requires authentication and restricts options to teachers", async () => {
    await expect(
      new AuthGuard(db).canActivate({
        switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      } as any),
    ).rejects.toThrow("Please sign in");
    const guard = new RolesGuard(new Reflector());
    const context = (role: string): any => ({
      getHandler: () => AssistantController.prototype.options,
      getClass: () => AssistantController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    });
    expect(guard.canActivate(context("teacher"))).toBe(true);
    expect(() => guard.canActivate(context("student"))).toThrow();
    await expect(service.options(student)).rejects.toThrow("Teacher access");
  });
  it("validates topic, UUIDs, and rejects injected identity or extra properties", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    for (const payload of [
      { topic: "delete" },
      { topic: "submissions", quizId: "invalid" },
      { topic: "results", studentId: student.id },
    ])
      await expect(
        pipe.transform(payload, {
          type: "query",
          metatype: AssistantReportDto,
        }),
      ).rejects.toThrow();
  });
  it("lists only owned quizzes and safe scope fields", async () => {
    const result = await service.options(teacher);
    expect(result.quizzes.some((q) => q.id === quiz)).toBe(true);
    expect(
      await service.options({ ...teacher, id: "different-owner" }),
    ).toEqual({ quizzes: [] });
    expect(JSON.stringify(result)).not.toMatch(
      /correct_answer|instructions|access_code/,
    );
  });
  it("rejects foreign quizzes, foreign sections, and foreign class totals", async () => {
    await expect(
      service.report(
        { ...teacher, id: "other" },
        { topic: "submissions", quizId: quiz },
      ),
    ).rejects.toThrow("own");
    await expect(
      service.report(teacher, {
        topic: "submissions",
        quizId: quiz,
        sectionId: "foreign",
      }),
    ).rejects.toThrow("section");
    await expect(
      service.report(
        { ...teacher, id: "other" },
        { topic: "gradebook", classId },
      ),
    ).rejects.toThrow("own");
  });
  it("reports not-started, in-progress and submitted changes on the next read", async () => {
    expect(
      (
        await service.report(teacher, {
          topic: "not_started",
          quizId: quiz,
          sectionId,
        })
      ).total,
    ).toBe(1);
    const attempt = await add();
    await db.updateAttempt(attempt.id, { status: "in_progress" });
    expect(
      (
        await service.report(teacher, {
          topic: "in_progress",
          quizId: quiz,
          sectionId,
        })
      ).total,
    ).toBe(1);
    expect(
      (
        await service.report(teacher, {
          topic: "not_submitted",
          quizId: quiz,
          sectionId,
        })
      ).total,
    ).toBe(1);
    await db.updateAttempt(attempt.id, { status: "submitted" });
    expect(
      (
        await service.report(teacher, {
          topic: "submissions",
          quizId: quiz,
          sectionId,
        })
      ).total,
    ).toBe(1);
    expect(
      (
        await service.report(teacher, {
          topic: "not_started",
          quizId: quiz,
          sectionId,
        })
      ).total,
    ).toBe(0);
  });
  it("updates pending grading, rankings and section totals without writing records", async () => {
    const attempt = await add(0, false);
    expect(
      (
        await service.report(teacher, {
          topic: "grading",
          quizId: quiz,
          sectionId,
        })
      ).total,
    ).toBe(1);
    await db.updateAttempt(attempt.id, { score: 8, is_graded: true });
    expect(
      (
        await service.report(teacher, {
          topic: "grading",
          quizId: quiz,
          sectionId,
        })
      ).total,
    ).toBe(0);
    expect(
      (
        await service.report(teacher, {
          topic: "leaderboard",
          quizId: quiz,
          sectionId,
        })
      ).rows[0].detail,
    ).toContain("8/10");
    expect(
      (await service.report(teacher, { topic: "gradebook", classId })).rows[0]
        .detail,
    ).toBe("No confirmed scores");
    const current = (await db.getAttemptById(attempt.id))!;
    await new GradingService(db).confirmScore(
      current.id,
      teacher.id,
      current.updated_at,
      current.score_revision || 0,
    );
    const before = await db.getAttemptById(attempt.id);
    expect(
      (await service.report(teacher, { topic: "gradebook", classId })).rows[0]
        .detail,
    ).toContain("8/10");
    expect(await db.getAttemptById(attempt.id)).toEqual(before);
  });
  it("never reads another student or honors client identity/scope overrides", async () => {
    await add(8, true);
    expect(
      (
        await service.report(
          { ...student, id: "b0000000-0000-0000-0000-000000000003" },
          { topic: "results" },
        )
      ).total,
    ).toBe(0);
    for (const query of [
      { topic: "submissions", quizId: quiz },
      { topic: "results", quizId: quiz },
      { topic: "performance", classId },
    ])
      await expect(service.report(student, query as any)).rejects.toThrow(
        "own released",
      );
    await expect(service.report(teacher, { topic: "results" })).rejects.toThrow(
      "role",
    );
  });
  it("applies release revocation and grading transitions to every student refresh", async () => {
    const attempt = await add(8, true);
    await db.updateQuiz(quiz, { release_scores_immediately: true });
    expect(
      (await service.report(student, { topic: "results" })).rows[0].detail,
    ).toContain("8/10");
    await db.updateQuiz(quiz, { release_scores_immediately: false });
    const hidden = await service.report(student, { topic: "results" });
    expect(hidden.rows[0].detail).toBe("Awaiting score release");
    expect(JSON.stringify(hidden)).not.toContain("8/10");
    expect(
      (await service.report(student, { topic: "performance" })).summary,
    ).toContain("No released");
    await db.updateQuiz(quiz, { release_scores_immediately: true });
    await db.updateAttempt(attempt.id, { is_graded: false });
    expect(
      (await service.report(student, { topic: "results" })).rows[0].detail,
    ).toBe("Awaiting grading");
    await db.updateAttempt(attempt.id, { is_graded: true, score: 9 });
    expect(
      (await service.report(student, { topic: "results" })).rows[0].detail,
    ).toContain("9/10");
    expect(
      JSON.stringify(await service.report(student, { topic: "results" })),
    ).not.toMatch(/correct_answer|studentEmail|@|answer_key/);
  });
  it("rejects malformed scope combinations", async () => {
    await expect(
      service.report(teacher, { topic: "gradebook" }),
    ).rejects.toThrow("section");
    await expect(
      service.report(teacher, { topic: "submissions" }),
    ).rejects.toThrow("quiz");
  });
});
