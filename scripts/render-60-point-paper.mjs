import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),runtime=createRequire('/Users/jazzreden/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {createCanvas,loadImage}=runtime('@napi-rs/canvas');
await build({entryPoints:['frontend/src/utils/paper-print.ts','frontend/src/utils/paper-scan.ts'],bundle:true,platform:'node',format:'cjs',outdir:'.local/sixty-point/compiled',logLevel:'silent'});
globalThis.document={createElement:()=>createCanvas(1,1)};
const {answerSheetImages}=require('../.local/sixty-point/compiled/paper-print.js');
const sheet=JSON.parse(await readFile('.local/sixty-point/sheet.json','utf8')),questions=JSON.parse(await readFile('.local/sixty-point/questions.json','utf8'));
const [image]=await answerSheetImages(sheet,3),source=await loadImage(Buffer.from(image.split(',')[1],'base64'));
assert.equal(source.width,3000);
await mkdir('output/paper-60',{recursive:true});
await writeFile('output/paper-60/blank.png',Buffer.from(image.split(',')[1],'base64'));
const canvas=createCanvas(source.width,source.height),ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);ctx.scale(3,3);
ctx.fillStyle='#132d77';ctx.font='20px Arial';ctx.fillText('Ella Garcia',160,203);ctx.fillText('Grade 12 St. Vincent',175,259);
const practice=['We can use refillable bottles and reusable containers. Count discarded cups each week to check progress.','Roots hold soil in place. Trees also provide shelter and food for birds and insects.','Check the original source, date and evidence. Compare the claim with reliable science sources before sharing.','Repair leaking taps and turn off the tap while brushing teeth. Both habits reduce wasted water.'];
let objective=0,essay=0;
for(const row of sheet.layout.pages[0].rows){
 const q=questions.find(q=>q.id===row.questionId);
 if(row.options.length){const option=row.options.find(o=>o.id===q.correct_answer);assert.ok(option);ctx.beginPath();ctx.arc(option.x,row.y,9,0,Math.PI*2);ctx.fill();objective++;}
 else {ctx.font='13px Arial';let line='',y=row.y+32;const left=(row.x||650)+15,right=(row.x||650)+row.width;for(const word of practice[essay].split(' ')){if(ctx.measureText(line+word).width>right-left-5){ctx.fillText(line,left,y);y+=24;line='';}line+=word+' ';}ctx.fillText(line,left,y);assert.ok(y<row.y+row.height-10);essay++;}
}
await writeFile('output/paper-60/answered.png',canvas.toBuffer('image/png'));assert.equal(objective,40);assert.equal(essay,4);
console.log(JSON.stringify({objective,essay,pages:1,renderWidth:canvas.width,renderHeight:canvas.height}));
