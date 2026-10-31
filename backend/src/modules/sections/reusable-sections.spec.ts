import { ConfigService } from "@nestjs/config";
import { DatabaseService } from "../../database/database.service";
import { SectionsService } from "./sections.service";
import { QuizzesService } from "../quizzes/quizzes.service";
import { AttemptsService } from "../attempts/attempts.service";
import { GradingService } from "../grading/grading.service";
import { ReportsService } from "../reports/reports.service";
import { BoundedWorkerPoolService } from "../workers/bounded-worker-pool.service";

const teacher = "a0000000-0000-0000-0000-000000000001",
  student = "b0000000-0000-0000-0000-000000000002",
  other = "b0000000-0000-0000-0000-000000000003",
  quizId = "c0000000-0000-0000-0000-000000000001";
describe("Reusable sections and expected students", () => {
  let db: DatabaseService,
    sections: SectionsService,
    reports: ReportsService,
    attempts: AttemptsService,
    pool: BoundedWorkerPoolService;
  beforeEach(() => {
    db = new DatabaseService(new ConfigService({ NODE_ENV: "test" }));
    sections = new SectionsService(db);
    pool = new BoundedWorkerPoolService();
    reports = new ReportsService(db, pool);
    attempts = new AttemptsService(db, new GradingService(db));
  });
  afterEach(() => pool.onModuleDestroy());
  it("creates a section before any quiz, reuses it with distinct stable quiz codes, and checks both owners", async () => {
    const section = await sections.createClass(teacher, " STEM A ");
    await expect(sections.createClass(teacher, "stem a")).rejects.toThrow(
      "already exists",
    );
    const quiz = await new QuizzesService(db).create(
      (await db.getProfile(teacher))!,
      { title: "Next quiz" },
    );
    const first = await sections.attach(quizId, teacher, section.id),
      second = await sections.attach(quiz.id, teacher, section.id);
    expect(first.class_section_id).toBe(second.class_section_id);
    expect(first.access_code).not.toBe(second.access_code);
    const repeats = await Promise.all([
      sections.attach(quizId, teacher, section.id),
      sections.attach(quizId, teacher, section.id),
    ]);
    expect(repeats.map((s) => s.id)).toEqual([first.id, first.id]);
    await expect(
      sections.attach(quizId, "other-teacher", section.id),
    ).rejects.toThrow("own this quiz");
    const foreign = await sections.createClass("other-teacher", "Foreign");
    await expect(sections.attach(quizId, teacher, foreign.id)).rejects.toThrow(
      "own this section",
    );
  });
  it("sorts owned sections naturally and keeps foreign rosters private", async () => {
    await sections.createClass(teacher, "Grade 12 B");
    const a = await sections.createClass(teacher, "Grade 12 A");
    await sections.createClass("other-teacher", "Hidden section");
    expect((await sections.listClasses(teacher)).map(s=>s.name)).toEqual(["Grade 12 A", "Grade 12 B"]);
    await expect(sections.roster(a.id,"other-teacher")).rejects.toThrow("own this section");
  });
  it("validates a whole roster batch, normalizes emails, and safely repeats an import", async () => {
    const section = await sections.createClass(teacher, "A");
    await expect(
      sections.addStudents(section.id, teacher, [
        { full_name: "Good", email: "good@example.test" },
        { full_name: "", email: "bad@example.test" },
      ]),
    ).rejects.toThrow("valid email");
    expect(await sections.roster(section.id, teacher)).toHaveLength(0);
    const roster = [
      { full_name: "Zoe Adams", email: " ZOE@example.test " },
      { full_name: "Alice Zulu", email: "alice@example.test" },
    ];
    await Promise.all([
      sections.addStudents(section.id, teacher, roster),
      sections.addStudents(section.id, teacher, roster),
    ]);
    expect(
      (await sections.roster(section.id, teacher)).map((s) => s.email),
    ).toEqual(["zoe@example.test", "alice@example.test"]);
    await expect(sections.roster(section.id, "other")).rejects.toThrow(
      "own this section",
    );
    await expect(
      sections.addStudents(section.id, "other", roster),
    ).rejects.toThrow("own this section");
    await expect(
      sections.removeStudent(section.id, "other", "fake"),
    ).rejects.toThrow("own this section");
  });
  it("automatically enrolls new starters and distinguishes participation states", async () => {
    const section = await sections.createClass(teacher, "A"),
      link = await sections.attach(quizId, teacher, section.id);
    const alex = (await db.getProfile(student))!,
      emma = (await db.getProfile(other))!;
    await sections.addStudents(section.id, teacher, [
      { full_name: alex.full_name, email: alex.email },
      { full_name: "Zoe Missing", email: "missing@example.test" },
    ]);
    let list = await reports.getClassList(quizId, teacher);
    expect(list.summary).toEqual({
      submitted: 0,
      in_progress: 0,
      not_started: 2,
    });
    const active = await attempts.startOrResumeAttempt(alex, link.access_code);
    const submitted = await attempts.startOrResumeAttempt(
      emma,
      link.access_code,
    );
    await attempts.submitAttempt(submitted.attempt.id, other);
    list = await reports.getClassList(quizId, teacher);
    expect(list.summary).toEqual({
      submitted: 1,
      in_progress: 1,
      not_started: 1,
    });
    expect(list.rows.find((s) => s.studentId === other)?.rosterMember).toBe(
      true,
    );
    expect(list.rows.find((s) => s.studentId === student)?.attemptId).toBe(
      active.attempt.id,
    );
    expect((await reports.getLeaderboard(quizId, teacher)).rows).toHaveLength(
      1,
    );
    const csv = await reports.exportScorebookCsv(quizId, teacher);
    expect(csv).toContain("Zoe Missing");
    expect(csv).toContain("Not started");
    expect(csv).toContain("In progress");
    await sections.addStudents(section.id, teacher, [
      { full_name: emma.full_name, email: emma.email.toUpperCase() },
    ]);
    expect(
      (await reports.getClassList(quizId, teacher)).rows.find(
        (s) => s.studentId === other,
      )?.rosterMember,
    ).toBe(true);
    const member = (await sections.roster(section.id, teacher)).find(
      (s) => s.email === emma.email,
    )!;
    await sections.removeStudent(section.id, teacher, member.id);
    list = await reports.getClassList(quizId, teacher);
    expect(list.rows.find((s) => s.studentId === other)?.participation).toBe(
      "submitted",
    );
    expect((await db.getAttemptById(submitted.attempt.id))?.status).toBe(
      "submitted",
    );
    await expect(reports.getClassList(quizId, "other")).rejects.toThrow(
      "own this quiz",
    );
  });
  it("reuses the roster without carrying participation across quizzes or sections", async () => {
    const section = await sections.createClass(teacher, "A"),
      otherSection = await sections.createClass(teacher, "B");
    await sections.addStudents(section.id, teacher, [
      { full_name: "Expected Student", email: "expected@example.test" },
    ]);
    await sections.attach(quizId, teacher, section.id);
    const quiz = await new QuizzesService(db).create(
      (await db.getProfile(teacher))!,
      { title: "Next quiz" },
    );
    const link = await sections.attach(quiz.id, teacher, section.id),
      otherLink = await sections.attach(quiz.id, teacher, otherSection.id);
    expect(
      (await reports.getClassList(quiz.id, teacher, link.id)).summary
        .not_started,
    ).toBe(1);
    expect(
      (await reports.getClassList(quiz.id, teacher, otherLink.id)).rows,
    ).toHaveLength(0);
    expect(
      (await reports.getClassList(quiz.id, teacher, "unassigned")).rows,
    ).toHaveLength(0);
  });
  it("enrolls concurrent starts once across quizzes and preserves an existing roster name", async () => {
    const section = await sections.createClass(teacher, "Automatic"),
      first = await sections.attach(quizId, teacher, section.id);
    const profile = (await db.getProfile(student))!;
    const quizService = new QuizzesService(db);
    const next = await quizService.create((await db.getProfile(teacher))!, {
      title: "Automatic next",
    });
    const { QuestionsService } = await import("../questions/questions.service");
    await new QuestionsService(db).create(teacher, {
      quiz_id: next.id,
      type: "true_false",
      prompt: "Automatic test",
      points: 1,
      correct_answer: "opt_true",
    });
    await quizService.publish(next.id, teacher);
    const second = await sections.attach(next.id, teacher, section.id);
    await Promise.all([
      attempts.startOrResumeAttempt(profile, first.access_code),
      attempts.startOrResumeAttempt(profile, first.access_code),
      attempts.startOrResumeAttempt(profile, second.access_code),
    ]);
    const roster = await sections.roster(section.id, teacher);
    expect(roster).toHaveLength(1);
    expect(roster[0].email).toBe(profile.email.trim().toLowerCase());
    await sections.addStudents(section.id, teacher, [
      {
        email: profile.email.toUpperCase(),
        full_name: "Teacher preferred name",
      },
    ]);
    await db.enrollStartedStudent(first, {
      ...profile,
      email: profile.email.toUpperCase(),
    });
    expect(await sections.roster(section.id, teacher)).toEqual([
      expect.objectContaining({
        id: roster[0].id,
        full_name: "Teacher preferred name",
      }),
    ]);
  });

  it("does not enroll invalid codes, teacher accounts or unassigned starts", async () => {
    const section = await sections.createClass(
      teacher,
      "No accidental enrollments",
    );
    const profile = (await db.getProfile(student))!;
    await expect(
      attempts.startOrResumeAttempt(profile, "INVALID"),
    ).rejects.toThrow();
    const link = await sections.attach(quizId, teacher, section.id);
    await expect(
      attempts.startOrResumeAttempt(
        (await db.getProfile(teacher))!,
        link.access_code,
      ),
    ).rejects.toThrow("Student account required");
    const quiz = (await db.getQuizById(quizId))!;
    await attempts.startOrResumeAttempt(profile, quiz.access_code);
    expect(await sections.roster(section.id, teacher)).toHaveLength(0);
  });
});
