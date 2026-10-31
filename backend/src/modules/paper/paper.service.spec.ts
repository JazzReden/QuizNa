import { ConfigService } from "@nestjs/config";
import { DatabaseService } from "../../database/database.service";
import { PaperService } from "./paper.service";
import { QuizzesService } from "../quizzes/quizzes.service";
import { SectionsService } from "../sections/sections.service";
import { QuestionsService } from "../questions/questions.service";
import { GradingService } from "../grading/grading.service";
import { AttemptsService } from "../attempts/attempts.service";
const teacher = "a0000000-0000-0000-0000-000000000001",
  student = "b0000000-0000-0000-0000-000000000002";
describe("Paper exams", () => {
  let db: DatabaseService,
    paper: PaperService,
    quizzes: QuizzesService,
    sections: SectionsService,
    quiz: any,
    link: any,
    questions: any[];
  beforeEach(async () => {
    db = new DatabaseService(new ConfigService({ NODE_ENV: "test" }));
    quizzes = new QuizzesService(db);
    sections = new SectionsService(db);
    paper = new PaperService(db, new GradingService(db));
    quiz = await quizzes.create((await db.getProfile(teacher))!, {
      title: "Paper fixture",
      exam_format: "paper",
      max_attempts: 2,
      randomize_options: true,
      randomize_questions: true,
    });
    const qs = new QuestionsService(db);
    questions = [
      await qs.create(teacher, {
        quiz_id: quiz.id,
        type: "mcq",
        prompt: "Pick one",
        points: 2,
        correct_answer: "a",
        options: [
          { id: "a", text: "Alpha" },
          { id: "b", text: "Beta" },
        ],
      }),
      await qs.create(teacher, {
        quiz_id: quiz.id,
        type: "essay",
        prompt: "Explain",
        points: 3,
      }),
    ];
    quiz = await quizzes.publish(quiz.id, teacher);
    const section = await sections.createClass(teacher, "Paper section");
    link = await sections.attach(quiz.id, teacher, section.id);
  });
  it("separates online starts from paper exams and freezes the exam format", async () => {
    await expect(
      new AttemptsService(db, new GradingService(db)).startOrResumeAttempt(
        (await db.getProfile(student))!,
        link.access_code,
      ),
    ).rejects.toThrow("paper");
    await expect(
      quizzes.getByAccessCodeForStudent(link.access_code, student),
    ).rejects.toThrow("paper");
    await expect(
      quizzes.update(quiz.id, teacher, { exam_format: "online" }),
    ).rejects.toThrow("fixed");
    expect(
      (await db.getQuizVersion(quiz.id, quiz.version))?.snapshot_data
        .exam_format,
    ).toBe("paper");
  });
  it("issues repeatable personalized sheets, strips keys, and resolves authenticated QR pages", async () => {
    const email = (await db.getProfile(student))!.email;
    const [a, b] = await Promise.all([
      paper.issue(quiz.id, teacher, {
        section_id: link.id,
        student_email: email,
      }),
      paper.issue(quiz.id, teacher, {
        section_id: link.id,
        student_email: email,
      }),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.layout).toEqual(b.layout);
    expect(JSON.stringify(a.layout)).not.toContain("correct_answer");
    expect(a.layout.questions[0]).not.toHaveProperty("rubric");
    expect(
      (await db.listRoster(link.class_section_id)).filter(
        (s) => s.email === email,
      ),
    ).toHaveLength(1);
    expect(
      (await paper.resolve(`QUIZNA:P1:${a.id}:0:${a.token}`, teacher)).sheet.id,
    ).toBe(a.id);
    await expect(
      paper.resolve(`QUIZNA:P1:${a.id}:0:${"0".repeat(32)}`, teacher),
    ).rejects.toThrow("Invalid");
    await expect(paper.get(a.id, "other")).rejects.toThrow("own");
    await expect(
      paper.resolve(`QUIZNA:P1:${a.id}:8:${a.token}`, teacher),
    ).rejects.toThrow("page");
  });
  it("grades on the server using the printed edition and saves repeated submissions once", async () => {
    const sheet = await paper.issue(quiz.id, teacher, {
      section_id: link.id,
      student_email: (await db.getProfile(student))!.email,
    });
    await new QuestionsService(db).update(questions[0].id, teacher, {
      correct_answer: "b",
      points: 9,
    });
    await quizzes.publish(quiz.id, teacher);
    const dto = {
      reviewed: true,
      answers: [
        { question_id: questions[0].id, answer: "a" },
        { question_id: questions[1].id, answer: "Written response" },
      ],
    };
    const [a, b] = await Promise.all([
      paper.save(sheet.id, teacher, dto),
      paper.save(sheet.id, teacher, dto),
    ]);
    expect(a!.id).toBe(b!.id);
    expect(a!.score).toBe(2);
    expect(a!.max_score).toBe(5);
    expect(a!.is_graded).toBe(false);
    expect(await db.listAttemptsByQuiz(quiz.id)).toHaveLength(1);
    expect(await db.getAnswersByAttempt(a!.id)).toHaveLength(2);
  });
  it("rejects incomplete, unreviewed, foreign and invalid-option results", async () => {
    const sheet = await paper.issue(quiz.id, teacher, {
      section_id: link.id,
      student_email: (await db.getProfile(student))!.email,
    });
    await expect(
      paper.save(sheet.id, teacher, { reviewed: false, answers: [] }),
    ).rejects.toThrow("Review");
    await expect(
      paper.save(sheet.id, teacher, { reviewed: true, answers: [] }),
    ).rejects.toThrow("every question");
    await expect(
      paper.save(sheet.id, teacher, {
        reviewed: true,
        answers: [
          { question_id: questions[0].id, answer: "invalid" },
          { question_id: questions[1].id, answer: null },
        ],
      }),
    ).rejects.toThrow("printed option");
    await expect(
      paper.save(sheet.id, "other", { reviewed: true, answers: [] }),
    ).rejects.toThrow("own");
    expect(await db.listAttemptsByQuiz(quiz.id)).toHaveLength(0);
  });
  it("prepares a section in surname order, reuses open sheets and reports missing accounts", async () => {
    const alex = (await db.getProfile(student))!;
    const emma = (await db.getProfile("b0000000-0000-0000-0000-000000000003"))!;
    await sections.addStudents(link.class_section_id, teacher, [
      { full_name: "Zara Adams", email: emma.email },
      { full_name: "Alex Mercer", email: alex.email },
      { full_name: "Unregistered Student", email: "missing@example.test" },
    ]);
    const first = await paper.prepareSection(quiz.id, teacher, link.id);
    const repeated = await paper.prepareSection(quiz.id, teacher, link.id);
    expect(first.sheet_ids).toEqual(repeated.sheet_ids);
    expect(first.sheet_ids).toHaveLength(2);
    expect((await paper.get(first.sheet_ids[0], teacher)).student_id).toBe(
      emma.id,
    );
    expect(first.skipped).toEqual([
      {
        student: "Unregistered Student",
        reason: "Student account not registered",
      },
    ]);
    expect(await db.listPaperSheets(quiz.id)).toHaveLength(2);
    expect(await db.listRoster(link.class_section_id)).toHaveLength(3);
  });
  it("skips already recorded students and never creates section retakes or overwrites grades", async () => {
    const sheet = await paper.issue(quiz.id, teacher, {
      section_id: link.id,
      student_email: (await db.getProfile(student))!.email,
    });
    const saved = await paper.save(sheet.id, teacher, {
      reviewed: true,
      answers: [
        { question_id: questions[0].id, answer: "a" },
        { question_id: questions[1].id, answer: "Written answer" },
      ],
    });
    const result = await paper.prepareSection(quiz.id, teacher, link.id);
    expect(result.sheet_ids).toEqual([]);
    expect(result.skipped[0].reason).toBe("Result already saved");
    expect(await db.listPaperSheets(quiz.id)).toHaveLength(1);
    expect((await db.getAttemptById(saved!.id))?.score).toBe(2);
    const dashboard = (await quizzes.listForTeacher(teacher)).find(
      (q) => q.id === quiz.id,
    )!;
    expect(dashboard.paper_submitted_count).toBe(1);
    expect(dashboard.paper_graded_count).toBe(0);
  });
  it("requires publishing pasted edits and labels original sheets without changing their questions", async () => {
    const sheet = await paper.issue(quiz.id, teacher, {
      section_id: link.id, student_email: (await db.getProfile(student))!.email,
    });
    expect((await quizzes.getByIdForTeacher(quiz.id, teacher)).paper_has_unpublished_changes).toBe(false);
    await new QuestionsService(db).update(questions[0].id, teacher, { prompt: "Updated question text", points: 4 });
    expect((await quizzes.getByIdForTeacher(quiz.id, teacher)).paper_has_unpublished_changes).toBe(true);
    await expect(paper.prepareSection(quiz.id, teacher, link.id)).rejects.toThrow("Publish your question changes");
    await quizzes.publish(quiz.id, teacher);
    expect((await quizzes.getByIdForTeacher(quiz.id, teacher)).paper_has_unpublished_changes).toBe(false);
    expect((await paper.list(quiz.id, teacher))[0].is_current_edition).toBe(false);
    expect((await paper.get(sheet.id, teacher)).layout).toEqual(sheet.layout);
  });
  it("validates ownership, exam format, publication, section identity and empty rosters before bulk preparation", async () => {
    await expect(
      paper.prepareSection(quiz.id, "other", link.id),
    ).rejects.toThrow("own");
    await expect(
      paper.prepareSection(quiz.id, teacher, "foreign-section"),
    ).rejects.toThrow("Select a section");
    await expect(
      paper.prepareSection(quiz.id, teacher, link.id),
    ).rejects.toThrow("no students");
    const online = await quizzes.create((await db.getProfile(teacher))!, {
      title: "Online",
    });
    await expect(
      paper.prepareSection(online.id, teacher, link.id),
    ).rejects.toThrow("Paper Exam");
    const draft = await quizzes.create((await db.getProfile(teacher))!, {
      title: "Draft paper",
      exam_format: "paper",
    });
    await expect(
      paper.prepareSection(draft.id, teacher, link.id),
    ).rejects.toThrow("Publish");
    expect(await db.listPaperSheets(quiz.id)).toHaveLength(0);
  });
});
