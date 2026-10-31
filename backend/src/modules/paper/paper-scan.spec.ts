import {
  homography,
  readMarks,
  MARKERS,
  QR_POINTS,
} from "../../../../frontend/src/utils/paper-scan";
import { paperLayout } from "./paper-layout";
const jsQR: typeof import("jsqr").default = require("jsqr");
import QRCode = require("qrcode");
const location = (points: any[]) => ({
  topLeftCorner: points[0],
  topRightCorner: points[1],
  bottomRightCorner: points[2],
  bottomLeftCorner: points[3],
});
describe("Printed-sheet optical mark recognition", () => {
  const page = {
    index: 0,
    rows: [
      {
        questionId: "q1",
        number: 1,
        type: "mcq",
        y: 350,
        height: 54,
        options: [
          { id: "a", label: "A", x: 300 },
          { id: "b", label: "B", x: 372 },
        ],
      },
    ],
  };
  function photo(
    mark: "a" | "both" | "faint" | "none",
    tilted = false,
    withMarkers = true,
  ) {
    const width = 1100,
      height = 1500,
      data = new Uint8ClampedArray(width * height * 4).fill(255);
    const transform = homography(
      [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1414 },
        { x: 0, y: 1414 },
      ],
      tilted
        ? [
            { x: 25, y: 15 },
            { x: 1050, y: 65 },
            { x: 1000, y: 1450 },
            { x: 70, y: 1400 },
          ]
        : [
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
            { x: 1000, y: 1414 },
            { x: 0, y: 1414 },
          ],
    );
    const paint = (x: number, y: number, tone: number) => {
      const p = transform({ x, y }),
        xx = Math.round(p.x),
        yy = Math.round(p.y);
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const i = ((yy + dy) * width + xx + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = tone;
        }
    };
    if (withMarkers)
      for (const p of MARKERS)
        for (let y = -10; y <= 10; y++)
          for (let x = -10; x <= 10; x++) paint(p.x + x, p.y + y, 0);
    for (const o of page.rows[0].options)
      for (let dy = -13; dy <= 13; dy++)
        for (let dx = -13; dx <= 13; dx++) {
          const d = dx * dx + dy * dy;
          if (d >= 110 && d <= 155) paint(o.x + dx, 350 + dy, 0);
          if (d < 65 && (mark === "both" || (mark === "a" && o.id === "a")))
            paint(o.x + dx, 350 + dy, 20);
          if (d < 65 && mark === "faint" && o.id === "a" && dx < 0)
            paint(o.x + dx, 350 + dy, 90);
        }
    return { data, width, height, qr: location(QR_POINTS.map(transform)) };
  }
  it.each([false, true])("reads filled bubbles with tilt=%s", (tilted) => {
    const p = photo("a", tilted);
    expect(readMarks(p.data, p.width, p.height, p.qr, page)[0]).toMatchObject({
      answer: "a",
      status: "marked",
    });
  });
  it("reads a fully shaded blue-ballpen bubble", () => {
    const p = photo("a");
    for (let i = 0; i < p.data.length; i += 4) {
      if (p.data[i] === 20) {
        p.data[i] = 15;
        p.data[i + 1] = 30;
        p.data[i + 2] = 170;
      }
    }
    expect(readMarks(p.data, p.width, p.height, p.qr, page)[0]).toMatchObject({
      answer: "a",
      status: "marked",
    });
  });
  it.each([
    ["both", "multiple"],
    ["faint", "uncertain"],
    ["none", "blank"],
  ] as const)("flags %s marks as %s", (mark, status) => {
    const p = photo(mark);
    expect(readMarks(p.data, p.width, p.height, p.qr, page)[0]).toMatchObject({
      answer: null,
      status,
    });
  });
  it("rejects cropped/missing alignment marks", () => {
    const p = photo("a", false, false);
    expect(() => readMarks(p.data, p.width, p.height, p.qr, page)).toThrow(
      "corner squares",
    );
  });
  it("decodes a real printed QR token from pixels", () => {
    const code =
        "QUIZNA:P1:00000000-0000-4000-8000-000000000000:0:01234567890123456789012345678901",
      qr = QRCode.create(code, { errorCorrectionLevel: "M" });
    const size = qr.modules.size,
      scale = 6,
      width = (size + 8) * scale,
      data = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (qr.modules.get(y, x))
          for (let yy = 0; yy < scale; yy++)
            for (let xx = 0; xx < scale; xx++) {
              const i =
                (((y + 4) * scale + yy) * width + (x + 4) * scale + xx) * 4;
              data[i] = data[i + 1] = data[i + 2] = 0;
            }
    expect(jsQR(data, width, width)?.data).toBe(code);
  });
  it("identifies a real QR and grades optical marks from the same full-page pixels", () => {
    const p = photo("a"),
      code =
        "QUIZNA:P1:00000000-0000-4000-8000-000000000000:0:01234567890123456789012345678901",
      qr = QRCode.create(code, { errorCorrectionLevel: "M" });
    for (let y = 70; y < 210; y++)
      for (let x = 780; x < 920; x++) {
        const dark = qr.modules.get(
          Math.floor(((y - 70) / 140) * qr.modules.size),
          Math.floor(((x - 780) / 140) * qr.modules.size),
        );
        const i = (y * p.width + x) * 4;
        p.data[i] = p.data[i + 1] = p.data[i + 2] = dark ? 0 : 255;
      }
    const detected = jsQR(p.data, p.width, p.height, {
      inversionAttempts: "dontInvert",
    });
    expect(detected?.data).toBe(code);
    expect(
      readMarks(p.data, p.width, p.height, detected!.location, page)[0],
    ).toMatchObject({ answer: "a", status: "marked" });
  });
  it("paginates long exams and keeps randomized option order stable without exposing keys", () => {
    const questions = Array.from({ length: 70 }, (_, i) => ({
      id: `q${i}`,
      quiz_id: "quiz",
      prompt: "Question",
      points: 1,
      type: "mcq",
      order_index: i,
      correct_answer: "a",
      options: [
        { id: "a", text: "A", is_correct: true },
        { id: "b", text: "B" },
      ],
    }));
    const version: any = {
      snapshot_data: {
        title: "Exam",
        time_limit_minutes: 20,
        randomize_questions: true,
        randomize_options: true,
        questions,
      },
    };
    const first = paperLayout(version, "sheet", "Student", "Section");
    expect(first).toEqual(paperLayout(version, "sheet", "Student", "Section"));
    expect(first.pages.length).toBeGreaterThan(1);
    expect(first.pages.flatMap((p) => p.rows)).toHaveLength(70);
    expect(JSON.stringify(first)).not.toContain("correct_answer");
    expect(JSON.stringify(first)).not.toContain("is_correct");
  });
});

