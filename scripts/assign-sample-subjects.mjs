// Label only the known development fixtures. Validate all other content in the
// same transaction so questions, editions, scores and user-created quizzes stay intact.
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
dotenv.config({ path: 'backend/.env', quiet: true });
const samples = [
  ['c0000000-0000-0000-0000-000000000001', 'CS 101: Data Structures & Algorithms Assessment', 'teacher@quizna.dev', 'Computer Science'],
  ['c4c5b1fe-2405-4875-8d48-60f93b9c589b', 'Environmental Literacy - 60-Question Paper Sample', 'demo.teacher.e9d067@quizna.test', 'Environmental Science'],
  ['bf6ac805-1966-4dd6-9fa3-e22e1e221ba3', 'Environmental Science — Paper Practice (Sample)', 'demo.teacher.e9d067@quizna.test', 'Environmental Science'],
  ['ccc0e59d-990b-469f-b6bb-724b7adef7a7', 'Media and Information Literacy (Sample)', 'demo.teacher.e9d067@quizna.test', 'Media and Information Literacy'],
  ['22950f2d-ee77-4167-88ed-044ebddb7009', 'Personal Development (Sample)', 'demo.teacher.e9d067@quizna.test', 'Personal Development'],
  ['02da9fb0-9ac2-4d29-a3ad-7f8e160fb50b', 'Practical Research: Evidence and Experiments (Sample)', 'demo.teacher.e9d067@quizna.test', 'Practical Research'],
];
const sampleIds = new Set(samples.map(([id]) => id));
const tables = ['quizzes','questions','quiz_versions','quiz_attempts','attempt_answers','quiz_incidents','paper_sheets','class_sections','section_students','quiz_sections'];
const db = await mysql.createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), socketPath: process.env.MYSQL_SOCKET || undefined, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, dateStrings: true, decimalNumbers: true });
async function snapshot() {
  const result = {};
  for (const table of tables) {
    const [rows] = await db.query(`SELECT * FROM \`${table}\``);
    const canonical = rows.map(row => JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key]) => !(table === 'quizzes' && sampleIds.has(row.id) && key === 'subject')).sort(([a],[b]) => a.localeCompare(b))))).sort();
    result[table] = { rows: rows.length, sha256: createHash('sha256').update(JSON.stringify(canonical)).digest('hex') };
  }
  return result;
}
try {
  if (process.argv.includes('--check')) {
    const saved = JSON.parse(await readFile('docs/SAMPLE_SUBJECTS_CHECK.json', 'utf8'));
    const current = await snapshot();
    if (JSON.stringify(current) !== JSON.stringify(saved.tables)) throw new Error('Existing content differs from the verified baseline.');
    for (const [id,title,email,subject] of samples) {
      const [rows] = await db.execute('SELECT q.title,q.subject,p.email FROM quizzes q JOIN profiles p ON p.id=q.teacher_id WHERE q.id=?', [id]);
      if (rows.length !== 1 || rows[0].title !== title || rows[0].email !== email || rows[0].subject !== subject) throw new Error('A sample subject no longer matches.');
    }
    console.log(JSON.stringify({ subjectLabelsVerified:true, otherContentUnchanged:true, questions:current.questions.rows, attempts:current.quiz_attempts.rows, answers:current.attempt_answers.rows }));
  } else {
  await db.beginTransaction();
  await db.query('SELECT id FROM quizna_local_metadata WHERE id=1 FOR UPDATE');
  const before = await snapshot();
  const changes = [];
  for (const [id,title,email,subject] of samples) {
    const [rows] = await db.execute('SELECT q.title,q.subject,p.email FROM quizzes q JOIN profiles p ON p.id=q.teacher_id WHERE q.id=? FOR UPDATE', [id]);
    if (rows.length !== 1 || rows[0].title !== title || rows[0].email !== email) throw new Error('A sample identity changed; no labels were saved.');
    await db.execute('UPDATE quizzes SET subject=? WHERE id=?', [subject,id]);
    const [verified] = await db.execute('SELECT subject FROM quizzes WHERE id=?', [id]);
    if (verified[0]?.subject !== subject) throw new Error('Subject verification failed.');
    changes.push({ id, title, previousSubject: rows[0].subject, subject });
  }
  const after = await snapshot();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Unexpected content change detected; rolling back.');
  await db.commit();
  const report = { checkedAt: new Date().toISOString(), subjectLabelsVerified: true, otherContentUnchanged: true, changes, tables: after };
  await mkdir('docs', {recursive:true});
  await writeFile('docs/SAMPLE_SUBJECTS_CHECK.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify({ subjectsAssigned: changes.length, otherContentUnchanged: true, quizzes: after.quizzes.rows, questions: after.questions.rows, attempts: after.quiz_attempts.rows, answers: after.attempt_answers.rows }));
  }
} catch (error) { await db.rollback(); throw error; }
finally { await db.end(); }
