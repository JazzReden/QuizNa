import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port = 3109;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath,['backend/dist/main.js'], { env: { ...process.env, PORT: String(port), NODE_ENV: 'development', DEMO_MODE: 'true' }, stdio: ['ignore','pipe','pipe'] });
let logs = '';
child.stdout.on('data',d => { logs += d; }); child.stderr.on('data',d => { logs += d; });
let checks = 0;
const request = async (path, token, method='GET', data, expected=200) => {
  const response = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type':'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(data !== undefined ? { body:JSON.stringify(data) } : {}) });
  assert.equal(response.status,expected,`${method} ${path}: ${await response.clone().text()}`); checks++;
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : response.text();
};
try {
  let ready = false;
  for(let i=0;i<100;i++) {
    try { const r=await fetch(`${base}/api/health`); if(r.ok) { ready=true;break; } } catch {}
    if(child.exitCode!==null) break;
    await new Promise(r=>setTimeout(r,100));
  }
  if(!ready) throw new Error(`Compiled API did not start: ${logs}`);
  const teacher = (await request('/auth/login',null,'POST',{email:'teacher@quizna.dev'},201)).token;
  const student = (await request('/auth/login',null,'POST',{email:'student@quizna.dev'},201)).token;
  await request('/quizzes',student,'GET',undefined,403);
  const quiz = await request('/quizzes',teacher,'POST',{title:'HTTP smoke quiz',time_limit_minutes:5},201);
  const question = await request('/questions',teacher,'POST',{quiz_id:quiz.id,type:'mcq',prompt:'Two plus two?',points:2,options:[{id:'a',text:'4'},{id:'b',text:'5'}],correct_answer:'a'},201);
  const essay = await request('/questions',teacher,'POST',{quiz_id:quiz.id,type:'essay',prompt:'Explain your answer',points:3},201);
  await request(`/quizzes/${quiz.id}/publish`,teacher,'POST',{},201);
  const attempt = await request('/attempts/start',student,'POST',{access_code:quiz.access_code},201);
  assert.equal(attempt.questions[0].correct_answer,undefined); checks++;
  const save = await request(`/answers/${attempt.attempt.id}/save`,student,'POST',{question_id:question.id,answer:'a'},201);
  assert.equal(save.answer.answer,'a'); checks++;
  await request(`/answers/${attempt.attempt.id}/save`,student,'POST',{question_id:essay.id,answer:'Because 2 + 2 = 4'},201);
  const resumed = await request('/attempts/start',student,'POST',{access_code:quiz.access_code},201);
  assert.equal(resumed.attempt.id,attempt.attempt.id); assert.equal(resumed.savedAnswers[question.id],'a'); checks++;
  const submitted = await request(`/attempts/${attempt.attempt.id}/submit`,student,'POST',{},201);
  assert.equal(submitted.score,undefined); checks++;
  const result = await request(`/attempts/${attempt.attempt.id}/result`,student);
  assert.equal(result.receipt.answeredCount,2); assert.equal(result.attempt.score,null); checks++;
  const savedAnswers = await request(`/answers/${attempt.attempt.id}`,teacher);
  const written = savedAnswers.find(a=>a.question_id===essay.id);
  await request(`/grading/answer/${written.id}`,teacher,'POST',{score_awarded:3,teacher_feedback:'Correct'},201);
  await request(`/quizzes/${quiz.id}`,teacher,'PUT',{release_scores_immediately:true,release_answers_immediately:true});
  const released = await request(`/attempts/${attempt.attempt.id}/result`,student);
  assert.equal(released.attempt.score,5); assert.equal(released.breakdown[0].student_answer,'4'); checks++;
  const csv = await request(`/reports/quiz/${quiz.id}/csv`,teacher);
  assert.ok(csv.includes('Alex Mercer')); checks++;
  const stats = await request(`/reports/quiz/${quiz.id}/stats`,teacher);
  assert.equal(stats.completedCount,1); checks++;
  console.log(`Compiled API smoke checks passed: ${checks}`);
} finally { child.kill('SIGTERM'); }
