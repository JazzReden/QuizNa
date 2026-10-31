import "./qa-report-directory.mjs";
// Bounded loopback-only negative testing against disposable in-memory records.
// Never targets a public host, XAMPP, or an externally supplied URL.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const port = 3128,
  base = `http://127.0.0.1:${port}/api`,
  checks = [];
let child,
  logs = "";
const check = (value, name) => {
  assert.ok(value, name);
  checks.push(name);
  console.log("✓ " + name);
};
async function start() {
  logs = "";
  child = spawn(process.execPath, ["dist/main.js"], {
    cwd: new URL("../backend/", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DEMO_MODE: "true",
      DATABASE_MODE: "memory",
      PORT: String(port),
      TRUST_PROXY_HOPS: "0",
      PAPER_AI_ENABLED: "false",
      GEMINI_API_KEY: "",
      OPENAI_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health")).ok) return;
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Security test API did not start: " + logs.slice(-2000));
}
async function stop() {
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
  child = null;
}
const request = (path, token, options = {}) =>
  fetch(base + path, {
    ...options,
    headers: {
      Origin: "http://localhost:5173",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...options.headers,
    },
  });
try {
  await start();
  const health = await request("/health", null, {
    headers: { Origin: "http://localhost:5173" },
  });
  check(
    health.headers
      .get("access-control-expose-headers")
      ?.includes("Retry-After"),
    "Allowed UI origins can read server retry delays",
  );
  const foreignOrigin = await request("/health", null, {
    headers: { Origin: "https://untrusted.invalid" },
  });
  check(
    !foreignOrigin.headers.has("access-control-allow-origin"),
    "Unlisted origins are not granted browser API access",
  );
  check(
    health.headers.get("x-content-type-options") === "nosniff" &&
      !health.headers.has("x-powered-by"),
    "Security headers omit server fingerprint",
  );
  for (const path of [
    "/quizzes",
    "/attempts/my",
    "/reports/quiz/private/analysis",
    "/assistant/options",
    "/paper/sheet/private",
    "/paper-ai/options",
  ])
    check(
      (await request(path)).status === 401,
      "Unauthenticated access blocked: " + path,
    );
  for (const path of [
    "/quizzes",
    "/questions/quiz/private",
    "/reports/quiz/private/analysis",
    "/paper-ai/options",
  ])
    check(
      (await request(path, "student-token")).status === 403,
      "Student cannot enter teacher endpoint: " + path,
    );
  check(
    (await request("/attempts/my", "forged-token")).status === 401,
    "Forged bearer tokens rejected",
  );
  const malformed = await request("/auth/login", null, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"privatePassword":"do-not-echo",',
  });
  const malformedText = await malformed.text();
  check(
    malformed.status === 400 && !malformedText.includes("do-not-echo"),
    "Malformed JSON returns safe 400 without echoing body",
  );
  check(
    (
      await request("/auth/login", null, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '"' + "a".repeat(530000) + '"',
      })
    ).status === 413,
    "Oversized JSON blocked before authentication",
  );
  check(
    (
      await request("/auth/login", null, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
        },
        body: "not-a-valid-compressed-stream",
      })
    ).status === 415,
    "Compressed request bodies refused safely",
  );
  check(
    (
      await request("/auth/login", null, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: { $ne: null }, password: { $gt: "" } }),
      })
    ).status === 400,
    "Object-based credential injection rejected",
  );
  check(
    (
      await request("/paper/resolve", "teacher-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "QUIZNA:P1:tampered:0:fake" }),
      })
    ).status >= 400,
    "Malformed QR reports cannot resolve a sheet",
  );
  const teacherQuizzes = await (
    await request("/quizzes", "teacher-token")
  ).json();
  const quizId = teacherQuizzes[0].id;
  const copyPath = `/quizzes/${quizId}/copy`;
  const copyRequest = { target_subject_id: 'f0000000-0000-4000-8000-000000000091', request_id: 'f0000000-0000-4000-8000-000000000092' };
  const jsonPost = (body) => ({method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  check((await request(copyPath, null, jsonPost(copyRequest))).status===401, 'Anonymous callers cannot copy quizzes');
  check((await request(copyPath, 'student-token', jsonPost(copyRequest))).status===403, 'Students cannot copy quizzes');
  check((await request(copyPath, 'forged-token', jsonPost(copyRequest))).status===401, 'Forged sessions cannot copy quizzes');
  check((await request(copyPath, 'teacher-token', jsonPost({...copyRequest,target_subject_id:"' OR 1=1 --"}))).status===400, 'Copy rejects injected destination identifiers');
  check((await request(copyPath, 'teacher-token', jsonPost(copyRequest))).status===403, 'Copy rejects inaccessible destinations without creating a draft');
  const sectionResponse=await request('/sections','teacher-token',jsonPost({name:'Disposable security section'}));
  check(sectionResponse.status===201,'Disposable copy destination section created');
  const section=await sectionResponse.json();
  const subjectResponse=await request('/subjects','teacher-token',jsonPost({name:'Security test subject',class_section_id:section.id}));
  check(subjectResponse.status===201,'Disposable copy destination subject created');
  const subject=await subjectResponse.json();
  const copyBody={...copyRequest,target_subject_id:subject.id,teacher_id:'b0000000-0000-0000-0000-000000000002',status:'published',release_scores_immediately:true};
  const copyResults=await Promise.all([request(copyPath,'teacher-token',jsonPost(copyBody)),request(copyPath,'teacher-token',jsonPost(copyBody))]);
  check(copyResults.every(r=>r.status===201),'Authorized concurrent copy requests succeed');
  const [copyA,copyB]=await Promise.all(copyResults.map(r=>r.json()));
  check(copyA.id===copyB.id,'Concurrent copy retries create one draft');
  check(copyA.teacher_id==='a0000000-0000-0000-0000-000000000001' && copyA.status==='draft' && !copyA.release_scores_immediately,'Copy ignores injected ownership, publication and release fields');
  let copyLimited=false;
  for(let i=0;i<9;i++) {
    const r=await request(copyPath,'teacher-token',jsonPost(copyRequest));
    if(r.status===429) {copyLimited=r.headers.has('Retry-After');break;}
  }
  check(copyLimited,'Copy requests are rate limited with a retry delay');
  for (const body of [
    { title: "x".repeat(201) },
    { title: "Invalid duration", time_limit_minutes: 10081 },
  ])
    check(
      (
        await request("/quizzes", "teacher-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status === 400,
      "Quiz field bounds reject oversized or unbounded settings",
    );
  for (const body of [
    {
      quiz_id: quizId,
      type: "mcq",
      prompt: "Bad choices",
      points: 1,
      options: [null, { id: "b", text: "B" }],
      correct_answer: "b",
    },
    {
      quiz_id: quizId,
      type: "short_answer",
      prompt: "Bad key",
      points: 1,
      correct_answer: { injected: true },
    },
    { quiz_id: quizId, type: "essay", prompt: "Bad points", points: 1e100 },
  ])
    check(
      (
        await request("/questions", "teacher-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status === 400,
      "Question validation rejects malformed choices, answer keys or points",
    );
  let limited = false;
  for (let i = 0; i < 65; i++) {
    const r = await request("/quizzes/code/INVALID", "student-token", {
      headers: { "X-Forwarded-For": `203.0.113.${i + 1}` },
    });
    if (r.status === 429) {
      limited = true;
      break;
    }
  }
  check(
    limited,
    "Access-code brute force is throttled despite forged forwarding headers",
  );
  let accountLimited = false;
  for (let i = 0; i < 240; i++) {
    const response = await request(
      i % 2 ? "/quizzes" : "/paper-ai/options",
      "student-token",
    );
    if (response.status === 429) {
      accountLimited = response.headers.get("Retry-After") === "60";
      break;
    }
  }
  check(
    accountLimited,
    "Verified account budget spans endpoints without relying on client IP",
  );
  await stop();
  await start();
  let aggregateBlocked = 0;
  // Four concurrent clients only; an intentionally bounded 320-request burst.
  for (let offset = 0; offset < 320; offset += 4) {
    const responses = await Promise.all(
      Array.from({ length: 4 }, (_, j) =>
        request(`/not-a-route-${offset + j}`),
      ),
    );
    for (const response of responses) {
      const body = await response.json();
      if (
        response.status === 429 &&
        body.message === "Too many requests. Please retry shortly."
      )
        aggregateBlocked++;
    }
  }
  check(
    aggregateBlocked > 0,
    "Shared route-independent burst budget returns 429 before downstream handlers",
  );
  await writeFile(
    ".local/qa/reports/BACKEND_SECURITY_CHECK.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        mode: "isolated in-memory loopback API",
        passed: checks.length,
        checks,
      },
      null,
      2,
    ),
  );
  console.log(`Backend abuse checks passed: ${checks.length}`);
} finally {
  await stop();
}
