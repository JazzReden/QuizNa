import { lockQa } from "./qa-lock.mjs";
lockQa();
// Repeatable QA. Default mode does not write to the configured application database.
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const logs = resolve(".local/qa", runId);
await mkdir(logs, { recursive: true });
const results = [];
const npmCli = process.env.npm_execpath;
const command = (args) =>
  npmCli
    ? [process.execPath, [npmCli, ...args]]
    : [process.platform === "win32" ? "npm.cmd" : "npm", args];
async function step(name, args, { node = false, audit = false } = {}) {
  const started = Date.now();
  let output = "";
  const [bin, argv] = node ? [process.execPath, args] : command(args);
  const code = await new Promise((resolve) => {
    const child = spawn(bin, argv, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...(name === "isolated-mysql"
          ? { QUIZNA_QA_PARENT_PID: String(process.pid) }
          : {}),
      },
    });
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", () => resolve(-1));
    child.on("close", resolve);
  });
  let status = code === 0 ? "PASS" : "FAIL",
    details;
  if (audit) {
    try {
      const report = JSON.parse(output);
      details = report.metadata.vulnerabilities;
      if (
        name === "development-audit" &&
        !details.moderate &&
        !details.high &&
        !details.critical &&
        details.low
      )
        status = "WARN";
    } catch {
      status = "FAIL";
    }
  }
  await writeFile(resolve(logs, `${name}.log`), output);
  const counts = [
    ...output.matchAll(
      /(?:Tests:|Tests\s+)\s*(\d+) passed|Database checks passed:\s*(\d+)|Backend abuse checks passed:\s*(\d+)/g,
    ),
  ].map((m) => Number(m[1] || m[2] || m[3]));
  results.push({
    name,
    status,
    seconds: Math.round((Date.now() - started) / 1000),
    ...(counts.length ? { passedChecks: counts.at(-1) } : {}),
    ...(details ? { advisories: details } : {}),
  });
  console.log(`${status} ${name}`);
  return status;
}
await step("typecheck", ["run", "check"]);
const built = await step("production-build", ["run", "build"]);
await Promise.all([
  step("backend-unit", ["--workspace=backend", "test", "--", "--runInBand"]),
  step("frontend-unit", ["--workspace=frontend", "test"]),
  step("postgres-integration", ["run", "test:database"]),
]);
await step(
  "gateway",
  ["--test", "scripts/test-phone-preview.mjs", "scripts/test-phone-link.mjs"],
  { node: true },
);
if (built === "PASS") {
  await step("api-abuse", ["scripts/test-backend-security.mjs"], {
    node: true,
  });
  await step("client-boundary", ["scripts/test-client-boundary.mjs"], {
    node: true,
  });
  if (process.argv.includes("--mysql"))
    await step("isolated-mysql", ["scripts/qa-mysql.mjs"], { node: true });
}
await step("production-audit", ["audit", "--omit=dev", "--json"], {
  audit: true,
});
await step("development-audit", ["audit", "--json"], { audit: true });
const summary = {
  runId,
  results,
  scope: process.argv.includes("--mysql")
    ? "Automated QA plus disposable XAMPP database"
    : "Automated QA; no application database writes",
  manualChecksPending: [
    "Physical phone camera and print accuracy",
    "Real handwriting and optional AI-provider quality",
    "Phone/tablet browser interaction and accessibility review",
    "500-user capacity test on staging",
    "Deployed Supabase Auth/Realtime and Render configuration",
  ],
  passed: !results.some((r) => r.status === "FAIL"),
  warnings: results.filter((r) => r.status === "WARN").map((r) => r.name),
};
await writeFile("docs/QA_LATEST.json", JSON.stringify(summary, null, 2));
console.log(
  `\nQA ${summary.passed ? "passed" : "has failures"}; ${summary.warnings.length} warning(s). Report: docs/QA_LATEST.json`,
);
if (!summary.passed) process.exitCode = 1;
