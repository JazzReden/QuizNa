import { ConfigService } from "@nestjs/config";
import { DatabaseService } from "../../database/database.service";
import { SubjectsService } from "./subjects.service";
const teacher: any = { id: "teacher-1", role: "teacher" },
  other: any = { id: "other", role: "teacher" },
  student: any = {
    id: "student-1",
    role: "student",
    full_name: "Ben Cruz",
    email: "ben@example.test",
  };
describe("Subject workspaces", () => {
  let db: DatabaseService;
  let service: SubjectsService;
  let room: any;
  beforeEach(async () => {
    db = new DatabaseService(
      new ConfigService({ DEMO_MODE: "true", NODE_ENV: "test" }),
    );
    await db.createClass({
      id: "class-1",
      teacher_id: teacher.id,
      name: "Vincent",
      created_at: new Date().toISOString(),
    });
    service = new SubjectsService(db, {
      listForStudent: jest.fn().mockResolvedValue([]),
    } as any);
    room = await service.create(teacher, "Practical Research", "class-1");
  });
  it("isolates subjects by teacher and requires enrollment to read details", async () => {
    await expect(service.detail(room.id, other)).rejects.toThrow();
    await expect(service.detail(room.id, student)).rejects.toThrow("Join");
    await expect(service.create(other, "Research", "class-1")).rejects.toThrow(
      "own section",
    );
    expect(await service.list(student)).toEqual([]);
  });
  it("joins idempotently under concurrent requests and creates one reusable roster entry", async () => {
    await Promise.all(
      Array.from({ length: 6 }, () =>
        service.join(student, room.access_code.toLowerCase()),
      ),
    );
    expect(
      await db.subjectRecords("subjectMembers", { subject_id: room.id }),
    ).toHaveLength(1);
    expect(await db.listRoster("class-1")).toHaveLength(1);
    expect(await service.detail(room.id, student)).toMatchObject({
      name: "Practical Research",
      quizzes: [],
    });
    await expect(service.join(student, "SUB-000000000000")).rejects.toThrow(
      "not found",
    );
  });
  it("does not expose drafts, question keys, or teacher settings to unenrolled students", async () => {
    const quiz = await db.createQuiz({
      teacher_id: teacher.id,
      title: "Draft",
      subject: "Research",
      access_code: "NEW123",
    } as any);
    await db.createSection({
      id: "link-1",
      quiz_id: quiz.id,
      class_section_id: "class-1",
      name: "Vincent",
      access_code: "S-11111111",
      created_at: new Date().toISOString(),
    });
    await service.attach(room.id, quiz.id, teacher);
    await service.join(student, room.access_code);
    expect((await service.detail(room.id, teacher)).quizzes).toHaveLength(1);
    expect((await service.detail(room.id, student)).quizzes).toHaveLength(0);
    await db.updateQuiz(quiz.id, { status: "published" });
    const result = (await service.detail(room.id, student)).quizzes[0];
    expect(result.title).toBe("Draft");
    expect(result).not.toHaveProperty("questions");
    await expect(service.settings(room.id, other, true)).rejects.toThrow();
  });
  it("does not attach foreign quizzes or quizzes from another section", async () => {
    const quiz = await db.createQuiz({
      teacher_id: other.id,
      title: "Foreign",
      access_code: "OTHER1",
    } as any);
    await expect(service.attach(room.id, quiz.id, teacher)).rejects.toThrow(
      "own quiz",
    );
    const own = await db.createQuiz({
      teacher_id: teacher.id,
      title: "Own",
      access_code: "OWN123",
    } as any);
    await expect(service.attach(room.id, own.id, teacher)).rejects.toThrow(
      "section first",
    );
  });
  it("hides start actions after attempt limits or closing dates without changing results", async () => {
    const quiz = await db.createQuiz({
      teacher_id: teacher.id,
      title: "Limited",
      access_code: "LIMIT1",
      status: "published",
      max_attempts: 1,
    } as any);
    await db.createSection({
      id: "limited-link",
      quiz_id: quiz.id,
      class_section_id: "class-1",
      name: "Vincent",
      access_code: "S-33333333",
      created_at: new Date().toISOString(),
    });
    await service.attach(room.id, quiz.id, teacher);
    await service.join(student, room.access_code);
    expect((await service.detail(room.id, student)).quizzes[0].can_start).toBe(
      true,
    );
    (service as any).attempts.listForStudent.mockResolvedValue([
      {
        quiz_id: quiz.id,
        section_id: "limited-link",
        status: "submitted",
        score: 8,
      },
    ]);
    expect((await service.detail(room.id, student)).quizzes[0].can_start).toBe(
      false,
    );
    (service as any).attempts.listForStudent.mockResolvedValue([]);
    await db.updateQuiz(quiz.id, {
      available_until: "2020-01-01T00:00:00.000Z",
    });
    expect((await service.detail(room.id, student)).quizzes[0].can_start).toBe(
      false,
    );
  });
  it("keeps rankings closed by default and excludes unreleased, unconfirmed and foreign-section scores", async () => {
    await service.join(student, room.access_code);
    await expect(service.leaderboard(room.id, student)).rejects.toThrow(
      "not opened",
    );
    await service.settings(room.id, teacher, true);
    const quiz = await db.createQuiz({
      teacher_id: teacher.id,
      title: "Research",
      access_code: "RANK12",
      status: "published",
      release_scores_immediately: true,
    } as any);
    await db.createSection({
      id: "rank-link",
      quiz_id: quiz.id,
      class_section_id: "class-1",
      name: "Vincent",
      access_code: "S-22222222",
      created_at: new Date().toISOString(),
    });
    await service.attach(room.id, quiz.id, teacher);
    jest.spyOn(db, "getProfile").mockResolvedValue(student);
    const spy = jest.spyOn(db, "listAttemptsByQuiz").mockResolvedValue([
      {
        student_id: student.id,
        section_id: "rank-link",
        status: "submitted",
        is_graded: true,
        score: 8,
        max_score: 10,
        score_confirmed_at: "now",
      },
      {
        student_id: student.id,
        section_id: "rank-link",
        status: "submitted",
        is_graded: true,
        score: 10,
        max_score: 10,
      },
      {
        student_id: student.id,
        section_id: "other-section",
        status: "submitted",
        is_graded: true,
        score: 100,
        max_score: 100,
        score_confirmed_at: "now",
      },
    ] as any);
    expect(await service.leaderboard(room.id, student)).toEqual([
      {
        rank: 1,
        student_id: student.id,
        name: "Ben Cruz",
        score: 8,
        max_score: 10,
      },
    ]);
    await db.updateQuiz(quiz.id, { release_scores_immediately: false });
    expect(await service.leaderboard(room.id, student)).toEqual([]);
    expect(spy).toHaveBeenCalled();
  });
});