describe("Compact paper layout", () => {
  const version = (options = 4): any => ({ snapshot_data: {
    title: "60-question exam", time_limit_minutes: 90,
    randomize_questions: false, randomize_options: false,
    questions: Array.from({ length: 60 }, (_, i) => ({
      id: `q${i + 1}`, quiz_id: "quiz", order_index: i, prompt: `Question ${i + 1}`,
      type: i < 40 ? "mcq" : i < 55 ? "true_false" : "essay", points: i < 55 ? 1 : 5,
      options: i < 40 ? Array.from({length:options}, (_, n) => ({id:`o${n}`,text:`Option ${n}`})) : i < 55 ? [{id:"true",text:"True"},{id:"false",text:"False"}] : undefined,
    })),
  }});
  it("fits 55 objective answers in three columns and keeps five essays on two separate pages", () => {
    const layout = paperLayout(version(), "seed", "Carla", "Vincent");
    expect(layout.revision).toBe(2);
    expect(layout.pages).toHaveLength(3);
    expect(layout.pages[0].rows).toHaveLength(55);
    expect(new Set(layout.pages[0].rows.map(row => row.x)).size).toBe(3);
    expect(layout.pages[1].rows.map(row => row.number)).toEqual([56,57,58]);
    expect(layout.pages[2].rows.map(row => row.number)).toEqual([59,60]);
    expect(layout.pages.flatMap(page => page.rows).map(row => row.questionId)).toEqual(Array.from({length:60},(_,i)=>`q${i+1}`));
    for (const page of layout.pages) for (const row of page.rows) {
      expect(row.y + row.height).toBeLessThanOrEqual(1270);
      expect(row.options.every(option => option.x >= 100 && option.x + 12 <= 920)).toBe(true);
    }
  });
  it.each([6,8])("keeps %i-choice questions within page bounds without shrinking bubbles", count => {
    const layout=paperLayout(version(count),"seed","Student","Section");
    const expected=count===6?2:1;
    expect(new Set(layout.pages[0].rows.map(row=>row.x)).size).toBe(expected);
    for(const page of layout.pages)for(const row of page.rows)expect(row.options.every(option=>option.x+12<=920)).toBe(true);
  });
  it("reads marks from every compact column with the existing alignment algorithm", () => {
    const page=paperLayout(version(),"seed","Student","Section").pages[0];
    const width=1000,height=1414,data=new Uint8ClampedArray(width*height*4).fill(255);
    const dark=(x:number,y:number)=>{const index=(y*width+x)*4;data[index]=data[index+1]=data[index+2]=0;};
    for(const marker of MARKERS)for(let y=marker.y-10;y<marker.y+10;y++)for(let x=marker.x-10;x<marker.x+10;x++)dark(x,y);
    for(const row of page.rows){const chosen=row.options[(row.number-1)%row.options.length];for(let dy=-9;dy<=9;dy++)for(let dx=-9;dx<=9;dx++)if(dx*dx+dy*dy<=81)dark(chosen.x+dx,row.y+dy);}
    const marks=readMarks(data,width,height,location(QR_POINTS),page);
    expect(marks).toHaveLength(55);
    for(let i=0;i<marks.length;i++){const row=page.rows[i];expect(marks[i]).toMatchObject({status:"marked",answer:row.options[(row.number-1)%row.options.length].id});}
  });
});

