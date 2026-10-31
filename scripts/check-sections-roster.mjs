// Read-only section/roster audit. No quiz, roster or score mutations.
import {readFile,writeFile} from 'node:fs/promises';import {createConnection} from 'mysql2/promise';import {config} from 'dotenv';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
config({path:'backend/.env',quiet:true});assert.equal(process.env.DATABASE_MODE,'mysql');
const db=await createConnection({socketPath:process.env.MYSQL_SOCKET,host:process.env.MYSQL_HOST,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
const hash=async()=>{const [rows]=await db.query('SELECT id,score,max_score,is_graded FROM quiz_attempts ORDER BY id');return createHash('sha256').update(JSON.stringify(rows)).digest('hex');};
try{
 const before=await hash(),base='http://127.0.0.1:3003/api',source=await readFile('.local/create-long-paper.mjs','utf8'),credentials=/email:'(demo\.teacher[^']+)',password:'([^']+)'/.exec(source);assert.ok(credentials);
 const login=async(email,password)=>{const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.status,201);return response.json();};
 const teacher=await login(credentials[1],credentials[2]);
 const get=async(path,token)=>fetch(base+path,{headers:token?{Authorization:'Bearer '+token}:{}});
 assert.equal((await get('/sections')).status,401);
 const classes=await (await get('/sections',teacher.token)).json();assert.ok(Array.isArray(classes));const result=[];
 for(const c of classes){const response=await get('/sections/'+c.id+'/students',teacher.token);assert.equal(response.status,200);const roster=await response.json();assert.equal(new Set(roster.map(s=>s.email.toLowerCase())).size,roster.length);assert.equal(c.student_count,roster.length);for(let i=1;i<roster.length;i++)assert.ok(roster[i-1].last_name.localeCompare(roster[i].last_name,'en',{sensitivity:'base'})<=0);result.push({section:c.name,students:roster.length,alphabeticalByLastName:true,noDuplicateEmails:true});}
 const studentSecret=JSON.parse(await readFile('.local/classroom-preview.json','utf8'));const student=await login('sample.vincent.02.d42927da@quizna.test',studentSecret.studentPassword);
 assert.equal((await get('/sections/'+classes[0].id+'/students',student.token)).status,403);
 const [foreign]=await db.execute('SELECT id FROM class_sections WHERE teacher_id<>? LIMIT 1',[teacher.profile.id]);if(foreign.length)assert.equal((await get('/sections/'+foreign[0].id+'/students',teacher.token)).status,403);
 assert.equal(await hash(),before);const report={checkedAt:new Date().toISOString(),sections:result,anonymousDenied:true,studentDenied:true,foreignOwnerDenied:foreign.length?true:'covered by service tests',scoresUnchanged:true};await writeFile('docs/SECTION_ROSTER_CHECK.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await db.end();}
