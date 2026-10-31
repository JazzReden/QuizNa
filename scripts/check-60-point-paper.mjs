import {createRequire} from 'node:module';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),runtime=createRequire('/Users/jazzreden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {createCanvas,loadImage}=runtime('@napi-rs/canvas'),jsQR=require('jsqr'),{readMarks}=require('../.local/sixty-point/compiled/paper-scan.js');
const {GradingService}=require('../backend/dist/modules/grading/grading.service');const grading=new GradingService(null);
const sheet=JSON.parse(await readFile('.local/sixty-point/sheet.json','utf8')),questions=JSON.parse(await readFile('.local/sixty-point/questions.json','utf8'));
const cases=[];
async function scan(name,path,{blank=false,obscured=false}={}){
 const image=await loadImage(path),factor=Math.min(1,2200/Math.max(image.width,image.height)),canvas=createCanvas(Math.round(image.width*factor),Math.round(image.height*factor)),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),qr=jsQR(pixels.data,canvas.width,canvas.height,{inversionAttempts:'dontInvert'});
 if(obscured){cases.push({name,qrRejected:!qr});assert.ok(!qr);return;}
 if(!qr){cases.push({name,qrDetected:false,correctAnswers:0});return;}
 assert.equal(qr.data,`QUIZNA:P1:${sheet.id}:0:${sheet.token}`);
 let marks; try { marks=readMarks(pixels.data,canvas.width,canvas.height,qr.location,sheet.layout.pages[0]); } catch(error) { cases.push({name,qrDetected:true,alignmentRejected:true,message:error.message}); return; }
 let correct=0,score=0;const statuses={};
 for(const mark of marks){statuses[mark.status]=(statuses[mark.status]||0)+1;const q=questions.find(q=>q.id===mark.questionId);if(mark.status==='marked'){if(mark.answer===q.correct_answer)correct++;score+=grading.getStrategy(q.type).grade(q,mark.answer).scoreAwarded;}}
 cases.push({name,qrDetected:true,correctAnswers:correct,objectiveScore:score,statuses});
 if(blank){assert.equal(statuses.blank,40);assert.equal(statuses.written,4);}
 return marks;
}
await scan('Printed PDF · blank','output/paper-60/printed-blank.png',{blank:true});
for(const [name,file] of [['Printed PDF · all marked','printed-answered.png'],['Camera simulation · clear','photo-clear.jpg'],['Camera simulation · 5° rotation','photo-rotated.jpg'],['Camera simulation · dim and JPEG compression','photo-dim.jpg'],['Camera simulation · perspective','photo-perspective.jpg']])await scan(name,'output/paper-60/'+file);
await scan('Camera simulation · QR covered by glare','output/paper-60/photo-qr-obscured.jpg',{obscured:true});
// A double-shaded answer must require review, rather than guessing.
const img=await loadImage('output/paper-60/answered.png'),canvas=createCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const row=sheet.layout.pages[0].rows[0],question=questions.find(q=>q.id===row.questionId),other=row.options.find(o=>o.id!==question.correct_answer);ctx.fillStyle='#142b74';ctx.beginPath();ctx.arc(other.x*3,row.y*3,27,0,Math.PI*2);ctx.fill();await writeFile('output/paper-60/double-mark.png',canvas.toBuffer('image/png'));
const ambiguous=await scan('Two choices shaded · review required','output/paper-60/double-mark.png');assert.equal(ambiguous.find(m=>m.questionId===row.questionId).status,'multiple');
ctx.drawImage(img,0,0);ctx.fillStyle='white';ctx.fillRect(925*3,1454*3,75*3,75*3);await writeFile('output/paper-60/missing-corner.png',canvas.toBuffer('image/png'));
await scan('Corner square missing · retake required','output/paper-60/missing-corner.png');assert.ok(cases.at(-1).alignmentRejected);
const report={checkedAt:new Date().toISOString(),questions:44,possiblePoints:60,objectivePoints:40,essayPoints:20,essaysRequireTeacherReview:true,same2200PixelLimitAsPhone:true,physicalPhoneCameraTested:false,realPrinterTested:false,scoreSaved:false,cases};
await writeFile('docs/SIXTY_POINT_SCAN_CHECK.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
assert.ok(cases.filter(c=>c.name.includes('Camera simulation')&&!c.qrRejected).every(c=>c.correctAnswers===40),'A camera simulation needs review');
