// Public frontend code is inspectable; privileged server code and secrets must never be served.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { parse } from 'dotenv';
const privateSettings=parse(await readFile(new URL('../backend/.env',import.meta.url),'utf8').catch(()=>''));
for(const directory of ['../frontend/dist/','../.local/phone-dist/']) {
 const root=new URL(directory,import.meta.url);
 let files;try{files=await readdir(new URL('assets/',root));}catch {if(directory.includes('phone-dist'))continue;throw Error('Build the frontend before checking its public assets');}
 assert.ok(files.some(name=>name.endsWith('.js')));
 assert.ok(!files.some(name=>name.endsWith('.map')),'Production source maps must not be public');
 const assets=await Promise.all(files.filter(name=>name.endsWith('.js')).map(name=>readFile(new URL('assets/'+name,root),'utf8')));
 for(const privateMarker of ['SUPABASE_SERVICE_ROLE_KEY','MYSQL_PASSWORD','quizna_attempt_command','NestFactory','scrypt$','teacher-token']) assert.ok(assets.every(source=>!source.includes(privateMarker)),`Private server marker found in client: ${privateMarker}`);
 for(const key of ['SUPABASE_SERVICE_ROLE_KEY','MYSQL_PASSWORD','GEMINI_API_KEY','OPENAI_API_KEY']) {
   const value=privateSettings[key];
   if(value && value.length>=8)assert.ok(assets.every(source=>!source.includes(value)),`Private setting detected in public bundle: ${key}`);
 }
 console.log('✓ Public build excludes server markers, private setting values and source maps: '+directory);
}
const base='http://127.0.0.1:5173';
// Non-secret fixture verifies deny rules with the query variants in the Vite advisory.
const fixture=new URL('../frontend/.env.quizna-boundary-test',import.meta.url);
const sentinel='QUIZNA_PRIVATE_BOUNDARY_FIXTURE_7d21b3';
await writeFile(fixture,sentinel,{flag:'wx'});
try {
 for(const query of ['', '?raw', '?import&raw', '?import&url&inline']) {
   for(const path of ['/.env.quizna-boundary-test','/@fs'+fileURLToPath(fixture)]) {
     const response=await fetch(base+path+query);const body=await response.text();
     assert.ok(!body.includes(sentinel),'Vite private-file deny rule must hold with query parameters');
   }
 }
 console.log('✓ Private-file deny rules hold with raw/import/inline query variants');
} finally {await unlink(fixture);}
const serverFile=fileURLToPath(new URL('../backend/src/main.ts',import.meta.url));
const envFile=fileURLToPath(new URL('../backend/.env',import.meta.url));
for(const path of ['/backend/src/main.ts','/backend/src/modules/quizzes/quiz-copy.service.ts','/.env','/.env.local','/backend/.env','/.git/config','/mysql/schema.sql','/supabase/migrations/14_copy_quiz.sql','/.local/classroom-preview.json','/@fs'+serverFile,'/@fs'+envFile]) {
 const response=await fetch(base+path);
 const body=await response.text();
 assert.ok(response.status>=400 || (response.headers.get('content-type')?.includes('text/html') && body.toLowerCase().includes('<!doctype html>')),`Unexpected source response at ${path}`);
 assert.ok(!body.includes('SUPABASE_SERVICE_ROLE_KEY')&&!body.includes('NestFactory'),'Server content must never be served');
 for(const key of ['SUPABASE_SERVICE_ROLE_KEY','MYSQL_PASSWORD','GEMINI_API_KEY','OPENAI_API_KEY']) {
   const value=privateSettings[key];if(value && value.length>=8)assert.ok(!body.includes(value),`Private setting exposed through source request: ${key}`);
 }
 console.log('✓ Client server does not expose '+path);
}
