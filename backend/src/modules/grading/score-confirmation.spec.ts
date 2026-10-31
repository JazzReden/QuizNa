import { ConfigService } from "@nestjs/config";
import { DatabaseService } from "../../database/database.service";
import { GradingService } from "./grading.service";
import { ReportsService } from "../reports/reports.service";
import { TeacherInsightsService } from "../reports/teacher-insights.service";
import { BoundedWorkerPoolService } from "../workers/bounded-worker-pool.service";
const teacher = "a0000000-0000-0000-0000-000000000001",
  student = "b0000000-0000-0000-0000-000000000002",
  quiz = "c0000000-0000-0000-0000-000000000001",
  question = "d0000000-0000-0000-0000-000000000001";
describe("Teacher score confirmation", () => {
  let db: DatabaseService,
    grading: GradingService,
    pool: BoundedWorkerPoolService,
    insights: TeacherInsightsService,
    attempt: any,
    answer: any;
  beforeEach(async () => {
    db = new DatabaseService(new ConfigService({ NODE_ENV: "test" }));
    grading = new GradingService(db);
    pool = new BoundedWorkerPoolService();
    insights = new TeacherInsightsService(
      db,
      new ReportsService(db, pool),
      pool,
    );
    jest.spyOn(db, "getAttemptQuestions").mockResolvedValue([
      {
        id: question,
        quiz_id: quiz,
        type: "mcq",
        points: 2,
        prompt: "Choose",
        options: [],
        correct_answer: "a",
      } as any,
    ]);
    await db.createClass({
      id: "class",
      name: "Test section",
      teacher_id: teacher,
      created_at: new Date().toISOString(),
    });
    await db.createSection({
      id: "section",
      quiz_id: quiz,
      name: "Test section",
      class_section_id: "class",
      access_code: "S-CONFIRM",
      created_at: new Date().toISOString(),
    });
    attempt = await db.createAttempt({
      quiz_id: quiz,
      student_id: student,
      section_id: "section",
      deadline_at: new Date().toISOString(),
      max_score: 2,
      question_order: [question],
      status: "submitted",
      score: 2,
      is_graded: true,
    });
    answer = await db.saveAnswer(attempt.id, question, "a");
    await db.updateAnswerGrade(answer.id, 2);
  });
  afterEach(() => pool.onModuleDestroy());
  const confirm = () =>
    grading.confirmScore(
      attempt.id,
      teacher,
      attempt.updated_at,
      attempt.score_revision || 0,
    );
  it("keeps unconfirmed scores out of gradebook totals and CSV, and includes explicitly confirmed scores", async () => {
    let book = await insights.gradebook("class", teacher);
    expect(book.rows[0].total).toBeNull();
    expect(book.rows[0].cells[0]).toMatchObject({
      score: null,
      awaitingConfirmation: true,
      gradingAttemptId: attempt.id,
    });
    expect(await insights.gradebookCsv("class", teacher)).toContain(
      "Awaiting confirmation",
    );
    const approved = await confirm();
    expect(approved.score_confirmed_by).toBe(teacher);
    book = await insights.gradebook("class", teacher);
    expect(book.rows[0]).toMatchObject({ total: 2, outOf: 2 });
    expect(await insights.gradebookCsv("class", teacher)).toContain("2/2");
  });
  it("rejects foreign ownership, active attempts, and unfinished grading", async () => {
    await expect(
      grading.confirmScore(attempt.id, "foreign", attempt.updated_at, 0),
    ).rejects.toMatchObject({ status: 403 });
    await db.updateAttempt(attempt.id, { is_graded: false });
    await expect(confirm()).rejects.toMatchObject({ status: 400 });
    await db.updateAttempt(attempt.id, {
      is_graded: true,
      status: "in_progress",
    });
    await expect(confirm()).rejects.toMatchObject({ status: 400 });
  });
  it("deduplicates simultaneous confirmations and rejects stale grades even within the same timestamp", async () => {
    const results = await Promise.all([confirm(), confirm(), confirm()]);
    expect(new Set(results.map((a) => a.score_confirmed_at)).size).toBe(1);
    await grading.manualGradeAnswer(answer.id, teacher, { score_awarded: 1 });
    const corrected = (await db.getAttemptById(attempt.id))!;
    expect(corrected.score_confirmed_at).toBeNull();
    expect(corrected.score).toBe(1);
    expect(corrected.score_revision).toBe(1);
    await expect(
      grading.confirmScore(attempt.id, teacher, corrected.updated_at, 0),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await insights.gradebook("class", teacher)).rows[0].total,
    ).toBeNull();
    await grading.confirmScore(
      attempt.id,
      teacher,
      corrected.updated_at,
      corrected.score_revision!,
    );
    expect((await insights.gradebook("class", teacher)).rows[0].total).toBe(1);
  });
  it("requires confirmation again when feedback is corrected without changing the numeric score", async () => {
    await confirm();
    await grading.manualGradeAnswer(answer.id, teacher, {
      score_awarded: 2,
      teacher_feedback: "Clarified feedback",
    });
    expect(
      (await db.getAttemptById(attempt.id))!.score_confirmed_at,
    ).toBeNull();
  });
  it("keeps an older confirmed score when a better retake has not been confirmed", async () => {
    await db.updateAttempt(attempt.id, { score: 1 });
    attempt = (await db.getAttemptById(attempt.id))!;
    await confirm();
    const retake = await db.createAttempt({
      quiz_id: quiz,
      student_id: student,
      section_id: "section",
      attempt_number: 2,
      deadline_at: new Date().toISOString(),
      max_score: 2,
      question_order: [question],
      status: "submitted",
      score: 2,
      is_graded: true,
    });
    const cell = (await insights.gradebook("class", teacher)).rows[0].cells[0];
    expect(cell).toMatchObject({
      score: 1,
      scoreAttemptId: attempt.id,
      pending: true,
      awaitingConfirmation: true,
      gradingAttemptId: retake.id,
    });
    await grading.confirmScore(
      retake.id,
      teacher,
      retake.updated_at,
      retake.score_revision || 0,
    );
    expect((await insights.gradebook("class", teacher)).rows[0].total).toBe(2);
  });
});
