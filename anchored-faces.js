(function(root){
'use strict';
const names=['back','left','right','top','bottom'];
const intersection=(a,b)=>Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
function rotateRect(rect,W,H,turn){let [x,y,w,h]=rect;for(let i=0;i<turn;i++){[x,y,w,h]=[H-y-h,x,h,w];[W,H]=[H,W];}return[x,y,w,h];}
function fromPixels(data,W,H,box,anchor){
 if(!anchor?.rect||anchor.rect.length!==4||!anchor.rect.every(Number.isFinite)||![box.width,box.height,box.depth].every(n=>Number.isFinite(n)&&n>0))return null;
 const [x,y,w,h]=anchor.rect;if(w<4||h<4||x<0||y<0||x+w>W+.01||y+h>H+.01)return null;
 const rotation=((anchor.rotation||0)%360+360)%360;if(rotation%90)return null;
 if(rotation){const turn=rotation/90,NW=turn%2?H:W,NH=turn%2?W:H,pixels=new Uint8Array(data.length);for(let py=0;py<H;py++)for(let px=0;px<W;px++){const [nx,ny]=rotateRect([px,py,1,1],W,H,turn),k=(py*W+px)*4,n=(ny*NW+nx)*4;for(let c=0;c<4;c++)pixels[n+c]=data[k+c];}
  const result=fromPixels(pixels,NW,NH,box,{...anchor,rect:rotateRect(anchor.rect,W,H,turn),rotation:0});if(!result)return null;
  for(const item of Object.values(result.faces)){item.rect=rotateRect(item.rect,NW,NH,4-turn);item.rotation=rotation;}result.faces.front={...anchor,rect:[...anchor.rect]};return result;
 }
 const faces={front:{...anchor,rect:[...anchor.rect],rotation:0}},missing=()=>names.filter(n=>!faces[n]),result=()=>({faces,count:Object.keys(faces).length,anchored:true,missing:missing(),sizeMismatch});
 let sizeMismatch=Math.abs(Math.log((w/h)/(box.width/box.height)))>.08;
 // A badly mismatched anchor cannot establish a reliable scale.
 if(Math.abs(Math.log((w/h)/(box.width/box.height)))>.22)return result();
 const scale=Math.sqrt(w*h/(box.width*box.height)),depth=scale*box.depth;
 const V=new Uint8Array(W*H),Y=new Uint8Array(W*H),vx=new Float64Array(W),hy=new Float64Array(H);
 function diff(a,b){return Math.max(Math.abs(data[a]-data[b]),Math.abs(data[a+1]-data[b+1]),Math.abs(data[a+2]-data[b+2]));}
 for(let py=1;py<H-1;py++)for(let px=1;px<W-1;px++){const k=py*W+px;if(diff((k-1)*4,(k+1)*4)>18){V[k]=1;vx[px]++;}if(diff((k-W)*4,(k+W)*4)>18){Y[k]=1;hy[py]++;}}
 const tolerance=Math.max(2,Math.min(4,Math.round(Math.min(w,h)*.012)));
 function edge(vertical,f,a,b){let yes=0,n=0;for(let p=Math.ceil(a)+2;p<b-2;p+=Math.max(1,Math.floor((b-a)/120))){n++;for(let d=-tolerance;d<=tolerance;d++){const px=vertical?Math.round(f)+d:p,py=vertical?p:Math.round(f)+d;if(px>=0&&px<W&&py>=0&&py<H&&(vertical?V:Y)[py*W+px]){yes++;break;}}}return yes/Math.max(1,n);}
 function coverage([a,b,c,d]){return[edge(true,a,b,b+d),edge(true,a+c,b,b+d),edge(false,b,a,a+c),edge(false,b+d,a,a+c)];}
 const specs=[['left',true,x,-1,y,h],['right',true,x+w,1,y,h],['top',false,y,-1,x,w],['bottom',false,y+h,1,x,w]];
 for(const [face,vertical,start,sign,a,length] of specs){const options=[];
  for(let d=Math.max(6,Math.floor(depth*.62));d<=Math.ceil(depth*1.45);d++){const end=start+sign*d;if(end<1||end>=(vertical?W:H)-1)continue;const rect=vertical?[Math.min(start,end),y,d,h]:[x,Math.min(start,end),w,d],edges=coverage(rect);if(Math.min(...edges)<.8)continue;
   const error=Math.abs(Math.log(d/depth)),quality=edges.reduce((a,b)=>a+b,0)/4;options.push({rect,error,score:quality-.1*error});
  }
  options.sort((a,b)=>b.score-a.score);const best=options[0];if(!best)continue;
  // Similar evidence at substantially different folds is ambiguous: leave it unset.
  if(options.some(c=>Math.abs(Math.log((vertical?c.rect[2]:c.rect[3])/(vertical?best.rect[2]:best.rect[3])))>.18&&best.score-c.score<.012))continue;
  faces[face]={rect:best.rect,rotation:0,inset:anchor.inset||0};if(best.error>.1)sizeMismatch=true;
 }
 // Back panels must have the same scale and four supported edges. Near-duplicate
 // borders count as one candidate; two separate equally plausible panels do not.
 function peaks(values,min){const ranked=[];for(let i=1;i<values.length-1;i++)if(values[i]>=min&&values[i]>=values[i-1]&&values[i]>=values[i+1])ranked.push(i);ranked.sort((a,b)=>values[b]-values[a]);const out=[];for(const p of ranked){if(out.every(q=>Math.abs(p-q)>4))out.push(p);if(out.length===48)break;}return out.sort((a,b)=>a-b);}
 const xs=peaks(vx,h*.55),ys=peaks(hy,w*.55),backs=[],used=Object.values(faces).map(f=>f.rect);
 for(let a=0;a<xs.length;a++)for(let b=a+1;b<xs.length;b++){const width=xs[b]-xs[a],ew=Math.abs(Math.log(width/w));if(ew>.12)continue;
  for(let c=0;c<ys.length;c++)for(let d=c+1;d<ys.length;d++){const height=ys[d]-ys[c],eh=Math.abs(Math.log(height/h));if(eh>.12)continue;const rect=[xs[a],ys[c],width,height];if(used.some(r=>intersection(r,rect)>Math.min(r[2]*r[3],width*height)*.08))continue;
   const edges=coverage(rect);if(Math.min(...edges)<.86)continue;backs.push({rect,score:edges.reduce((a,b)=>a+b,0)/4-.12*(ew+eh)});
  }
 }
 // Adjacent fold panels distinguish a tray's back from similarly sized artwork.
 for(const candidate of backs){const [cx,cy,cw,ch]=candidate.rect;let support=0;
  for(const [vertical,start,sign,a,length] of [[true,cx,-1,cy,ch],[true,cx+cw,1,cy,ch],[false,cy,-1,cx,cw],[false,cy+ch,1,cx,cw]]){
   let found=false;for(let d=Math.max(6,Math.floor(depth*.62));d<=Math.ceil(depth*1.45)&&!found;d++){const end=start+sign*d;if(end<1||end>=(vertical?W:H)-1)continue;const rect=vertical?[Math.min(start,end),cy,d,ch]:[cx,Math.min(start,end),cw,d];found=Math.min(...coverage(rect))>=.85;}if(found)support++;
  }
  candidate.score+=support*.035;
 }
 backs.sort((a,b)=>b.score-a.score);const unique=[];for(const c of backs)if(!unique.some(p=>intersection(p.rect,c.rect)>Math.min(p.rect[2]*p.rect[3],c.rect[2]*c.rect[3])*.8))unique.push(c);
 if(unique[0]&&(!unique[1]||unique[0].score-unique[1].score>.04))faces.back={rect:unique[0].rect,rotation:0,inset:anchor.inset||0};
 return result();
}
function detect(image,box,anchor){
 const W=image.naturalWidth,H=image.naturalHeight,scale=Math.min(1,1800/Math.max(W,H)),canvas=document.createElement('canvas');canvas.width=Math.round(W*scale);canvas.height=Math.round(H*scale);const sx=canvas.width/W,sy=canvas.height/H,ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const result=fromPixels(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,box,{rect:anchor.rect.map((n,i)=>n*(i%2?sy:sx)),rotation:anchor.rotation||0,inset:(anchor.inset||0)*Math.min(sx,sy)});if(!result)return null;
 for(const [name,item] of Object.entries(result.faces)){if(name==='front')continue;item.rect=item.rect.map((n,i)=>Math.round(n/(i%2?sy:sx)));item.inset=anchor.inset||0;}
 result.faces.front={...anchor,rect:[...anchor.rect]};return result;
}
const api={fromPixels,detect,rotateRect};if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxAnchoredFaces=api;
})(globalThis);
