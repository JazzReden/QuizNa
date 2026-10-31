// Additive local-only 44-question / 60-point paper-scanning fixture.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {config} from 'dotenv';
config({path:'backend/.env',quiet:true});
assert.equal(process.env.DATABASE_MODE,'mysql');assert.equal(process.env.DEMO_MODE,'true');assert.notEqual(process.env.NODE_ENV,'production');
const require=createRequire(import.meta.url);require('reflect-metadata');
const {NestFactory}=require('@nestjs/core');
const app=await NestFactory.createApplicationContext(require('../backend/dist/app.module').AppModule,{logger:['error']});
const service=(path,name)=>app.get(require('../backend/dist/'+path)[name]);
const db=service('database/database.service','DatabaseService'),quizzes=service('modules/quizzes/quizzes.service','QuizzesService'),questions=service('modules/questions/questions.service','QuestionsService'),sections=service('modules/sections/sections.service','SectionsService'),paper=service('modules/paper/paper.service','PaperService');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function snapshot(q){const attempts=await db.listAttemptsByQuiz(q.id);return {quiz:q,questions:await db.listQuestions(q.id),attempts,answers:await Promise.all(attempts.map(a=>db.getAnswersByAttempt(a.id))),sheets:await db.listPaperSheets(q.id)};}
try {
 const manifest=JSON.parse(await readFile('docs/CLASSROOM_PREVIEW.json','utf8'));
 const teacher=await db.getProfileByEmail(manifest.teacherEmail);assert.equal(teacher.role,'teacher');
 const section=manifest.classes.find(c=>c.section==='Grade 12 St. Vincent');assert.ok(section);
 const old=await db.listQuizzes(teacher.id),before=new Map();for(const q of old)before.set(q.id,hash(await snapshot(q)));
 const sourceSheet=JSON.parse(await readFile('.local/long-bond-paper-sheet.json','utf8'));
 const source=await db.getQuizVersion(sourceSheet.quiz_id,sourceSheet.layout.version || (await db.getQuizById(sourceSheet.quiz_id)).version);
 const sourceQuestions=source.snapshot_data.questions;
 const picked=[...sourceQuestions.filter(q=>q.type==='mcq').slice(0,30),...sourceQuestions.filter(q=>q.type==='true_false').slice(0,10),...sourceQuestions.filter(q=>q.type==='essay').slice(0,4)];assert.equal(picked.length,44);
 const marker='local-60-point-scan-practice-v1';let quiz=old.find(q=>q.description===marker);
 if(!quiz){
  quiz=await quizzes.create(teacher,{title:'Environmental Science — 60-point Scan Practice',description:marker,subject:'Environmental Science',exam_format:'paper',time_limit_minutes:90,max_attempts:1,randomize_questions:false,randomize_options:false,release_scores_immediately:false,release_answers_immediately:false,instructions:'Questions 1–30: multiple choice (1 point each). Questions 31–40: true or false (1 point each). Questions 41–44: essays (5 points each). Total: 60 points. Shade one bubble fully per objective question using dark ink. Write short, clear essay responses in the lined spaces.'});
  for(const [index,q] of picked.entries())await questions.create(teacher.id,{quiz_id:quiz.id,type:q.type,prompt:q.prompt,points:q.type==='essay'?5:1,options:q.options,correct_answer:q.correct_answer,rubric:q.type==='essay'?'Accuracy: 2 points. Explanation and relevant examples: 2 points. Clarity: 1 point. Teacher reviews and confirms the score.':undefined,order_index:index});
  await sections.attach(quiz.id,teacher.id,section.classId);quiz=await quizzes.publish(quiz.id,teacher.id);
 }
 const roster=await db.listRoster(section.classId),student=roster.find(s=>s.full_name==='Ella Garcia');assert.ok(student);
 const link=(await db.listSections(quiz.id)).find(s=>s.class_section_id===section.classId);
 const sheet=await paper.issue(quiz.id,teacher.id,{section_id:link.id,student_email:student.email,paper_format:'long_bond'});
 assert.equal(sheet.layout.pages.length,1);assert.equal(sheet.layout.questions.length,44);assert.equal(sheet.layout.questions.reduce((n,q)=>n+q.points,0),60);assert.ok(!sheet.attempt_id);
 const edition=await db.getQuizVersion(quiz.id,quiz.version);
 await mkdir('.local/sixty-point',{recursive:true});
 await writeFile('.local/sixty-point/sheet.json',JSON.stringify(sheet),{mode:0o600});
 await writeFile('.local/sixty-point/questions.json',JSON.stringify(edition.snapshot_data.questions),{mode:0o600});
 for(const q of old)assert.equal(hash(await snapshot(await db.getQuizById(q.id))),before.get(q.id),'Existing quiz or score changed');
 const report={quizId:quiz.id,sheetId:sheet.id,student:sheet.layout.student,section:sheet.layout.section,pages:1,questions:44,multipleChoice:30,trueFalse:10,essays:4,essayPoints:5,totalPoints:60,existingQuizzesPreserved:old.length,scoreSaved:false,physicalPhoneTested:false};
 await writeFile('docs/SIXTY_POINT_PAPER_PREVIEW.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await app.close();}
