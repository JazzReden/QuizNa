// Additive local sample data. Uses normal quiz/answer/grading services in one transaction.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: new URL("../backend/.env", import.meta.url) });
if (
  process.env.DATABASE_MODE !== "mysql" ||
  process.env.DEMO_MODE !== "true" ||
  process.env.NODE_ENV === "production"
)
  throw Error("This seed is restricted to local XAMPP testing.");
const manifest = JSON.parse(
  await readFile(
    new URL("../docs/CLASSROOM_PREVIEW.json", import.meta.url),
    "utf8",
  ),
);
const require = createRequire(import.meta.url);
require("reflect-metadata");
const { NestFactory } = require("@nestjs/core");
const load = (path) =>
  require(fileURLToPath(new URL("../backend/dist/" + path, import.meta.url)));
const { AppModule } = load("app.module.js");
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ["error"],
});
const get = (path, name) => app.get(load(path)[name]);
const db = get("database/database.service.js", "DatabaseService");
const sections = get("modules/sections/sections.service.js", "SectionsService");
const quizzes = get("modules/quizzes/quizzes.service.js", "QuizzesService");
const questions = get(
  "modules/questions/questions.service.js",
  "QuestionsService",
);
const attempts = get("modules/attempts/attempts.service.js", "AttemptsService");
const answers = get("modules/answers/answers.service.js", "AnswersService");
const grading = get("modules/grading/grading.service.js", "GradingService");
const insights = get(
  "modules/reports/teacher-insights.service.js",
  "TeacherInsightsService",
);
const title = "Practical Research: Evidence and Experiments (Sample)";
const marker = "Local sample set: multi-quiz-preview-v1.";
const content = [
  {
    type: "mcq",
    points: 2,
    prompt: "Which statement is a testable research hypothesis?",
    options: [
      { id: "a", text: "Science is always interesting." },
      {
        id: "b",
        text: "Plants given six hours of light grow taller than plants given two hours.",
      },
      { id: "c", text: "Everyone should like gardening." },
      { id: "d", text: "Green is the best color." },
    ],
    correct_answer: "b",
    explanation:
      "A hypothesis makes a measurable prediction that can be tested.",
  },
  {
    type: "mcq",
    points: 2,
    prompt:
      "Which sampling method best reduces selection bias in a class survey?",
    options: [
      { id: "a", text: "Ask only your closest friends." },
      { id: "b", text: "Ask only the first students who arrive." },
      {
        id: "c",
        text: "Randomly select students from the complete class list.",
      },
      { id: "d", text: "Choose only students who agree with you." },
    ],
    correct_answer: "c",
    explanation:
      "Random selection gives every listed student a chance to participate.",
  },
  {
    type: "true_false",
    points: 2,
    prompt:
      "A correlation between two variables, by itself, proves that one causes the other.",
    options: [
      { id: "opt_true", text: "True" },
      { id: "opt_false", text: "False" },
    ],
    correct_answer: "opt_false",
    explanation:
      "A relationship can have other explanations; correlation alone does not establish causation.",
  },
  {
    type: "short_answer",
    points: 2,
    prompt:
      "What do we call the variable that a researcher deliberately changes in an experiment?",
    correct_answer: [
      "independent variable",
      "independent",
      "manipulated variable",
    ],
  },
  {
    type: "essay",
    points: 4,
    prompt:
      "Plan a simple experiment to test how daily light exposure affects plant growth. Explain what you would change, keep the same, and measure.",
    rubric:
      "Light exposure as independent variable (1), consistent plant/soil/water conditions (1), measurable growth and time period (1), fair comparison or repeated trials (1).",
  },
];
const essays = [
  "I would compare groups of the same plant species receiving two or six hours of light each day. Soil, water, pot size and starting height would stay similar. I would measure height weekly for four weeks and use several plants in each group.",
  "I would change the number of hours of light. I would use the same plant type and equal water and soil, measure height in centimeters each week, and compare the average growth of several plants after a month.",
  "I would give one group more light and another less light. I would keep the plant type and water the same and record plant height after two weeks.",
  "I would put one plant near a window and one farther away, then compare their height. I should keep their water and soil the same.",
  "I would put plants in different places and check which one grows more.",
];
const sorted = (rows) => rows.slice().sort((a, b) => a.id.localeCompare(b.id));
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function snapshot(quiz) {
  const records = [];
  for (const a of sorted(await db.listAttemptsByQuiz(quiz.id)))
    records.push({
      attempt: a,
      answers: sorted(await db.getAnswersByAttempt(a.id)),
      incidents: sorted(await db.getIncidentsByAttempt(a.id)),
    });
  const versions = [];
  for (let version = 1; version <= quiz.version; version++)
    versions.push(await db.getQuizVersion(quiz.id, version));
  return {
    quiz,
    questions: sorted(await db.listQuestions(quiz.id)),
    versions,
    sections: sorted(await db.listSections(quiz.id)),
    records,
  };
}
try {
  const teacher = await db.getProfileByEmail(manifest.teacherEmail);
  assert.ok(
    teacher?.role === "teacher",
    "Original local sample teacher was not found.",
  );
  const result = await db.withLock("gradebook-preview-seed", async () => {
    const existing = await db.listQuizzes(teacher.id);
    let quiz = existing.find((q) => q.title === title);
    if (quiz && quiz.description !== marker)
      throw Error(
        "A different quiz already uses the sample title. No records changed.",
      );
    // Include existing sample records on reruns: completed answers/grades are never replaced.
    const before = new Map();
    for (const q of existing) before.set(q.id, hash(await snapshot(q)));
    const rosters = new Map();
    for (const entry of manifest.classes) {
      const section = await db.getClass(entry.classId);
      assert.equal(
        section?.teacher_id,
        teacher.id,
        "Sample section ownership changed.",
      );
      rosters.set(
        entry.classId,
        hash(sorted(await db.listRoster(entry.classId))),
      );
    }
    if (!quiz) {
      quiz = await quizzes.create(teacher, {
        title,
        description: marker,
        instructions:
          "Answer all five questions. Explain your experiment clearly.",
        time_limit_minutes: 30,
        max_attempts: 1,
        release_scores_immediately: true,
        release_answers_immediately: false,
      });
      for (const q of content)
        await questions.create(teacher.id, { ...q, quiz_id: quiz.id });
      quiz = await quizzes.publish(quiz.id, teacher.id);
    }
    assert.equal(
      quiz.status,
      "published",
      "Existing sample is no longer published; preserve it as edited.",
    );
    const frozen = (await db.getQuizVersion(quiz.id, quiz.version))
      ?.snapshot_data.questions;
    assert.ok(
      frozen?.length === 5,
      "Existing sample content changed. No answers overwritten.",
    );
    assert.deepEqual(
      frozen.map((q) => [q.prompt, q.points, q.type]),
      content.map((q) => [q.prompt, q.points, q.type]),
      "Existing sample content changed.",
    );
    const summary = [];
    for (const [sectionIndex, entry] of manifest.classes.entries()) {
      const prefix =
        sectionIndex === 0 ? "sample.vincent." : "sample.filomena.";
      const students = (await db.listRoster(entry.classId))
        .filter((s) => s.email.startsWith(prefix))
        .sort((a, b) => a.email.localeCompare(b.email));
      assert.equal(
        students.length,
        sectionIndex === 0 ? 10 : 9,
        "Original sample roster differs; no students replaced.",
      );
      const link = await sections.attach(quiz.id, teacher.id, entry.classId);
      const expectedScores = new Map();
      for (const [i, student] of students.entries()) {
        const profile = await db.getProfileByEmail(student.email);
        assert.equal(
          profile?.role,
          "student",
          "An original sample account is missing.",
        );
        const prior = (await db.listAttemptsByStudent(profile.id)).find(
          (a) => a.quiz_id === quiz.id,
        );
        if (prior) {
          assert.notEqual(
            prior.status,
            "in_progress",
            "A sample student is already answering this quiz. No answers overwritten.",
          );
          if (prior.is_graded && prior.score != null)
            expectedScores.set(
              student.email.toLowerCase(),
              Number(prior.score),
            );
          continue;
        }
        const started = await attempts.startOrResumeAttempt(
          profile,
          link.access_code,
        );
        const correct = [
          (i + sectionIndex) % 5 !== 0,
          (i + sectionIndex) % 3 === 0,
          i % 4 !== 1,
          (i + sectionIndex) % 3 !== 1,
        ];
        const responses = [
          correct[0] ? "b" : "a",
          correct[1] ? "c" : "a",
          correct[2] ? "opt_false" : "opt_true",
          correct[3] ? "independent variable" : "dependent variable",
          essays[(i + sectionIndex) % essays.length],
        ];
        for (const [index, question] of frozen.entries())
          await answers.autosaveAnswer(started.attempt.id, profile.id, {
            question_id: question.id,
            answer: responses[index],
          });
        await attempts.submitAttempt(started.attempt.id, profile.id);
        const written = (await db.getAnswersByAttempt(started.attempt.id)).find(
          (a) => a.question_id === frozen[4].id,
        );
        const essayScore = [4, 4, 3, 2.5, 1.5][(i + sectionIndex) % 5];
        await grading.manualGradeAnswer(written.id, teacher.id, {
          score_awarded: essayScore,
          teacher_feedback:
            "Sample grade: use the experiment-planning rubric to review this response.",
        });
        const expected = correct.filter(Boolean).length * 2 + essayScore;
        const saved = await db.getAttemptById(started.attempt.id);
        assert.equal(saved.score, expected);
        assert.equal(saved.max_score, 12);
        assert.equal(saved.is_graded, true);
        assert.equal((await db.getAnswersByAttempt(saved.id)).length, 5);
        expectedScores.set(student.email.toLowerCase(), expected);
      }
      const book = await insights.gradebook(entry.classId, teacher.id);
      assert.ok(
        book.quizzes.length >= 2,
        "Gradebook must have multiple quiz columns.",
      );
      for (const row of book.rows) {
        const cell = row.cells.find((c) => c.quizId === quiz.id);
        if (expectedScores.has(row.email.toLowerCase()))
          assert.equal(cell.score, expectedScores.get(row.email.toLowerCase()));
        const graded = row.cells.filter((c) => c.score !== null);
        assert.equal(
          row.total,
          graded.length
            ? Math.round(graded.reduce((sum, c) => sum + c.score, 0) * 100) /
                100
            : null,
        );
        assert.equal(
          row.outOf,
          graded.reduce((sum, c) => sum + c.maxScore, 0),
        );
      }
      const analysis = await insights.questionAnalysis(
        quiz.id,
        teacher.id,
        link.id,
      );
      assert.equal(analysis.submittedCount, students.length);
      assert.equal(analysis.rows.length, 5);
      assert.ok(analysis.rows.some((q) => q.commonWrong.length > 0));
      assert.ok(analysis.rows.every((q) => q.pending === 0));
      summary.push({
        section: entry.section,
        classId: entry.classId,
        quizSectionId: link.id,
        accessCode: link.access_code,
        submitted: students.length,
        notStarted: book.rows.filter(
          (r) =>
            r.cells.find((c) => c.quizId === quiz.id)?.status === "not_started",
        ).length,
        quizColumns: book.quizzes.length,
        totals: book.rows
          .filter((r) => expectedScores.has(r.email.toLowerCase()))
          .map((r) => ({
            student: r.name,
            newScore: expectedScores.get(r.email.toLowerCase()),
            total: r.total,
            outOf: r.outOf,
          })),
        analysis: analysis.rows.map((q) => ({
          question: q.prompt,
          averagePercent: q.averagePercent,
          commonWrong: q.commonWrong,
        })),
      });
    }
    assert.notEqual(summary[0].accessCode, summary[1].accessCode);
    for (const [id, fingerprint] of before)
      assert.equal(
        hash(await snapshot(await db.getQuizById(id))),
        fingerprint,
        "An existing quiz, answer, incident or grade changed. Rolling back sample additions.",
      );
    for (const [id, fingerprint] of rosters)
      assert.equal(
        hash(sorted(await db.listRoster(id))),
        fingerprint,
        "An existing roster changed.",
      );
    return {
      verifiedAt: new Date().toISOString(),
      title,
      quizId: quiz.id,
      existingQuizzesPreserved: before.size,
      existingRecordsVerified: true,
      classes: summary,
    };
  });
  await writeFile(
    new URL("../docs/GRADEBOOK_PREVIEW.json", import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        title: result.title,
        quizId: result.quizId,
        existingQuizzesPreserved: result.existingQuizzesPreserved,
        classes: result.classes.map(({ totals, analysis, ...entry }) => entry),
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
}
