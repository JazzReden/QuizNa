import { buildLeaderboard } from "./leaderboard";
import { buildClassList } from "./class-list";
import { TeacherInsightsService } from "./teacher-insights.service";
import { BoundedWorkerPoolService } from "../workers/bounded-worker-pool.service";
import { AnalysisInput } from "./question-analysis";

describe("Section gradebook and question analysis", () => {
  let pool: BoundedWorkerPoolService, service: TeacherInsightsService;
  let db: any, reports: any;
  beforeEach(() => {
    pool = new BoundedWorkerPoolService();
    db = {
      getClass: jest.fn().mockResolvedValue({
        id: "class",
        teacher_id: "teacher",
        name: "STEM A",
      }),
      listRoster: jest.fn().mockResolvedValue([
        { full_name: "Alice Zulu", email: "alice@test.local" },
        { full_name: "Zoe Adams", email: "zoe@test.local" },
        { full_name: "=Missing", email: "missing@test.local" },
      ]),
      listQuizzes: jest.fn().mockResolvedValue([
        {
          id: "q2",
          title: "Quiz 2",
          status: "archived",
          created_at: "2026-01-02",
        },
        {
          id: "q1",
          title: "Quiz 1",
          status: "published",
          created_at: "2026-01-01",
        },
        { id: "draft", status: "draft", created_at: "2026-01-03" },
        { id: "unlinked", status: "published", created_at: "2026-01-03" },
      ]),
      listSections: jest
        .fn()
        .mockImplementation(async (id) =>
          id === "unlinked" ? [] : [{ id: "s", class_section_id: "class" }],
        ),
      getQuizById: jest.fn().mockResolvedValue({
        id: "q1",
        teacher_id: "teacher",
        title: "Quiz 1",
      }),
      listAttemptsByQuiz: jest.fn().mockResolvedValue([]),
    };
    reports = {
      getClassList: jest.fn().mockImplementation(async (id) => ({
        rows:
          id === "q1"
            ? [
                {
                  studentName: "Alice Zulu",
                  studentEmail: "ALICE@test.local",
                  score: 7,
                  maxScore: 10,
                  participation: "in_progress",
                  pendingAttempts: 0,
                  scoreAttemptId: "best-score",
                  reviewAttemptId: "best-score",
                },
                {
                  studentName: "Zoe Adams",
                  studentEmail: "zoe@test.local",
                  score: null,
                  maxScore: 10,
                  participation: "submitted",
                  pendingAttempts: 1,
                  reviewAttemptId: "pending-essay",
                },
                {
                  scoreAttemptId: "zero-score",
                  reviewAttemptId: "zero-score",
                  studentName: "Ben Cruz",
                  studentEmail: "ben@test.local",
                  score: 0,
                  maxScore: 10,
                  participation: "submitted",
                  pendingAttempts: 0,
                },
              ]
            : [
                {
                  studentName: "Alice Zulu",
                  studentEmail: "alice@test.local",
                  scoreAttemptId: "second-score",
                  reviewAttemptId: "second-score",
                  score: 4,
                  maxScore: 5,
                  participation: "submitted",
                  pendingAttempts: 0,
                },
              ],
      })),
    };
    service = new TeacherInsightsService(db, reports, pool);
  });
  afterEach(() => pool.onModuleDestroy());

  it("combines linked published/archived quizzes, surname order, missing students, zero grades and retakes", async () => {
    const result = await service.gradebook("class", "teacher");
    expect(result.quizzes.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(db.listQuizzes).toHaveBeenCalledWith("teacher");
    expect(result.rows.map((r) => r.name)).toEqual([
      "=Missing",
      "Zoe Adams",
      "Ben Cruz",
      "Alice Zulu",
    ]);
    const alice = result.rows.find((r) => r.email === "alice@test.local")!;
    expect(alice.total).toBe(11);
    expect(alice.outOf).toBe(15);
    expect(alice.gradedCount).toBe(2);
    expect(alice.cells[0].status).toBe("in_progress");
    const zoe = result.rows.find((r) => r.name === "Zoe Adams")!;
    expect(zoe.total).toBeNull();
    expect(zoe.cells[0].pending).toBe(true);
    expect(zoe.cells[1].status).toBe("not_started");
    expect(result.rows.find((r) => r.name === "Ben Cruz")).toMatchObject({
      total: 0,
      outOf: 10,
      onRoster: false,
    });
    const missing = result.rows.find((r) => r.name === "=Missing")!;
    expect(missing.total).toBeNull();
    expect(missing.cells.every((c) => c.score === null)).toBe(true);
  });

  it("returns exact review targets for scores, zero grades and pending essays, with no targets for missing work", async () => {
    const result = await service.gradebook("class", "teacher");
    const alice = result.rows.find((r) => r.name === "Alice Zulu")!;
    expect(alice.cells[0]).toMatchObject({
      scoreAttemptId: "best-score",
      gradingAttemptId: null,
    });
    const zoe = result.rows.find((r) => r.name === "Zoe Adams")!;
    expect(zoe.cells[0]).toMatchObject({
      scoreAttemptId: null,
      gradingAttemptId: "pending-essay",
    });
    expect(zoe.cells[1]).toMatchObject({
      scoreAttemptId: null,
      gradingAttemptId: null,
    });
    expect(
      result.rows.find((r) => r.name === "Ben Cruz")!.cells[0],
    ).toMatchObject({ score: 0, scoreAttemptId: "zero-score" });
  });

  it("preserves separate best-score and pending targets during active retakes", async () => {
    const base: any = {
      student_id: "a",
      section_id: "s",
      max_score: 10,
      attempt_number: 1,
      started_at: "2026-01-01",
      submitted_at: "2026-01-01",
      student_profile: { full_name: "Alice Zulu", email: "alice@test.local" },
    };
    const best = {
      ...base,
      id: "best",
      status: "submitted",
      is_graded: true,
      score: 8,
    };
    const pending = {
      ...base,
      id: "pending",
      status: "submitted",
      is_graded: false,
      submitted_at: "2026-01-02",
    };
    const active = {
      ...base,
      id: "active",
      status: "in_progress",
      is_graded: false,
    };
    const scores = buildLeaderboard([best, pending]);
    const rows = buildClassList(
      scores,
      [active],
      [{ id: "s", name: "Section" } as any],
      [],
    );
    expect(rows[0]).toMatchObject({
      scoreAttemptId: "best",
      reviewAttemptId: "pending",
      attemptId: "active",
      participation: "in_progress",
    });
    reports.getClassList.mockResolvedValue({ rows });
    const result = await service.gradebook("class", "teacher");
    expect(
      result.rows.find((r) => r.name === "Alice Zulu")!.cells[0],
    ).toMatchObject({ scoreAttemptId: "best", gradingAttemptId: "pending" });
    reports.getClassList.mockResolvedValue({
      rows: buildClassList([], [active], [], []),
    });
    const activeOnly = await service.gradebook("class", "teacher");
    expect(
      activeOnly.rows.find((r) => r.name === "Alice Zulu")!.cells[0],
    ).toMatchObject({ scoreAttemptId: null, gradingAttemptId: null });
  });

  it("exports exact cells, graded totals, surname ordering and neutralizes spreadsheet formulas", async () => {
    const csv = await service.gradebookCsv("class", "teacher");
    const rows = csv.split("\n").map((line) => JSON.parse("[" + line + "]"));
    expect(rows[2][0]).toBe("Zoe Adams");
    expect(rows[0]).toEqual(["Student", "Quiz 1", "Quiz 2", "Total"]);
    expect(rows[3]).toEqual(["Ben Cruz", "0/10", "Not started", "0/10"]);
    expect(rows[2]).toEqual([
      "Zoe Adams",
      "Awaiting grading",
      "Not started",
      "",
    ]);
    expect(rows.every((row) => row.length === 4)).toBe(true);
    expect(rows[1]).toEqual(["'=Missing", "Not started", "Not started", ""]);
    expect(rows[4]).toEqual(["Alice Zulu", "7/10", "4/5", "11/15"]);
  });

  it("supports empty sections without inventing quiz scores", async () => {
    db.listQuizzes.mockResolvedValue([]);
    const result = await service.gradebook("class", "teacher");
    expect(result.quizzes).toEqual([]);
    expect(
      result.rows.every((r) => r.total === null && r.gradedCount === 0),
    ).toBe(true);
  });

  it("checks class ownership before reading any rosters or scores", async () => {
    await expect(service.gradebook("class", "other")).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.gradebookCsv("class", "other")).rejects.toMatchObject({
      status: 403,
    });
    expect(db.listRoster).not.toHaveBeenCalled();
    expect(reports.getClassList).not.toHaveBeenCalled();
    db.getClass.mockResolvedValue(null);
    await expect(service.gradebook("missing", "teacher")).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("checks analysis owner and section before reading answers", async () => {
    await expect(service.questionAnalysis("q1", "other")).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(
      service.questionAnalysis("q1", "teacher", "foreign"),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.listAttemptsByQuiz).not.toHaveBeenCalled();
  });

  it("uses latest finalized attempts only and isolates immutable editions", async () => {
    const attempt = (
      id: string,
      student: string,
      time: string,
      status = "submitted",
      section = "s",
    ) => ({
      id,
      student_id: student,
      submitted_at: time,
      section_id: section,
      attempt_number: 1,
      status,
    });
    db.listAttemptsByQuiz.mockResolvedValue([
      attempt("old", "a", "2026-01-01"),
      attempt("latest", "a", "2026-01-02"),
      attempt("active", "a", "2026-01-03", "in_progress"),
      attempt("second", "b", "2026-01-01"),
      attempt("foreign", "c", "2026-01-03", "submitted", "other-section"),
    ]);
    db.getVersionForAttempt = jest.fn().mockImplementation(async (a) => ({
      id: a.id === "second" ? "v1" : "v2",
      version_number: a.id === "second" ? 1 : 2,
    }));
    db.getAttemptQuestions = jest.fn().mockResolvedValue([
      {
        id: "same-question-id",
        type: "mcq",
        points: 2,
        prompt: "Frozen question",
        order_index: 0,
        options: [{ id: "wrong", text: "Wrong choice" }],
        correct_answer: "secret",
      },
    ]);
    db.getAnswersByAttempt = jest
      .fn()
      .mockResolvedValue([
        { question_id: "same-question-id", answer: "wrong", score_awarded: 0 },
      ]);
    const data = await service.questionAnalysis("q1", "teacher", "s");
    expect(data.submittedCount).toBe(2);
    expect(data.rows).toHaveLength(2);
    expect(db.getAnswersByAttempt.mock.calls.map((c) => c[0])).toEqual([
      "latest",
      "second",
    ]);
    expect(data.rows.map((r) => r.version).sort()).toEqual([1, 2]);
    expect(data.rows[0].commonWrong).toEqual([
      { answer: "Wrong choice", count: 1 },
    ]);
    expect(JSON.stringify(data)).not.toContain("secret");
  });

  it("aggregates common wrong choices, normalized short answers, false answers, unanswered and pending essays", async () => {
    const questions: any[] = [
      {
        id: "mcq",
        type: "mcq",
        prompt: "Choice",
        points: 2,
        order_index: 0,
        options: [{ id: "x", text: "Mars" }],
      },
      {
        id: "tf",
        type: "true_false",
        prompt: "Fact",
        points: 1,
        order_index: 1,
      },
      {
        id: "short",
        type: "short_answer",
        prompt: "Name",
        points: 1,
        order_index: 2,
      },
      {
        id: "essay",
        type: "essay",
        prompt: "Explain",
        points: 4,
        order_index: 3,
      },
    ];
    const answers = (n: number): any[] => [
      { question_id: "mcq", answer: n === 2 ? null : "x", score_awarded: 0 },
      { question_id: "tf", answer: false, score_awarded: n === 2 ? 1 : 0 },
      {
        question_id: "short",
        answer: n === 0 ? "  Jupiter  " : "jupiter",
        score_awarded: 0,
      },
      {
        question_id: "essay",
        answer: "Response",
        score_awarded: n === 0 ? 2 : undefined,
        is_manually_graded: n === 0,
      },
    ];
    const input: AnalysisInput[] = [0, 1, 2].map((n) => ({
      versionId: "v1",
      version: 1,
      questions,
      answers: answers(n),
    }));
    const { analyzeQuestions } = await import("./question-analysis");
    const rows = await pool.runTask("test-analysis", input, analyzeQuestions);
    expect(rows.find((r) => r.type === "mcq")).toMatchObject({
      responses: 3,
      graded: 3,
      unanswered: 1,
      averagePercent: 0,
      commonWrong: [{ answer: "Mars", count: 2 }],
    });
    expect(rows.find((r) => r.type === "true_false")?.commonWrong).toEqual([
      { answer: "False", count: 2 },
    ]);
    expect(
      rows.find((r) => r.type === "short_answer")?.commonWrong[0].count,
    ).toBe(3);
    expect(rows.find((r) => r.type === "essay")).toMatchObject({
      graded: 1,
      pending: 2,
      averagePercent: 50,
      commonWrong: [],
    });
    expect(rows[rows.length - 1].type).toBe("essay");
  });
});
