import {config} from 'dotenv';
import {createConnection} from 'mysql2/promise';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
config({path:'backend/.env',quiet:true});
assert.equal(process.env.DATABASE_MODE,'mysql');
const db=await createConnection({host:process.env.MYSQL_HOST,socketPath:process.env.MYSQL_SOCKET,user:process.env.MYSQL_MIGRATION_USER || process.env.MYSQL_USER,password:process.env.MYSQL_MIGRATION_PASSWORD ?? process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
try {
 const digest=async()=>{const [attempts]=await db.query('SELECT id,quiz_id,student_id,score,max_score,is_graded,status,updated_at FROM quiz_attempts ORDER BY id');const [answers]=await db.query('SELECT * FROM attempt_answers ORDER BY id');return createHash('sha256').update(JSON.stringify({attempts,answers})).digest('hex');};
 const before=await digest();
 for(const sql of (await readFile('mysql/07_score_confirmation.sql','utf8')).replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.query(sql);
 const after=await digest();assert.equal(after,before);
 const report={migrated:true,existingScoresAndAnswersUnchanged:before===after,checkedAt:new Date().toISOString()};await writeFile('docs/SCORE_CONFIRMATION_MIGRATION.json',JSON.stringify(report,null,2));console.log(report);
}finally{await db.end();}
