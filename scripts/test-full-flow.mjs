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
  base = 'http://127.0.0.1:3114/api';
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
    env: { ...process.env, PORT: '3114', NODE_ENV: 'development' },
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
    password = 'Flow-' + randomBytes(18).toString('hex');
  async function account(role, label = role) {
    const session = await post('/auth/register', {
      email: `${label}-${suffix}@example.test`,
      full_name: `Flow ${role}`,
      password,
      role,
    });
    ids.push(session.profile.id);
    return post('/auth/login', { email: session.profile.email, password });
  }
  const teacher = await account('teacher'),
    student = await account('student'),
    otherTeacher = await account('teacher', 'other-teacher');
  check(
    teacher.profile.role === 'teacher' && student.profile.role === 'student',
    'Fresh teacher and student registration and password login',
  );
  const quiz = await post(
    '/quizzes',
    {
      title: 'Full flow fixture',
      instructions: 'Answer all four questions.',
      time_limit_minutes: 10,
      max_attempts: 1,
      randomize_questions: true,
      randomize_options: true,
    },
    teacher.token,
  );
  quizzes.push(quiz.id);
  const definitions = [
    {
      type: 'mcq',
      prompt: 'Two plus two?',
      points: 2,
      options: [
        { id: 'four', text: 'Four' },
        { id: 'five', text: 'Five' },
      ],
      correct_answer: 'four',
    },
    {
      type: 'true_false',
      prompt: 'The Earth orbits the Sun.',
      points: 1,
      options: [
        { id: 'opt_true', text: 'True' },
        { id: 'opt_false', text: 'False' },
      ],
      correct_answer: 'opt_true',
    },
    {
      type: 'short_answer',
      prompt: 'Name the planet we live on.',
      points: 2,
      correct_answer: ['Earth', 'the Earth'],
    },
    {
      type: 'essay',
      prompt: 'Explain why we have seasons.',
      points: 5,
      rubric: 'Axial tilt and orbit.',
      explanation: 'Earth’s axis is tilted.',
    },
  ];
  const questions = [];
  for (const definition of definitions)
    questions.push(
      await post(
        '/questions',
        { quiz_id: quiz.id, ...definition },
        teacher.token,
      ),
    );
  check(questions.length === 4, 'Teacher creates all four question types');
  await post('/quizzes/' + quiz.id + '/publish', {}, teacher.token);
  const preview = await request(
    '/quizzes/code/' + quiz.access_code,
    student.token,
  );
  check(
    preview.title === quiz.title &&
      !JSON.stringify(preview).includes('correct_answer'),
    'Published code opens instructions without answer keys',
  );
  await post(
    '/attempts/start',
    { access_code: 'BADCODE123' },
    student.token,
    404,
  );
  check(true, 'Invalid access code rejected');
  await request('/quizzes/' + quiz.id, otherTeacher.token, 'GET', undefined, 403);
  await request('/quizzes', student.token, 'GET', undefined, 403);
  check(true, 'Teacher ownership and student role restrictions');
  const context = await post(
      '/attempts/start',
      { access_code: quiz.access_code },
      student.token,
    ),
    id = context.attempt.id;
  check(
    context.questions.length === 4 &&
      context.questions.every(
        (q) => !('correct_answer' in q) && !('rubric' in q),
      ),
    'Attempt contains all questions without private grading data',
  );
  const responses = [
    'four',
    'opt_true',
    '  EARTH  ',
    'Seasons occur because Earth’s axis tilts as it orbits the Sun.',
  ];
  for (let i = 0; i < questions.length; i++)
    await post(
      `/answers/${id}/save`,
      { question_id: questions[i].id, answer: responses[i] },
      student.token,
    );
  await post(
    `/answers/${id}/save`,
    { question_id: questions[0].id, answer: responses[0] },
    student.token,
  );
  check(
    (await request(`/answers/${id}`, teacher.token)).length === 4,
    'Repeated autosave updates answers without duplicate records',
  );
  await stop();
  await start();
  const resumed = await post(
    '/attempts/start',
    { access_code: quiz.access_code },
    student.token,
  );
  check(
    resumed.isResumed &&
      resumed.attempt.id === id &&
      resumed.attempt.deadline_at === context.attempt.deadline_at &&
      Object.keys(resumed.savedAnswers).length === 4 &&
      JSON.stringify(resumed.questions) === JSON.stringify(context.questions),
    'Restart restores login, same attempt, deadline, saved answers and ordering',
  );
  await request('/questions/' + questions[0].id, teacher.token, 'PUT', {
    prompt: 'Edited after start',
    correct_answer: 'five',
  });
  await post('/quizzes/' + quiz.id + '/publish', {}, teacher.token);
  const frozen = await post(
    '/attempts/start',
    { access_code: quiz.access_code },
    student.token,
  );
  check(
    frozen.questions.find((q) => q.id === questions[0].id).prompt ===
      'Two plus two?',
    'Later publishing preserves the student’s assigned questions',
  );
  const submissions = await Promise.all([
    post(`/attempts/${id}/submit`, {}, student.token),
    post(`/attempts/${id}/submit`, {}, student.token),
  ]);
  check(
    submissions.every((a) => a.id === id && a.status === 'submitted'),
    'Concurrent manual submissions finalize one attempt',
  );
  const hidden = await request(`/attempts/${id}/result`, student.token);
  check(
    hidden.attempt.score === null &&
      hidden.breakdown.every(
        (q) => q.correct_answer == null && q.score_awarded == null,
      ) &&
      hidden.receipt.answeredCount === 4,
    'Submission receipt preserves four answers while scores and keys remain hidden',
  );
  const objective = await request('/attempts/' + id, teacher.token);
  check(
    objective.score === 5 && !objective.is_graded,
    'All objective types grade automatically using frozen answers; essay awaits teacher',
  );
  await post(
    '/attempts/start',
    { access_code: quiz.access_code },
    student.token,
    409,
  );
  check(true, 'Completed attempt counts toward attempt limit');
  const answers = await request('/answers/' + id, teacher.token),
    essay = answers.find((a) => a.question_id === questions[3].id);
  await post(
    '/grading/answer/' + essay.id,
    {
      score_awarded: 4,
      teacher_feedback: 'Clear explanation; include an example.',
    },
    teacher.token,
  );
  const graded = await request('/attempts/' + id, teacher.token);
  check(
    graded.score === 9 && graded.max_score === 10 && graded.is_graded,
    'Teacher grading recalculates final score and review status',
  );
  check(
    (await request(`/attempts/${id}/result`, student.token)).attempt.score ===
      null,
    'Completed manual grading does not release scores early',
  );
  await request('/quizzes/' + quiz.id, teacher.token, 'PUT', {
    release_scores_immediately: true,
  });
  const scores = await request(`/attempts/${id}/result`, student.token);
  check(
    scores.attempt.score === 9 &&
      scores.breakdown.every((q) => q.correct_answer == null),
    'Teacher releases scores independently from correct answers',
  );
  await request('/quizzes/' + quiz.id, teacher.token, 'PUT', {
    release_answers_immediately: true,
  });
  const review = await request(`/attempts/${id}/result`, student.token);
  check(
    review.breakdown.find((q) => q.question_id === questions[0].id)
      .student_answer === 'Four' &&
      review.breakdown.find((q) => q.question_id === questions[0].id)
        .correct_answer === 'Four' &&
      review.breakdown
        .find((q) => q.question_id === questions[3].id)
        .teacher_feedback.includes('Clear explanation'),
    'Student review shows readable choices, original key and teacher feedback',
  );
  const history = await request('/attempts/my', student.token);
  check(
    history.some((a) => a.id === id && a.score === 9),
    'Student dashboard receives released score',
  );
  const csv = await request(`/reports/quiz/${quiz.id}/csv`, teacher.token),
    stats = await request(`/reports/quiz/${quiz.id}/stats`, teacher.token);
  check(
    csv.includes('Flow student') && stats.completedCount === 1,
    'CSV export and quiz statistics include the completed student',
  );
  const feed = await request(`/monitoring/quiz/${quiz.id}/live`, teacher.token);
  check(
    JSON.stringify(feed).includes(id),
    'Teacher monitoring includes the completed attempt',
  );
  await post(`/attempts/${id}/submit`, {}, student.token);
  check(
    (await request('/attempts/' + id, teacher.token)).score === 9,
    'Repeated submission preserves manual grades',
  );
  await post(
    '/auth/logout',
    { refresh_token: student.refresh_token },
    student.token,
  );
  await request('/auth/me', student.token, 'GET', undefined, 401);
  check(true, 'Logout revokes student session');
  await writeFile(
    '.local/qa/reports/full-flow-check.json',
    JSON.stringify(
      {
        passed: true,
        verifiedAt: new Date().toISOString(),
        database: 'XAMPP MariaDB',
        checks: checks.length,
        scenarios: checks,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Full local flow: ${checks.length} checks passed.`);
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
