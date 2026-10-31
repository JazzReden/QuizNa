// Additive, repeatable local fixture. All creation, answers and grading use the
// application services inside one database transaction; existing records are hashed.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: new URL("../backend/.env", import.meta.url), quiet: true });
if (
  process.env.DATABASE_MODE !== "mysql" ||
  process.env.DEMO_MODE !== "true" ||
  process.env.NODE_ENV === "production"
)
  throw Error("This fixture is restricted to local XAMPP development.");
const require = createRequire(import.meta.url);
require("reflect-metadata");
const load = (path, name) =>
  require(fileURLToPath(new URL("../backend/dist/" + path, import.meta.url)))[
    name
  ];
const { ConfigService } = require("@nestjs/config");
const db = new (load("database/database.service.js", "DatabaseService"))(
  new ConfigService(process.env),
);
// Explicit construction intentionally avoids background expiry workers in the seeder.
const grading = new (load(
  "modules/grading/grading.service.js",
  "GradingService",
))(db);
const attempts = new (load(
  "modules/attempts/attempts.service.js",
  "AttemptsService",
))(db, grading);
const answers = new (load(
  "modules/answers/answers.service.js",
  "AnswersService",
))(db, attempts);
const quizzes = new (load(
  "modules/quizzes/quizzes.service.js",
  "QuizzesService",
))(db);
const questions = new (load(
  "modules/questions/questions.service.js",
  "QuestionsService",
))(db);
const sections = new (load(
  "modules/sections/sections.service.js",
  "SectionsService",
))(db);
const title = "Practical Research: Sampling and Data Collection (Sample)";
const marker = "Local sample set: ben-research-performance-v1.";
const content = [
  {
    type: "mcq",
    points: 2,
    prompt:
      "Which approach gives every student in a class an equal chance of being selected for a survey?",
    options: [
      { id: "a", text: "Ask only students sitting in the front row." },
      {
        id: "b",
        text: "Draw student numbers randomly from the complete class list.",
      },
      { id: "c", text: "Ask only students who volunteer first." },
      { id: "d", text: "Select only your closest friends." },
    ],
    correct_answer: "b",
    explanation:
      "A random draw from the complete list gives every listed student an equal chance.",
  },
  {
    type: "mcq",
    points: 2,
    prompt:
      "What is the main purpose of pilot-testing a questionnaire before the main survey?",
    options: [
      { id: "a", text: "Make sure every participant gives the same answer." },
      { id: "b", text: "Replace the need for consent." },
      {
        id: "c",
        text: "Find unclear questions and improve the survey procedure.",
      },
      {
        id: "d",
        text: "Remove all questions that produce unexpected answers.",
      },
    ],
    correct_answer: "c",
    explanation:
      "Pilot testing helps identify unclear wording and practical problems before full data collection.",
  },
  {
    type: "true_false",
    points: 1,
    prompt:
      "Survey participants should understand the study and be free to decline participation.",
    options: [
      { id: "opt_true", text: "True" },
      { id: "opt_false", text: "False" },
    ],
    correct_answer: "opt_true",
  },
  {
    type: "short_answer",
    points: 1,
    prompt:
      "What do we call information a researcher collects directly from participants for a particular study?",
    correct_answer: ["primary data", "primary"],
  },
  {
    type: "essay",
    points: 4,
    prompt:
      "Plan a short survey about Grade 12 students’ weekly study time. Explain how you would select participants, protect their privacy, ask consistent questions, and check data quality.",
    rubric:
      "Participant selection (1): select fairly from the class list. Consent and privacy (1): voluntary participation and no identifying details. Consistent questions (1): use the same clear wording and time period. Data quality (1): pilot the survey and check missing or unclear responses.",
  },
];
const responses = [
  "b",
  "a",
  "opt_true",
  "primary data",
  "I would randomly select 15 students from the complete Grade 12 class list. I would explain the study and ask for voluntary consent, allow anyone to skip a question, and avoid recording names. Every participant would answer the same question about total study hours during the previous seven days. I would pilot the questionnaire with a few students outside the selected group, clarify confusing wording, and check the collected responses for missing or unclear values before summarizing the results.",
];
const sort = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function snapshot(quiz) {
  const records = [];
  for (const attempt of sort(await db.listAttemptsByQuiz(quiz.id)))
    records.push({
      attempt,
      answers: sort(await db.getAnswersByAttempt(attempt.id)),
      incidents: sort(await db.getIncidentsByAttempt(attempt.id)),
    });
  const versions = [];
  for (let version = 1; version <= quiz.version; version++)
    versions.push(await db.getQuizVersion(quiz.id, version));
  return {
    quiz,
    questions: sort(await db.listQuestions(quiz.id)),
    versions,
    sections: sort(await db.listSections(quiz.id)),
    sheets: sort(await db.listPaperSheets(quiz.id)),
    records,
  };
}
try {
  await db.onModuleInit();
  const result = await db.withLock(
    "ben-research-performance-preview",
    async () => {
      const teacher = await db.getProfileByEmail(
        "demo.teacher.e9d067@quizna.test",
      );
      const ben = await db.getProfileByEmail(
        "sample.vincent.02.d42927da@quizna.test",
      );
      assert.equal(teacher?.role, "teacher");
      assert.equal(ben?.role, "student");
      assert.equal(ben.full_name, "Ben Cruz");
      const classId = "c1f4c06e-f40b-4e4c-934d-dc64ee33e0e5";
      const section = await db.getClass(classId);
      assert.equal(section?.teacher_id, teacher.id);
      assert.equal(section.name, "Grade 12 St. Vincent");
      const existing = await db.listQuizzes();
      const before = new Map();
      for (const q of existing) before.set(q.id, hash(await snapshot(q)));
      const rosterHash = hash(sort(await db.listRoster(classId)));
      const performanceBefore = await attempts.getStudentPerformance(ben.id);
      let quiz = existing.find(
        (q) => q.teacher_id === teacher.id && q.title === title,
      );
      const alreadyExisted = !!quiz;
      if (quiz)
        assert.equal(
          quiz.description,
          marker,
          "Another quiz uses this sample title; nothing was overwritten.",
        );
      else {
        quiz = await quizzes.create(teacher, {
          title,
          subject: "Practical Research",
          description: marker,
          exam_format: "online",
          instructions:
            "Answer all five questions. Use clear examples in the survey-planning essay.",
          time_limit_minutes: 20,
          max_attempts: 1,
          randomize_questions: false,
          randomize_options: false,
          release_scores_immediately: true,
          release_answers_immediately: false,
        });
        for (const q of content)
          await questions.create(teacher.id, { ...q, quiz_id: quiz.id });
        quiz = await quizzes.publish(quiz.id, teacher.id);
      }
      assert.equal(quiz.subject, "Practical Research");
      assert.equal(quiz.status, "published");
      const frozen = (await db.getQuizVersion(quiz.id, quiz.version))
        ?.snapshot_data.questions;
      assert.deepEqual(
        frozen?.map((q) => [q.prompt, q.type, q.points]),
        content.map((q) => [q.prompt, q.type, q.points]),
        "Existing sample content changed; no results were overwritten.",
      );
      const linked = await sections.attach(quiz.id, teacher.id, classId);
      let attempt = (await db.listAttemptsByStudent(ben.id)).find(
        (a) => a.quiz_id === quiz.id,
      );
      if (!attempt) {
        const started = await attempts.startOrResumeAttempt(
          ben,
          linked.access_code,
        );
        for (const [index, q] of frozen.entries())
          await answers.autosaveAnswer(started.attempt.id, ben.id, {
            question_id: q.id,
            answer: responses[index],
          });
        await attempts.submitAttempt(started.attempt.id, ben.id);
        const essay = (await db.getAnswersByAttempt(started.attempt.id)).find(
          (a) => a.question_id === frozen[4].id,
        );
        assert.ok(essay);
        await grading.manualGradeAnswer(essay.id, teacher.id, {
          score_awarded: 4,
          teacher_feedback:
            "Sample grade: 4/4. The plan uses random selection, voluntary consent and anonymity, a consistent seven-day question, and a pilot plus response-quality checks.",
        });
        attempt = await db.getAttemptById(started.attempt.id);
      }
      assert.equal(attempt.status, "submitted");
      assert.equal(attempt.is_graded, true);
      assert.equal(attempt.score, 8);
      assert.equal(attempt.max_score, 10);
      assert.equal((await db.getAnswersByAttempt(attempt.id)).length, 5);
      const performanceAfter = await attempts.getStudentPerformance(ben.id);
      const research = performanceAfter.subjects.find(
        (s) => s.subject === "Practical Research",
      );
      assert.ok(research);
      assert.equal(research.quizzes.filter((q) => q.id === quiz.id).length, 1);
      assert.equal(research.quizzes.find((q) => q.id === quiz.id).score, 8);
      if (!alreadyExisted) {
        assert.equal(
          performanceAfter.quizCount,
          performanceBefore.quizCount + 1,
        );
        assert.equal(
          performanceAfter.gradedCount,
          performanceBefore.gradedCount + 1,
        );
      }
      for (const [id, fingerprint] of before)
        assert.equal(
          hash(await snapshot(await db.getQuizById(id))),
          fingerprint,
          "An existing quiz, question, frozen edition, attempt, answer, incident or score changed. Rolling back.",
        );
      assert.equal(
        hash(sort(await db.listRoster(classId))),
        rosterHash,
        "Existing roster changed. Rolling back.",
      );
      return {
        verifiedAt: new Date().toISOString(),
        title,
        quizId: quiz.id,
        accessCode: linked.access_code,
        student: "Ben Cruz",
        attemptId: attempt.id,
        newScore: "8/10",
        alreadyExisted,
        existingQuizzesPreserved: before.size,
        existingRecordsUnchanged: true,
        rosterUnchanged: true,
        performanceBefore: {
          research: performanceBefore.subjects.find(
            (s) => s.subject === "Practical Research",
          )?.percentage,
          overall: performanceBefore.percentage,
        },
        performanceAfter: {
          research: research.percentage,
          researchEarned: research.earned,
          researchPossible: research.possible,
          overall: performanceAfter.percentage,
          quizCount: performanceAfter.quizCount,
        },
      };
    },
  );
  await writeFile(
    new URL("../docs/BEN_RESEARCH_PREVIEW.json", import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.onModuleDestroy();
}
