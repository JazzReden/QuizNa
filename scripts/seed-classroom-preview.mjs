// Local-only, additive classroom preview. Uses normal domain services; never served to browsers.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { config } from 'dotenv';
import assert from 'node:assert/strict';
config({path:new URL('../backend/.env',import.meta.url)});
if(process.env.DATABASE_MODE!=='mysql'||process.env.DEMO_MODE!=='true'||process.env.NODE_ENV==='production') throw Error('This sample seed is restricted to local XAMPP testing.');
const teacherEmail=process.argv[process.argv.indexOf('--teacher-email')+1];
if(!process.argv.includes('--teacher-email')||!teacherEmail?.includes('@')) throw Error('Specify the teacher account with --teacher-email.');
const require=createRequire(import.meta.url);
require('reflect-metadata');
const {NestFactory}=require('@nestjs/core');
const load=(path)=>require(fileURLToPath(new URL('../backend/dist/'+path,import.meta.url)));
const {AppModule}=load('app.module.js');
const {DatabaseService}=load('database/database.service.js');
const {SectionsService}=load('modules/sections/sections.service.js');
const {QuizzesService}=load('modules/quizzes/quizzes.service.js');
const {QuestionsService}=load('modules/questions/questions.service.js');
const {AttemptsService}=load('modules/attempts/attempts.service.js');
const {AnswersService}=load('modules/answers/answers.service.js');
const {GradingService}=load('modules/grading/grading.service.js');
const {ReportsService}=load('modules/reports/reports.service.js');
const app=await NestFactory.createApplicationContext(AppModule,{logger:['error']});
const db=app.get(DatabaseService),sections=app.get(SectionsService),quizzes=app.get(QuizzesService),questions=app.get(QuestionsService),attempts=app.get(AttemptsService),answers=app.get(AnswersService),grading=app.get(GradingService),reports=app.get(ReportsService);
const localDir=new URL('../.local/',import.meta.url), manifestPath=new URL('classroom-preview.json',localDir);
let previous={};try{previous=JSON.parse(await readFile(manifestPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const password=previous.teacherEmail===teacherEmail&&previous.studentPassword?previous.studentPassword:'QuizNa-Sample!'+randomBytes(8).toString('hex');
const choice=(prompt,correct,wrong)=>({type:'mcq',prompt,points:2,options:[{id:'correct',text:correct},{id:'wrong',text:wrong},{id:'other_a',text:'None of the above'},{id:'other_b',text:'All of the above'}],correct_answer:'correct'});
const topics=[{
 section:'Grade 12 St. Vincent', title:'Personal Development (Sample)', short:'vincent',
 names:['Ana Reyes','Ben Cruz','Carla Santos','Daniel Torres','Ella Garcia','Francis Mendoza','Gabrielle Flores','Hannah Castillo','Ivan Ramos','Julia Navarro'],
 questions:[
  choice('Which action best demonstrates emotional regulation?','Recognizing anger and responding calmly','Ignoring every negative emotion'),
  choice('Which response to a low grade shows resilience?','Reviewing mistakes and improving study habits','Giving up on the subject'),
  {type:'true_false',prompt:'Self-acceptance includes recognizing strengths and weaknesses while valuing yourself.',points:1,options:[{id:'opt_true',text:'True'},{id:'opt_false',text:'False'}],correct_answer:'opt_true'},
  {type:'short_answer',prompt:'What term describes the ability to recover and adapt after setbacks?',points:2,correct_answer:['resilience']},
  {type:'essay',prompt:'How can self-awareness and emotional regulation help you prepare for college or employment?',points:3,rubric:'Self-awareness (1), emotional regulation (1), practical example (1).'}
 ],
 essays:[
  'Knowing my strengths helps me choose a suitable course. When I feel stressed, I pause and plan my tasks so I can respond calmly to classmates and future coworkers.',
  'I can recognize my weaknesses and ask for help. Staying calm during difficult tasks helps me learn and work well with others.',
  'Self-awareness helps me understand my interests. I can manage pressure by taking a short break and then following a study schedule.',
  'I will identify the skills I need for my chosen career and practice them. If I become frustrated, I will listen before answering and think about a solution.',
  'Understanding my feelings can help me make better decisions about college. Managing anger helps me communicate respectfully in group projects.',
  'I can set realistic goals based on my abilities. I will use breathing exercises and a weekly plan when schoolwork becomes stressful.',
  'It helps me know what I can do. I will try to stay calm and finish my activities.',
  'I will improve my confidence and be more patient when working with other people.',
  'I should know my goals and try not to get angry when something goes wrong.',
  'It can help me become a better student.'
 ]
},{
 section:'Grade 12 St. Filomena',title:'Media and Information Literacy (Sample)',short:'filomena',
 names:['Adrian Aquino','Bea Bautista','Carlos de la Cruz','Diana Fernandez','Enzo Gonzales','Faye Lim','Gian Mercado','Hazel Reyes','Isabel Tan'],
 questions:[
  choice('What should you do before sharing a surprising news post?','Verify its source and compare reliable reports','Share it immediately because it has many likes'),
  choice('Which is the safest response to an unexpected message asking for your password?','Open the service through its official website and verify the request','Reply with your password so the sender can check it'),
  {type:'true_false',prompt:'A large number of shares always proves that information is accurate.',points:1,options:[{id:'opt_true',text:'True'},{id:'opt_false',text:'False'}],correct_answer:'opt_false'},
  {type:'short_answer',prompt:'What term means giving proper credit to the original source of information?',points:2,correct_answer:['attribution','citation','citing sources']},
  {type:'essay',prompt:'Describe how you would verify an online claim before sharing it with your class.',points:3,rubric:'Check the source (1), compare evidence (1), responsible sharing (1).'}
 ],
 essays:[
  'I would identify the original source and check the author and date. I would compare the claim with reliable news reports and official information before deciding whether to share it.',
  'I will read the full article, check its date, and find the original evidence. I will compare trusted sources and avoid sharing the post if it cannot be verified.',
  'I would check whether the website is reliable and compare the information with an official announcement. I would include the source when I share it.',
  'I will check the author and look for other reports. If the sources disagree, I will ask my teacher before sharing.',
  'I would search for the same claim on trusted websites and check the date. I should not rely only on likes and comments.',
  'I will examine the source, compare evidence, and explain any uncertainty instead of presenting an unsupported claim as a fact.',
  'I will check another website before sharing the information with my classmates.',
  'I would ask a friend if the post is true and read the comments.',
  'I will think about whether the information looks believable.'
 ]
}];
const patterns=[[true,true,true,true],[true,true,true,true],[true,true,true,false],[true,false,true,true],[false,true,true,true],[true,true,false,true],[true,false,false,true],[false,true,false,false],[false,false,true,true],[false,false,false,false]];
const essayScores=[[3,2.5,3,2,2.5,2,1.5,2,1.5,1],[2.5,3,2.5,2,2,2.5,1.5,1,1]];
try {
 const teacher=await db.getProfileByEmail(teacherEmail);
 if(!teacher||teacher.role!=='teacher')throw Error('The selected local teacher account was not found.');
 const summary=await db.withLock('classroom-preview-seed',async()=>{
  const output=[];
  for(const [topicIndex,topic] of topics.entries()){
   const normalized=value=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
   let section=(await sections.listClasses(teacher.id)).find(s=>normalized(s.name)===normalized(topic.section));
   if(!section)section=await sections.createClass(teacher.id,topic.section);
   let quiz=(await quizzes.listForTeacher(teacher.id)).find(q=>q.title===topic.title);
   if(!quiz){
    quiz=await quizzes.create(teacher,{title:topic.title,description:'Sample quiz with completed student responses.',instructions:'Answer each question carefully. Written answers are worth 3 points.',time_limit_minutes:30,max_attempts:1,release_scores_immediately:true,release_answers_immediately:false});
    for(const question of topic.questions)await questions.create(teacher.id,{...question,quiz_id:quiz.id});
    quiz=await quizzes.publish(quiz.id,teacher.id);
   }
   const link=await sections.attach(quiz.id,teacher.id,section.id);
   const students=[];
   for(const [i,name] of topic.names.entries()){
    const email=`sample.${topic.short}.${String(i+1).padStart(2,'0')}.${teacher.id.slice(0,8)}@quizna.test`;
    let profile=await db.getProfileByEmail(email);
    if(!profile)profile=(await db.localAuth.register({email,password,full_name:name,role:'student'})).profile;
    if(profile.role!=='student'||profile.full_name!==name)throw Error('Sample account identity mismatch. No existing account was replaced.');
    students.push(profile);
   }
   await sections.addStudents(section.id,teacher.id,students.map(s=>({full_name:s.full_name,email:s.email})));
   const liveQuestions=await questions.listByQuiz(quiz.id,teacher.id);
   assert.equal(liveQuestions.length,5,'Sample quiz content differs from the expected seed');
   for(const [i,profile] of students.entries()){
    const prior=(await db.listAttemptsByStudent(profile.id)).find(a=>a.quiz_id===quiz.id&&a.status!=='in_progress');
    if(prior)continue;
    const started=await attempts.startOrResumeAttempt(profile,link.access_code);
    for(const [questionIndex,question] of liveQuestions.entries()){
     let answer;
     const correct=patterns[i][questionIndex];
     if(question.type==='mcq')answer=correct?'correct':'wrong';
     else if(question.type==='true_false')answer=correct?question.correct_answer:(question.correct_answer==='opt_true'?'opt_false':'opt_true');
     else if(question.type==='short_answer')answer=correct?question.correct_answer[0]:(topicIndex===0?'confidence':'popularity');
     else answer=topic.essays[i];
     await answers.autosaveAnswer(started.attempt.id,profile.id,{question_id:question.id,answer});
    }
    await attempts.submitAttempt(started.attempt.id,profile.id);
    const essay=liveQuestions.find(q=>q.type==='essay');
    const written=(await db.getAnswersByAttempt(started.attempt.id)).find(a=>a.question_id===essay.id);
    await grading.manualGradeAnswer(written.id,teacher.id,{score_awarded:essayScores[topicIndex][i],teacher_feedback:'Sample grade for preview. Review or adjust using the rubric.'});
   }
   const progress=await reports.getClassList(quiz.id,teacher.id,link.id);
   const board=await reports.getLeaderboard(quiz.id,teacher.id,link.id);
   assert.equal(progress.summary.submitted,topic.names.length);
   assert.equal(progress.summary.not_started,0);
   assert.equal(board.rows.length,topic.names.length);
   assert.ok(board.rows.every(row=>row.isGraded));
   for(const row of board.rows)assert.equal((await db.getAnswersByAttempt(row.attemptId)).length,5);
   output.push({section:section.name,classId:section.id,quizId:quiz.id,title:quiz.title,accessCode:link.access_code,students:topic.names.length,submitted:progress.summary.submitted,graded:board.rows.length,scores:board.rows.map(row=>({student:row.studentName,score:row.score,outOf:row.maxScore,rank:row.rank}))});
  }
  assert.notEqual(output[0].accessCode,output[1].accessCode);
  return output;
 });
 await mkdir(localDir,{recursive:true});
 await writeFile(manifestPath,JSON.stringify({teacherEmail,studentPassword:password,createdAt:new Date().toISOString(),classes:summary},null,2)+'\n',{mode:0o600});
 await writeFile(new URL('../docs/CLASSROOM_PREVIEW.json',import.meta.url),JSON.stringify({teacherEmail,verifiedAt:new Date().toISOString(),classes:summary},null,2)+'\n');
 console.log(JSON.stringify({teacherEmail,quizzes:summary.map(({scores,...entry})=>entry)},null,2));
}finally{await app.close();}
