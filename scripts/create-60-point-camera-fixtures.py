from PIL import Image,ImageEnhance,ImageFilter,ImageDraw
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[1]/'output/paper-60';im=Image.open(root/'printed-answered.png').convert('RGB');im.thumbnail((1800,2200))
im.save(root/'photo-clear.jpg',quality=95)
im.rotate(5,expand=True,fillcolor='#d9d5cb',resample=Image.Resampling.BICUBIC).save(root/'photo-rotated.jpg',quality=90)
ImageEnhance.Brightness(im).enhance(.72).filter(ImageFilter.GaussianBlur(.45)).save(root/'photo-dim.jpg',quality=75)
w,h=im.size;dest=[(180,100),(1300,160),(1400,2050),(70,2150)];src=[(0,0),(w,0),(w,h),(0,h)];A=[];B=[]
for (x,y),(u,v) in zip(dest,src):A.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]]);B.extend([u,v])
coeff=np.linalg.solve(np.array(A),np.array(B));photo=im.transform((1500,2250),Image.Transform.PERSPECTIVE,coeff,Image.Resampling.BICUBIC,fillcolor='#d9d5cb');photo.save(root/'photo-perspective.jpg',quality=90)
# Known difficult case: glare covers the QR, so the scanner must reject it.
glare=im.copy();d=ImageDraw.Draw(glare);sx=w/2550;sy=h/3900;d.rectangle((w*.71,h*.025,w*.94,h*.19),fill='white');glare.save(root/'photo-qr-obscured.jpg',quality=90)
print('Prepared clear, rotated, dim, perspective, and obscured-QR images.')
