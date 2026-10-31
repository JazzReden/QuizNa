import "./qa-report-directory.mjs";
// Explicit integration test against the configured local XAMPP database.
// Creates one uniquely named fixture quiz and deletes only that fixture afterward.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { config } from "dotenv";
import { createConnection } from "mysql2/promise";
import { writeFile } from "node:fs/promises";
config({ path: "backend/.env" });
if (
  process.env.DATABASE_MODE !== "mysql" ||
  process.env.DEMO_MODE !== "true" ||
  process.env.NODE_ENV === "production"
)
  throw new Error(
    "This integration test requires an explicitly configured local MySQL demo",
  );
const port = 3110,
  base = `http://127.0.0.1:${port}/api`;
let child,
  quiz,
  log = "",
  checks = 0;
const fixtureUsers = [];
const check = (value, label) => {
  assert.ok(value, label);
  checks++;
  console.log(`✓ ${label}`);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const request = async (path, token, method = "GET", data, status = 200) => {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const value = await response.json();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(value)}`,
  );
  return value;
};
const start = async () => {
  log = "";
  child = spawn(process.execPath, ["dist/main.js"], {
    cwd: new URL("../backend/", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "development",
      DEMO_MODE: "true",
      DATABASE_MODE: "mysql",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => {
    log += data;
  });
  child.stderr.on("data", (data) => {
    log += data;
  });
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(base + "/health");
      if (response.ok) {
        const body = await response.json();
        check(
          body.status === "ok" && body.service === "QuizNa Backend API",
          "Compiled API starts without exposing database internals",
        );
        return;
      }
    } catch {}
    if (child.exitCode !== null) break;
    await wait(100);
  }
  throw new Error("Local API failed to start: " + log);
};
const stop = async () => {
  if (child && child.exitCode === null) {
    const ended = once(child, "exit");
    child.kill("SIGTERM");
    await ended;
  }
  child = null;
};
const database = await createConnection({
  socketPath: process.env.MYSQL_SOCKET || undefined,
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});
try {
  await start();
  const suffix = randomUUID(),
    password = "Persistence-" + randomBytes(18).toString("hex");
  const account = async (role, label) => {
    const session = await request(
      "/auth/register",
      null,
      "POST",
      {
        email: `${label}-${suffix}@example.test`,
        full_name: `Persistence ${label}`,
        password,
        role,
      },
      201,
    );
    fixtureUsers.push(session.profile.id);
    return session.token;
  };
  const teacher = await account("teacher", "teacher"),
    student = await account("student", "student");
  const [seedRows] = await database.execute(
    "SELECT created_at FROM profiles WHERE id=?",
    ["a0000000-0000-0000-0000-000000000001"],
  );
  const seeded = seedRows[0];
  quiz = await request(
    "/quizzes",
    teacher,
    "POST",
    {
      title: `Persistence verification ${randomUUID()}`,
      time_limit_minutes: 10,
    },
    201,
  );
  const question = await request(
    "/questions",
    teacher,
    "POST",
    {
      quiz_id: quiz.id,
      type: "mcq",
      prompt: "Persistent answer check?",
      points: 2,
      options: [
        { id: "a", text: "Saved" },
        { id: "b", text: "Lost" },
      ],
      correct_answer: "a",
    },
    201,
  );
  const essay = await request(
    "/questions",
    teacher,
    "POST",
    {
      quiz_id: quiz.id,
      type: "essay",
      prompt: "Explain persistence.",
      points: 3,
    },
    201,
  );
  await request(`/quizzes/${quiz.id}/publish`, teacher, "POST", {}, 201);
  const started = await Promise.all(
    Array.from({ length: 4 }, () =>
      request(
        "/attempts/start",
        student,
        "POST",
        { access_code: quiz.access_code },
        201,
      ),
    ),
  );
  const attempt = started[0].attempt;
  check(
    started.every((context) => context.attempt.id === attempt.id),
    "Concurrent local starts create exactly one attempt",
  );
  await request(
    `/answers/${attempt.id}/save`,
    student,
    "POST",
    { question_id: question.id, answer: "a" },
    201,
  );
  await request(
    `/answers/${attempt.id}/save`,
    student,
    "POST",
    { question_id: essay.id, answer: "Saved in XAMPP" },
    201,
  );
  // Fixture clock adjustment avoids sleeping through the initial fullscreen grace window.
  await database.execute("UPDATE quiz_attempts SET started_at=? WHERE id=?", [
    new Date(Date.now() - 10000).toISOString(),
    attempt.id,
  ]);
  const warning = await request(
    `/monitoring/${attempt.id}/incident`,
    student,
    "POST",
    { incident_type: "tab_hidden" },
    201,
  );
  check(warning.warning_number === 1, "First warning saved in MariaDB");
  await request(`/questions/${question.id}`, teacher, "PUT", {
    prompt: "Edited draft",
    correct_answer: "b",
    points: 99,
  });
  const before = await request(
    "/attempts/start",
    student,
    "POST",
    { access_code: quiz.access_code },
    201,
  );
  check(
    before.savedAnswers[question.id] === "a",
    "Saved answer readable before restart",
  );
  await stop();
  await start();
  const after = await request(
    "/attempts/start",
    student,
    "POST",
    { access_code: quiz.access_code },
    201,
  );
  check(
    after.isResumed && after.attempt.id === attempt.id,
    "Actual backend restart restores the same attempt",
  );
  check(
    after.attempt.deadline_at === attempt.deadline_at,
    "Restart does not reset the deadline",
  );
  check(after.attempt.warning_count === 1, "Restart does not reset warnings");
  check(
    after.savedAnswers[question.id] === "a" &&
      after.savedAnswers[essay.id] === "Saved in XAMPP",
    "Objective and written responses survive restart",
  );
  check(
    after.questions.find((q) => q.id === question.id).prompt ===
      "Persistent answer check?",
    "Frozen quiz survives draft edits and backend restart",
  );
  const restoredQuiz = await request(`/quizzes/${quiz.id}`, teacher);
  check(
    restoredQuiz.questions.find((q) => q.id === question.id).prompt ===
      "Edited draft",
    "Teacher draft edits persist separately",
  );
  const [seedAfter] = await database.execute(
    "SELECT created_at FROM profiles WHERE id=?",
    ["a0000000-0000-0000-0000-000000000001"],
  );
  check(
    seedAfter[0]?.created_at === seeded?.created_at,
    "Restart does not overwrite seeded profiles",
  );
  // Persisted incident deduplication also survives a fresh monitoring service.
  const duplicate = await request(
    `/monitoring/${attempt.id}/incident`,
    student,
    "POST",
    { incident_type: "window_blur" },
    201,
  );
  check(
    duplicate.deduplicated && duplicate.warning_number === 1,
    "Related events are deduplicated after process restart",
  );
  await wait(2100);
  await request(
    `/monitoring/${attempt.id}/incident`,
    student,
    "POST",
    { incident_type: "tab_hidden" },
    201,
  );
  await wait(2100);
  const third = await request(
    `/monitoring/${attempt.id}/incident`,
    student,
    "POST",
    { incident_type: "fullscreen_exit" },
    201,
  );
  check(
    third.action_taken === "terminated",
    "Third persisted incident finalizes the attempt",
  );
  const result = await request(`/attempts/${attempt.id}/result`, student);
  check(
    result.receipt.answeredCount === 2 && result.attempt.score === null,
    "Saved responses are preserved and score stays private",
  );
  const gradedAttempt = await request(`/attempts/${attempt.id}`, teacher);
  check(
    gradedAttempt.score === 2,
    "Objective grading uses the frozen answer key in MariaDB",
  );
  const answers = await request(`/answers/${attempt.id}`, teacher);
  await request(
    `/grading/answer/${answers.find((a) => a.question_id === essay.id).id}`,
    teacher,
    "POST",
    { score_awarded: 3, teacher_feedback: "Persisted feedback" },
    201,
  );
  await request(`/quizzes/${quiz.id}`, teacher, "PUT", {
    release_scores_immediately: true,
  });
  check(
    (await request(`/attempts/${attempt.id}/result`, student)).attempt.score ===
      5,
    "Manual grading and score release work with persistent data",
  );
  // Explicit transaction rollback: a temporary title must not survive a failed business operation.
  const { MysqlLocalStore } =
    await import("../backend/dist/database/mysql-local.store.js");
  const { ConfigService } = await import("@nestjs/config");
  const repository = new MysqlLocalStore(new ConfigService());
  try {
    await assert.rejects(
      repository.transaction(async () => {
        const record = await repository.get("quizzes", quiz.id);
        await repository.put("quizzes", {
          ...record,
          title: "Uncommitted test title",
        });
        throw new Error("Simulated failure after write");
      }),
      /Local database operation failed/,
    );
  } finally {
    await repository.close();
  }
  check(
    (await request(`/quizzes/${quiz.id}`, teacher)).title === quiz.title,
    "Adapter rolls back failed multi-step writes",
  );
  const secondStudent = await account("student", "second-student");
  const secondAttempt = (
    await request(
      "/attempts/start",
      secondStudent,
      "POST",
      { access_code: quiz.access_code },
      201,
    )
  ).attempt;
  await request(
    `/answers/${secondAttempt.id}/save`,
    secondStudent,
    "POST",
    { question_id: question.id, answer: "a" },
    201,
  );
  await database.execute("UPDATE quiz_attempts SET deadline_at=? WHERE id=?", [
    new Date(Date.now() - 1000).toISOString(),
    secondAttempt.id,
  ]);
  const expiredSave = await request(
    `/answers/${secondAttempt.id}/save`,
    secondStudent,
    "POST",
    { question_id: question.id, answer: "b" },
    201,
  );
  check(
    expiredSave.status === "closed" &&
      (await request(`/attempts/${secondAttempt.id}`, teacher)).status ===
        "timed_out",
    "Rejected expired save commits finalization instead of rolling it back",
  );
  check(
    (await request(`/answers/${secondAttempt.id}`, teacher)).find(
      (a) => a.question_id === question.id,
    ).answer === "a",
    "Late saves preserve the earlier stored answer",
  );
  await request(`/quizzes/${quiz.id}`, teacher, "PUT", { max_attempts: 2 });
  const thirdAttempt = (
    await request(
      "/attempts/start",
      secondStudent,
      "POST",
      { access_code: quiz.access_code },
      201,
    )
  ).attempt;
  await database.execute("UPDATE quiz_attempts SET deadline_at=? WHERE id=?", [
    new Date(Date.now() - 1000).toISOString(),
    thirdAttempt.id,
  ]);
  const expiredResume = await request(
    "/attempts/start",
    secondStudent,
    "POST",
    { access_code: quiz.access_code },
    201,
  );
  check(
    expiredResume.attempt.status === "timed_out" &&
      (await request(`/attempts/${thirdAttempt.id}`, teacher)).status ===
        "timed_out",
    "Expired reconnect commits finalization",
  );
  await request(
    "/attempts/start",
    secondStudent,
    "POST",
    { access_code: quiz.access_code },
    409,
  );
  check(true, "Expired attempts still consume the configured attempt limit");
  console.log(`MySQL persistence checks passed: ${checks}`);
  await writeFile(
    ".local/qa/reports/mysql-persistence-check.json",
    JSON.stringify(
      {
        database: process.env.MYSQL_DATABASE,
        checks,
        passed: true,
        verifiedAt: new Date().toISOString(),
        backendRestartVerified: true,
      },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await stop();
  if (quiz) {
    await database.execute("DELETE FROM quizzes WHERE id=?", [quiz.id]);
  }
  for (const id of fixtureUsers)
    await database.execute("DELETE FROM profiles WHERE id=?", [id]);
  await database.end();
}
