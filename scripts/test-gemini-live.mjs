import "./qa-report-directory.mjs";
// Opt-in live provider check using fictional test accounts and a synthetic handwriting image.
// No save-paper or grade endpoint is called. All disposable database rows are removed.
import {config} from 'dotenv';
import {createConnection} from 'mysql2/promise';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
config({path:'backend/.env'});
if(process.env.RUN_LIVE_GEMINI!=='true')throw Error('Set RUN_LIVE_GEMINI=true to explicitly run a live external AI test.');
if(process.env.DATABASE_MODE!=='mysql'||process.env.DEMO_MODE!=='true'||process.env.NODE_ENV==='production')throw Error('Run only against the local XAMPP development database.');
if(process.env.PAPER_AI_PROVIDER!=='gemini'||!process.env.GEMINI_API_KEY?.trim())throw Error('Configure Gemini locally first.');
const db=await createConnection({socketPath:process.env.MYSQL_SOCKET,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
const base='http://127.0.0.1:3002/api',users=[],quizzes=[];
const checksum=async()=>{const [attempts]=await db.query('SELECT id,score,max_score,status,is_graded FROM quiz_attempts ORDER BY id');const [answers]=await db.query('SELECT id,attempt_id,question_id,answer,score_awarded,teacher_feedback,is_manually_graded FROM attempt_answers ORDER BY id');return {attempts:attempts.length,answers:answers.length,digest:createHash('sha256').update(JSON.stringify({attempts,answers})).digest('hex')};};
async function call(path,token,method='GET',body,status=200){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(result)}`);return result;}
const post=(path,token,body,status=201)=>call(path,token,'POST',body,status);
const before=await checksum();
let report={checkedAt:new Date().toISOString(),passed:false,fixture:'AI-generated handwriting; fictional self-awareness response',confirmedOrSavedGrade:false};
try{
 const suffix=randomUUID().slice(0,8),password='Fixture!'+randomBytes(18).toString('hex');
 async function register(role){const result=await post('/auth/register',undefined,{full_name:'Gemini Test '+role,email:`gemini-live-${role}-${suffix}@example.test`,password,role});users.push(result.profile.id);return result;}
 const teacher=await register('teacher'),student=await register('student');
 const options=await call('/paper-ai/options',teacher.token);assert.equal(options.provider,'gemini');assert.equal(options.enabled,true);
 const quiz=await post('/quizzes',teacher.token,{title:'Disposable Gemini handwriting check '+suffix,exam_format:'paper',max_attempts:1});quizzes.push(quiz.id);
 const question=await post('/questions',teacher.token,{quiz_id:quiz.id,type:'essay',prompt:'Explain how self-awareness and emotional regulation can help a Grade 12 student prepare for college or employment. Include practical examples.',points:5,rubric:'Essay criteria\nAccuracy (2 points): Correctly explains self-awareness and emotional regulation.\nCompleteness (2 points): Connects both skills to college or employment and gives practical examples.\nClarity (1 points): Presents understandable and organized ideas.'});
 const section=await post('/sections',teacher.token,{name:'Disposable Gemini test '+suffix});
 const link=await post(`/sections/quiz/${quiz.id}/attach`,teacher.token,{class_section_id:section.id});
 await post(`/quizzes/${quiz.id}/publish`,teacher.token,{});
 const sheet=await post(`/paper/quiz/${quiz.id}/issue`,teacher.token,{section_id:link.id,student_email:student.profile.email,paper_format:'long_bond'});
 const page=sheet.layout.pages.find(page=>page.rows.some(row=>row.questionId===question.id));
 const form=new FormData();form.set('sheet_id',sheet.id);form.set('page_index',String(page.index));form.append('images',new Blob([await readFile(process.env.GEMINI_TEST_IMAGE||'output/imagegen/essay-handwriting-synthetic-crop.png')],{type:'image/png'}),'fictional-response.png');
 const started=Date.now();
 const response=await fetch(base+'/paper-ai/suggest',{method:'POST',headers:{Authorization:'Bearer '+teacher.token},body:form,signal:AbortSignal.timeout(60000)});const draft=await response.json();assert.equal(response.status,201,JSON.stringify(draft));
 assert.equal(draft.requiresTeacherReview,true);assert.equal(draft.essays.length,1);const essay=draft.essays[0];assert.equal(essay.questionId,question.id);assert.equal(essay.needsReview,true);assert.equal(essay.legibility,'clear');assert.equal(essay.basis,'published');assert(essay.suggestedScore>=0&&essay.suggestedScore<=5);
 const expected='Self-awareness helps me understand my strengths and weaknesses. When I feel nervous about college, I can pause, breathe slowly, and plan what to do next. Emotional regulation helps me stay calm during an interview and respond respectfully.';
 const normalize=text=>text.toLowerCase().match(/[a-z0-9]+/g).join(' ');
 const unchanged=await call(`/paper/sheet/${sheet.id}`,teacher.token);assert(!unchanged.attempt_id);const [attempts]=await db.execute('SELECT count(*) AS n FROM quiz_attempts WHERE quiz_id=?',[quiz.id]);assert.equal(Number(attempts[0].n),0);
 report={...report,passed:true,elapsedMs:Date.now()-started,model:process.env.GEMINI_ESSAY_MODEL,transcription:essay.transcription,exactNormalizedTranscription:normalize(expected)===normalize(essay.transcription),legibility:essay.legibility,suggestedScore:essay.suggestedScore,maximum:essay.maximum,criteria:essay.criteria,feedback:essay.feedback,teacherReviewRequired:true,attemptCreated:false};
 console.log(JSON.stringify(report,null,2));
}catch(error){report={...report,error:error.message};console.error(error.message);process.exitCode=1;}
finally{
 for(const id of quizzes)await db.execute('DELETE FROM quizzes WHERE id=?',[id]);
 for(const id of users)await db.execute('DELETE FROM profiles WHERE id=?',[id]);
 const after=await checksum();report.existingRecordsUnchanged=after.digest===before.digest;report.existingAttempts=after.attempts;report.existingAnswers=after.answers;
 await writeFile('.local/qa/reports/GEMINI_LIVE_CHECK.json',JSON.stringify(report,null,2)+'\n');await db.end();assert.equal(after.digest,before.digest,'Existing scores or answers changed');console.log('All existing answers and scores unchanged; disposable fixture removed.');
}
