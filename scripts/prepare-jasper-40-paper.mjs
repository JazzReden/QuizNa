// Additive sample: reuse Jasper's registered identity; never save a score or edit previous quizzes.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createConnection} from 'mysql2/promise';
import {config} from 'dotenv';
import assert from 'node:assert/strict';
config({path:'backend/.env',quiet:true});assert.equal(process.env.DATABASE_MODE,'mysql');assert.equal(process.env.DEMO_MODE,'true');assert.notEqual(process.env.NODE_ENV,'production');
const require=createRequire(import.meta.url);require('reflect-metadata');
const {NestFactory}=require('@nestjs/core');const app=await NestFactory.createApplicationContext(require('../backend/dist/app.module').AppModule,{logger:['error']});
const service=(path,name)=>app.get(require('../backend/dist/'+path)[name]);
const db=service('database/database.service','DatabaseService'),quizzes=service('modules/quizzes/quizzes.service','QuizzesService'),questions=service('modules/questions/questions.service','QuestionsService'),sections=service('modules/sections/sections.service','SectionsService'),paper=service('modules/paper/paper.service','PaperService'),subjects=service('modules/subjects/subjects.service','SubjectsService');
const sql=await createConnection({socketPath:process.env.MYSQL_SOCKET,host:process.env.MYSQL_HOST,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
const tables=['profiles','quizzes','questions','quiz_versions','quiz_attempts','attempt_answers','paper_sheets','class_sections','section_students','quiz_sections','subject_rooms','subject_members','subject_quizzes'];
const hash=row=>createHash('sha256').update(JSON.stringify(row)).digest('hex');
try{
 const original={};for(const table of tables){const[rows]=await sql.query(`SELECT * FROM ${table}`);original[table]=new Map(rows.map(r=>[r.id,hash(r)]));}
 const manifest=JSON.parse(await readFile('docs/CLASSROOM_PREVIEW.json','utf8'));const teacher=await db.getProfileByEmail(manifest.teacherEmail);assert.equal(teacher.role,'teacher');
 const student=await db.getProfile('0c3773fa-3834-40aa-8b6c-0b3c8f6a0797');assert.equal(student.role,'student');assert.equal(student.full_name,'Jasper Busa Dumasig');
 const cls=manifest.classes.find(c=>c.section==='Grade 12 St. Vincent');assert.ok(cls);
 const source=JSON.parse(await readFile('.local/sixty-point/questions.json','utf8'));const picked=[...source.filter(q=>q.type==='mcq').slice(0,30),...source.filter(q=>q.type==='true_false').slice(0,10)];assert.equal(picked.length,40);
 const marker='local-jasper-40-question-paper-v1';let quiz=(await db.listQuizzes(teacher.id)).find(q=>q.description===marker);
 if(!quiz){
  quiz=await quizzes.create(teacher,{title:'Environmental Science - 40-item Practice',description:marker,subject:'Environmental Science',exam_format:'paper',time_limit_minutes:60,max_attempts:1,randomize_questions:false,randomize_options:false,release_scores_immediately:false,release_answers_immediately:false,instructions:'Questions 1-30: multiple choice. Questions 31-40: true or false. Each question is worth 1 point. Shade one bubble fully using dark ink.'});
  for(const[index,q]of picked.entries())await questions.create(teacher.id,{quiz_id:quiz.id,type:q.type,prompt:q.prompt,points:1,options:q.options,correct_answer:q.correct_answer,order_index:index});
  await sections.attach(quiz.id,teacher.id,cls.classId);
  const room=(await subjects.list(teacher)).find(r=>r.class_section_id===cls.classId&&r.name==='Environmental Science');assert.ok(room);await subjects.attach(room.id,quiz.id,teacher);
  quiz=await quizzes.publish(quiz.id,teacher.id);
 }
 const section=(await db.listSections(quiz.id)).find(s=>s.class_section_id===cls.classId);assert.ok(section);
 const sheet=await paper.issue(quiz.id,teacher.id,{section_id:section.id,student_email:student.email,paper_format:'long_bond'});
 assert.ok(!sheet.attempt_id,'Sheet must remain unsaved for the phone test');assert.equal(sheet.layout.pages.length,1);assert.equal(sheet.layout.questions.length,40);
 const version=await db.getQuizVersion(quiz.id,quiz.version);await mkdir('.local/jasper-40',{recursive:true});
 await writeFile('.local/jasper-40/sheet.json',JSON.stringify(sheet),{mode:0o600});await writeFile('.local/jasper-40/questions.json',JSON.stringify(version.snapshot_data.questions),{mode:0o600});
 for(const table of tables){const[rows]=await sql.query(`SELECT * FROM ${table}`);const after=new Map(rows.map(r=>[r.id,hash(r)]));for(const[id,before]of original[table])assert.equal(after.get(id),before,`Existing ${table} row changed`);}
 const report={quizId:quiz.id,sheetId:sheet.id,student:sheet.layout.student,section:sheet.layout.section,subject:sheet.layout.subject,questions:40,multipleChoice:30,trueFalse:10,pages:1,totalPoints:40,expectedScore:40,scoreSaved:false,existingRecordsUnchanged:true};
 await writeFile('docs/JASPER_40_PAPER_PREVIEW.json',JSON.stringify(report,null,2));console.log(report);
}finally{await sql.end();await app.close();}
