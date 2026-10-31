import "./qa-report-directory.mjs";
// End-to-end API test against real XAMPP using disposable accounts only.
import { studentLastName } from "../backend/dist/modules/reports/student-name.js";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { config } from "dotenv";
import { createConnection } from "mysql2/promise";
import assert from "node:assert/strict";
config({ path: "backend/.env" });
if (
  process.env.DATABASE_MODE !== "mysql" ||
  process.env.DEMO_MODE !== "true" ||
  process.env.NODE_ENV === "production"
)
  throw Error("Use local XAMPP development mode for this test.");
const db = await createConnection({
  socketPath: process.env.MYSQL_SOCKET || undefined,
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});
const ids = [],
  quizzes = [],
  checks = [],
  base = "http://127.0.0.1:3118/api";
let browserFixture;
let child,
  logs = "";
const check = (value, label) => {
  assert.ok(value, label);
  checks.push(label);
  console.log("✓ " + label);
};
async function request(path, token, method = "GET", body, status = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = response.headers.get("content-type")?.includes("json")
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
  request(path, token, "POST", body, status);
async function start() {
  logs = "";
  child = spawn(process.execPath, ["dist/main.js"], {
    cwd: new URL("../backend/", import.meta.url),
    env: { ...process.env, PORT: "3118", NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (v) => (logs += v));
  child.stderr.on("data", (v) => (logs += v));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health")).ok) return;
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(logs);
}
async function stop() {
  if (child && child.exitCode === null) {
    const done = once(child, "exit");
    child.kill("SIGTERM");
    await done;
  }
  child = null;
}
try {
  await start();
  const suffix = randomUUID(),
    password = "Section-" + randomBytes(18).toString("hex");
  async function account(role, name) {
    const session = await post("/auth/register", {
      email: `section-${name.toLowerCase().replaceAll(" ", "-")}-${suffix}@example.test`,
      full_name: name,
      role,
      password,
    });
    ids.push(session.profile.id);
    return session;
  }
  const teacher = await account("teacher", "Section Teacher"),
    alice = await account("student", "Alice Reyes"),
    bob = await account("student", "Bob Cruz"),
    cara = await account("student", "Cara Santos"),
    dina = await account("student", "Dina Torres"),
    eli = await account("student", "Eli Flores"),
    otherTeacher = await account("teacher", "Other Teacher");
  browserFixture = { teacher, alice, password };
  const quiz = await post(
    "/quizzes",
    {
      title: "Section leaderboard fixture",
      time_limit_minutes: 10,
      max_attempts: 2,
    },
    teacher.token,
  );
  quizzes.push(quiz.id);
  const mcq = await post(
    "/questions",
    {
      quiz_id: quiz.id,
      type: "mcq",
      prompt: "Choose the correct answer.",
      points: 5,
      options: [
        { id: "yes", text: "Correct" },
        { id: "no", text: "Incorrect" },
      ],
      correct_answer: "yes",
    },
    teacher.token,
  );
  const essay = await post(
    "/questions",
    { quiz_id: quiz.id, type: "essay", prompt: "Explain.", points: 5 },
    teacher.token,
  );
  await post(`/quizzes/${quiz.id}/publish`, {}, teacher.token);
  const a = await post(
      `/sections/quiz/${quiz.id}`,
      { name: "STEM A" },
      teacher.token,
    ),
    b = await post(
      `/sections/quiz/${quiz.id}`,
      { name: "STEM B" },
      teacher.token,
    );
  check(
    a.access_code !== b.access_code && a.access_code.startsWith("S-"),
    "Each section has its own distinct quiz access code",
  );
  await post(
    `/sections/quiz/${quiz.id}`,
    { name: "stem a" },
    teacher.token,
    409,
  );
  await post(
    `/sections/quiz/${quiz.id}`,
    { name: "Forbidden" },
    alice.token,
    403,
  );
  await request(
    `/sections/quiz/${quiz.id}`,
    otherTeacher.token,
    "GET",
    undefined,
    403,
  );
  check(
    true,
    "Duplicate section names and unauthorized section access are rejected",
  );
  await post(
    `/sections/quiz/${quiz.id}`,
    { name: "STÉM A" },
    teacher.token,
    409,
  );
  const unchanged = await request(`/sections/quiz/${quiz.id}`, teacher.token);
  check(
    unchanged.some(
      (s) =>
        s.id === a.id && s.name === "STEM A" && s.access_code === a.access_code,
    ),
    "Collation-equivalent names cannot overwrite an existing section or code",
  );
  const preview = await request(
    `/quizzes/code/${a.access_code.toLowerCase()}`,
    alice.token,
  );
  check(
    preview.section_name === "STEM A" && preview.question_count === 2,
    "Student briefing recognizes the section code without exposing keys",
  );
  async function submit(student, code, correct = true) {
    const context = await post(
      "/attempts/start",
      { access_code: code },
      student.token,
    );
    await post(
      `/answers/${context.attempt.id}/save`,
      { question_id: mcq.id, answer: correct ? "yes" : "no" },
      student.token,
    );
    await post(
      `/answers/${context.attempt.id}/save`,
      { question_id: essay.id, answer: "Written fixture response." },
      student.token,
    );
    await post(`/attempts/${context.attempt.id}/submit`, {}, student.token);
    return context;
  }
  async function grade(context, points) {
    const answers = await request(
      `/answers/${context.attempt.id}`,
      teacher.token,
    );
    await post(
      `/grading/answer/${answers.find((r) => r.question_id === essay.id).id}`,
      { score_awarded: points },
      teacher.token,
    );
    const graded = await request(`/attempts/${context.attempt.id}`, teacher.token);
    await post(`/grading/attempt/${context.attempt.id}/confirm`, {expected_updated_at:graded.updated_at,expected_revision:graded.score_revision || 0}, teacher.token);
  }
  const al = await submit(alice, a.access_code),
    bo = await submit(bob, a.access_code),
    ca = await submit(cara, b.access_code, false),
    di = await submit(dina, quiz.access_code);
  await grade(al, 5);
  await grade(bo, 5);
  await grade(ca, 3);
  let board = await request(
    `/reports/quiz/${quiz.id}/leaderboard`,
    teacher.token,
  );
  check(
    board.rows.length === 4 &&
      board.rows.map((r) => r.rank).join(",") === "1,1,3,",
    "Leaderboard shares tied ranks and keeps ungraded submissions unranked",
  );
  check(
    board.rows.find((r) => r.studentId === alice.profile.id).score === 10 &&
      board.rows.find((r) => r.studentId === dina.profile.id).sectionName ===
        "Unassigned",
    "Final scores and legacy unassigned submissions appear correctly",
  );
  const filtered = await request(
    `/reports/quiz/${quiz.id}/leaderboard?section_id=${b.id}`,
    teacher.token,
  );
  check(
    filtered.rows.length === 1 &&
      filtered.rows[0].studentName === "Cara Santos" &&
      filtered.rows[0].rank === 1,
    "Section filter isolates students and ranks within their section",
  );
  await request(
    `/reports/quiz/${quiz.id}/leaderboard`,
    alice.token,
    "GET",
    undefined,
    403,
  );
  await request(
    `/reports/quiz/${quiz.id}/leaderboard`,
    otherTeacher.token,
    "GET",
    undefined,
    403,
  );
  check(true, "Leaderboard is private to the owning teacher");
  await post(
    "/attempts/start",
    { access_code: b.access_code },
    alice.token,
    409,
  );
  await post(
    "/attempts/start",
    { access_code: quiz.access_code },
    alice.token,
    409,
  );
  check(
    true,
    "Changing codes cannot move sections or bypass quiz attempt limits",
  );
  const active = await post(
    "/attempts/start",
    { access_code: a.access_code },
    alice.token,
  );
  await request(
    `/sections/attempt/${active.attempt.id}`,
    teacher.token,
    "PUT",
    { section_id: b.id },
    400,
  );
  check(true, "Section corrections cannot change active quiz records");
  const history = await request("/attempts/my", alice.token);
  check(
    history.every(
      (r) =>
        r.quiz.access_code === a.access_code && r.section_name === "STEM A",
    ),
    "Student history retains the section code needed to resume",
  );
  await stop();
  await start();
  const resumed = await post(
    "/attempts/start",
    { access_code: a.access_code },
    alice.token,
  );
  check(
    resumed.attempt.id === active.attempt.id &&
      resumed.attempt.deadline_at === active.attempt.deadline_at &&
      resumed.section_name === "STEM A",
    "Section, deadline and attempt survive an actual API restart",
  );
  await post(`/attempts/${active.attempt.id}/submit`, {}, alice.token);
  board = await request(`/reports/quiz/${quiz.id}/leaderboard`, teacher.token);
  const row = board.rows.find((r) => r.studentId === alice.profile.id);
  check(
    row.score === 10 &&
      row.attemptCount === 2 &&
      row.pendingAttempts === 1 &&
      row.reviewAttemptId === active.attempt.id,
    "Retakes do not duplicate students or replace their best fully graded score",
  );
  await post(
    "/attempts/start",
    { access_code: a.access_code },
    alice.token,
    409,
  );
  check(
    true,
    "Section attempts still enforce the original per-quiz attempt limit",
  );
  const before = await request(`/attempts/${di.attempt.id}`, teacher.token);
  await request(`/sections/attempt/${di.attempt.id}`, teacher.token, "PUT", {
    section_id: b.id,
  });
  const after = await request(`/attempts/${di.attempt.id}`, teacher.token);
  check(
    after.section_id === b.id &&
      after.score === before.score &&
      after.warning_count === before.warning_count,
    "Teacher can organize old submissions without changing grades or warnings",
  );
  await request(
    `/sections/attempt/${di.attempt.id}`,
    otherTeacher.token,
    "PUT",
    { section_id: a.id },
    403,
  );
  check(true, "Other teachers cannot reassign student records");
  const other = await post(
    "/quizzes",
    { title: "Other fixture" },
    teacher.token,
  );
  quizzes.push(other.id);
  const foreign = await post(
    `/sections/quiz/${other.id}`,
    { name: "Other section" },
    teacher.token,
  );
  await request(
    `/sections/attempt/${di.attempt.id}`,
    teacher.token,
    "PUT",
    { section_id: foreign.id },
    400,
  );
  await request(
    `/reports/quiz/${quiz.id}/leaderboard?section_id=${foreign.id}`,
    teacher.token,
    "GET",
    undefined,
    400,
  );
  check(true, "Sections cannot be mixed between quizzes");
  const csv = await request(
    `/reports/quiz/${quiz.id}/scorebook.csv?section_id=${b.id}`,
    teacher.token,
  );
  check(
    csv.includes("Section") &&
      csv.includes("STEM B") &&
      csv.includes("Cara Santos") &&
      csv.includes("Dina Torres") &&
      !csv.includes("Alice Reyes"),
    "Section CSV contains only the selected class and one record per student",
  );
  const raw = await request(`/reports/quiz/${quiz.id}/csv`, teacher.token);
  check(
    raw.includes('"Section"') && raw.includes("STEM A"),
    "Detailed results CSV also identifies student sections",
  );
  const detailedSection = await request(
    `/reports/quiz/${quiz.id}/csv?section_id=${b.id}`,
    teacher.token,
  );
  check(
    detailedSection.includes("Cara Santos") &&
      detailedSection.includes("Dina Torres") &&
      !detailedSection.includes("Alice Reyes") &&
      !detailedSection.includes("Bob Cruz"),
    "Detailed CSV honors the selected section",
  );
  const allScores = await request(
    `/reports/quiz/${quiz.id}/scorebook.csv`,
    teacher.token,
  );
  const csvRows = (csv) =>
    csv
      .split("\n")
      .slice(1)
      .filter(Boolean)
      .map((line) =>
        [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map((match) =>
          match[1].replaceAll('""', '"'),
        ),
      );
  for (const [label, csv] of [
    ["Scorebook", allScores],
    ["Detailed", raw],
  ]) {
    const names = csvRows(csv).map((row) => [row[3], row[1]]);
    const sorted = names.slice().sort(
      (a, b) =>
        a[0].localeCompare(b[0], "en", {
          sensitivity: "base",
          numeric: true,
        }) ||
        studentLastName(a[1]).localeCompare(studentLastName(b[1]), "en", {
          sensitivity: "base",
          numeric: true,
        }),
    );
    check(
      JSON.stringify(names) === JSON.stringify(sorted),
      `${label} CSV groups sections and sorts student last names A–Z`,
    );
  }
  await request(
    `/reports/quiz/${quiz.id}/csv?section_id=${foreign.id}`,
    teacher.token,
    "GET",
    undefined,
    400,
  );
  await request(
    `/reports/quiz/${quiz.id}/csv?section_id=${b.id}`,
    otherTeacher.token,
    "GET",
    undefined,
    403,
  );
  await request(
    `/reports/quiz/${quiz.id}/csv?section_id=${b.id}`,
    alice.token,
    "GET",
    undefined,
    403,
  );
  check(
    true,
    "Detailed section exports reject foreign sections, other teachers, and students",
  );
  const responses = await Promise.all(
    [a, b].map((section) =>
      fetch(base + "/attempts/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${eli.token}`,
        },
        body: JSON.stringify({ access_code: section.access_code }),
      }),
    ),
  );
  check(
    responses
      .map((r) => r.status)
      .sort()
      .join(",") === "201,409",
    "Simultaneous joins with different section codes create exactly one active attempt",
  );
  const winningSection = responses.findIndex(r => r.status === 201) === 0 ? a : b;
  const losingSection = winningSection.id === a.id ? b : a;
  const autoRoster = await request(`/sections/${winningSection.class_section_id}/students`, teacher.token);
  check(autoRoster.filter(r => r.email === eli.profile.email).length === 1, "A successful section-code start automatically enrolls exactly one roster member");
  const rejectedRoster = await request(`/sections/${losingSection.class_section_id}/students`, teacher.token);
  check(!rejectedRoster.some(r => r.email === eli.profile.email), "A rejected simultaneous start does not enroll a student in the other section");
  await Promise.all([post("/attempts/start", { access_code: winningSection.access_code }, eli.token), post("/attempts/start", { access_code: winningSection.access_code }, eli.token)]);
  check((await request(`/sections/${winningSection.class_section_id}/students`, teacher.token)).filter(r => r.email === eli.profile.email).length === 1, "Concurrent reconnects do not duplicate roster members");
  board = await request(`/reports/quiz/${quiz.id}/leaderboard`, teacher.token);
  check(
    !board.rows.some((r) => r.studentId === eli.profile.id),
    "Students still answering are not shown as ranked submissions",
  );
  const library = await request("/sections", teacher.token);
  check(
    library.some((c) => c.id === a.class_section_id),
    "Existing quiz sections are reusable teacher-owned sections",
  );
  const reused = await post(
    `/sections/quiz/${other.id}/attach`,
    { class_section_id: a.class_section_id },
    teacher.token,
  );
  const repeated = await post(
    `/sections/quiz/${other.id}/attach`,
    { class_section_id: a.class_section_id },
    teacher.token,
  );
  check(
    reused.id === repeated.id && reused.access_code !== a.access_code,
    "Same section reuses its roster across quizzes with stable distinct quiz codes",
  );
  const missingEmail = `future-${suffix}@example.test`;
  const rosterInput = [alice, bob, eli].map((s) => ({
    full_name: s.profile.full_name,
    email: s.profile.email,
  }));
  rosterInput.push({ full_name: "Zoe Missing", email: missingEmail });
  await post(
    `/sections/${a.class_section_id}/students`,
    { students: rosterInput },
    teacher.token,
  );
  const enrolled = await post(
    `/sections/${a.class_section_id}/students`,
    {
      students: rosterInput.map((s) => ({
        ...s,
        email: s.email.toUpperCase(),
      })),
    },
    teacher.token,
  );
  check(
    enrolled.length === 4,
    "Roster imports normalize email and are safe to retry without duplicate students",
  );
  await post(
    `/sections/${a.class_section_id}/students`,
    {
      students: [
        { full_name: "Valid", email: "valid@example.test" },
        { full_name: "", email: "invalid@example.test" },
      ],
    },
    teacher.token,
    400,
  );
  check(
    (await request(`/sections/${a.class_section_id}/students`, teacher.token))
      .length === 4,
    "Invalid roster batches cannot partially save",
  );
  await request(
    `/sections/${a.class_section_id}/students`,
    otherTeacher.token,
    "GET",
    undefined,
    403,
  );
  await request("/sections", alice.token, "GET", undefined, 403);
  await post("/sections", { name: "Forbidden" }, alice.token, 403);
  await post(
    `/sections/quiz/${quiz.id}/attach`,
    { class_section_id: foreign.class_section_id },
    otherTeacher.token,
    403,
  );
  check(
    true,
    "Students and other teachers cannot read or change private rosters or attach foreign sections",
  );
  let progress = await request(
    `/reports/quiz/${quiz.id}/class-list?section_id=${a.id}`,
    teacher.token,
  );
  check(
    progress.rows.some(
      (r) =>
        r.studentEmail === missingEmail &&
        r.participation === "not_started" &&
        r.score === null,
    ),
    "Expected students without accounts appear as Not started with no invented score",
  );
  check(
    progress.rows.some(
      (r) =>
        r.studentId === alice.profile.id && r.participation === "submitted",
    ),
    "Submitted students are matched to their roster by account email",
  );
  const eliAttempt = await post(
    "/attempts/start",
    {
      access_code:
        responses.findIndex((r) => r.status === 201) === 0
          ? a.access_code
          : b.access_code,
    },
    eli.token,
  );
  const eliSection = eliAttempt.attempt.section_id;
  if (eliSection === a.id)
    check(
      progress.rows.some(
        (r) =>
          r.studentId === eli.profile.id && r.participation === "in_progress",
      ),
      "Live attempts appear as In progress",
    );
  else {
    const eliProgress = await request(
      `/reports/quiz/${quiz.id}/class-list?section_id=${b.id}`,
      teacher.token,
    );
    check(
      eliProgress.rows.some(
        (r) =>
          r.studentId === eli.profile.id && r.participation === "in_progress",
      ),
      "Live attempts outside the roster remain visible as In progress",
    );
  }
  const nextProgress = await request(
    `/reports/quiz/${other.id}/class-list?section_id=${reused.id}`,
    teacher.token,
  );
  check(
    nextProgress.summary.not_started === 4 &&
      nextProgress.summary.submitted === 0,
    "A new quiz reuses its section roster without copying old submission status",
  );
  const rosterCsv = await request(
    `/reports/quiz/${quiz.id}/scorebook.csv?section_id=${a.id}`,
    teacher.token,
  );
  check(
    rosterCsv.includes("Zoe Missing") &&
      rosterCsv.includes("Not started") &&
      rosterCsv.includes("Submission status"),
    "Class record export includes expected students and participation status",
  );
  // Reset the isolated test server's export limiter before checking each filter.
  await stop();
  await start();
  const expectedStatuses = await request(`/reports/quiz/${quiz.id}/class-list?section_id=${a.id}`, teacher.token);
  for (const status of ["submitted", "in_progress", "not_started"]) {
    const expected = expectedStatuses.rows.filter((r) => r.participation === status);
    const filtered = csvRows(await request(`/reports/quiz/${quiz.id}/scorebook.csv?section_id=${a.id}&status=${status}`, teacher.token));
    assert.deepEqual(filtered.map((r) => r[2]), expected.map((r) => r.studentEmail));
    check(true, `${status} score CSV matches the section class list in last-name order`);
  }
  const activeCsv = csvRows(await request(`/reports/quiz/${quiz.id}/csv?section_id=${eliSection}&status=in_progress`, teacher.token));
  check(activeCsv.length > 0 && activeCsv.every((r) => r[4] === "in_progress"), "Detailed In progress CSV exports only active attempts in the selected section");
  const submittedCsv = csvRows(await request(`/reports/quiz/${quiz.id}/csv?section_id=${a.id}&status=submitted`, teacher.token));
  check(submittedCsv.length > 0 && submittedCsv.every((r) => r[4] !== "in_progress"), "Detailed Submitted CSV exports only finalized attempts");
  for (const endpoint of ["scorebook.csv", "csv"]) {
    await request(`/reports/quiz/${quiz.id}/${endpoint}?status=invalid`, teacher.token, "GET", undefined, 400);
    await request(`/reports/quiz/${quiz.id}/${endpoint}?status=not_started`, alice.token, "GET", undefined, 403);
    await request(`/reports/quiz/${quiz.id}/${endpoint}?status=not_started`, otherTeacher.token, "GET", undefined, 403);
  }
  check(true, "Filtered CSV endpoints reject invalid statuses, students and other teachers");
  await stop();
  await start();
  progress = await request(
    `/reports/quiz/${quiz.id}/class-list?section_id=${a.id}`,
    teacher.token,
  );
  check(
    progress.rows.some(
      (r) =>
        r.studentEmail === missingEmail && r.participation === "not_started",
    ),
    "Reusable sections, roster and participation survive an API restart",
  );
  const nextQuestion = await post("/questions", { quiz_id: other.id, type: "true_false", prompt: "Second quiz fact.", points: 3, correct_answer: true }, teacher.token);
  await post(`/quizzes/${other.id}/publish`, {}, teacher.token);
  const nextAttempt = await post("/attempts/start", { access_code: reused.access_code }, alice.token);
  await post(`/answers/${nextAttempt.attempt.id}/save`, { question_id: nextQuestion.id, answer: "opt_true" }, alice.token);
  await post(`/attempts/${nextAttempt.attempt.id}/submit`, {}, alice.token);
  const unconfirmedNext = await request(`/attempts/${nextAttempt.attempt.id}`, teacher.token);
  const beforeConfirmation = await request(`/reports/section/${a.class_section_id}/gradebook`, teacher.token);
  check(beforeConfirmation.rows.find(r=>r.email===alice.profile.email).total===10, "Unconfirmed objective result stays out of gradebook totals");
  await post(`/grading/attempt/${nextAttempt.attempt.id}/confirm`, {expected_updated_at:unconfirmedNext.updated_at,expected_revision:unconfirmedNext.score_revision || 0}, teacher.token);
  const gradebookPath = `/reports/section/${a.class_section_id}/gradebook`;
  const gradebook = await request(gradebookPath, teacher.token);
  check(gradebook.quizzes.length === 2 && gradebook.rows.length === 4, "Section gradebook combines two published quizzes and the existing roster");
  const aliceGrades = gradebook.rows.find(r => r.email === alice.profile.email);
  check(aliceGrades.total === 13 && aliceGrades.outOf === 13 && aliceGrades.gradedCount === 2, "Gradebook sums the best fully graded scores across quizzes without double counting retakes");
  const missingGrades = gradebook.rows.find(r => r.email === missingEmail);
  check(missingGrades.total === null && missingGrades.cells.every(c => c.score === null), "Gradebook leaves missing grades blank rather than assigning zero");
  const originalCell = aliceGrades.cells.find(c => c.quizId === quiz.id);
  check(originalCell.scoreAttemptId === al.attempt.id && originalCell.gradingAttemptId === active.attempt.id, "Gradebook score targets the best graded attempt while Awaiting grading targets the pending retake");
  check(missingGrades.cells.every(c => c.scoreAttemptId === null && c.gradingAttemptId === null), "Not-started gradebook cells expose no review targets");
  const review = await request(`/attempts/${originalCell.gradingAttemptId}`, teacher.token);
  check(review.student_id === alice.profile.id && review.quiz_id === quiz.id, "Gradebook review target loads the correct student and quiz");
  await request(`/attempts/${originalCell.gradingAttemptId}`, otherTeacher.token, "GET", undefined, 403);
  const gradebookCsv = csvRows(await request(gradebookPath + ".csv", teacher.token));
  assert.deepEqual(gradebookCsv.map(r => r[0]), gradebook.rows.map(r => r.name));
  assert.ok(gradebookCsv.every(r => r.length === gradebook.quizzes.length + 2));
  check(gradebookCsv.find(r => r[0] === alice.profile.full_name).at(-1) === "13/13", "Gradebook CSV matches surname order, scores and totals from the section table");
  const analysisPath = `/reports/quiz/${quiz.id}/analysis?section_id=${a.id}`;
  const analysis = await request(analysisPath, teacher.token);
  check(analysis.submittedCount === 2 && analysis.rows.length === 2 && analysis.rows.every(r => r.responses === 2), "Question analysis uses one latest finalized attempt per student and the selected section");
  check(analysis.rows.some(r => r.type === "essay" && r.pending > 0) && analysis.rows.some(r => r.type === "mcq" && r.unanswered > 0), "Analysis separates awaiting essay grading from unanswered objective questions");
  check(!JSON.stringify(analysis).includes('"correct_answer"') && !JSON.stringify(analysis).includes('"student_id"'), "Analysis returns aggregate results without student identities or raw answer keys");
  await request(`/reports/quiz/${quiz.id}/analysis?section_id=${foreign.id}`, teacher.token, "GET", undefined, 400);
  for (const path of [gradebookPath, gradebookPath + ".csv", analysisPath]) {
    await request(path, alice.token, "GET", undefined, 403);
    await request(path, otherTeacher.token, "GET", undefined, 403);
    await request(path, undefined, "GET", undefined, 401);
  }
  check(true, "Gradebook and question analysis reject students, unauthenticated requests and other teachers");
  await grade(active, 4);
  const afterGrade = await request(gradebookPath, teacher.token);
  const refreshedCell = afterGrade.rows.find(r => r.email === alice.profile.email).cells.find(c => c.quizId === quiz.id);
  check(refreshedCell.gradingAttemptId === null && !refreshedCell.pending && refreshedCell.scoreAttemptId === al.attempt.id && refreshedCell.score === 10, "Saving an essay grade removes its pending link while preserving the best score and total");
  await stop(); await start();
  const afterInsightsRestart = await request(gradebookPath, teacher.token);
  check(afterInsightsRestart.rows.find(r => r.email === alice.profile.email).total === 13, "Gradebook survives a backend restart using saved XAMPP scores");
  const aliceMember = enrolled.find((r) => r.email === alice.profile.email);
  await request(
    `/sections/${a.class_section_id}/students/${aliceMember.id}`,
    teacher.token,
    "DELETE",
  );
  progress = await request(
    `/reports/quiz/${quiz.id}/class-list?section_id=${a.id}`,
    teacher.token,
  );
  check(
    progress.rows.some(
      (r) =>
        r.studentId === alice.profile.id &&
        r.participation === "submitted" &&
        !r.rosterMember,
    ),
    "Removing a roster entry preserves the student’s existing quiz submission",
  );
  // Fresh account: no manual roster import before starting either quiz.
  const fresh = await account("student", "Faye Quinn");
  const rosterPath = `/sections/${a.class_section_id}/students`;
  const freshMembers = (rows) => rows.filter(r => r.email.toLowerCase() === fresh.profile.email.toLowerCase());
  check(freshMembers(await request(rosterPath, teacher.token)).length === 0, "Fresh student is absent from the roster before either quiz starts");
  const firstFresh = await post("/attempts/start", { access_code: a.access_code }, fresh.token);
  const firstMembership = freshMembers(await request(rosterPath, teacher.token));
  check(firstMembership.length === 1, "First quiz automatically creates exactly one roster entry for the new student");
  const secondFresh = await post("/attempts/start", { access_code: reused.access_code }, fresh.token);
  const secondMembership = freshMembers(await request(rosterPath, teacher.token));
  check(secondMembership.length === 1 && secondMembership[0].id === firstMembership[0].id, "Starting a second quiz in the same section reuses the exact same roster entry");
  assert.notEqual(firstFresh.attempt.id, secondFresh.attempt.id);
  check(firstFresh.attempt.section_id === a.id && secondFresh.attempt.section_id === reused.id, "Each quiz keeps its own attempt and code while sharing the reusable section");
  const retryStarts = await Promise.all([
    post("/attempts/start", { access_code: a.access_code }, fresh.token),
    post("/attempts/start", { access_code: reused.access_code }, fresh.token),
    post("/attempts/start", { access_code: a.access_code }, fresh.token),
    post("/attempts/start", { access_code: reused.access_code }, fresh.token),
  ]);
  assert.deepEqual(new Set(retryStarts.map(r => r.attempt.id)), new Set([firstFresh.attempt.id, secondFresh.attempt.id]));
  check(freshMembers(await request(rosterPath, teacher.token)).length === 1, "Concurrent retries across both quizzes still leave just one roster member");
  for (const [quizId, sectionId] of [[quiz.id, a.id], [other.id, reused.id]]) {
    const classList = await request(`/reports/quiz/${quizId}/class-list?section_id=${sectionId}`, teacher.token);
    assert.equal(classList.rows.filter(r => r.studentEmail === fresh.profile.email).length, 1);
    assert.ok(classList.rows.some(r => r.studentId === fresh.profile.id && r.rosterMember && r.participation === "in_progress"));
  }
  check(true, "Both quiz class lists show the new student once, enrolled and In progress");
  await stop(); await start();
  const restoredMembership = freshMembers(await request(rosterPath, teacher.token));
  check(restoredMembership.length === 1 && restoredMembership[0].id === firstMembership[0].id, "One shared roster membership survives a backend restart without duplicates");
  await request("/auth/me", "teacher-token", "GET", undefined, 401);
  await post("/auth/login", { email: "teacher@quizna.dev" }, undefined, 401);
  check(
    (await request("/auth/options")).demoLogin === false,
    "Local XAMPP does not accept fixed demo tokens or password-free demo login",
  );
  const health = await fetch(base + "/health");
  check(
    health.headers.get("x-content-type-options") === "nosniff" &&
      health.headers.get("cache-control")?.includes("no-store") &&
      !health.headers.get("x-powered-by"),
    "API sends privacy and browser hardening headers",
  );
  const foreignOrigin = await fetch(base + "/auth/options", {
    headers: { Origin: "https://untrusted.example" },
  });
  check(
    foreignOrigin.headers.get("access-control-allow-origin") !==
      "https://untrusted.example",
    "CORS does not authorize an untrusted browser origin",
  );
  for (const path of ["/backend/src/main.ts", "/.env", "/src/main.ts"]) {
    const response = await fetch(base + path);
    check(
      response.status === 404,
      "API does not serve source or environment files: " + path,
    );
  }
  let limited;
  for (let i = 0; i < 22; i++) {
    limited = await fetch(base + "/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `198.51.100.${i + 1}`,
      },
      body: JSON.stringify({
        email: "unknown@example.test",
        password: "wrong-password",
      }),
    });
    if (limited.status === 429) break;
  }
  check(
    limited.status === 429 && !!limited.headers.get("retry-after"),
    "Login attempts are rate limited even when forwarded IP headers change",
  );
  let rosterLimited;
  for (let i = 0; i < 22; i++) {
    rosterLimited = await fetch(
      base + `/sections/${a.class_section_id}/students`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${teacher.token}`,
        },
        body: JSON.stringify({ students: [] }),
      },
    );
    if (rosterLimited.status === 429) break;
  }
  check(
    rosterLimited.status === 429,
    "Roster mutation endpoints enforce a tighter rate limit",
  );
  await writeFile(
    ".local/qa/reports/sections-check.json",
    JSON.stringify(
      {
        passed: true,
        verifiedAt: new Date().toISOString(),
        checks: checks.length,
        scenarios: checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Section and leaderboard checks passed: ${checks.length}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await stop();
  if (process.env.QUIZNA_KEEP_SECTION_FIXTURE === "true" && !process.exitCode) {
    await writeFile(
      ".local/sections-browser.json",
      JSON.stringify({ ...browserFixture, ids, quizzes }),
      { mode: 0o600 },
    );
    console.log(
      "Disposable section fixtures retained for browser verification.",
    );
  } else {
    for (const id of quizzes)
      await db.execute("DELETE FROM quizzes WHERE id=?", [id]);
    for (const id of ids)
      await db.execute("DELETE FROM profiles WHERE id=?", [id]);
  }
  await db.end();
}
