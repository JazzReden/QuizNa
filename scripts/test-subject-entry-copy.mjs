// This scenario is only allowed inside the disposable QA database wrapper.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID, randomBytes } from "node:crypto";
import { createConnection } from "mysql2/promise";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
if (!/^quizna_qa_[a-f0-9]{12}$/.test(process.env.MYSQL_DATABASE || ""))
  throw Error(
    "Run through npm run qa:mysql; this test refuses the application database.",
  );
const db = await createConnection({
  socketPath: process.env.MYSQL_SOCKET,
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});
const base = "http://127.0.0.1:3122/api",
  checks = [];
let child,
  logs = "";
const check = (value, name) => {
  assert.ok(value, name);
  checks.push(name);
  console.log("✓ " + name);
};
async function call(path, token, method = "GET", body, status = 200) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
const post = (path, token, body, status = 201) =>
  call(path, token, "POST", body, status);
try {
  child = spawn(process.execPath, ["dist/main.js"], {
    cwd: new URL("../backend/", import.meta.url),
    env: { ...process.env, PORT: "3122" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, "QA API starts");
  const suffix = randomUUID(),
    password = "QA-" + randomBytes(18).toString("hex");
  const account = async (role, label) =>
    post("/auth/register", null, {
      email: `${label}-${suffix}@example.test`,
      full_name: `QA ${label}`,
      password,
      role,
    });
  const teacher = await account("teacher", "teacher"),
    student = await account("student", "student"),
    other = await account("teacher", "other"),
    second = await account("student", "second");
  const t = teacher.token,
    s = student.token;
  const a = await post("/sections", t, { name: "QA Vincent " + suffix }),
    b = await post("/sections", t, { name: "QA Filomena " + suffix });
  const room = await post("/subjects", t, {
      name: "Research",
      class_section_id: a.id,
    }),
    target = await post("/subjects", t, {
      name: "Research",
      class_section_id: b.id,
    });
  const quiz = await post("/quizzes", t, {
    title: "QA code entry and copy",
    require_access_code: true,
    time_limit_minutes: 10,
    max_attempts: 1,
  });
  const objective = await post("/questions", t, {
    quiz_id: quiz.id,
    type: "mcq",
    prompt: "Choose A",
    points: 2,
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    correct_answer: "a",
  });
  const essay = await post("/questions", t, {
    quiz_id: quiz.id,
    type: "essay",
    prompt: "Explain",
    points: 3,
    rubric: "Clear and accurate reasoning",
  });
  const section = await post(`/sections/quiz/${quiz.id}/attach`, t, {
    class_section_id: a.id,
  });
  await post(`/subjects/${room.id}/quizzes`, t, { quiz_id: quiz.id });
  await post(`/quizzes/${quiz.id}/publish`, t, {});
  await Promise.all(
    Array.from({ length: 3 }, () =>
      post("/subjects/join", s, { code: room.access_code }),
    ),
  );
  const roster = await call(`/sections/${a.id}/students`, t);
  check(
    roster.filter((r) => r.email === student.profile.email).length === 1,
    "Repeated subject joining enrolls one roster entry",
  );
  const protectedQuiz = (await call(`/subjects/${room.id}`, s)).quizzes[0];
  check(
    protectedQuiz.require_access_code && !protectedQuiz.access_code,
    "Protected quiz does not reveal its entry code",
  );
  await call(`/subjects/${room.id}`, second.token, "GET", undefined, 403);
  await post(
    `/subjects/${room.id}/quizzes/${quiz.id}/enter`,
    s,
    { code: "WRONG" },
    403,
  );
  await post(`/subjects/${room.id}/quizzes/${quiz.id}/enter`, s, {
    code: section.access_code.toLowerCase(),
  });
  const [before] = await db.execute(
    "SELECT id FROM quiz_attempts WHERE quiz_id=?",
    [quiz.id],
  );
  check(
    before.length === 0,
    "Checking quiz code does not consume an attempt or start time",
  );
  const started = await post("/attempts/start", s, {
    access_code: section.access_code,
  });
  await post(`/answers/${started.attempt.id}/save`, s, {
    question_id: objective.id,
    answer: "a",
  });
  await post(`/answers/${started.attempt.id}/save`, s, {
    question_id: essay.id,
    answer: "Clear explanation",
  });
  const resumed = await post("/attempts/start", s, {
    access_code: section.access_code,
  });
  check(
    resumed.attempt.id === started.attempt.id &&
      resumed.attempt.deadline_at === started.attempt.deadline_at &&
      resumed.savedAnswers[essay.id] === "Clear explanation",
    "Reconnect restores the same deadline and saved written answer",
  );
  const submitted = await Promise.all([
    post(`/attempts/${started.attempt.id}/submit`, s, {}),
    post(`/attempts/${started.attempt.id}/submit`, s, {}),
  ]);
  check(
    submitted[0].id === started.attempt.id &&
      submitted[0].id === submitted[1].id,
    "Concurrent submissions return one result",
  );
  await post("/attempts/start", s, { access_code: section.access_code }, 409);
  check(
    (await call(`/subjects/${room.id}`, s)).quizzes[0].can_start === false,
    "Completed attempt limit disables further entry",
  );
  const answers = await call(`/answers/${started.attempt.id}`, t);
  await post(
    `/grading/answer/${answers.find((a) => a.question_id === essay.id).id}`,
    t,
    { score_awarded: 3 },
  );
  const graded = await call(`/attempts/${started.attempt.id}`, t);
  const confirmation = {
    expected_updated_at: graded.updated_at,
    expected_revision: graded.score_revision || 0,
  };
  check(
    (await call(`/reports/section/${a.id}/gradebook`, t)).rows[0].total ===
      null,
    "Graded but unconfirmed result does not count in totals",
  );
  await post(
    `/grading/attempt/${started.attempt.id}/confirm`,
    other.token,
    confirmation,
    403,
  );
  await post(`/grading/attempt/${started.attempt.id}/confirm`, t, confirmation);
  check(
    (await call(`/reports/section/${a.id}/gradebook`, t)).rows[0].total === 5,
    "Teacher confirmation adds the correct total",
  );
  check(
    (await call(`/attempts/${started.attempt.id}/result`, s)).attempt.score ===
      null,
    "Student score remains held until released",
  );
  await call(`/quizzes/${quiz.id}`, t, "PUT", {
    release_scores_immediately: true,
  });
  check(
    (await call(`/attempts/${started.attempt.id}/result`, s)).attempt.score ===
      5,
    "Teacher release reveals the confirmed score",
  );
  const request = { target_subject_id: target.id, request_id: randomUUID() };
  const copies = await Promise.all([
    post(`/quizzes/${quiz.id}/copy`, t, request),
    post(`/quizzes/${quiz.id}/copy`, t, request),
  ]);
  const copy = copies[0];
  check(
    copy.id === copies[1].id &&
      copy.status === "draft" &&
      !copy.release_scores_immediately,
    "Copy retries create one independent draft with scores held",
  );
  const copyQuestions = (await call(`/quizzes/${copy.id}`, t)).questions;
  check(
    copyQuestions.length === 2 &&
      copyQuestions.find((q) => q.type === "essay").rubric ===
        "Clear and accurate reasoning",
    "Copy retains questions, points and essay criteria",
  );
  const [copiedAttempts] = await db.execute(
    "SELECT id FROM quiz_attempts WHERE quiz_id=?",
    [copy.id],
  );
  check(copiedAttempts.length === 0, "Copy has no inherited submissions");
  await post(`/quizzes/${quiz.id}/copy`, s, request, 403);
  await post(`/quizzes/${quiz.id}/copy`, other.token, request, 403);
  await post(`/quizzes/${copy.id}/publish`, t, {});
  await post("/subjects/join", second.token, { code: target.access_code });
  await post(
    `/subjects/${target.id}/quizzes/${copy.id}/enter`,
    second.token,
    { code: section.access_code },
    403,
  );
  const copiedSection = (await call(`/subjects/${target.id}`, t)).quizzes.find(
    (q) => q.id === copy.id,
  );
  check(
    copiedSection.access_code !== section.access_code,
    "Copied quiz has a distinct section code",
  );
  await call(`/quizzes/${copy.id}`, t, "PUT", { require_access_code: false });
  check(
    (await call(`/subjects/${target.id}`, second.token)).quizzes[0]
      .access_code === copiedSection.access_code,
    "No-code option opens subject quizzes directly",
  );
  console.log(`Subject entry and copy QA passed: ${checks.length}`);
  await writeFile(
    "docs/QA_SUBJECT_ENTRY_COPY.json",
    JSON.stringify(
      {
        passed: true,
        checks: checks.length,
        scenarios: checks,
        disposableQaDatabase: true,
      },
      null,
      2,
    ),
  );
} finally {
  if (child && child.exitCode === null) {
    const ended = once(child, "exit");
    child.kill("SIGTERM");
    await ended;
  }
  await db.end();
}
