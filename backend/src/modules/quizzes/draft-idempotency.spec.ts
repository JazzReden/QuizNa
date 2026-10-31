import {ConfigService} from '@nestjs/config';
import {DatabaseService} from '../../database/database.service';
import {QuizzesService} from './quizzes.service';
import {QuestionsService} from '../questions/questions.service';
const owner='a0000000-0000-0000-0000-000000000001',foreign='b0000000-0000-0000-0000-000000000003';
describe('Retry-safe quiz creation with locally composed questions',()=>{
 let db:DatabaseService,quizzes:QuizzesService,questions:QuestionsService;
 beforeEach(()=>{db=new DatabaseService(new ConfigService({NODE_ENV:'test'}));quizzes=new QuizzesService(db);questions=new QuestionsService(db);});
 it('reuses a scoped draft ID for concurrent creation and later retries',async()=>{
  const teacher=(await db.getProfile(owner))!,dto={title:'Local draft',client_draft_id:'b1000000-0000-4000-8000-000000000001'};
  const created=await Promise.all([quizzes.create(teacher,dto),quizzes.create(teacher,dto)]);expect(created[0].id).toBe(created[1].id);
  const changed=await quizzes.create(teacher,{...dto,title:'Revised draft'});expect(changed.id).toBe(created[0].id);expect(changed.title).toBe('Revised draft');expect(changed).not.toHaveProperty('client_draft_id');
 });
 it('stores each question once and applies an edited retry without duplicating it',async()=>{
  const teacher=(await db.getProfile(owner))!,quiz=await quizzes.create(teacher,{title:'Draft'}),dto={quiz_id:quiz.id,client_question_id:'c1000000-0000-4000-8000-000000000001',type:'essay' as const,prompt:'Explain A',points:5,options:[],correct_answer:null};
  const results=await Promise.all([questions.create(owner,dto),questions.create(owner,dto)]);expect(results[0].id).toBe(results[1].id);
  const edited=await questions.create(owner,{...dto,prompt:'Explain B'});expect(edited.id).toBe(results[0].id);expect(edited.prompt).toBe('Explain B');expect(await db.listQuestions(quiz.id)).toHaveLength(1);expect(edited).not.toHaveProperty('client_question_id');
  await expect(questions.create(foreign,dto)).rejects.toThrow('own this quiz');
 });
 it('validates the full batch before writing and accepts retry-safe batches',async()=>{
  const teacher=(await db.getProfile(owner))!,quiz=await quizzes.create(teacher,{title:'Batch'});
  const first={quiz_id:quiz.id,client_question_id:'c2000000-0000-4000-8000-000000000001',type:'essay' as const,prompt:'Essay',points:5,options:[],correct_answer:null};
  const invalid={quiz_id:quiz.id,client_question_id:'c2000000-0000-4000-8000-000000000002',type:'mcq' as const,prompt:'Pick',points:1,options:[{id:'a',text:'Only choice'}],correct_answer:'a'};
  await expect(questions.saveDraftBatch(owner,[first,invalid])).rejects.toThrow();expect(await db.listQuestions(quiz.id)).toHaveLength(0);
  const results=await Promise.all([questions.saveDraftBatch(owner,[first]),questions.saveDraftBatch(owner,[first])]);expect(results[0][0].id).toBe(results[1][0].id);expect(await db.listQuestions(quiz.id)).toHaveLength(1);
  await expect(questions.saveDraftBatch(foreign,[first])).rejects.toThrow('own this quiz');
 });
 it('preserves the frozen published version and rejects reusing its create key',async()=>{
  const teacher=(await db.getProfile(owner))!,dto={title:'Snapshot draft',client_draft_id:'d1000000-0000-4000-8000-000000000001'},quiz=await quizzes.create(teacher,dto),question={quiz_id:quiz.id,client_question_id:'e1000000-0000-4000-8000-000000000001',type:'essay' as const,prompt:'Original',points:5,options:[],correct_answer:null};
  await questions.create(owner,question);const published=await quizzes.publish(quiz.id,owner);await questions.create(owner,{...question,prompt:'Later draft'});
  expect((await db.getQuizVersion(quiz.id,published.version))?.snapshot_data.questions[0].prompt).toBe('Original');await expect(quizzes.create(teacher,dto)).rejects.toThrow('already published');
 });
});
