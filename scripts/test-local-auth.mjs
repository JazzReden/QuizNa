import "./qa-report-directory.mjs";
// Real XAMPP integration test. Only uniquely created fixture accounts/quizzes are removed.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash,randomUUID,randomBytes } from 'node:crypto';
import { config } from 'dotenv';
import { createConnection } from 'mysql2/promise';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
config({path:'backend/.env'});
if(process.env.DATABASE_MODE!=='mysql'||process.env.DEMO_MODE!=='true'||process.env.NODE_ENV==='production') throw new Error('Configure the local XAMPP demo before running this test');
const database=await createConnection({socketPath:process.env.MYSQL_SOCKET||undefined,host:process.env.MYSQL_HOST||'127.0.0.1',port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
const base='http://127.0.0.1:3112/api',fixtureIds=new Set(),fixtureQuizIds=new Set();
let child,logs='',checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log(`✓ ${label}`);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const request=async(path,{method='GET',body,token,status=200}={})=>{
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const data=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data)}`);return data;
};
const post=(path,body,token,status=201)=>request(path,{method:'POST',body,token,status});
const start=async()=>{
 logs='';child=spawn(process.execPath,['dist/main.js'],{cwd:new URL('../backend/',import.meta.url),env:{...process.env,PORT:'3112',NODE_ENV:'development',DATABASE_MODE:'mysql',DEMO_MODE:'true'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',data=>{logs+=data;});child.stderr.on('data',data=>{logs+=data;});
 for(let i=0;i<100;i++){try{const response=await fetch(base+'/health');if(response.ok)return;}catch{}if(child.exitCode!==null)break;await new Promise(resolve=>setTimeout(resolve,100));}
 throw new Error('Test API failed to start: '+logs);
};
const stop=async()=>{if(child&&child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}child=null;};
const suffix=randomUUID();const password=`Test-${randomBytes(18).toString('hex')}`;
const account=async(role,label)=>{
 const session=await post('/auth/register',{email:`${label}-${suffix}@example.test`,full_name:`Local test ${label}`,role,password});
 fixtureIds.add(session.profile.id);return session;
};
try{
 await start();
 const options=await request('/auth/options');
 check(options.registration&&options.teacherRegistration&&options.passwordLogin,'Backend enables both account roles for local testing');
 const teacher=await account('teacher','teacher');
 const student=await account('student','student');
 const otherTeacher=await account('teacher','other-teacher');
 check(teacher.profile.role==='teacher'&&student.profile.role==='student','Register real local teacher and student accounts');
 check(!JSON.stringify(teacher).includes('password_hash')&&!JSON.stringify(student).includes('password_hash'),'Registration responses never expose password hashes');
 const [credentials]=await database.execute('SELECT password_hash FROM local_auth_credentials WHERE user_id IN (?,?)',[teacher.profile.id,student.profile.id]);
 check(credentials.length===2&&credentials.every(row=>row.password_hash.startsWith('scrypt$')&&row.password_hash!==password),'MariaDB stores salted password hashes');
 check(credentials[0].password_hash!==credentials[1].password_hash,'Identical passwords have different salts');
 const [sessions]=await database.execute('SELECT access_hash,refresh_hash FROM local_auth_sessions WHERE user_id=?',[teacher.profile.id]);
 check(sessions[0].access_hash===hash(teacher.token)&&sessions[0].refresh_hash===hash(teacher.refresh_token),'Database stores only hashes of session tokens');
 const loggedIn=await post('/auth/login',{email:`  ${teacher.profile.email.toUpperCase()}  `,password});
 check(loggedIn.profile.id===teacher.profile.id,'Email normalization works for local login');
 const wrong=await post('/auth/login',{email:teacher.profile.email,password:'Not the password'},null,401);
 const unknown=await post('/auth/login',{email:`unknown-${suffix}@example.test`,password},null,401);
 check(wrong.message===unknown.message,'Wrong-password and unknown-account errors are equally safe');
 await post('/auth/login',{email:teacher.profile.email},null,401);
 check(true,'Custom accounts cannot sign in without a password');
 await post('/auth/register',{email:teacher.profile.email.toUpperCase(),full_name:'Duplicate',role:'student',password},null,400);
 check(true,'Duplicate emails cannot replace an existing account or role');
 await post('/auth/register',{email:`weak-${suffix}@example.test`,full_name:'Weak',role:'student',password:'short'},null,400);
 await post('/auth/register',{email:`invalid-${suffix}@example.test`,full_name:'Invalid',role:'admin',password},null,400);
 check(true,'Weak passwords and invalid roles are rejected');
 await request('/quizzes',{token:student.token,status:403});
 check(true,'Registered students cannot access teacher endpoints');
 const quiz=await post('/quizzes',{title:'Local account integration quiz',time_limit_minutes:5},teacher.token);
 fixtureQuizIds.add(quiz.id);
 const question=await post('/questions',{quiz_id:quiz.id,type:'mcq',prompt:'Can local accounts save answers?',points:2,options:[{id:'yes',text:'Yes'},{id:'no',text:'No'}],correct_answer:'yes'},teacher.token);
 await post(`/quizzes/${quiz.id}/publish`,{},teacher.token);
 const attempt=await post('/attempts/start',{access_code:quiz.access_code},student.token);
 await post(`/answers/${attempt.attempt.id}/save`,{question_id:question.id,answer:'yes'},student.token);
 check(true,'New teacher and student accounts complete a real authoring and answering flow');
 await request(`/quizzes/${quiz.id}`,{token:otherTeacher.token,status:403});
 check(true,'A different teacher cannot access the new teacher’s quiz');
 await request('/auth/me',{token:teacher.profile.id,status:401});
 check(true,'A profile ID is never accepted as a session token');
 await stop();await start();
 check((await request('/auth/me',{token:teacher.token})).id===teacher.profile.id,'Existing login sessions survive a backend restart');
 const after=await post('/auth/login',{email:student.profile.email,password});
 check(after.profile.id===student.profile.id&&after.profile.role==='student','Registered account and password login survive restart');
 const resumed=await post('/attempts/start',{access_code:quiz.access_code},after.token);
 check(resumed.attempt.id===attempt.attempt.id&&resumed.savedAnswers[question.id]==='yes','The new student’s saved quiz attempt survives restart');
 await database.execute('UPDATE local_auth_sessions SET access_expires_at=? WHERE access_hash=?',[new Date(Date.now()-1000).toISOString(),hash(after.token)]);
 await request('/auth/me',{token:after.token,status:401});
 check(true,'Expired access sessions cannot authenticate');
 const rotated=await post('/auth/refresh',{refresh_token:after.refresh_token});
 check((await request('/auth/me',{token:rotated.token})).id===student.profile.id,'A valid refresh token restores the local session');
 await post('/auth/refresh',{refresh_token:after.refresh_token},null,401);
 check(true,'Refresh tokens rotate and cannot be replayed');
 await post('/auth/logout',{refresh_token:rotated.refresh_token},rotated.token);
 await request('/auth/me',{token:rotated.token,status:401});
 await post('/auth/refresh',{refresh_token:rotated.refresh_token},null,401);
 check(true,'Logout revokes the access session and its refresh token');
 const concurrentEmail=`concurrent-${suffix}@example.test`;
 const registrations=await Promise.all(Array.from({length:2},()=>fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:concurrentEmail,full_name:'Concurrent fixture',role:'student',password})})));
 const statuses=registrations.map(response=>response.status).sort();
 for(const response of registrations){const value=await response.json();if(value.profile)fixtureIds.add(value.profile.id);}
 check(statuses[0]===201&&statuses[1]===400,'Concurrent registration creates exactly one account');
 console.log(`Local authentication checks passed: ${checks}`);
 await writeFile('.local/qa/reports/local-auth-check.json',JSON.stringify({passed:true,checks,verifiedAt:new Date().toISOString(),backendRestartVerified:true},null,2)+'\n');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{
 await stop();
 for(const id of fixtureQuizIds)await database.execute('DELETE FROM quizzes WHERE id=?',[id]);
 for(const id of fixtureIds)await database.execute('DELETE FROM profiles WHERE id=?',[id]);
 await database.end();
}
