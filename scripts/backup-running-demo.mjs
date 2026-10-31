// Preserve API-accessible data before replacing an ephemeral local demo process.
import { mkdir,writeFile } from 'node:fs/promises';
const base='http://127.0.0.1:3002/api';
const get=async path=>{ const response=await fetch(base+path,{headers:{Authorization:'Bearer teacher-token'}}); if(!response.ok)throw new Error(`Backup failed (${response.status})`);return response.json(); };
const health=await get('/health');
if(!health.databaseMode.includes('In-Memory'))throw new Error('Expected an ephemeral demo before switching storage');
const quizzes=await get('/quizzes');
let count=0;
for(const quiz of quizzes){quiz.attempts=await get(`/attempts/quiz/${quiz.id}`);for(const attempt of quiz.attempts){attempt.detail=await get(`/attempts/${attempt.id}`);attempt.answers=await get(`/answers/${attempt.id}`);attempt.incidents=await get(`/monitoring/attempt/${attempt.id}`);count++;}}
await mkdir('.local',{recursive:true});
await writeFile('.local/previous-memory-demo.json',JSON.stringify({backedUpAt:new Date().toISOString(),quizzes},null,2),{mode:0o600});
console.log(`Backed up ${quizzes.length} quizzes and ${count} attempts from the previous temporary demo to .local/previous-memory-demo.json.`);
