import {config} from 'dotenv';
import {createConnection} from 'mysql2/promise';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
config({path:'backend/.env',quiet:true});
assert.equal(process.env.DATABASE_MODE,'mysql');
const db=await createConnection({host:process.env.MYSQL_HOST,socketPath:process.env.MYSQL_SOCKET,user:process.env.MYSQL_MIGRATION_USER||process.env.MYSQL_USER,password:process.env.MYSQL_MIGRATION_PASSWORD??process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
try{
 const hash=async()=>{const data={};for(const table of ['quizzes','questions','quiz_versions','quiz_attempts','attempt_answers']){const [rows]=await db.query(`SELECT * FROM ${table} ORDER BY id`);data[table]=rows;}return createHash('sha256').update(JSON.stringify(data)).digest('hex');};
 const before=await hash();
 const [prior]=await db.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='subject_rooms'");
 for(const sql of (await readFile('mysql/08_subject_rooms.sql','utf8')).replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.query(sql);
 // Replace migration-only generated codes with cryptographically random share codes, once.
 if(!prior[0].n){const [rooms]=await db.query('SELECT id FROM subject_rooms');for(const r of rooms)await db.query('UPDATE subject_rooms SET access_code=? WHERE id=?',['SUB-'+randomBytes(6).toString('hex').toUpperCase(),r.id]);}
 assert.equal(await hash(),before);
 const [rooms]=await db.query('SELECT COUNT(*) AS n FROM subject_rooms');
 const result={migrated:true,subjects:rooms[0].n,existingQuizzesQuestionsScoresUnchanged:true,checkedAt:new Date().toISOString()};
 await writeFile('docs/SUBJECT_MIGRATION.json',JSON.stringify(result,null,2));console.log(result);
}finally{await db.end();}
