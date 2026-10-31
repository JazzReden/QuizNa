import json,html
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch,mm
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,KeepTogether
from reportlab.lib.styles import ParagraphStyle
from pypdf import PdfReader
root=Path(__file__).resolve().parents[1];dest=root/'output/pdf';dest.mkdir(exist_ok=True)
sheet=json.loads((root/'.local/sixty-point/sheet.json').read_text());qs=json.loads((root/'.local/sixty-point/questions.json').read_text())
page=(8.5*inch,13*inch)
for kind in ['blank','answered']:
 p=dest/f'QuizNa_60_Points_{kind.title()}_Answer_Sheet.pdf';c=canvas.Canvas(str(p),pagesize=page);c.setTitle(f'QuizNa · 60 points · {kind} answer sheet · Ella Garcia')
 width=195.9*mm;height=299.53*mm;c.drawImage(str(root/f'output/paper-60/{kind}.png'),(page[0]-width)/2,(page[1]-height)/2,width=width,height=height);c.showPage();c.save();assert len(PdfReader(p).pages)==1
styles={k:ParagraphStyle(k,fontName='Helvetica-Bold' if k in ['title','question','heading'] else 'Helvetica',fontSize=size,leading=size*1.35,spaceAfter=space) for k,size,space in [('title',17,10),('body',10,1),('question',10,4),('heading',12,10)]}
styles['body'].leading=12
flow=[Paragraph('QuizNa | Environmental Science',styles['body']),Paragraph('60-point Paper Exam',styles['title']),Paragraph('Name: __________________________   Section: __________________________',styles['body']),Paragraph('44 questions · 60 points · 90 minutes',styles['body']),Paragraph(html.escape(sheet['layout']['instructions']),styles['body'])]
for i,q in enumerate(qs):
 if i in [0,30,40]:flow.append(Spacer(1,10));flow.append(Paragraph({0:'Multiple choice · 30 points',30:'True or false · 10 points',40:'Essays · 20 points'}[i],styles['heading']))
 group=[Paragraph(f"{i+1}. {html.escape(q['prompt'])} ({q['points']} {'point' if q['points']==1 else 'points'})",styles['question'])]
 if q['type']=='mcq':
  for n,o in enumerate(q['options']):group.append(Paragraph(f"{chr(65+n)}. {html.escape(o['text'])}",styles['body']))
 if q['type']=='essay':group.append(Paragraph('Criteria: Accuracy 2 · Explanation and relevant examples 2 · Clarity 1',styles['body']))
 group.append(Spacer(1,6));flow.append(KeepTogether(group))
path=dest/'QuizNa_60_Points_Question_Paper.pdf'
SimpleDocTemplate(str(path),pagesize=page,leftMargin=15*mm,rightMargin=15*mm,topMargin=14*mm,bottomMargin=15*mm).build(flow)
r=PdfReader(path);text=' '.join(p.extract_text() for p in r.pages);assert all(f'{i}.' in text for i in range(1,45));print(json.dumps({'answerPages':1,'questionPages':len(r.pages),'size':'8.5 × 13 inches','totalPoints':60}))
