import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QuizEditorPage} from '../src/pages/teacher/QuizEditorPage';
const api=vi.hoisted(()=>({listClasses:vi.fn(async()=>[]),listSections:vi.fn(async()=>[]),createQuiz:vi.fn(),updateQuiz:vi.fn(),createQuestion:vi.fn(),saveDraftQuestions:vi.fn(),updateQuestion:vi.fn(),importQuestions:vi.fn()}));
vi.mock('../src/api/client',()=>({api,ApiError:class extends Error{status=400}}));
afterEach(()=>{cleanup();vi.clearAllMocks();sessionStorage.clear();});
function show(){render(<MemoryRouter initialEntries={['/teacher/create']}><QuizEditorPage/></MemoryRouter>);}
async function addEssay(){fireEvent.click(screen.getByRole('button',{name:'Add Question',exact:true}));fireEvent.change(screen.getByLabelText('Question Type'),{target:{value:'essay'}});fireEvent.change(screen.getByLabelText('Prompt *'),{target:{value:'Explain one healthy study habit.'}});fireEvent.click(screen.getByRole('button',{name:'Save Question',exact:true}));await screen.findByText('Explain one healthy study habit.');}
it('adds and edits a question before any server save, then persists it when Save quiz is chosen',async()=>{
 show();await addEssay();expect(api.createQuiz).not.toHaveBeenCalled();expect(api.createQuestion).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Edit',exact:true}));fireEvent.change(screen.getByLabelText('Prompt *'),{target:{value:'Explain two healthy study habits.'}});fireEvent.click(screen.getByRole('button',{name:'Save Question',exact:true}));await screen.findByText('Explain two healthy study habits.');expect(api.updateQuestion).not.toHaveBeenCalled();
 api.createQuiz.mockResolvedValue({id:'saved'});api.saveDraftQuestions.mockImplementation(async(items:any[])=>items.map(data=>({...data,id:'stored-question'})));
 fireEvent.change(screen.getByLabelText('Quiz Title *'),{target:{value:'Study habits'}});fireEvent.click(screen.getByRole('button',{name:'Save quiz',exact:true}));
 await waitFor(()=>expect(api.saveDraftQuestions).toHaveBeenCalledTimes(1));expect(api.createQuiz.mock.calls[0][0].client_draft_id).toMatch(/^[a-f0-9-]{36}$/);expect(api.saveDraftQuestions.mock.calls[0][0][0]).toMatchObject({quiz_id:'saved',type:'essay',prompt:'Explain two healthy study habits.'});
});
it('can paste questions without a title or saved quiz',async()=>{
 show();fireEvent.click(screen.getByRole('button',{name:'Paste questions',exact:true}));
 const input=await screen.findByPlaceholderText(/Which planet/);fireEvent.change(input,{target:{value:'1. Which is a color?\nA. Green\nB. Seven\nAnswer: A'}});fireEvent.click(screen.getByRole('button',{name:'Organize & preview'}));fireEvent.click(await screen.findByRole('button',{name:'Add 1 question',exact:true}));await screen.findByText('Which is a color?');expect(api.importQuestions).not.toHaveBeenCalled();expect(api.createQuiz).not.toHaveBeenCalled();
});
it('reuses pending question keys after a failed save instead of creating another quiz',async()=>{
 show();await addEssay();api.createQuiz.mockResolvedValue({id:'saved'});api.updateQuiz.mockResolvedValue({id:'saved'});api.saveDraftQuestions.mockRejectedValueOnce(new Error('Connection lost')).mockImplementation(async(items:any[])=>items.map(data=>({...data,id:'stored'})));
 fireEvent.change(screen.getByLabelText('Quiz Title *'),{target:{value:'Retry sample'}});fireEvent.click(screen.getByRole('button',{name:'Save quiz',exact:true}));await screen.findByText(/Connection lost/);fireEvent.click(screen.getByRole('button',{name:'Save quiz',exact:true}));await waitFor(()=>expect(api.saveDraftQuestions).toHaveBeenCalledTimes(2));expect(api.createQuiz).toHaveBeenCalledTimes(1);expect(api.saveDraftQuestions.mock.calls[0][0][0].client_question_id).toBe(api.saveDraftQuestions.mock.calls[1][0][0].client_question_id);
});
