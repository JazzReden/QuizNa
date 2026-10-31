import{it,expect,vi,beforeEach,afterEach}from'vitest';
import{render,screen,cleanup}from'@testing-library/react';
import{MemoryRouter}from'react-router-dom';
import{QuizEditorPage}from'../src/pages/teacher/QuizEditorPage';
const api=vi.hoisted(()=>({getSubject:vi.fn(),listClasses:vi.fn(),listSections:vi.fn(),createQuiz:vi.fn(),attachSubjectQuiz:vi.fn()}));
vi.mock('../src/api/client',()=>({api}));
beforeEach(()=>{vi.clearAllMocks();api.listClasses.mockResolvedValue([{id:'class',name:'St. Vincent'}]);api.listSections.mockResolvedValue([])});
afterEach(()=>cleanup());
function show(){render(<MemoryRouter initialEntries={['/teacher/create?subjectRoom=selected']}><QuizEditorPage/></MemoryRouter>)}
it('blocks an unowned subject before showing a quiz form or saving any data',async()=>{
 api.getSubject.mockRejectedValue(Object.assign(Error('Forbidden'),{status:403}));show();
 expect(await screen.findByRole('heading',{name:'Choose a subject from your account'})).toBeTruthy();
 expect(screen.getByText(/not available to the signed-in teacher/)).toBeTruthy();
 expect(screen.getByRole('link',{name:'My subjects'}).getAttribute('href')).toBe('/teacher');
 expect(screen.queryByRole('button',{name:'Save quiz',exact:true})).toBeNull();
 expect(screen.queryByLabelText('Quiz Title *')).toBeNull();
 expect(api.createQuiz).not.toHaveBeenCalled();expect(api.attachSubjectQuiz).not.toHaveBeenCalled();
});
it('waits for subject authorization before enabling the editor',async()=>{
 api.getSubject.mockReturnValue(new Promise(()=>{}));show();
 expect(screen.getByRole('status').textContent).toContain('Loading quiz workspace');
 expect(screen.queryByRole('button',{name:'Save quiz',exact:true})).toBeNull();
});
it('preselects an owned subject and section after authorization succeeds',async()=>{
 api.getSubject.mockResolvedValue({id:'selected',name:'Practical Research',class_section_id:'class'});show();
 expect((await screen.findByLabelText('Subject (optional)') as HTMLInputElement).value).toBe('Practical Research');
 expect((await screen.findByRole('checkbox',{name:/St. Vincent/}) as HTMLInputElement).checked).toBe(true);
 expect(screen.getByRole('button',{name:'Save quiz',exact:true})).toBeTruthy();
});
it('offers a safe recovery for deleted subjects without opening a blank form',async()=>{
 api.getSubject.mockRejectedValue(Object.assign(Error('not found'),{status:404}));show();
 expect(await screen.findByText(/no longer available/)).toBeTruthy();
 expect(screen.getByRole('link',{name:'Use another account'}).getAttribute('href')).toBe('/login');
 expect(screen.queryByRole('button',{name:'Save quiz',exact:true})).toBeNull();
});