describe("Long bond write-in form", () => {
  const version = (count=60): any => ({snapshot_data:{title:"Exam",time_limit_minutes:90,questions:Array.from({length:count},(_,i)=>({id:`q${i}`,type:i<40?'mcq':i<55?'true_false':'essay',points:i<55?1:5,prompt:`Question ${i+1}`,options:i<40?[{id:'a',text:'A'},{id:'b',text:'B'},{id:'c',text:'C'},{id:'d',text:'D'}]:i<55?[{id:'t',text:'True'},{id:'f',text:'False'}]:undefined}))}});
  it("fits 40 MCQ, 15 true/false and five short essays on one 8.5 by 13 form", () => {
    const layout=paperLayout(version(),'id','Student','Section','long_bond');
    expect(layout.revision).toBe(3);expect(layout.paperSize).toBe('long_bond');expect(layout.pages).toHaveLength(1);
    const page=layout.pages[0];expect(page.height).toBe(1529);expect(page.rows).toHaveLength(60);
    expect(page.rows.every(row=>row.y+row.height<=1390)).toBe(true);
    expect(page.rows.filter(row=>row.width===270)).toHaveLength(5);
    expect(page.rows.filter(row=>row.options.length&&row.showOptionLabels)).toHaveLength(3);
  });
  it("uses extra pages for longer responses and avoids overflowing mixed headers", () => {
    expect(paperLayout(version(61),'id','Student','Section','long_bond').pages.length).toBeGreaterThan(1);
    const mixed=version();mixed.snapshot_data.questions=mixed.snapshot_data.questions.slice(0,55).map((q:any,i:number)=>({...q,type:i%2?'true_false':'mcq',options:i%2?[{id:'t',text:'True'},{id:'f',text:'False'}]:[{id:'a',text:'A'},{id:'b',text:'B'}]}));
    const layout=paperLayout(mixed,'id','Student','Section','long_bond');expect(new Set(layout.pages[0].rows.map(row=>row.x)).size).toBe(3);
    expect(layout.pages.flatMap(page=>page.rows).every(row=>row.y+row.height<1390)).toBe(true);
  });
  it("aligns the longer page's bottom markers and reads every objective answer", () => {
    const page=paperLayout(version(),'id','Student','Section','long_bond').pages[0],width=1000,height=1529;
    const data=new Uint8ClampedArray(width*height*4).fill(255);
    const black=(x:number,y:number)=>{const index=(y*width+x)*4;data[index]=data[index+1]=data[index+2]=0;};
    for(const marker of [{x:40,y:40},{x:960,y:40},{x:960,y:1489},{x:40,y:1489}])for(let y=marker.y-10;y<marker.y+10;y++)for(let x=marker.x-10;x<marker.x+10;x++)black(x,y);
    for(const row of page.rows){if(!row.options.length)continue;const chosen=row.options[0];for(let dy=-9;dy<=9;dy++)for(let dx=-9;dx<=9;dx++)if(dx*dx+dy*dy<81)black(chosen.x+dx,row.y+dy);}
    const marks=readMarks(data,width,height,location(QR_POINTS),page);expect(marks.filter(mark=>mark.status==='marked')).toHaveLength(55);expect(marks.filter(mark=>mark.status==='written')).toHaveLength(5);
  });
});
it("uses the full writing width for an essay-only long-bond exam", () => {
  const version:any={snapshot_data:{title:'Essays',time_limit_minutes:90,questions:Array.from({length:5},(_,i)=>({id:`essay${i}`,type:'essay',points:5,prompt:'Explain your reasoning.'}))}};
  const layout=paperLayout(version,'id','Student','Section','long_bond');expect(layout.pages).toHaveLength(2);expect(layout.pages.flatMap(page=>page.rows).every(row=>row.width===undefined)).toBe(true);
});
