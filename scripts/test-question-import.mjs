import "./qa-report-directory.mjs";
// End-to-end API test against real XAMPP using disposable accounts only.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { createConnection } from 'mysql2/promise';
import assert from 'node:assert/strict';
config({ path: 'backend/.env' });
if (
  process.env.DATABASE_MODE !== 'mysql' ||
  process.env.DEMO_MODE !== 'true' ||
  process.env.NODE_ENV === 'production'
)
  throw Error('Use local XAMPP development mode for this test.');
const db = await createConnection({
  socketPath: process.env.MYSQL_SOCKET || undefined,
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});
const ids = [],
  quizzes = [],
  checks = [],
  base = 'http://127.0.0.1:3116/api';
let child,
  logs = '';
const check = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
  console.log('✓ ' + label);
};
async function request(path, token, method = 'GET', body, status = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = response.headers.get('content-type')?.includes('json')
    ? await response.json()
    : await response.text();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(result)}`,
  );
  return result;
}
const post = (path, body, token, status = 201) =>
  request(path, token, 'POST', body, status);
async function start() {
  logs = '';
  child = spawn(process.execPath, ['dist/main.js'], {
    cwd: new URL('../backend/', import.meta.url),
    env: { ...process.env, PORT: '3116', NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (v) => (logs += v));
  child.stderr.on('data', (v) => (logs += v));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/health')).ok) return;
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(logs);
}
async function stop() {
  if (child && child.exitCode === null) {
    const done = once(child, 'exit');
    child.kill('SIGTERM');
    await done;
  }
  child = null;
}
try {
  await start();
  const suffix = randomUUID(),
    password = 'Import-' + randomBytes(18).toString('hex');
  async function account(role, label = role) {
    const value = await post('/auth/register', {
      email: `import-${label}-${suffix}@example.test`,
      full_name: `Import ${role}`,
      role,
      password,
    });
    ids.push(value.profile.id);
    return value;
  }
  const teacher = await account('teacher'),
    student = await account('student'),
    otherTeacher = await account('teacher', 'other-teacher');
  const quiz = await post(
    '/quizzes',
    { title: 'Bulk import fixture', time_limit_minutes: 10 },
    teacher.token,
  );
  quizzes.push(quiz.id);
  const question = {
    prompt: 'Pasted multiple choice?',
    points: 1.25,
    options: [
      { id: 'opt_1', text: 'First' },
      { id: 'opt_2', text: 'Second' },
    ],
    correct_answer: 'opt_2',
  };
  const payload = {
    quiz_id: quiz.id,
    import_id: randomUUID(),
    questions: [question, { ...question, prompt: 'Another pasted question?' }],
  };
  await post('/questions/import', payload, student.token, 403);
  await post('/questions/import', payload, otherTeacher.token, 403);
  check(true, 'Student role and unrelated teacher cannot import questions');
  const bad = {
    ...payload,
    questions: [question, { ...question, correct_answer: 'missing' }],
  };
  await post('/questions/import', bad, teacher.token, 400);
  check(
    (await request(`/questions/quiz/${quiz.id}`, teacher.token)).length === 0,
    'Invalid answer key rejects the entire batch without partial saves',
  );
  await post(
    '/questions/import',
    { ...payload, questions: [{ ...question, points: 1.234 }] },
    teacher.token,
    400,
  );
  check(true, 'Over-precise points are rejected instead of rounded silently');
  const [first, replayed] = await Promise.all([
    post('/questions/import', payload, teacher.token),
    post('/questions/import', payload, teacher.token),
  ]);
  check(
    first.length === 2 &&
      first.map((q) => q.id).join() === replayed.map((q) => q.id).join(),
    'Concurrent imports create one batch with the same question IDs',
  );
  check(
    (await request(`/questions/quiz/${quiz.id}`, teacher.token)).length === 2 &&
      first[0].points === 1.25 &&
      first[1].order_index > first[0].order_index,
    'MariaDB preserves decimal points, choices and question order',
  );
  await stop();
  await start();
  const after = await post('/questions/import', payload, teacher.token);
  check(
    after.map((q) => q.id).join() === first.map((q) => q.id).join() &&
      (await request(`/questions/quiz/${quiz.id}`, teacher.token)).length === 2,
    'Retry after backend restart does not duplicate questions',
  );
  await post(
    '/questions/import',
    {
      ...payload,
      questions: [{ ...question, prompt: 'Changed' }, payload.questions[1]],
    },
    teacher.token,
    409,
  );
  check(true, 'Changed replay cannot overwrite an earlier import');
  const essay = await post(
    '/questions',
    {
      quiz_id: quiz.id,
      type: 'essay',
      prompt: 'Explain your choice.',
      points: 1.5,
    },
    teacher.token,
  );
  await post(`/quizzes/${quiz.id}/publish`, {}, teacher.token);
  const attempt = await post(
    '/attempts/start',
    { access_code: quiz.access_code },
    student.token,
  );
  check(
    attempt.questions.length === 3 &&
      attempt.questions.every((q) => q.correct_answer === undefined),
    'Imported questions publish and reach students without private keys',
  );
  await post(
    `/answers/${attempt.attempt.id}/save`,
    { question_id: first[0].id, answer: 'opt_2' },
    student.token,
  );
  await post(
    `/answers/${attempt.attempt.id}/save`,
    { question_id: essay.id, answer: 'A written response.' },
    student.token,
  );
  await post(`/attempts/${attempt.attempt.id}/submit`, {}, student.token);
  const answers = await request(
      `/answers/${attempt.attempt.id}`,
      teacher.token,
    ),
    written = answers.find((a) => a.question_id === essay.id);
  await post(
    `/grading/answer/${written.id}`,
    { score_awarded: 1.25, teacher_feedback: 'Reviewed decimal score.' },
    teacher.token,
  );
  await post(
    `/grading/answer/${written.id}`,
    { score_awarded: 2 },
    teacher.token,
    400,
  );
  await request(`/quizzes/${quiz.id}`, teacher.token, 'PUT', {
    release_scores_immediately: true,
  });
  check(
    (await request(`/attempts/${attempt.attempt.id}/result`, student.token))
      .attempt.score === 2.5,
    'Imported objective points and typed decimal essay grade reach student results',
  );
  const longQuiz = await post(
    '/quizzes',
    { title: '100-question batch fixture', time_limit_minutes: 10 },
    teacher.token,
  );
  quizzes.push(longQuiz.id);
  const longPayload = {
    quiz_id: longQuiz.id,
    import_id: randomUUID(),
    questions: Array.from({ length: 100 }, (_, i) => ({
      ...question,
      prompt: `Long quiz question ${i + 1}? ${'Context '.repeat(120)}`,
    })),
  };
  const long = await post('/questions/import', longPayload, teacher.token);
  check(
    long.length === 100 &&
      (await request(`/questions/quiz/${longQuiz.id}`, teacher.token))
        .length === 100,
    'A full 100-question quiz saves in one batch',
  );
  await post(
    '/questions/import',
    {
      ...longPayload,
      import_id: randomUUID(),
      questions: [...longPayload.questions, question],
    },
    teacher.token,
    400,
  );
  check(
    (await request(`/questions/quiz/${longQuiz.id}`, teacher.token)).length ===
      100,
    'Oversized batches are rejected without changing the quiz',
  );
  await post(
    '/questions/import',
    {
      ...longPayload,
      import_id: randomUUID(),
      questions: [{ ...question, prompt: 'x'.repeat(600000) }],
    },
    teacher.token,
    413,
  );
  check(
    (await request(`/questions/quiz/${longQuiz.id}`, teacher.token)).length ===
      100,
    'Oversized request bodies return a safe error without partial writes',
  );
  const mixedQuiz = await post(
    '/quizzes',
    { title: 'Mixed pasted quiz fixture', time_limit_minutes: 10 },
    teacher.token,
  );
  quizzes.push(mixedQuiz.id);
  const mixedPayload = {
    quiz_id: mixedQuiz.id,
    import_id: randomUUID(),
    questions: [
      { ...question, type: 'mcq' },
      {
        type: 'true_false',
        prompt: 'A person with self-awareness never experiences stress.',
        points: 1,
        options: [
          { id: 'opt_true', text: 'True' },
          { id: 'opt_false', text: 'False' },
        ],
        correct_answer: 'opt_false',
      },
      {
        type: 'essay',
        prompt: 'Explain self-awareness and emotional regulation.',
        points: 3,
        options: [],
        correct_answer: null,
      },
    ],
  };
  const mixed = await post('/questions/import', mixedPayload, teacher.token);
  check(
    mixed.map((q) => q.type).join() === 'mcq,true_false,essay' &&
      mixed[2].points === 3 &&
      mixed[2].correct_answer === null,
    'Mixed question types and explicit essay points persist in XAMPP',
  );
  check(
    (await post('/questions/import', mixedPayload, teacher.token))
      .map((q) => q.id)
      .join() === mixed.map((q) => q.id).join(),
    'Mixed imports remain safe to retry',
  );
  await post(`/quizzes/${mixedQuiz.id}/publish`, {}, teacher.token);
  const mixedAttempt = await post(
    '/attempts/start',
    { access_code: mixedQuiz.access_code },
    student.token,
  );
  for (const [index, answer] of [
    'opt_2',
    'opt_false',
    'Self-awareness helps us choose a calm response.',
  ].entries())
    await post(
      `/answers/${mixedAttempt.attempt.id}/save`,
      { question_id: mixed[index].id, answer },
      student.token,
    );
  await post(`/attempts/${mixedAttempt.attempt.id}/submit`, {}, student.token);
  const mixedDetail = await request(
    `/attempts/${mixedAttempt.attempt.id}`,
    teacher.token,
  );
  check(
    mixedDetail.score === 2.25 && !mixedDetail.is_graded,
    'Pasted true/false grades automatically while the essay awaits review',
  );
  const mixedAnswers = await request(
    `/answers/${mixedAttempt.attempt.id}`,
    teacher.token,
  );
  await post(
    `/grading/answer/${mixedAnswers.find((a) => a.question_id === mixed[2].id).id}`,
    { score_awarded: 3 },
    teacher.token,
  );
  await request(`/quizzes/${mixedQuiz.id}`, teacher.token, 'PUT', {
    release_scores_immediately: true,
  });
  check(
    (
      await request(
        `/attempts/${mixedAttempt.attempt.id}/result`,
        student.token,
      )
    ).attempt.score === 5.25,
    'Mixed imported questions complete submission, manual grading and released results',
  );
  await writeFile(
    '.local/qa/reports/question-import-check.json',
    JSON.stringify(
      {
        passed: true,
        verifiedAt: new Date().toISOString(),
        checks: checks.length,
        scenarios: checks,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Bulk import integration: ${checks.length} checks passed.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await stop();
  for (const id of quizzes)
    await db.execute('DELETE FROM quizzes WHERE id=?', [id]);
  for (const id of ids)
    await db.execute('DELETE FROM profiles WHERE id=?', [id]);
  await db.end();
}
