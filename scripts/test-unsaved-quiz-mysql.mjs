// Disposable, authenticated real-DB test. Existing quiz/score rows are hash checked.
import {readFile,writeFile} from 'node:fs/promises';import {createConnection} from 'mysql2/promise';import {config} from 'dotenv';import {randomUUID,createHash} from 'node:crypto';import assert from 'node:assert/strict';
config({path:'backend/.env',quiet:true});assert.equal(process.env.DATABASE_MODE,'mysql');assert.equal(process.env.DEMO_MODE,'true');
const db=await createConnection({socketPath:process.env.MYSQL_SOCKET,host:process.env.MYSQL_HOST,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
const credentials=JSON.parse(await readFile('.local/four-section-demo.json','utf8'));const base='http://127.0.0.1:3003/api';let token,quizId;
const request=async(path,body,method=body?'POST':'GET')=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,`${path}: ${r.status}`);return r.json();};
const signature=async()=>{const [quizzes]=await db.query('SELECT * FROM quizzes ORDER BY id'),[scores]=await db.query('SELECT * FROM quiz_attempts ORDER BY id');return createHash('sha256').update(JSON.stringify({quizzes,scores})).digest('hex');};
let before,report;
try{
 before=await signature();token=(await request('/auth/login',{email:credentials.email,password:credentials.password})).token;
 const payload={title:'Temporary unsaved-draft reliability fixture',exam_format:'online',time_limit_minutes:30,max_attempts:1,client_draft_id:randomUUID()};
 const [a,b]=await Promise.all([request('/quizzes',payload),request('/quizzes',payload)]);quizId=a.id;assert.equal(a.id,b.id);
 const types=[{type:'mcq',options:[{id:'a',text:'A'},{id:'b',text:'B'}],correct_answer:'a'},{type:'true_false',options:[{id:'opt_true',text:'True'},{id:'opt_false',text:'False'}],correct_answer:'opt_true'},{type:'short_answer',options:[],correct_answer:['accepted']},{type:'essay',options:[],correct_answer:null}];
 const saved=[],prepared=[];
 for(const [i,q] of types.entries()){
  const body={...q,quiz_id:quizId,prompt:`Temporary question ${i+1}`,points:2,order_index:i,client_question_id:randomUUID()};prepared.push(body);const first=await request('/questions',body),retry=await request('/questions',body);assert.equal(first.id,retry.id);saved.push(first);
 }
 const batches=await Promise.all([request('/questions/draft-batch',{questions:prepared}),request('/questions/draft-batch',{questions:prepared})]);assert.deepEqual(batches[0].map(q=>q.id),saved.map(q=>q.id));assert.deepEqual(batches[1].map(q=>q.id),saved.map(q=>q.id));
 assert.equal((await request('/quizzes/'+quizId)).questions.length,4);
 const recovered=await request('/quizzes',payload);assert.equal(recovered.id,quizId);
 await request('/quizzes/'+quizId+'/publish',{});
 const snapshotBefore=await db.execute('SELECT snapshot_data FROM quiz_versions WHERE quiz_id=? ORDER BY version_number',[quizId]);
 await request('/questions/'+saved[0].id,{prompt:'Revised working-copy prompt'},'PUT');
 const snapshotAfter=await db.execute('SELECT snapshot_data FROM quiz_versions WHERE quiz_id=? ORDER BY version_number',[quizId]);assert.deepEqual(snapshotAfter[0],snapshotBefore[0]);
 report={checkedAt:new Date().toISOString(),concurrentCreateReusesQuiz:true,questionTypesSaved:['mcq','true_false','short_answer','essay'],repeatedQuestionsNotDuplicated:true,concurrentBatchesNotDuplicated:true,savedQuestionCount:4,publishedVersionUnchanged:true};
}finally{
 if(quizId)await request('/quizzes/'+quizId,undefined,'DELETE');
 if(token)await request('/auth/logout',{});
 if(before)assert.equal(await signature(),before,'Existing quizzes or scores changed');await db.end();
}
report.existingQuizzesAndScoresUnchanged=true;await writeFile('docs/UNSAVED_QUIZ_CHECK.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
