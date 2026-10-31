"""Generate illustrative landing demos (no real accounts or scores).
Requires Pillow and imageio-ffmpeg. Run from the repository root.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math, subprocess
import imageio_ffmpeg
OUT = Path('frontend/public/previews')
OUT.mkdir(parents=True, exist_ok=True)
W,H,FPS,DURATION = 1000,700,30,20
RENDER_SCALE = 2
VIDEO_SECONDS = 12
OUTPUT_SIZE = (1920, 1344)
INK='#234438'; GREEN='#368366'; MUTED='#718579'; BORDER='#d8e7de'; SOFT='#edf5ef'
FONT=Path('/System/Library/Fonts/Supplemental')
def font(size,bold=False): return ImageFont.truetype(str(FONT / ('Arial Bold.ttf' if bold else 'Arial.ttf')),size*RENDER_SCALE)
logo=Image.open('frontend/public/quizna-campus.png').convert('RGBA'); logo.thumbnail((38*RENDER_SCALE,38*RENDER_SCALE))
class SharpDraw:
    """Draw at native double resolution while keeping the established layout."""
    def __init__(self, image): self.draw = ImageDraw.Draw(image)
    def coordinates(self, values):
        return tuple(self.coordinates(v) if isinstance(v,(tuple,list)) else v*RENDER_SCALE for v in values)
    def shape(self, method, xy, **kwargs):
        for key in ['width','radius']:
            if key in kwargs: kwargs[key] *= RENDER_SCALE
        return getattr(self.draw,method)(self.coordinates(xy),**kwargs)
    def line(self, xy, **kwargs): return self.shape('line',xy,**kwargs)
    def rectangle(self, xy, **kwargs): return self.shape('rectangle',xy,**kwargs)
    def rounded_rectangle(self, xy, **kwargs): return self.shape('rounded_rectangle',xy,**kwargs)
    def ellipse(self, xy, **kwargs): return self.shape('ellipse',xy,**kwargs)
    def polygon(self, xy, **kwargs): return self.shape('polygon',xy,**kwargs)
    def text(self, xy, text, **kwargs): return self.shape('text',xy,text=text,**kwargs)
    def textbbox(self, xy, text, **kwargs):
        return tuple(v/RENDER_SCALE for v in self.draw.textbbox(self.coordinates(xy),text,**kwargs))

def draw_pointer(d, kind, t):
    if kind == 'online' and t < 14:
        positions=[(0,760,510),(1.8,600,310),(3.2,600,310),(5.2,780,450),(7,760,510),(8.8,605,375),(10.2,605,375),(12.8,748,590),(14,748,590)]
        clicks=[2.5,9.5,13.65]
    elif kind == 'paper' and 10 <= t < 16:
        positions=[(10,790,460),(11.4,520,330),(12.5,520,435),(15,735,578),(16,735,578)]
        clicks=[15.65]
    else: return
    for first,second in zip(positions,positions[1:]):
        if first[0] <= t <= second[0]:
            amount=(t-first[0])/(second[0]-first[0]); amount=amount*amount*(3-2*amount)
            x=first[1]+(second[1]-first[1])*amount; y=first[2]+(second[2]-first[2])*amount
            break
    else: x,y=positions[-1][1:]
    press=any(0 <= t-click < .18 for click in clicks)
    for click in clicks:
        elapsed=t-click
        if 0 <= elapsed < .65:
            r=7+elapsed*30
            d.ellipse((x-r,y-r,x+r,y+r),outline='#8cbea2',width=2)
    scale=.88 if press else 1
    points=[(0,0),(0,29),(7,22),(13,35),(19,32),(13,20),(24,20)]
    d.polygon([(x+px*scale+1.5,y+py*scale+2) for px,py in points],fill='#b7cfc0')
    arrow=[(x+px*scale,y+py*scale) for px,py in points]
    d.polygon(arrow,fill='white')
    d.line(arrow+[arrow[0]],fill=INK,width=1)

def frame(kind,t):
    im=Image.new('RGB',(W*RENDER_SCALE,H*RENDER_SCALE),'#e6f1e9'); d=SharpDraw(im)
    for x in range(0,W,50): d.line((x,0,x,H),fill='#deebe2')
    for y in range(0,H,50): d.line((0,y,W,y),fill='#deebe2')
    for x,y,r in [(80,140,60),(920,530,90)]:
        off=math.sin(t/4)*10
        d.ellipse((x-r,y-r+off,x+r,y+r+off),outline='#c7ddcc',width=2)
    d.rounded_rectangle((133,50,873,660),radius=26,fill='#d6e5da')
    d.rounded_rectangle((125,42,865,652),radius=26,fill='white')
    im.paste(logo,(157*RENDER_SCALE,68*RENDER_SCALE),logo)
    def text(x,y,s,size=22,bold=False,color=INK):
        if s == '✓':
            d.line((x+size*.1,y+size*.55,x+size*.4,y+size*.82,x+size*.9,y+size*.2),fill=color,width=max(2,int(size*.08)))
        else: d.text((x,y),s,font=font(size,bold),fill=color)
    def centered_text(y,s,size=22,bold=False,color=INK):
        # Center the visible glyph bounds on the white card (125..865).
        left, _, right, _ = d.textbbox((0,0),s,font=font(size,bold))
        text(495-(left+right)/2,y,s,size,bold,color)
    def box(x,y,w,h,fill='white',outline=BORDER): d.rounded_rectangle((x,y,x+w,y+h),radius=12,fill=fill,outline=outline,width=2)
    text(208,76,'QuizNa',24,True); text(690,80,'Sample preview',16,color=MUTED)
    d.line((157,125,830,125),fill=BORDER,width=2)
    # Gentle fade-in/out makes each loop continuous.
    if kind=='online':
        if t < 14:
            question=0 if t<7 else 1
            text(160,154,f'Question {question+1} of 2',18,color=MUTED)
            text(740,154,'24:58' if question else '25:00',18,color=MUTED)
            d.rounded_rectangle((160,193,830,199),radius=3,fill=SOFT)
            d.rounded_rectangle((160,193,160+int(335*(question+1)),199),radius=3,fill=GREEN)
            text(160,225,'Which habit helps you learn?' if not question else 'What makes feedback useful?',28,True)
            choices=['Reviewing lessons regularly','Skipping feedback','Rushing through every task','Avoiding practice'] if not question else ['Ignoring mistakes','Using it to improve','Comparing every score','Avoiding difficult questions']
            selected=t%7>2.5; answer=question
            for i,c in enumerate(choices):
                y=285+i*65; active=selected and i==answer
                box(160,y,670,53,SOFT if active else 'white',GREEN if active else BORDER)
                text(178,y+14,chr(65+i),19,True,color=GREEN)
                text(222,y+14,c,21)
                if active: text(785,y+12,'✓',24,color=GREEN)
            text(160,579,'Answer saved' if selected else 'Choose your answer',18,color=GREEN if selected else MUTED)
            if t>11: box(665,566,165,48,GREEN,GREEN); text(690,580,'Submit quiz',19,True,'white')
        else:
            d.ellipse((440,190,550,300),fill=SOFT); text(468,214,'✓',54,True,GREEN)
            centered_text(337,'Quiz submitted',36,True)
            centered_text(395,'Your answers have been saved.',24,color=MUTED)
            box(255,463,480,78,SOFT); centered_text(490,'View results when released',24,True)
    else:
        if t<10:
            text(160,153,'Paper exam',27,True)
            text(160,194,'Name: Alex Santos     Section: Grade 12',19,color=MUTED)
            for i in range(5):
                y=262+i*55; text(225,y,str(i+1).zfill(2),20,color=MUTED)
                for j in range(4):
                    x=350+j*105
                    if i==0: text(x,229,chr(65+j),16,color=MUTED)
                    d.ellipse((x,y,x+24,y+24),outline=GREEN,width=2,fill=GREEN if j==[2,0,3,1,2][i] else 'white')
            if t>=3:
                for x,y,dx,dy in [(185,240,1,1),(805,240,-1,1),(185,551,1,-1),(805,551,-1,-1)]:
                    d.line((x+dx*30,y,x,y,x,y+dy*30),fill=GREEN,width=4)
                y=255+int(((t-3)/7)*280)
                d.rectangle((200,y,790,y+4),fill='#7fc7a4')
            centered_text(586,'Align the sheet inside the frame',20,color=MUTED)
        elif t<16:
            text(160,156,'Review detected answers',28,True)
            text(160,204,'Alex Santos · Grade 12',20,color=MUTED)
            for i,a in enumerate(['C','A','D','B','C']):
                y=257+i*52; box(160,y,670,43,SOFT); text(180,y+10,f'{i+1:02}     {a}',20); text(720,y+10,'Correct',18,color=GREEN)
            box(600,550,230,54,GREEN,GREEN); text(638,568,'Confirm & save',20,True,'white')
        else:
            d.ellipse((440,180,550,290),fill=SOFT); text(468,204,'✓',54,True,GREEN)
            centered_text(326,'Result saved',34,True)
            centered_text(385,'5 / 5',38,True,GREEN)
            centered_text(458,'Ready in your section gradebook.',24,color=MUTED)
            centered_text(505,'Students see scores when released.',22,color=MUTED)
    draw_pointer(d,kind,t)
    opacity=min(1,t/0.8,(DURATION-t)/0.8)
    return Image.blend(Image.new('RGB',im.size,'#e6f1e9'),im,max(0,opacity))
for kind in ['online','paper']:
    frame(kind,5).resize(OUTPUT_SIZE, Image.Resampling.LANCZOS).save(OUT / f'{kind}.jpg',quality=95)
    p=subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-f','rawvideo','-vcodec','rawvideo','-s',f'{OUTPUT_SIZE[0]}x{OUTPUT_SIZE[1]}','-pix_fmt','rgb24','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/f'{kind}.tmp.mp4')],stdin=subprocess.PIPE,stderr=subprocess.DEVNULL)
    for n in range(FPS*VIDEO_SECONDS): p.stdin.write(frame(kind,n/FPS*DURATION/VIDEO_SECONDS).resize(OUTPUT_SIZE, Image.Resampling.LANCZOS).tobytes())
    p.stdin.close()
    if p.wait(): raise RuntimeError('Video encoding failed')
    (OUT/f'{kind}.tmp.mp4').replace(OUT/f'{kind}.mp4')
    print(kind, (OUT/f'{kind}.mp4').stat().st_size)
