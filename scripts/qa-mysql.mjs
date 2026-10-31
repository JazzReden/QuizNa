import "./qa-report-directory.mjs";
import { lockQa } from "./qa-lock.mjs";
lockQa();
// Creates a unique, disposable database and DML-only account. Never runs tests on the app database.
import { createConnection } from "mysql2/promise";
import { parse } from "dotenv";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
const settings = parse(await readFile("backend/.env", "utf8"));
if (
  settings.DATABASE_MODE !== "mysql" ||
  settings.DEMO_MODE !== "true" ||
  settings.NODE_ENV === "production"
)
  throw Error("QA MySQL requires local XAMPP development configuration.");
if (
  !settings.MYSQL_SOCKET &&
  !["127.0.0.1", "localhost"].includes(settings.MYSQL_HOST || "127.0.0.1")
)
  throw Error("QA only permits local MySQL.");
const suffix = randomBytes(6).toString("hex"),
  database = `quizna_qa_${suffix}`,
  user = `qnqa_${suffix}`,
  password = randomBytes(24).toString("hex");
const logDir = `.local/qa/mysql-${suffix}`;
await mkdir(logDir, { recursive: true });
const admin = await createConnection({
  socketPath: settings.MYSQL_SOCKET || undefined,
  host: settings.MYSQL_HOST || "127.0.0.1",
  port: Number(settings.MYSQL_PORT || 3306),
  user: process.env.QA_MYSQL_ADMIN_USER || "root",
  password: process.env.QA_MYSQL_ADMIN_PASSWORD || "",
  multipleStatements: true,
});
let created = false,
  accountCreated = false;
const results = [];
const env = {
  ...process.env,
  ...settings,
  NODE_ENV: "development",
  DEMO_MODE: "true",
  DATABASE_MODE: "mysql",
  MYSQL_DATABASE: database,
  MYSQL_USER: user,
  MYSQL_PASSWORD: password,
  LOCAL_REGISTRATION_ENABLED: "true",
  PAPER_AI_ENABLED: "false",
  GEMINI_API_KEY: "",
  OPENAI_API_KEY: "",
};
try {
  await admin.query(
    `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  created = true;
  await admin.changeUser({ database });
  await admin.query(await readFile("mysql/schema.sql", "utf8"));
  await admin.query(
    `CREATE USER ${admin.escape(user)}@'localhost' IDENTIFIED BY ${admin.escape(password)}`,
  );
  accountCreated = true;
  await admin.query(
    `GRANT SELECT,INSERT,UPDATE,DELETE ON \`${database}\`.* TO ${admin.escape(user)}@'localhost'`,
  );
  for (const file of [
    "test-local-auth.mjs",
    "test-full-flow.mjs",
    "test-mysql-persistence.mjs",
    "test-question-import.mjs",
    "test-sections.mjs",
    "test-paper.mjs",
    "test-subject-entry-copy.mjs",
  ]) {
    const started = Date.now();
    let log = "";
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`scripts/${file}`], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (d) => (log += d));
      child.stderr.on("data", (d) => (log += d));
      child.on("error", reject);
      child.on("close", resolve);
    });
    await writeFile(`${logDir}/${file}.log`, log);
    results.push({
      test: file,
      status: code === 0 ? "PASS" : "FAIL",
      seconds: Math.round((Date.now() - started) / 1000),
    });
    console.log(`${code === 0 ? "PASS" : "FAIL"} ${file}`);
  }
} finally {
  // These names originate only in this process, never from user input or the live .env database name.
  if (
    !/^quizna_qa_[0-9a-f]{12}$/.test(database) ||
    database === settings.MYSQL_DATABASE
  )
    throw Error("Refusing unsafe QA cleanup");
  if (created) {
    await admin.changeUser({ database: "mysql" });
    await admin.query(`DROP DATABASE \`${database}\``);
  }
  if (accountCreated)
    await admin.query(`DROP USER ${admin.escape(user)}@'localhost'`);
  await admin.end();
  await writeFile(
    ".local/qa/reports/QA_MYSQL_LATEST.json",
    JSON.stringify(
      {
        mode: "isolated disposable XAMPP database; DML-only test account",
        existingAppDatabaseUsed: false,
        temporaryDatabaseRemoved: created,
        temporaryAccountRemoved: accountCreated,
        results,
      },
      null,
      2,
    ),
  );
}
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
