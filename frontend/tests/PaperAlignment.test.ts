import {expect,it} from 'vitest';
import {alignPaperPage,pageMarkers} from '../src/utils/paper-scan';
import type {PaperPage} from '../src/types';
// Recorded QR/marker geometry from the 5-degree rotated, 300-dpi long-bond fixture.
// This isolates QR extrapolation error and the filled-bubble distractor without image libraries.
function fixture(missing=false){
 const width=1543,height=2200,pixels=new Uint8ClampedArray(width*height*4).fill(255);
 const centers=[{x:125.56,y:255.26},{x:1260.61,y:155.89},{x:1416.96,y:1944.25},{x:282.03,y:2043.56}];
 const paint=(cx:number,cy:number,r:number,circle=false)=>{for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++){if(circle&&Math.hypot(x-cx,y-cy)>r)continue;const i=(y*width+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}};
 centers.forEach((p,i)=>{if(!(missing&&i===3))paint(p.x,p.y,12);});
 paint(424.25,1822.18,11,true);
 const qr={topLeftCorner:{x:1040.714,y:212.997},topRightCorner:{x:1215.065,y:197.552},bottomRightCorner:{x:1230.05,y:370.492},bottomLeftCorner:{x:1057.197,y:385.636}};
 const page={height:1529,rows:[],index:0} as unknown as PaperPage;
 return {pixels,width,height,centers,qr,page};
}
it('finds the distant long-page markers despite QR rounding and a nearer filled bubble',()=>{
 const f=fixture(),project=alignPaperPage(f.pixels,f.width,f.height,f.qr,f.page);
 for(const [i,p] of pageMarkers(f.page).entries())expect(Math.hypot(project(p).x-f.centers[i].x,project(p).y-f.centers[i].y)).toBeLessThan(2);
});
it('rejects a missing corner instead of using a shaded answer as a marker',()=>{
 const f=fixture(true);expect(()=>alignPaperPage(f.pixels,f.width,f.height,f.qr,f.page)).toThrow(/align|Flatten|corner/);
});
