// Disposable API + persistent-XAMPP regression. Never confirms an existing student's result.
import {createRequire} from 'node:module';import {readFile,writeFile} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';import {createConnection} from 'mysql2/promise';import {config} from 'dotenv';import assert from 'node:assert/strict';
config({path:'backend/.env',quiet:true});assert.equal(process.env.DATABASE_MODE,'mysql');
const require=createRequire(import.meta.url);require('reflect-metadata');const {NestFactory}=require('@nestjs/core');const app=await NestFactory.createApplicationContext(require('../backend/dist/app.module').AppModule,{logger:['error']});
const db=app.get(require('../backend/dist/database/database.service').DatabaseService);const quizzes=app.get(require('../backend/dist/modules/quizzes/quizzes.service').QuizzesService);const questions=app.get(require('../backend/dist/modules/questions/questions.service').QuestionsService);const sections=app.get(require('../backend/dist/modules/sections/sections.service').SectionsService);
const sql=await createConnection({host:process.env.MYSQL_HOST,socketPath:process.env.MYSQL_SOCKET,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});const base='http://127.0.0.1:3002/api';const saved=JSON.parse(await readFile('.local/four-section-demo.json','utf8'));let quizId,classId,attemptId,session,studentSession;
const hash=async()=>{const [q]=await sql.query('SELECT * FROM quizzes ORDER BY id');const [a]=await sql.query('SELECT * FROM quiz_attempts ORDER BY id');const [answers]=await sql.query('SELECT * FROM attempt_answers ORDER BY id');return createHash('sha256').update(JSON.stringify({q,a,answers})).digest('hex');};
const call=async(path,body,token=session?.token)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();return {status:r.status,data};};
let before,report;
try{
 before=await hash();session=(await call('/auth/login',{email:saved.email,password:saved.password},'')).data;assert.ok(session.token);
 const teacher=await db.getProfileByEmail(saved.email),student=await db.getProfileByEmail('sample.vincent.02.d42927da@quizna.test');assert.ok(student);
 const classroom=JSON.parse(await readFile('.local/classroom-preview.json','utf8'));studentSession=(await call('/auth/login',{email:student.email,password:classroom.studentPassword},'')).data;assert.ok(studentSession.token);
 const quiz=await quizzes.create(teacher,{title:'Disposable score confirmation '+randomUUID(),exam_format:'online',time_limit_minutes:30,max_attempts:1});quizId=quiz.id;
 const mcq=await questions.create(teacher.id,{quiz_id:quizId,type:'mcq',prompt:'Choose A',points:5,options:[{id:'a',text:'A'},{id:'b',text:'B'}],correct_answer:'a'});
 const essay=await questions.create(teacher.id,{quiz_id:quizId,type:'essay',prompt:'Explain the choice',points:5,options:[],correct_answer:null});
 const cls=await sections.createClass(teacher.id,'Disposable confirmation '+randomUUID());classId=cls.id;const section=await sections.attach(quizId,teacher.id,classId);await quizzes.publish(quizId,teacher.id);
 const version=await db.getQuizVersion(quizId,2); // publish() increments the draft version
 const attempt=await db.createAttempt({quiz_id:quizId,quiz_version_id:version?.id,student_id:student.id,section_id:section.id,status:'submitted',submitted_at:new Date().toISOString(),deadline_at:new Date().toISOString(),max_score:10,question_order:[mcq.id,essay.id],score:5,is_graded:false});attemptId=attempt.id;
 const a=await db.saveAnswer(attemptId,mcq.id,'a');await db.updateAnswerGrade(a.id,5);const e=await db.saveAnswer(attemptId,essay.id,'A clear explanation');
 const confirmation=async()=>{const current=await db.getAttemptById(attemptId);return {expected_updated_at:current.updated_at,expected_revision:current.score_revision||0};};
 assert.equal((await call(`/grading/attempt/${attemptId}/confirm`,await confirmation(),'')).status,401);
 assert.equal((await call(`/grading/attempt/${attemptId}/confirm`,await confirmation(),studentSession.token)).status,403);
 assert.equal((await call(`/grading/attempt/${attemptId}/confirm`,await confirmation())).status,400);
 assert.equal((await call(`/grading/answer/${e.id}`,{score_awarded:4,teacher_feedback:'Clear'})).status,201);
 let book=(await call(`/reports/section/${classId}/gradebook`)).data;assert.equal(book.rows[0].total,null);assert.equal(book.rows[0].cells[0].awaitingConfirmation,true);
 const body=await confirmation();const results=await Promise.all([call(`/grading/attempt/${attemptId}/confirm`,body),call(`/grading/attempt/${attemptId}/confirm`,body)]);assert.ok(results.every(r=>r.status===201));assert.equal(results[0].data.score_confirmed_at,results[1].data.score_confirmed_at);
 book=(await call(`/reports/section/${classId}/gradebook`)).data;assert.equal(book.rows[0].total,9);assert.equal(book.rows[0].outOf,10);
 const csv=await fetch(base+`/reports/section/${classId}/gradebook.csv`,{headers:{Authorization:'Bearer '+session.token}}).then(r=>r.text());assert.ok(csv.includes('9/10'));assert.ok(!csv.includes('Email'));
 assert.equal((await call(`/grading/answer/${e.id}`,{score_awarded:3,teacher_feedback:'Corrected'})).status,201);
 assert.equal((await call(`/reports/section/${classId}/gradebook`)).data.rows[0].total,null);assert.equal((await call(`/grading/attempt/${attemptId}/confirm`,body)).status,409);
 assert.equal((await call(`/grading/attempt/${attemptId}/confirm`,await confirmation())).status,201);assert.equal((await call(`/reports/section/${classId}/gradebook`)).data.rows[0].total,8);
 report={apiConfirmationAndCorrection:true,anonymousRejected:true,studentRejected:true,unfinishedGradingRejected:true,duplicateConfirmationsIdempotent:true,staleConfirmationRejected:true,gradebookAndCsvVerified:true};
}finally{
 if(quizId)await sql.execute('DELETE FROM quizzes WHERE id=?',[quizId]);if(classId)await sql.execute('DELETE FROM class_sections WHERE id=?',[classId]);
 if(session?.token)await db.localAuth.logout(session.token,session.refresh_token);if(studentSession?.token)await db.localAuth.logout(studentSession.token,studentSession.refresh_token);
 if(before){const unchanged=(await hash())===before;assert.equal(unchanged,true,'Existing quizzes, scores and answers changed');if(report){report.existingRecordsUnchanged=unchanged;await writeFile('docs/SCORE_CONFIRMATION_MYSQL_CHECK.json',JSON.stringify(report,null,2));console.log(report);}}
 await sql.end();await app.close();
}
