import "./qa-report-directory.mjs";
// Read-only source/ignore audit. Does not initialize, stage, commit or push this project.
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, stat, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
let scratch;
const findings = [];
const required = ['package.json','package-lock.json','frontend/package.json','backend/package.json',
  'frontend/.env.example','backend/.env.example','frontend/src/main.tsx','backend/src/main.ts',
  'frontend/vite.config.ts','frontend/tsconfig.json','backend/tsconfig.json','README.md','vercel.json','render.yaml',
  'supabase/migrations/01_schema.sql','supabase/migrations/14_copy_quiz.sql'];
const secretValues = new Set();
const secretName = /password|secret|api[_-]?key|service.?role|refresh[_-]?token|access[_-]?token|jwt/i;
const remember = value => {
  if (typeof value === 'string' && value.length >= 12 && !/your[-_]|placeholder/i.test(value)) secretValues.add(value);
};
function fromJson(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (secretName.test(key)) remember(child);
    if (typeof child === 'object') fromJson(child);
  }
}
// Compare upload candidates against local credentials without displaying values.
for (const path of ['.env','backend/.env','frontend/.env']) {
  try {
    for (const line of (await readFile(join(root,path),'utf8')).split('\n')) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (match && secretName.test(match[1])) remember(match[2].replace(/^(['"])(.*)\1$/, '$2'));
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
try {
  for (const name of await readdir(join(root,'.local'))) {
    if (!name.endsWith('.json')) continue;
    const path = join(root,'.local',name);
    if ((await stat(path)).size > 512_000) continue;
    try { fromJson(JSON.parse(await readFile(path,'utf8'))); } catch { /* Non-JSON private files are not upload candidates. */ }
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }

try {
  let gitArgs;
  try { await stat(join(root,'.git')); gitArgs = ['-C',root]; }
  catch {
    scratch = await mkdtemp(join(tmpdir(),'quizna-source-audit-'));
    const result = spawnSync('git',['init','--bare',scratch],{encoding:'utf8'});
    if (result.status !== 0) throw new Error('Unable to create isolated ignore-rule checker');
    gitArgs = [`--git-dir=${scratch}`,`--work-tree=${root}`];
  }
  const git = args => {
    const result = spawnSync('git',[...gitArgs,...args],{encoding:'utf8',cwd:root,maxBuffer:16*1024*1024});
    if (result.status !== 0) throw new Error('Git file inspection failed');
    return result.stdout.split('\0').filter(Boolean);
  };
  const files = [...new Set(git(['ls-files','--cached','--others','--exclude-standard','-z']))].sort();
  for (const file of git(['ls-files','--cached','--ignored','--exclude-standard','-z'])) findings.push({file,reason:'Already tracked despite an ignore rule; review and untrack before commit'});
  const candidates = new Set(files);
  const privatePaths = ['.env','.env.local','.env.production','frontend/.env','backend/.env',
    'frontend/.env.production.local','backend/.env.local','node_modules/example/index.js',
    'frontend/dist/index.html','backend/build/main.js','.next/cache/file','out/index.html',
    'uploads/student.pdf','frontend/uploads/sheet.png','backend/scans/answer.jpg',
    'tmp/pdfs/student.pdf','.local/classroom-preview.json','output/pdf/student.pdf',
    '.idea/workspace.xml','.vscode/settings.json','backend/logs/server.log','.DS_Store',
    'docs/CLASSROOM_PREVIEW.json','docs/classroom-preview.png'];
  const checked = spawnSync('git',[...gitArgs,'check-ignore','--no-index','-z','--stdin'],
    {cwd:root,encoding:'utf8',input:privatePaths.join('\0')+'\0'});
  if (![0,1].includes(checked.status)) throw new Error('Ignore-rule verification failed');
  const ignored = new Set(checked.stdout.split('\0').filter(Boolean));
  for (const file of privatePaths) if (!ignored.has(file)) findings.push({file,reason:'Private/generated path is not ignored'});
  for (const file of required) if (!candidates.has(file)) findings.push({file,reason:'Required deployment source missing or ignored'});
  for (const directory of ['frontend/src/','backend/src/','frontend/public/','supabase/migrations/','mysql/']) {
    if (!files.some(file=>file.startsWith(directory))) findings.push({file:directory,reason:'Required source/assets/schema directory missing or ignored'});
  }
  let textFiles = 0;
  for (const file of files) {
    const path = resolve(root,file);
    const info = await stat(path);
    if (!info.isFile() || info.size > 4_000_000) continue;
    const buffer = await readFile(path);
    if (buffer.includes(0)) continue;
    textFiles++;
    const lines = buffer.toString('utf8').split('\n');
    lines.forEach((line,index) => {
      let reason;
      if ([...secretValues].some(value=>line.includes(value))) reason='Matches a locally configured credential (value hidden)';
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)) reason='Private key material';
      if (/(?:sk-(?:proj-)?[A-Za-z0-9_-]{25,}|AIza[A-Za-z0-9_-]{30,}|sb_secret_[A-Za-z0-9_-]{20,})/.test(line)) reason='Potential provider secret';
      if (/(?:postgres(?:ql)?|mysql):\/\/[^\s:'"/]+:[^\s@'"/]+@/.test(line) && !/YOUR|placeholder|example/i.test(line)) reason='Potential credential-bearing database URL';
      if (/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/.test(line)) reason='Potential embedded JWT';
      if (reason) findings.push({file,line:index+1,reason});
    });
  }
  const report = {date:new Date().toISOString(),repositoryInitialized:!scratch,readOnly:true,pushPerformed:false,
    candidateFiles:files.length,textFilesScanned:textFiles,ignoreCasesChecked:privatePaths.length,findings,
    limitations:'Pattern and known-local-credential scanning cannot detect every possible secret; review staged changes before committing.'};
  await writeFile(join(root,'.local/qa/reports/GITHUB_AUDIT.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if (findings.length) process.exitCode=1;
} finally { if (scratch) await rm(scratch,{recursive:true,force:true}); }
