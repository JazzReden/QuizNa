// Read-only regression against existing rendered sample sheets and frozen keys.
import { createRequire } from 'node:module';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { config } from 'dotenv';
import { createConnection } from 'mysql2/promise';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const runtime=createRequire('/Users/jazzreden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {createCanvas,loadImage}=runtime('@napi-rs/canvas'),jsQR=require('jsqr');
await mkdir('.local/current-scan',{recursive:true});
await require('esbuild').build({entryPoints:['frontend/src/utils/paper-scan.ts'],bundle:true,platform:'node',format:'cjs',outfile:'.local/current-scan/paper-scan.cjs'});
const {readMarks}=require('../.local/current-scan/paper-scan.cjs');
const {GradingService}=require('../backend/dist/modules/grading/grading.service');
config({path:'backend/.env',quiet:true});
if(process.env.DATABASE_MODE!=='mysql')throw Error('This audit uses local XAMPP sample sheets only.');
const db=await createConnection({socketPath:process.env.MYSQL_SOCKET,host:process.env.MYSQL_HOST||'127.0.0.1',port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
const hash=async()=>{const [rows]=await db.query('SELECT id,score,max_score,is_graded FROM quiz_attempts ORDER BY id');return createHash('sha256').update(JSON.stringify(rows)).digest('hex');};
try{
 const before=await hash(),checks=[];
 for(const fixture of [
  {name:'Ben · 10-question paper',sheet:'.local/ben-paper-sheet.json',files:['tmp/pdfs/ben-answered.png'],expected:10},
  {name:'Ella · 60-question long bond',sheet:'.local/long-bond-paper-sheet.json',files:['tmp/pdfs/ella-answered-final-1.png'],expected:55},
  {name:'Carla · 60-question multi-page',sheet:'.local/long-paper-sheet.json',files:Array.from({length:5},(_,i)=>`tmp/pdfs/long-answered-${i+1}.png`),expected:55},
 ]){
  const sheet=JSON.parse(await readFile(fixture.sheet,'utf8'));
  const [versions]=await db.execute('SELECT snapshot_data FROM quiz_versions WHERE id=?',[sheet.quiz_version_id]);
  const version=typeof versions[0].snapshot_data==='string'?JSON.parse(versions[0].snapshot_data):versions[0].snapshot_data;
  const grading=new GradingService(null);let score=0,objectives=0,essays=0;
  assert.equal(sheet.layout.pages.length,fixture.files.length);
  for(let index=0;index<fixture.files.length;index++){
   const image=await loadImage(fixture.files[index]),scale=Math.min(1,2200/Math.max(image.width,image.height));
   const canvas=createCanvas(Math.round(image.width*scale),Math.round(image.height*scale)),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),qr=jsQR(pixels.data,canvas.width,canvas.height,{inversionAttempts:'dontInvert'});
   assert.equal(qr?.data,`QUIZNA:P1:${sheet.id}:${index}:${sheet.token}`,'QR must identify the correct student sheet and page');
   const marks=readMarks(pixels.data,canvas.width,canvas.height,qr.location,sheet.layout.pages[index]);
   for(const mark of marks){if(mark.status==='written'){essays++;continue;}assert.equal(mark.status,'marked',`${fixture.name}, question ${mark.number}: expected a clear mark`);objectives++;const question=version.questions.find(q=>q.id===mark.questionId);score+=grading.getStrategy(question.type).grade(question,mark.answer).scoreAwarded;}
  }
  assert.equal(score,fixture.expected);
  checks.push({fixture:fixture.name,pages:fixture.files.length,objectiveAnswers:objectives,objectiveScore:score,essaysForTeacherReview:essays});
 }
 assert.equal(await hash(),before);
 const report={checkedAt:new Date().toISOString(),passed:true,currentScannerSource:true,same2200PixelLimitAsBrowser:true,checks,existingScoresUnchanged:true,physicalPhoneCameraTested:false};
 await writeFile('docs/PAPER_IMAGE_CHECK.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await db.end();}
