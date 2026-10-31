// Read-only preservation audit. Run --baseline before an additive migration.
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
dotenv.config({path:'backend/.env',quiet:true});
const connection=await mysql.createConnection({host:process.env.MYSQL_HOST||'127.0.0.1',port:Number(process.env.MYSQL_PORT||3306),socketPath:process.env.MYSQL_SOCKET||undefined,user:process.env.MYSQL_USER||'quizna_local',password:process.env.MYSQL_PASSWORD||'',database:process.env.MYSQL_DATABASE||'quizna_local',dateStrings:true,decimalNumbers:true});
const tables=['quizzes','questions','quiz_versions','quiz_attempts','attempt_answers','quiz_incidents','paper_sheets','class_sections','section_students','quiz_sections'];
async function snapshot(){const result={};for(const table of tables){const [rows]=await connection.query(`SELECT * FROM \`${table}\``);const canonical=rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key,value])=>key!=='subject'||value!==null).sort(([a],[b])=>a.localeCompare(b))))).sort();result[table]={rows:rows.length,sha256:createHash('sha256').update(JSON.stringify(canonical)).digest('hex')};}return result;}
try {
 await mkdir('.local',{recursive:true});
 let before;
 if(process.argv.includes('--baseline')) { before=await snapshot();await writeFile('.local/performance-before.json',JSON.stringify(before,null,2),{mode:0o600}); }
 else before=JSON.parse(await readFile('.local/performance-before.json','utf8'));
 const after=await snapshot();const unchanged=JSON.stringify(before)===JSON.stringify(after);
 await writeFile('docs/PERFORMANCE_DATA_CHECK.json',JSON.stringify({checkedAt:new Date().toISOString(),unchanged,tables:after},null,2));
 console.log(JSON.stringify({unchanged,quizzes:after.quizzes.rows,attempts:after.quiz_attempts.rows,answers:after.attempt_answers.rows}));
 if(!unchanged)process.exitCode=1;
} finally {await connection.end();}
