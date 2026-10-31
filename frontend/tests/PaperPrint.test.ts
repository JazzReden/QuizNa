import { afterEach, expect, it, vi } from "vitest";
import { answerSheetImages } from "../src/utils/paper-print";
const qr = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("qrcode", () => ({ default: { toCanvas: qr } }));
afterEach(() => vi.restoreAllMocks());
it("keeps shading instructions outside answer labels and preserves QR, page and bubble coordinates", async () => {
  const text: { value: string; x: number; y: number }[] = [],
    circles: { x: number; y: number; r: number }[] = [];
  const context = {
    fillRect() {},
    drawImage() {},
    beginPath() {},
    stroke() {},
    fillText(value: string, x: number, y: number) {
      text.push({ value, x, y });
    },
    measureText: (value: string) => ({ width: value.length * 10 }),
    arc(x: number, y: number, r: number) {
      circles.push({ x, y, r });
    },
  };
  vi.spyOn(document, "createElement").mockImplementation(
    () =>
      ({
        getContext: () => context,
        toDataURL: () => "data:image/png;base64,fixture",
      }) as any,
  );
  const sheet: any = {
    id: "sheet",
    token: "qr-token",
    layout: {
      title: "Paper",
      student: "Ben Cruz",
      section: "Grade 12 St. Vincent",
      questions: [{ id: "question", type: "mcq", prompt: "Pick A" }],
      pages: [
        {
          index: 0,
          rows: [
            {
              questionId: "question",
              number: 1,
              type: "mcq",
              y: 310,
              height: 54,
              options: [
                { id: "a", label: "A", x: 300 },
                { id: "b", label: "B", x: 372 },
              ],
            },
          ],
        },
      ],
    },
  };
  await answerSheetImages(sheet);
  expect(
    text.find((t) => t.value.startsWith("Fill one bubble"))?.y,
  ).toBeGreaterThan(1300);
  expect(
    text.filter((t) => /Fill|ink/.test(t.value)).every((t) => t.y > 1300),
  ).toBe(true);
  expect(text.find((t) => t.value === "A")).toMatchObject({ x: 295, y: 290 });
  expect(circles).toEqual([
    { x: 300, y: 310, r: 12 },
    { x: 372, y: 310, r: 12 },
  ]);
  expect(qr).toHaveBeenCalledWith(
    expect.anything(),
    "QUIZNA:P1:sheet:0:qr-token",
    expect.objectContaining({ width: 280, errorCorrectionLevel: "M" }),
  );
  expect(text.find((t) => t.value === "Page 1/1")).toMatchObject({
    x: 780,
    y: 238,
  });
});
it("prints compact question numbers in their own columns with centered labels", async () => {
  const text: {value:string;x:number;y:number}[]=[],circles: {x:number;y:number}[]=[];
  const ctx={fillRect(){},drawImage(){},beginPath(){},stroke(){},moveTo(){},lineTo(){},fillText(value:string,x:number,y:number){text.push({value,x,y});},measureText:(value:string)=>({width:value.length*6}),arc(x:number,y:number){circles.push({x,y});}};
  vi.spyOn(document,'createElement').mockImplementation(()=>({getContext:()=>ctx,toDataURL:()=>"data:image/png;base64,fixture"}) as any);
  await answerSheetImages({id:'sheet',token:'token',layout:{revision:2,title:'Exam',student:'Student',section:'Section',questions:[{id:'q1'},{id:'q21'}],pages:[{index:0,rows:[{questionId:'q1',number:1,x:80,y:350,height:44,type:'mcq',options:[{id:'a',label:'A',x:145}]},{questionId:'q21',number:21,x:380,y:350,height:44,type:'mcq',options:[{id:'b',label:'B',x:445}]}]}]}} as any);
  expect(text.find(t=>t.value==='1.')).toMatchObject({x:80,y:357});
  expect(text.find(t=>t.value==='21.')).toMatchObject({x:380,y:357});
  expect(text.find(t=>t.value==='B')).toMatchObject({x:442,y:333});
  expect(circles).toEqual([{x:145,y:350},{x:445,y:350}]);
});
it("uses a long-bond canvas, write-in identity fields and the new bottom marker positions", async () => {
  const text:{value:string;x:number;y:number}[]=[],rects:{x:number;y:number;w:number;h:number}[]=[],canvases:any[]=[];
  const ctx={fillRect(x:number,y:number,w:number,h:number){rects.push({x,y,w,h});},drawImage(){},beginPath(){},stroke(){},moveTo(){},lineTo(){},fillText(value:string,x:number,y:number){text.push({value,x,y});},measureText:(value:string)=>({width:value.length*6}),arc(){}};
  vi.spyOn(document,'createElement').mockImplementation(()=>{const canvas={width:0,height:0,getContext:()=>ctx,toDataURL:()=>"data:image/png;base64,fixture"};canvases.push(canvas);return canvas as any;});
  await answerSheetImages({id:'sheet',token:'token',layout:{revision:3,paperSize:'long_bond',title:'Exam',student:'Ella Garcia',section:'Vincent',questions:[{id:'q',points:5,prompt:'Essay'}],pages:[{index:0,width:1000,height:1529,rows:[{questionId:'q',number:56,type:'essay',x:650,width:270,y:350,height:200,options:[]}]}]}} as any);
  expect(canvases[0].height).toBe(1529);
  expect(text.find(t=>t.value==='Name:')).toBeTruthy();expect(text.find(t=>t.value==='Section:')).toBeTruthy();
  expect(text.some(t=>t.value==='Student: Ella Garcia')).toBe(false);
  expect(text.find(t=>t.value.startsWith('Assigned to:'))?.value).toContain('Ella Garcia');
  expect(rects).toContainEqual({x:950,y:1479,w:20,h:20});
});
