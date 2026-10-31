import { config } from 'dotenv';
import { createConnection } from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
config({ path: 'backend/.env', quiet: true });
assert.equal(process.env.DATABASE_MODE, 'mysql');
const db = await createConnection({ host: process.env.MYSQL_HOST, socketPath: process.env.MYSQL_SOCKET, user: process.env.MYSQL_MIGRATION_USER || process.env.MYSQL_USER, password: process.env.MYSQL_MIGRATION_PASSWORD ?? process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE });
const snapshot = async () => {
  const result = {};
  for (const table of ['quizzes', 'questions', 'quiz_versions', 'quiz_attempts', 'attempt_answers']) {
    const [rows] = await db.query(`SELECT * FROM ${table} ORDER BY id`);
    result[table] = table === 'quizzes' ? rows.map(({ require_access_code, ...original }) => original) : rows;
  }
  return createHash('sha256').update(JSON.stringify(result)).digest('hex');
};
try {
  const before = await snapshot();
  const [columns] = await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='quizzes' AND COLUMN_NAME='require_access_code'");
  if (!columns.length) {
    const sql = (await readFile('mysql/09_quiz_entry_code.sql', 'utf8')).replace(/--[^\n]*/g, '').trim();
    await db.query(sql);
    const [protectedRows] = await db.query('SELECT id FROM quizzes WHERE require_access_code<>0');
    assert.equal(protectedRows.length, 0);
  }
  assert.equal(await snapshot(), before);
  const result = { migrated: true, existingQuizSettingsQuestionsVersionsAnswersScoresUnchanged: true, existingQuizzesRemainDirectEntry: columns.length ? 'prior settings preserved' : true };
  await writeFile('docs/QUIZ_ENTRY_MIGRATION.json', JSON.stringify(result, null, 2)); console.log(result);
} finally { await db.end(); }
