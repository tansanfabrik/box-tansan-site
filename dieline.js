(function(root){
 'use strict';
 function peaks(values,threshold){const groups=[];for(let i=0;i<values.length;i++){if(values[i]<threshold)continue;const last=groups[groups.length-1];if(last&&i-last.end<=4){last.end=i;if(values[i]>last.score){last.at=i;last.score=values[i];}}else groups.push({at:i,end:i,score:values[i]});}return groups;}
 function legacy(pixels,W,H){
  if(W/H<1.65||W/H>2.5)return null;
  const v=new Float64Array(W),left=new Float64Array(H),right=new Float64Array(H);
  const contrast=(a,b)=>Math.max(Math.abs(pixels[a]-pixels[b]),Math.abs(pixels[a+1]-pixels[b+1]),Math.abs(pixels[a+2]-pixels[b+2]));
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){if(contrast((y*W+x-1)*4,(y*W+x+1)*4)>10)v[x]++;if(contrast(((y-1)*W+x)*4,((y+1)*W+x)*4)>10)(x<W/2?left:right)[y]++;}
  const xs=peaks(v,H*.5),find=(list,lo,hi)=>list.filter(p=>p.at>=lo&&p.at<=hi).sort((a,b)=>b.score-a.score)[0];
  function panel(offset,rows){const x0=find(xs,offset+W*.08,offset+W*.19),x1=find(xs,offset+W*.31,offset+W*.44),ys=peaks(rows,W*.2),y0=find(ys,H*.13,H*.4),y1=find(ys,H*.6,H*.87);if(!x0||!x1||!y0||!y1)return null;return[x0.at,y0.at,x1.at-x0.at,y1.at-y0.at];}
  const front=panel(0,left),back=panel(W/2,right);if(!front||!back)return null;
  if(Math.abs(front[2]/back[2]-1)>.12||Math.abs(front[3]/back[3]-1)>.12||Math.abs(front[1]-back[1])>H*.05)return null;
  const [x,y,w,h]=front;
  const outerL=xs.filter(p=>p.at<x-H*.06&&p.at>x-H*.28).sort((a,b)=>b.at-a.at)[0],outerR=xs.filter(p=>p.at>x+w+H*.06&&p.at<x+w+H*.28).sort((a,b)=>a.at-b.at)[0];
  if(!outerL||!outerR)return null;const dl=x-outerL.at,dr=outerR.at-x-w;if(Math.abs(dl/dr-1)>.15)return null;const depth=(dl+dr)/2;
  const ys=peaks(left,W*.2),top=ys.some(p=>Math.abs(p.at-(y-depth))<H*.025),bottom=ys.some(p=>Math.abs(p.at-(y+h+depth))<H*.025);if(!top||!bottom||y-depth<0||y+h+depth>H)return null;
  return {kind:'double',rects:{front,back,left:[x-depth,y,depth,h],right:[x+w,y,depth,h],top:[x,y-depth,w,depth],bottom:[x,y+h,w,depth]},ratio:{height:h/w,depth:depth/w},width:W,height:H};
 }
 // Look for two complete tray nets, using sustained lines rather than artwork contrast totals.
 // A tray needs a central rectangle and four folds at one consistent wall depth.
 function structured(pixels,W,H){
  if(W/H<1.35||W/H>3.5)return null;
  const V=new Uint8Array(W*H),Y=new Uint8Array(W*H);
  const contrast=(a,b)=>Math.max(Math.abs(pixels[a]-pixels[b]),Math.abs(pixels[a+1]-pixels[b+1]),Math.abs(pixels[a+2]-pixels[b+2]));
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const k=y*W+x;V[k]=contrast((k-1)*4,(k+1)*4)>18;Y[k]=contrast((k-W)*4,(k+W)*4)>18;}
  function on(map,fixed,p,vertical){for(let d=-1;d<=1;d++){const x=vertical?fixed+d:p,y=vertical?p:fixed+d;if(x>=0&&x<W&&y>=0&&y<H&&map[y*W+x])return true;}return false;}
  function lines(map,vertical){const length=vertical?H:W,n=vertical?W:H,scores=new Float64Array(n),threshold=vertical?H*.2:W*.1;
   for(let f=2;f<n-2;f++){let best=0,run=0,gap=0;for(let p=1;p<length-1;p++){if(on(map,f,p,vertical)){run++;gap=0;}else if(++gap>2){best=Math.max(best,run);run=0;}}scores[f]=Math.max(best,run);}
   const ranked=[];for(let i=2;i<n-2;i++)if(scores[i]>=threshold&&scores[i]>=scores[i-1]&&scores[i]>=scores[i+1])ranked.push(i);ranked.sort((a,b)=>scores[b]-scores[a]);const selected=[];for(const i of ranked){if(selected.every(p=>Math.abs(p-i)>4))selected.push(i);if(selected.length===64)break;}return selected.sort((a,b)=>a-b);
  }
  const xs=lines(V,true),ys=lines(Y,false),cache=new Map();
  function edge(vertical,f,a,b){const key=[vertical,f,a,b].join(',');if(cache.has(key))return cache.get(key);let yes=0,n=0;for(let p=Math.ceil(a)+3;p<b-3;p+=Math.max(1,Math.floor((b-a)/100))){n++;if(on(vertical?V:Y,f,p,vertical))yes++;}const score=yes/Math.max(1,n);cache.set(key,score);return score;}
  const panels=[];
  for(let i=0;i<xs.length;i++)for(let j=i+1;j<xs.length;j++){
   const x=xs[i],r=xs[j],w=r-x;if(w<W*.08||w>W*.4)continue;
   // Both side walls must exist and agree in depth before considering horizontal edges.
   const walls=[];for(const l of xs){const dl=x-l;if(dl<Math.max(6,w*.06)||dl>w*.65)continue;for(const q of xs){const dr=q-r;if(dr>0&&Math.abs(dl-dr)<=Math.max(4,(dl+dr)*.045))walls.push({l,q,depth:(dl+dr)/2});}}
   if(!walls.length)continue;
   for(let a=0;a<ys.length;a++)for(let b=a+1;b<ys.length;b++){
    const y=ys[a],bottom=ys[b],h=bottom-y;if(h<H*.25||h>H*.82||w/h<.35||w/h>2.5)continue;
    const center=[edge(true,x,y,bottom),edge(true,r,y,bottom),edge(false,y,x,r),edge(false,bottom,x,r)];if(Math.min(...center)<.82)continue;
    for(const wall of walls){const d=wall.depth,tol=Math.max(4,d*.1),top=ys.filter(v=>v<y&&Math.abs(y-v-d)<=tol).sort((a,b)=>Math.abs(y-a-d)-Math.abs(y-b-d))[0],base=ys.filter(v=>v>bottom&&Math.abs(v-bottom-d)<=tol).sort((a,b)=>Math.abs(a-bottom-d)-Math.abs(b-bottom-d))[0];if(top===undefined||base===undefined)continue;
     const support=[edge(true,wall.l,y,bottom),edge(true,wall.q,y,bottom),edge(false,top,x,r),edge(false,base,x,r),edge(false,y,wall.l,x),edge(false,y,r,wall.q),edge(false,bottom,wall.l,x),edge(false,bottom,r,wall.q)];if(Math.min(...support)<.76)continue;
     panels.push({rect:[x,y,w,h],depth:d,quality:[...center,...support].reduce((a,b)=>a+b,0)/12-.2*Math.abs((x-wall.l)-(wall.q-r))/d,sideRects:{left:[wall.l,y,x-wall.l,h],right:[r,y,wall.q-r,h],top:[x,top,w,y-top],bottom:[x,bottom,w,base-bottom]}});
    }
   }
  }
  let best=null;
  for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++){
   const a=panels[i],b=panels[j],ar=a.rect,br=b.rect;if(Math.max(ar[0],br[0])<Math.min(ar[0]+ar[2],br[0]+br[2]))continue;
   if(Math.abs(Math.log(ar[2]/br[2]))>.12||Math.abs(Math.log(ar[3]/br[3]))>.12||Math.abs(ar[1]-br[1])>H*.05||Math.abs(Math.log(a.depth/b.depth))>.18)continue;
   const quality=Math.min(a.quality,b.quality),area=ar[2]*ar[3]+br[2]*br[3],score=quality*Math.sqrt(area);
   if(!best||score>best.score)best={a,b,score};
  }
  if(!best)return null;
  // The lid is normally a little larger than the body; equal-size panels remain ambiguous.
  const area=p=>p.rect[2]*p.rect[3],larger=area(best.a)>=area(best.b)?best.a:best.b,smaller=larger===best.a?best.b:best.a;
  const ambiguous=area(larger)/area(smaller)<1.025,front=ambiguous?(best.a.rect[0]<best.b.rect[0]?best.a:best.b):larger,back=front===best.a?best.b:best.a;
  return {kind:'double',rects:{front:front.rect,back:back.rect,...front.sideRects},ratio:{height:front.rect[3]/front.rect[2],depth:front.depth/front.rect[2]},width:W,height:H,frontAmbiguous:ambiguous,method:'tray-structure'};
 }
 function fromPixels(pixels,W,H){return structured(pixels,W,H)||legacy(pixels,W,H);}
 function detect(image){const W=image.naturalWidth,H=image.naturalHeight,scale=Math.min(1,1800/Math.max(W,H)),canvas=document.createElement('canvas');canvas.width=Math.round(W*scale);canvas.height=Math.round(H*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const result=fromPixels(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);if(!result)return null;for(const key in result.rects)result.rects[key]=result.rects[key].map((v,i)=>v*(i%2?H/canvas.height:W/canvas.width));result.inset=Math.max(2,Math.ceil(2/scale));return result;}
 const api={fromPixels,detect};if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxDieline=api;
})(globalThis);
