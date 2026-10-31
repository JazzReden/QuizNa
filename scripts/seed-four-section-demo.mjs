// Local development fixture: separate teacher and four empty reusable sections.
import {createRequire} from 'node:module';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {randomBytes,createHash} from 'node:crypto';import {config} from 'dotenv';import {createConnection} from 'mysql2/promise';import assert from 'node:assert/strict';
config({path:'backend/.env',quiet:true});assert.equal(process.env.DATABASE_MODE,'mysql');assert.equal(process.env.DEMO_MODE,'true');assert.notEqual(process.env.NODE_ENV,'production');
const require=createRequire(import.meta.url);require('reflect-metadata');const {NestFactory}=require('@nestjs/core');
const app=await NestFactory.createApplicationContext(require('../backend/dist/app.module').AppModule,{logger:['error']});const db=app.get(require('../backend/dist/database/database.service').DatabaseService),sections=app.get(require('../backend/dist/modules/sections/sections.service').SectionsService);
const sql=await createConnection({socketPath:process.env.MYSQL_SOCKET,host:process.env.MYSQL_HOST,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
const hash=async()=>{const [quizzes]=await sql.query('SELECT * FROM quizzes ORDER BY id'),[attempts]=await sql.query('SELECT * FROM quiz_attempts ORDER BY id');return createHash('sha256').update(JSON.stringify({quizzes,attempts})).digest('hex');};
try{
 const before=await hash();let saved;try{saved=JSON.parse(await readFile('.local/four-section-demo.json','utf8'));}catch{}
 const email='demo.sections.teacher@quizna.test';let teacher=await db.getProfileByEmail(email);
 if(teacher){assert.equal(teacher.full_name,'Demo Sections Teacher');assert.ok(saved?.password,'Existing account has no saved fixture password; no credential changed.');}
 else {const password='QuizNa!'+randomBytes(7).toString('hex');const registered=await db.localAuth.register({email,password,full_name:'Demo Sections Teacher',role:'teacher'});teacher=registered.profile;saved={email,password,teacherId:teacher.id};await mkdir('.local',{recursive:true});await writeFile('.local/four-section-demo.json',JSON.stringify(saved,null,2),{mode:0o600});await db.localAuth.logout(registered.token,registered.refresh_token);}
 assert.equal(teacher.role,'teacher');const names=['Grade 12 · STEM A','Grade 12 · STEM B','Grade 12 · ABM A','Grade 12 · HUMSS A'];
 for(const name of names)if(!(await sections.listClasses(teacher.id)).some(c=>c.name===name))await sections.createClass(teacher.id,name);
 const classes=await sections.listClasses(teacher.id);assert.equal(classes.length,4);assert.ok(classes.every(c=>c.student_count===0));
 const session=await db.localAuth.login({email,password:saved.password});assert.equal(session.profile.id,teacher.id);await db.localAuth.logout(session.token,session.refresh_token);
 assert.equal(await hash(),before);await writeFile('docs/FOUR_SECTION_DEMO.json',JSON.stringify({email,teacherId:teacher.id,sections:classes.map(c=>({id:c.id,name:c.name,students:c.student_count})),loginVerified:true,existingQuizzesAndAttemptsUnchanged:true},null,2));console.log(JSON.stringify({email,password:saved.password,sections:classes.map(c=>c.name),loginVerified:true,existingQuizzesAndScoresUnchanged:true}));
}finally{await sql.end();await app.close();}