describe("Server-checked subject quiz entry", () => {
  let db: DatabaseService, service: SubjectsService, room: any, quiz: any;
  const attemptViews = { listForStudent: jest.fn() };
  beforeEach(async () => {
    db = new DatabaseService(
      new ConfigService({ DEMO_MODE: "true", NODE_ENV: "test" }),
    );
    await db.createClass({
      id: "class-1",
      teacher_id: teacher.id,
      name: "Vincent",
      created_at: new Date().toISOString(),
    });
    attemptViews.listForStudent.mockResolvedValue([]);
    service = new SubjectsService(db, attemptViews as any);
    room = await service.create(teacher, "Protected subject", "class-1");
    quiz = await db.createQuiz({
      teacher_id: teacher.id,
      title: "Protected",
      access_code: "GLOBAL",
      status: "published",
      require_access_code: true,
    });
    await db.createSection({
      id: "code-link",
      quiz_id: quiz.id,
      class_section_id: "class-1",
      name: "Vincent",
      access_code: "S-12345678",
      created_at: new Date().toISOString(),
    });
    await service.attach(room.id, quiz.id, teacher);
    await service.join(student, room.access_code);
  });
  it("hides the protected code from students but preserves teacher visibility", async () => {
    const view = (await service.detail(room.id, student)).quizzes[0];
    expect(view.require_access_code).toBe(true);
    expect(view).not.toHaveProperty("access_code");
    expect(JSON.stringify(view)).not.toContain("S-12345678");
    expect(
      (await service.detail(room.id, teacher)).quizzes[0].access_code,
    ).toBe("S-12345678");
  });
  it("rejects wrong codes without making attempts and accepts the exact section code", async () => {
    await expect(
      service.enterQuiz(room.id, quiz.id, "WRONG", student),
    ).rejects.toThrow("does not match");
    await expect(
      service.enterQuiz(room.id, quiz.id, "GLOBAL", student),
    ).rejects.toThrow("does not match");
    await expect(
      service.enterQuiz(room.id, quiz.id, "s-12345678", student),
    ).resolves.toEqual({ access_code: "S-12345678" });
    expect(await db.listAttemptsByStudent(student.id)).toEqual([]);
  });
  it("requires subject membership, student role, publication and the actual subject link", async () => {
    await expect(
      service.enterQuiz(room.id, quiz.id, "S-12345678", {
        ...student,
        id: "outsider",
      }),
    ).rejects.toThrow("Join");
    await expect(
      service.enterQuiz(room.id, quiz.id, "S-12345678", teacher),
    ).rejects.toThrow("Student");
    const otherRoom = await service.create(teacher, "Other subject", "class-1");
    await service.join(student, otherRoom.access_code);
    await expect(
      service.enterQuiz(otherRoom.id, quiz.id, "S-12345678", student),
    ).rejects.toThrow("not available");
    await db.updateQuiz(quiz.id, { status: "draft" });
    await expect(
      service.enterQuiz(room.id, quiz.id, "S-12345678", student),
    ).rejects.toThrow("not available");
  });
  it("supports direct entry when disabled and lets an already-authorized active attempt resume", async () => {
    await db.updateQuiz(quiz.id, { require_access_code: false });
    expect(
      (await service.detail(room.id, student)).quizzes[0].access_code,
    ).toBe("S-12345678");
    await db.updateQuiz(quiz.id, { require_access_code: true });
    attemptViews.listForStudent.mockResolvedValue([
      {
        id: "a",
        quiz_id: quiz.id,
        section_id: "code-link",
        status: "in_progress",
        warning_count: 2,
        deadline_at: "2026-12-01T00:00:00Z",
      },
    ]);
    const view = (await service.detail(room.id, student)).quizzes[0];
    expect(view.access_code).toBe("S-12345678");
    expect(view.attempts[0].warning_count).toBe(2);
    expect(view.attempts[0].deadline_at).toBe("2026-12-01T00:00:00Z");
  });
});
