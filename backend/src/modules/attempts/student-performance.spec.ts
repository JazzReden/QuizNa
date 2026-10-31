import { buildStudentPerformance } from "./student-performance";
import { AttemptsService } from "./attempts.service";
import { AttemptsController } from "./attempts.controller";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Reflector } from "@nestjs/core";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateQuizDto } from "../quizzes/quizzes.dto";
const attempt = (override: any = {}): any => ({
  id: "a",
  quiz_id: "q",
  student_id: "student",
  is_graded: true,
  score: 8,
  max_score: 10,
  status: "submitted",
  started_at: "2026-10-01",
  submitted_at: "2026-10-02",
  quiz: { title: "Quiz", subject: " Science ", exam_format: "online" },
  ...override,
});
describe("student subject performance", () => {
  it("groups multiple subjects and weights their independent totals", () => {
    const report = buildStudentPerformance([
      attempt({ quiz_id: "science-one", score: 8 }),
      attempt({
        quiz_id: "math",
        score: 5,
        quiz: { title: "Algebra", subject: "Mathematics" },
      }),
      attempt({ quiz_id: "science-two", score: 1, max_score: 2 }),
    ]);
    expect(report.subjects.map((s) => [s.subject, s.percentage])).toEqual([
      ["Mathematics", 50],
      ["Science", 75],
    ]);
    expect(report.percentage).toBe(63.64);
    expect(report.gradedCount).toBe(3);
  });

  it("counts each quiz once and selects its best percentage, including zero scores", () => {
    const result = buildStudentPerformance([
      attempt(),
      attempt({ id: "b", score: 9 }),
      attempt({ id: "c", score: 7 }),
      attempt({ id: "z", quiz_id: "z", score: 0 }),
    ]);
    expect(result.gradedCount).toBe(2);
    expect(result.percentage).toBe(45);
    expect(result.subjects[0].quizzes.find((q) => q.id === "q").attemptId).toBe(
      "b",
    );
  });
  it("weights by points rather than averaging quiz percentages and normalizes subject names", () => {
    const result = buildStudentPerformance([
      attempt({ score: 10 }),
      attempt({
        quiz_id: "second",
        score: 10,
        max_score: 20,
        quiz: { title: "Second", subject: "science" },
      }),
    ]);
    expect(result.subjects).toHaveLength(1);
    expect(result.percentage).toBe(66.67);
  });
  it("never counts hidden scores, unfinished attempts or provisional essay grades", () => {
    const result = buildStudentPerformance([
      attempt({ id: "hidden", quiz_id: "hidden", score: undefined }),
      attempt({ id: "essay", quiz_id: "essay", is_graded: false, score: 6 }),
      attempt({
        id: "active",
        quiz_id: "active",
        status: "in_progress",
        score: 10,
      }),
    ]);
    expect(result.percentage).toBeNull();
    expect(result.gradedCount).toBe(0);
    expect(
      result.subjects[0].quizzes.every(
        (q) => q.score === null && q.maxScore === null && q.percentage === null,
      ),
    ).toBe(true);
    expect(result.subjects[0].quizzes.map((q) => q.state).sort()).toEqual([
      "awaiting_grading",
      "awaiting_release",
      "in_progress",
    ]);
  });
  it("keeps legacy quizzes unassigned without guessing subjects or changing source attempts", () => {
    const source = [attempt({ quiz: { title: "Personal Development" } })];
    const before = JSON.stringify(source);
    expect(buildStudentPerformance(source).subjects[0].subject).toBeNull();
    expect(JSON.stringify(source)).toBe(before);
  });
  it("handles different published maxima and breaks ties by most recent submission", () => {
    const result = buildStudentPerformance([
      attempt({ id: "large", score: 15, max_score: 20 }),
      attempt({ id: "small", score: 9, max_score: 10 }),
      attempt({ id: "latest", score: 9, submitted_at: "2026-10-03" }),
    ]);
    expect(result.subjects[0].quizzes[0].attemptId).toBe("latest");
    expect(result.percentage).toBe(90);
  });
  it("handles an empty record", () =>
    expect(buildStudentPerformance([])).toEqual({
      subjects: [],
      gradedCount: 0,
      quizCount: 0,
      percentage: null,
    }));
  it("queries the authenticated student only and applies current teacher release settings", async () => {
    const db: any = {
      listAttemptsByStudent: jest.fn().mockResolvedValue([attempt()]),
      getQuizById: jest.fn().mockResolvedValue({
        id: "q",
        title: "Quiz",
        subject: "Science",
        release_scores_immediately: false,
      }),
    };
    const service = new AttemptsService(db, {} as any);
    const report = await service.getStudentPerformance("student");
    expect(db.listAttemptsByStudent).toHaveBeenCalledWith("student");
    expect(report.percentage).toBeNull();
    expect(report.subjects[0].quizzes[0].score).toBeNull();
  });
  it("restricts the endpoint to students", () => {
    const reflector = new Reflector(),
      guard = new RolesGuard(reflector);
    const context = (role: string): any => ({
      getHandler: () => AttemptsController.prototype.performance,
      getClass: () => AttemptsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: "user", role } }),
      }),
    });
    expect(guard.canActivate(context("student"))).toBe(true);
    expect(() => guard.canActivate(context("teacher"))).toThrow();
  });
  it("validates subject type, length and normalized whitespace", async () => {
    const valid = plainToInstance(CreateQuizDto, {
      title: "Quiz",
      subject: "  Personal   Development ",
    });
    expect(valid.subject).toBe("Personal Development");
    expect(await validate(valid)).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(CreateQuizDto, {
            title: "Quiz",
            subject: "x".repeat(121),
          }),
        )
      ).some((e) => e.property === "subject"),
    ).toBe(true);
    expect(
      (
        await validate(
          plainToInstance(CreateQuizDto, { title: "Quiz", subject: {} }),
        )
      ).some((e) => e.property === "subject"),
    ).toBe(true);
  });
});
