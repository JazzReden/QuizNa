import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {PdfSheetUpload} from '../src/components/teacher/PdfSheetUpload';
const mocks=vi.hoisted(()=>({destroy:vi.fn(),render:vi.fn().mockResolvedValue(undefined)}));
vi.mock('../src/utils/paper-pdf',()=>({openAnswerPdf:vi.fn().mockImplementation(async()=>({numPages:2,loadingTask:{destroy:mocks.destroy}})),renderAnswerPdfPage:mocks.render}));
afterEach(()=>{cleanup();vi.clearAllMocks()});
it('previews pages without scanning or saving until the teacher requests a scan',async()=>{
 const scan=vi.fn().mockResolvedValue(undefined);
 render(<PdfSheetUpload file={new File(['%PDF-'],'answers.pdf')} disabled={false} onScan={scan} onClose={()=>{}}/>);
 const select=await screen.findByLabelText('PDF page');
 await waitFor(()=>expect((screen.getByText('Scan this page') as HTMLButtonElement).disabled).toBe(false));
 expect(scan).not.toHaveBeenCalled();
 fireEvent.change(select,{target:{value:'2'}});
 await waitFor(()=>expect(mocks.render.mock.calls.at(-1)?.[1]).toBe(2));
 await waitFor(()=>expect((screen.getByText('Scan this page') as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByText('Scan this page'));
 expect(scan).toHaveBeenCalledTimes(1);
 cleanup();expect(mocks.destroy).toHaveBeenCalled();
});
