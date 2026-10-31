import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QuizEditorPage} from '../src/pages/teacher/QuizEditorPage';
const api=vi.hoisted(()=>({listClasses:vi.fn(async()=>[]),createQuiz:vi.fn()}));
vi.mock('../src/api/client',()=>({api}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
function show(){render(<MemoryRouter initialEntries={['/teacher/create']}><QuizEditorPage/></MemoryRouter>);}
it('keeps cleared timing fields blank and removes leading zeroes from new values',async()=>{
 show();const minutes=screen.getByLabelText('Time Limit (Minutes)') as HTMLInputElement,attempts=screen.getByLabelText('Max Attempts') as HTMLInputElement;
 fireEvent.change(minutes,{target:{value:''}});fireEvent.change(attempts,{target:{value:''}});expect(minutes.value).toBe('');expect(attempts.value).toBe('');
 fireEvent.change(minutes,{target:{value:'030'}});fireEvent.change(attempts,{target:{value:'02'}});expect(minutes.value).toBe('30');expect(attempts.value).toBe('2');expect(minutes.type).toBe('text');expect(minutes.inputMode).toBe('numeric');
});
it('requires valid limits before sending a save request',async()=>{
 show();fireEvent.change(screen.getByLabelText('Quiz Title *'),{target:{value:'Sample'}});
 fireEvent.change(screen.getByLabelText('Time Limit (Minutes)'),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Save quiz'}));expect(screen.getByText('Enter a time limit from 1 to 10,080 minutes.')).toBeTruthy();expect(api.createQuiz).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Time Limit (Minutes)'),{target:{value:'30'}});fireEvent.change(screen.getByLabelText('Max Attempts'),{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Save quiz'}));expect(screen.getByText('Enter an attempt limit from 1 to 100.')).toBeTruthy();expect(api.createQuiz).not.toHaveBeenCalled();
});
