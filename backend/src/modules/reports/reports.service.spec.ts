import { ReportsService } from "./reports.service";
import { BoundedWorkerPoolService } from "../workers/bounded-worker-pool.service";
import { DatabaseService } from "../../database/database.service";

describe("Section-organized CSV exports", () => {
  let pool: BoundedWorkerPoolService;
  let reports: ReportsService;
  let db: Record<string, jest.Mock>;
  const sections = [
    { id: "ten", name: "Section 10" },
    { id: "two", name: "Section 2" },
  ];
  const attempts = [
    { id: "z", student_id: "Zoe", section_id: "two" },
    { id: "c", student_id: "Cara", section_id: "ten" },
    { id: "a", student_id: "alice", section_id: "two" },
    { id: "u", student_id: "=Unknown", section_id: null },
  ].map((a) => ({
    ...a,
    quiz_id: "quiz",
    status: "submitted",
    is_graded: true,
    score: 1,
    max_score: 1,
    started_at: "2026-10-20T00:00:00Z",
    submitted_at: "2026-10-20T00:01:00Z",
    attempt_number: 1,
  }));

  beforeEach(() => {
    pool = new BoundedWorkerPoolService();
    db = {
      getQuizById: jest.fn().mockResolvedValue({
        id: "quiz",
        teacher_id: "teacher",
        title: "Quiz",
      }),
      listSections: jest.fn().mockResolvedValue(sections),
      listAttemptsByQuiz: jest
        .fn()
        .mockImplementation(async () => attempts.map((a) => ({ ...a }))),
      getProfile: jest.fn().mockImplementation(async (id) => ({
        full_name: id,
        email: id + "@example.test",
      })),
      getVersionForAttempt: jest
        .fn()
        .mockResolvedValue({ id: "v1", version_number: 1 }),
      getAttemptQuestions: jest.fn().mockResolvedValue([]),
      getAnswersByAttempt: jest.fn().mockResolvedValue([]),
      getIncidentsByAttempt: jest.fn().mockResolvedValue([]),
    };
    reports = new ReportsService(db as unknown as DatabaseService, pool);
  });
  afterEach(() => pool.onModuleDestroy());

  it.each(["scorebook", "detailed"])(
    "groups %s rows by section and sorts names case-insensitively A–Z",
    async (kind) => {
      const csv =
        kind === "scorebook"
          ? await reports.exportScorebookCsv("quiz", "teacher")
          : await reports.exportQuizCsv("quiz", "teacher");
      const lines = csv.split("\n").slice(1);
      expect(lines[0]).toContain('"alice"');
      expect(lines[1]).toContain('"Zoe"');
      expect(lines[2]).toContain('"Cara"');
      expect(lines[3]).toContain('"\'=Unknown"');
      expect(lines[0]).toContain('"Section 2"');
      expect(lines[2]).toContain('"Section 10"');
      expect(lines[3]).toContain('"Unassigned"');
    },
  );

  it.each(["scorebook", "detailed"])(
    "filters %s exports to the requested section or Unassigned",
    async (kind) => {
      const run = (section: string) =>
        kind === "scorebook"
          ? reports.exportScorebookCsv("quiz", "teacher", section)
          : reports.exportQuizCsv("quiz", "teacher", section);
      const csv = await run("two");
      expect(csv.split("\n")).toHaveLength(3);
      expect(csv).toContain('"alice"');
      expect(csv).not.toContain('"Cara"');
      expect(csv).not.toContain('"Unassigned"');
      const unassigned = await run("unassigned");
      expect(unassigned.split("\n")).toHaveLength(2);
      expect(unassigned).toContain('"Unassigned"');
    },
  );

  it.each(["scorebook", "detailed"])(
    "sorts %s by surname ahead of given name within each section",
    async (kind) => {
      const names = {
        Zoe: "Zoe Adams",
        alice: "Alice Zulu",
        Cara: "Cara Baker",
        "=Unknown": "=Unknown",
      };
      db.getProfile.mockImplementation(async (id) => ({
        full_name: names[id],
        email: id + "@example.test",
      }));
      const csv =
        kind === "scorebook"
          ? await reports.exportScorebookCsv("quiz", "teacher")
          : await reports.exportQuizCsv("quiz", "teacher");
      const lines = csv.split("\n").slice(1);
      expect(lines[0]).toContain('"Zoe Adams"');
      expect(lines[1]).toContain('"Alice Zulu"');
      expect(lines[2]).toContain('"Cara Baker"');
    },
  );

  it("rejects foreign sections and other teachers before exporting data", async () => {
    for (const run of [
      reports.exportScorebookCsv.bind(reports),
      reports.exportQuizCsv.bind(reports),
    ]) {
      await expect(run("quiz", "teacher", "foreign")).rejects.toThrow(
        "from this quiz",
      );
      await expect(run("quiz", "other", "two")).rejects.toThrow(
        "own this quiz",
      );
    }
    expect(db.listAttemptsByQuiz).not.toHaveBeenCalled();
  });

  describe("selected student status", () => {
    beforeEach(() => {
      db.listSections.mockResolvedValue(sections.map((s) => ({ ...s, class_section_id: s.id })));
      db.listRoster = jest.fn().mockImplementation(async (id) => id === "two" ? [
        { id: "missing-z", class_section_id: "two", full_name: "Aaron Zulu", email: "missing-z@example.test" },
        { id: "missing-a", class_section_id: "two", full_name: "Zara Adams", email: "missing-a@example.test" },
      ] : [{ id: "other", class_section_id: "ten", full_name: "Other Section", email: "other@example.test" }]);
      const current = [
        ...attempts,
        { ...attempts[0], id: "retake", status: "in_progress", attempt_number: 2, is_graded: false },
        { ...attempts[0], id: "active", student_id: "Nina", status: "in_progress", is_graded: false },
      ];
      db.listAttemptsByQuiz.mockImplementation(async () => current.map((a) => ({ ...a })));
      db.getProfile.mockImplementation(async (id) => ({
        full_name: ({ Zoe: "Zoe Adams", Nina: "Nina Baker", alice: "Alice Zulu" })[id] || id,
        email: id + "@example.test",
      }));
    });

    it.each(["scorebook", "detailed"])("filters %s by participation and section, including active retakes", async (kind) => {
      const run = (status: string, section = "two") => kind === "scorebook"
        ? reports.exportScorebookCsv("quiz", "teacher", section, status)
        : reports.exportQuizCsv("quiz", "teacher", section, status);
      const submitted = await run("submitted");
      expect(submitted.split("\n")).toHaveLength(2);
      expect(submitted).toContain('"Alice Zulu"');
      expect(submitted).not.toContain('"Zoe Adams"');
      expect(submitted).not.toContain('"Cara"');
      const active = await run("in_progress");
      expect(active.split("\n")).toHaveLength(3);
      expect(active.split("\n")[1]).toContain('"Zoe Adams"');
      expect(active.split("\n")[2]).toContain('"Nina Baker"');
      expect(active).not.toContain('"Alice Zulu"');
      if (kind === "detailed") {
        expect(active).toContain('"retake"');
        expect(active).not.toContain('"z",');
      }
      expect((await run("in_progress", "ten")).split("\n")).toHaveLength(1);
      const all = await run("all");
      expect(all).toContain('"Alice Zulu"');
      expect(all).toContain('"Zoe Adams"');
    });

    it("exports not-started roster students by last name with blank scores", async () => {
      const csv = await reports.exportScorebookCsv("quiz", "teacher", "two", "not_started");
      const lines = csv.split("\n");
      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain('"Zara Adams"');
      expect(lines[2]).toContain('"Aaron Zulu"');
      for (const line of lines.slice(1)) {
        const columns = JSON.parse("[" + line + "]");
        expect(columns.slice(4, 8)).toEqual(["", "", "", ""]);
        expect(columns[9]).toBe("Not started");
      }
      expect(csv).not.toContain('"Other Section"');
      const detailed = await reports.exportQuizCsv("quiz", "teacher", "two", "not_started");
      expect(detailed.split("\n")).toHaveLength(1);
    });

    it.each(["scorebook", "detailed"])("rejects invalid %s filters and retains ownership checks", async (kind) => {
      const run = kind === "scorebook" ? reports.exportScorebookCsv.bind(reports) : reports.exportQuizCsv.bind(reports);
      await expect(run("quiz", "teacher", "two", "invalid")).rejects.toMatchObject({ status: 400 });
      await expect(run("quiz", "other", "two", "not_started")).rejects.toMatchObject({ status: 403 });
      await expect(run("quiz", "teacher", "foreign", "submitted")).rejects.toMatchObject({ status: 400 });
      expect(db.listAttemptsByQuiz).not.toHaveBeenCalled();
    });
  });

});
