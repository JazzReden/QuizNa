// Additive, local-only samples for all three participation states. Never resets deadlines.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
import {config} from 'dotenv';
import assert from 'node:assert/strict';
config({path:new URL('../backend/.env',import.meta.url)});
if(process.env.DATABASE_MODE!=='mysql'||process.env.DEMO_MODE!=='true'||process.env.NODE_ENV==='production')throw Error('Local XAMPP testing only.');
const manifest=JSON.parse(await readFile(new URL('../.local/classroom-preview.json',import.meta.url),'utf8'));
const require=createRequire(import.meta.url);require('reflect-metadata');
const {NestFactory}=require('@nestjs/core');
const load=path=>require(fileURLToPath(new URL('../backend/dist/'+path,import.meta.url)));
const {AppModule}=load('app.module.js');
const {DatabaseService}=load('database/database.service.js');
const {SectionsService}=load('modules/sections/sections.service.js');
const {AttemptsService}=load('modules/attempts/attempts.service.js');
const {AnswersService}=load('modules/answers/answers.service.js');
const {ReportsService}=load('modules/reports/reports.service.js');
const app=await NestFactory.createApplicationContext(AppModule,{logger:['error']});
const db=app.get(DatabaseService),sections=app.get(SectionsService),attempts=app.get(AttemptsService),answers=app.get(AnswersService),reports=app.get(ReportsService);
const additions=[['Kyla Bautista','Liam Dela Cruz','Maya Aquino','Noah Villanueva'],['Janelle Castillo','Kelvin Flores','Lara Garcia','Marco Ramos']];
try {
 const teacher=await db.getProfileByEmail(manifest.teacherEmail);
 if(!teacher||teacher.role!=='teacher')throw Error('Original sample teacher not found.');
 const result=await db.withLock('participation-preview-seed',async()=>{
  const output=[];
  for(const [classIndex,entry] of manifest.classes.entries()) {
   const link=(await sections.list(entry.quizId,teacher.id)).find(s=>s.class_section_id===entry.classId);
   if(!link)throw Error('Original sample section/quiz pairing not found.');
   const before=await reports.getClassList(entry.quizId,teacher.id,link.id);
   const original=await db.listAttemptsByQuiz(entry.quizId);
   const completed=original.filter(a=>a.status!=='in_progress');
   const fingerprints=new Map();
   for(const attempt of completed)fingerprints.set(attempt.id,JSON.stringify({status:attempt.status,score:attempt.score,submittedAt:attempt.submitted_at,answers:await db.getAnswersByAttempt(attempt.id)}));
   const students=[];
   for(const [index,name] of additions[classIndex].entries()) {
    const email=`status.${classIndex+1}.${index+1}.${teacher.id.slice(0,8)}@quizna.test`;
    let profile=await db.getProfileByEmail(email);
    if(!profile)profile=(await db.localAuth.register({email,password:manifest.studentPassword,full_name:name,role:'student'})).profile;
    if(profile.role!=='student'||profile.full_name!==name)throw Error('Sample identity mismatch.');
    students.push(profile);
   }
   await sections.addStudents(entry.classId,teacher.id,students.map(s=>({full_name:s.full_name,email:s.email})));
   const active=[];
   for(const profile of students.slice(0,2)) {
    const started=await attempts.startOrResumeAttempt(profile,link.access_code);
    const frozen=await db.getAttemptQuestions(started.attempt);
    for(const question of frozen.slice(0,2))await answers.autosaveAnswer(started.attempt.id,profile.id,{question_id:question.id,answer:profile.id===students[0].id?'correct':'wrong'});
    active.push({student:profile.full_name,attemptId:started.attempt.id,deadlineAt:started.attempt.deadline_at});
   }
   const after=await reports.getClassList(entry.quizId,teacher.id,link.id);
   for(const profile of students.slice(0,2))assert.equal(after.rows.find(r=>r.studentId===profile.id)?.participation,'in_progress');
   for(const profile of students.slice(2))assert.equal(after.rows.find(r=>r.studentEmail===profile.email)?.participation,'not_started');
   assert.equal(after.summary.submitted,before.summary.submitted,'Completed submission count must be preserved');
   for(const attempt of completed) {
    const current=await db.getAttemptById(attempt.id);
    assert.equal(JSON.stringify({status:current.status,score:current.score,submittedAt:current.submitted_at,answers:await db.getAnswersByAttempt(attempt.id)}),fingerprints.get(attempt.id),'Original answers and grades must not change');
   }
   output.push({section:entry.section,quizId:entry.quizId,title:entry.title,summary:after.summary,added:{inProgress:active,notStarted:students.slice(2).map(s=>s.full_name)}});
  }
  return output;
 });
 await writeFile(new URL('../docs/PARTICIPATION_PREVIEW.json',import.meta.url),JSON.stringify({verifiedAt:new Date().toISOString(),teacherEmail:manifest.teacherEmail,classes:result},null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
} finally {await app.close();}
