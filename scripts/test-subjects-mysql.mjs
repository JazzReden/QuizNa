import {config} from 'dotenv';import {createConnection} from 'mysql2/promise';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
config({path:'backend/.env',quiet:true});
const db=await createConnection({host:process.env.MYSQL_HOST,socketPath:process.env.MYSQL_SOCKET,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
const request=async(path,token,method='GET',body)=>{const r=await fetch('http://127.0.0.1:3002/api/'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
let subject,teacherToken,studentToken;
const snapshot=async()=>{const data={};for(const table of ['quizzes','questions','quiz_versions','quiz_attempts','attempt_answers','section_students']){const [rows]=await db.query(`SELECT * FROM ${table} ORDER BY id`);data[table]=rows;}return createHash('sha256').update(JSON.stringify(data)).digest('hex');};
try{
 const before=await snapshot();
 const preview=JSON.parse(await readFile('.local/classroom-preview.json','utf8'));
 const source=await readFile('.local/create-long-paper.mjs','utf8');const password=source.match(/QuizNa![a-z0-9]{10}/)[0];
 const teacher=await request('auth/login',null,'POST',{email:preview.teacherEmail,password,role:'teacher'});assert.equal(teacher.status,201);teacherToken=teacher.data.token;
 const student=await request('auth/login',null,'POST',{email:'sample.vincent.02.d42927da@quizna.test',password:preview.studentPassword,role:'student'});assert.equal(student.status,201);studentToken=student.data.token;
 assert.equal((await request('subjects')).status,401);
 const rooms=await request('subjects',teacherToken);assert.equal(rooms.status,200);assert.ok(rooms.data.length);
 const room=rooms.data.find(r=>r.section_name?.includes('Vincent'));assert.ok(room);
 const made=await request('subjects',teacherToken,'POST',{name:'Subject isolation test '+Date.now(),class_section_id:room.class_section_id});assert.equal(made.status,201);subject=made.data.id;
 assert.equal((await request('subjects',studentToken,'POST',{name:'Unauthorized',class_section_id:room.class_section_id})).status,403);
 assert.equal((await request('subjects/'+subject,studentToken)).status,403);
 assert.equal((await request('subjects/join',studentToken,'POST',{code:'SUB-000000000000'})).status,404);
 const joins=await Promise.all(Array.from({length:4},()=>request('subjects/join',studentToken,'POST',{code:made.data.access_code})));assert.ok(joins.every(j=>j.status===201));
 const [members]=await db.query('SELECT * FROM subject_members WHERE subject_id=?',[subject]);assert.equal(members.length,1);
 assert.equal((await request('subjects/'+subject+'/leaderboard',studentToken)).status,403);
 assert.equal((await request('subjects/'+subject+'/settings',studentToken,'PUT',{leaderboard_enabled:true})).status,403);
 assert.equal((await request('subjects/'+subject+'/settings',teacherToken,'PUT',{leaderboard_enabled:true})).status,200);
 assert.equal((await request('subjects/'+subject+'/leaderboard',studentToken)).status,200);
 const current=await request('subjects/'+room.id,teacherToken);assert.ok(current.data.quizzes.length);
 const quiz=current.data.quizzes[0];const attached=await request('subjects/'+subject+'/quizzes',teacherToken,'POST',{quiz_id:quiz.id});assert.equal(attached.status,201);
 await request('subjects/'+subject+'/quizzes',teacherToken,'POST',{quiz_id:quiz.id});
 const [links]=await db.query('SELECT * FROM subject_quizzes WHERE subject_id=?',[subject]);assert.equal(links.length,1);
 const content=await request('subjects/'+subject,studentToken);assert.equal(content.status,200);assert.ok(content.data.quizzes.every(q=>q.status==='published'&&!q.questions&&!q.correct_answer));
 assert.equal(await snapshot(),before);
 const report={passed:true,checks:'Authentication, ownership, invalid code, concurrent enrollment, duplicate quiz links, closed leaderboard, teacher-only settings, sanitized student content',existingQuizzesQuestionsAnswersScoresAndRostersUnchanged:true};await writeFile('docs/SUBJECT_MYSQL_CHECK.json',JSON.stringify(report,null,2));console.log(report);
}finally{
 if(subject)await db.query('DELETE FROM subject_rooms WHERE id=?',[subject]);
 await db.end();
}
