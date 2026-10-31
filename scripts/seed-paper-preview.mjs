// Additive local fixture: never submits the prepared sheet or changes existing results.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
config({ path: new URL('../backend/.env', import.meta.url) });
if (process.env.DATABASE_MODE !== 'mysql' || process.env.DEMO_MODE !== 'true' || process.env.NODE_ENV === 'production')
  throw Error('This sample is restricted to local XAMPP development.');
const manifest = JSON.parse(await readFile(new URL('../docs/CLASSROOM_PREVIEW.json', import.meta.url), 'utf8'));
const require = createRequire(import.meta.url);
require('reflect-metadata');
const load = path => require(fileURLToPath(new URL('../backend/dist/' + path, import.meta.url)));
const { NestFactory } = require('@nestjs/core');
const app = await NestFactory.createApplicationContext(load('app.module.js').AppModule, { logger: ['error'] });
const get = (path, name) => app.get(load(path)[name]);
const db = get('database/database.service.js', 'DatabaseService');
const quizzes = get('modules/quizzes/quizzes.service.js', 'QuizzesService');
const questions = get('modules/questions/questions.service.js', 'QuestionsService');
const sections = get('modules/sections/sections.service.js', 'SectionsService');
const paper = get('modules/paper/paper.service.js', 'PaperService');
const sorted = rows => rows.slice().sort((a, b) => a.id.localeCompare(b.id));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function snapshot(q) {
  const attempts = [];
  for (const a of sorted(await db.listAttemptsByQuiz(q.id)))
    attempts.push({ attempt: a, answers: sorted(await db.getAnswersByAttempt(a.id)), incidents: sorted(await db.getIncidentsByAttempt(a.id)) });
  const versions = [];
  for (let n = 1; n <= q.version; n++) versions.push(await db.getQuizVersion(q.id, n));
  return { quiz: q, questions: sorted(await db.listQuestions(q.id)), sections: sorted(await db.listSections(q.id)), sheets: sorted(await db.listPaperSheets(q.id)), versions, attempts };
}
const content = [
  ['Which action best reduces single-use plastic waste?', ['Bring a reusable water bottle.', 'Use a new plastic cup each time.', 'Burn plastic packaging.', 'Throw plastic into rivers.'], 'a'],
  ['Which source of energy is renewable?', ['Coal', 'Sunlight', 'Diesel', 'Natural gas'], 'b'],
  ['What is the best first step before sharing an environmental claim online?', ['Forward it immediately.', 'Count its likes.', 'Check reliable evidence and its source.', 'Trust its headline alone.'], 'c'],
  ['Which item belongs in a compost bin?', ['A glass bottle', 'An aluminum can', 'A plastic wrapper', 'Vegetable peels'], 'd'],
  ['What does biodiversity describe?', ['The variety of living things in an area.', 'The number of buildings in a city.', 'The amount of rainfall in one day.', 'The temperature inside a room.'], 'a'],
  ['Which habit saves electricity?', ['Leave unused lights on.', 'Switch off appliances when not in use.', 'Keep the refrigerator open.', 'Run an empty washing machine.'], 'b'],
  ['Why should a science investigation use repeated trials?', ['To guarantee a preferred result.', 'To avoid collecting evidence.', 'To check whether findings are consistent.', 'To remove the need for measurement.'], 'c'],
  ['Which action helps protect a local river?', ['Dump used oil into drains.', 'Leave litter beside the water.', 'Wash paint into the street.', 'Dispose of waste through proper collection.'], 'd'],
];
const title = 'Environmental Science — Paper Practice (Sample)';
const marker = 'Local sample set: paper-preview-v1.';
try {
  const teacher = await db.getProfileByEmail(manifest.teacherEmail);
  assert.equal(teacher?.role, 'teacher');
  const entry = manifest.classes.find(c => c.section === 'Grade 12 St. Vincent');
  assert.ok(entry);
  assert.equal((await db.getClass(entry.classId))?.teacher_id, teacher.id);
  const result = await db.withLock('paper-preview-seed', async () => {
    const existing = await db.listQuizzes(teacher.id);
    const before = new Map();
    for (const q of existing) before.set(q.id, hash(await snapshot(q)));
    const rosterBefore = hash(sorted(await db.listRoster(entry.classId)));
    const rosterStudent = (await db.listRoster(entry.classId)).find(s => s.full_name === 'Ana Reyes');
    assert.ok(rosterStudent, 'The existing sample student Ana Reyes is required.');
    const student = await db.getProfileByEmail(rosterStudent.email);
    assert.equal(student?.role, 'student');
    let quiz = existing.find(q => q.title === title);
    if (quiz) assert.equal(quiz.description, marker, 'Another quiz uses this title; no changes made.');
    if (!quiz) {
      quiz = await quizzes.create(teacher, {
        title, description: marker, exam_format: 'paper', time_limit_minutes: 20, max_attempts: 1,
        instructions: 'Answer all 10 questions on the separate answer sheet. Fill one bubble per question using a dark pen. Keep the QR code and corner squares clear.',
        randomize_questions: false, randomize_options: false,
        release_scores_immediately: true, release_answers_immediately: false,
      });
      for (const [prompt, choices, correct_answer] of content)
        await questions.create(teacher.id, { quiz_id: quiz.id, type: 'mcq', prompt, points: 1, options: choices.map((text, i) => ({ id: String.fromCharCode(97 + i), text })), correct_answer });
      for (const [prompt, correct_answer] of [
        ['Clean drinking water is essential for human health.', 'opt_true'],
        ['Burning plastic waste is a safe way to protect air quality.', 'opt_false'],
      ]) await questions.create(teacher.id, { quiz_id: quiz.id, type: 'true_false', prompt, points: 1, correct_answer });
      await sections.attach(quiz.id, teacher.id, entry.classId);
      quiz = await quizzes.publish(quiz.id, teacher.id);
    }
    assert.equal(quiz.exam_format, 'paper');
    assert.equal(quiz.status, 'published');
    const link = (await db.listSections(quiz.id)).find(s => s.class_section_id === entry.classId);
    assert.ok(link);
    // Preserve a saved sample on reruns rather than replacing its score or issuing a retake.
    let sheet = (await db.listPaperSheets(quiz.id)).find(s => s.student_id === student.id);
    if (!sheet) sheet = await paper.issue(quiz.id, teacher.id, { section_id: link.id, student_email: student.email });
    assert.equal(sheet.layout.pages.length, 1);
    assert.equal(sheet.layout.questions.length, 10);
    assert.equal(sheet.layout.questions.reduce((n, q) => n + q.points, 0), 10);
    if (!sheet.attempt_id) {
      const resolved = await paper.resolve(`QUIZNA:P1:${sheet.id}:0:${sheet.token}`, teacher.id);
      assert.equal(resolved.sheet.id, sheet.id);
      assert.equal((await db.listAttemptsByQuiz(quiz.id)).length, 0, 'Leave the sample unsubmitted for the teacher.');
    }
    for (const q of existing) assert.equal(hash(await snapshot(await db.getQuizById(q.id))), before.get(q.id), 'Existing quiz data must be unchanged.');
    assert.equal(hash(sorted(await db.listRoster(entry.classId))), rosterBefore, 'Existing roster must be unchanged.');
    return {
      teacherEmail: teacher.email, title, quizId: quiz.id, section: entry.section,
      student: student.full_name, studentEmail: student.email, sheetId: sheet.id,
      pages: sheet.layout.pages.length, maximumScore: 10, saved: !!sheet.attempt_id,
      url: `http://127.0.0.1:5173/teacher/paper/${quiz.id}`,
      practiceKey: ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'True', 'False'],
      preservedExistingQuizzes: existing.length, verifiedAt: new Date().toISOString(),
    };
  });
  await writeFile(new URL('../docs/PAPER_PREVIEW.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { await app.close(); }
