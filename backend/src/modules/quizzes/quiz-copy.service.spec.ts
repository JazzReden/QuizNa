import { ConfigService } from "@nestjs/config";
import { DatabaseService } from "../../database/database.service";
import { QuizCopyService } from "./quiz-copy.service";

describe("Copy quiz to another section", () => {
  let db: DatabaseService, service: QuizCopyService, source: any;
  const teacher = "a0000000-0000-0000-0000-000000000001",
    request = "00000000-0000-4000-8000-000000000123";
  beforeEach(async () => {
    db = new DatabaseService(
      new ConfigService({ DEMO_MODE: "true", NODE_ENV: "test" }),
    );
    service = new QuizCopyService(db);
    const now = new Date().toISOString();
    await db.createClass({
      id: "dest",
      teacher_id: teacher,
      name: "Filomena",
      created_at: now,
    });
    await db.saveSubjectRecord("subjects", {
      id: "target",
      teacher_id: teacher,
      class_section_id: "dest",
      name: "Research",
      access_code: "SUB-TEST",
      leaderboard_enabled: false,
      created_at: now,
    });
    source = await db.createQuiz({
      teacher_id: teacher,
      title: "Original",
      subject: "Research",
      status: "published",
      access_code: "COPY01",
      require_access_code: true,
      time_limit_minutes: 20,
      max_attempts: 2,
      randomize_questions: true,
      release_scores_immediately: true,
      available_until: "2020-01-01T00:00:00Z",
    });
    await db.createQuestion({
      quiz_id: source.id,
      type: "essay",
      prompt: "Explain your reasoning",
      points: 5,
      rubric: "Accuracy 3; clarity 2",
    });
  });
  it("copies questions and settings into an independent draft with fresh codes and no results", async () => {
    const copy = await service.copy(source.id, teacher, "target", request);
    expect(copy).toMatchObject({
      status: "draft",
      subject: "Research",
      require_access_code: true,
      time_limit_minutes: 20,
      max_attempts: 2,
      release_scores_immediately: false,
      release_answers_immediately: false,
    });
    expect(copy.available_until).toBeFalsy();
    expect(copy.access_code).not.toBe(source.access_code);
    const questions = await db.listQuestions(copy.id),
      original = await db.listQuestions(source.id);
    expect(questions[0]).toMatchObject({
      prompt: original[0].prompt,
      points: 5,
      rubric: original[0].rubric,
    });
    expect(questions[0].id).not.toBe(original[0].id);
    expect(await db.listAttemptsByQuiz(copy.id)).toEqual([]);
    expect((await db.listSections(copy.id))[0].class_section_id).toBe("dest");
    expect(
      await db.subjectRecords("subjectQuizzes", { quiz_id: copy.id }),
    ).toHaveLength(1);
    await db.updateQuiz(copy.id, { title: "Changed" });
    expect((await db.getQuizById(source.id))!.title).toBe("Original");
  });
  it("deduplicates concurrent retries", async () => {
    const copies = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.copy(source.id, teacher, "target", request),
      ),
    );
    expect(new Set(copies.map((q) => q.id)).size).toBe(1);
    expect(await db.listQuestions(copies[0].id)).toHaveLength(1);
  });
  it("rejects foreign quizzes, foreign destinations and same-section copies", async () => {
    await expect(
      service.copy(source.id, "other", "target", request),
    ).rejects.toThrow("own");
    await db.saveSubjectRecord("subjects", {
      id: "foreign",
      teacher_id: "other",
      class_section_id: "dest",
    } as any);
    await expect(
      service.copy(source.id, teacher, "foreign", request),
    ).rejects.toThrow("own");
    await db.createSection({
      id: "section",
      quiz_id: source.id,
      class_section_id: "dest",
      name: "Filomena",
      access_code: "S-12345678",
      created_at: new Date().toISOString(),
    });
    await expect(
      service.copy(source.id, teacher, "target", request),
    ).rejects.toThrow("different section");
  });
  it("cleans up a failed memory copy so a retry can finish", async () => {
    const spy = jest
      .spyOn(db, "saveSubjectRecord")
      .mockRejectedValueOnce(Error("failure"));
    await expect(
      service.copy(source.id, teacher, "target", request),
    ).rejects.toThrow("failure");
    spy.mockRestore();
    const copied = await service.copy(source.id, teacher, "target", request);
    expect(await db.listQuestions(copied.id)).toHaveLength(1);
    expect(await db.listSections(copied.id)).toHaveLength(1);
  });
});
