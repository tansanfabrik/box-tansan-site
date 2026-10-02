/* Dieline removal: deterministic pixel repair and PDF stroke selection, no image AI. */
(function(root){
'use strict';
const parse=color=>{if(typeof color!=='string')return null;const m=/^#([0-9a-f]{6})$/i.exec(color);return m?[0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16)):null;};
function matches(rgb,colors,tolerance){const threshold=(Math.min(100,Math.max(0,tolerance))*255/100)**2*3;return colors.some(c=>(rgb[0]-c[0])**2+(rgb[1]-c[1])**2+(rgb[2]-c[2])**2<=threshold);}
function repair(data,w,h,colors,tolerance,width){
 const rgb=colors.map(parse).filter(Boolean),mask=new Uint8Array(w*h),changed=new Uint8Array(w*h),out=new Uint8ClampedArray(data),limit=Math.max(1,Math.min(64,Math.round(width)));
 for(let i=0;i<mask.length;i++){const j=i*4;if(data[j+3]>16&&matches(data.subarray(j,j+3),rgb,tolerance))mask[i]=1;}
 // Include antialiased edge pixels only when their colour is a mixture of
 // a chosen ink and the unmarked neighbour behind it. Do not dilate blindly.
 for(let pass=0;pass<2;pass++){
  const add=new Set();
  for(let i=0;i<mask.length;i++)if(mask[i]){const x=i%w,y=Math.floor(i/w);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const X=x+dx,Y=y+dy,BX=X+dx,BY=Y+dy;if(X<0||Y<0||BX<0||BY<0||X>=w||Y>=h||BX>=w||BY>=h)continue;
   const q=Y*w+X,b=BY*w+BX;if(mask[q]||mask[b]||data[q*4+3]<16)continue;
   for(const ink of rgb){let dot=0,length=0;for(let c=0;c<3;c++){const v=ink[c]-data[b*4+c];dot+=(data[q*4+c]-data[b*4+c])*v;length+=v*v;}if(length<100)continue;const t=dot/length;if(t<.04||t>1)continue;let error=0;for(let c=0;c<3;c++)error+=(data[q*4+c]-(data[b*4+c]+t*(ink[c]-data[b*4+c])))**2;if(error<36){add.add(q);break;}}
  }}
  for(const i of add)mask[i]=1;if(!add.size)break;
 }
 // Read only the original pixels. Work along the shortest crossing of the line;
 // broad blocks are left intact, and alpha is interpolated with the colour.
 const dirs=[[1,0],[0,1],[1,1],[1,-1]];
 let count=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(!mask[i])continue;let best=null;
  for(const [dx,dy] of dirs){let a=0,b=0,ai=-1,bi=-1,ae=false,be=false;
   for(let s=1;s<=limit+1;s++){const X=x-dx*s,Y=y-dy*s;a=s;if(X<0||Y<0||X>=w||Y>=h){ae=true;break;}if(!mask[Y*w+X]){ai=Y*w+X;break;}}
   for(let s=1;s<=limit+1;s++){const X=x+dx*s,Y=y+dy*s;b=s;if(X<0||Y<0||X>=w||Y>=h){be=true;break;}if(!mask[Y*w+X]){bi=Y*w+X;break;}}
   if(a+b-1>limit||(ai<0&&!ae)||(bi<0&&!be)||(ai<0&&bi<0))continue;
   const score=(a+b)*Math.hypot(dx,dy)+(ai<0||bi<0?1000:0);if(!best||score<best.score)best={a,b,ai,bi,score};
  }
  if(!best)continue;const {a,b,ai,bi}=best,A=ai<0?bi:ai,B=bi<0?ai:bi,t=ai<0?1:bi<0?0:a/(a+b),alpha=data[A*4+3]*(1-t)+data[B*4+3]*t;
  for(let c=0;c<3;c++)out[i*4+c]=alpha?Math.round((data[A*4+c]*data[A*4+3]*(1-t)+data[B*4+c]*data[B*4+3]*t)/alpha):0;
  out[i*4+3]=Math.round(alpha);changed[i]=1;count++;
 }
 return {data:out,changed,count};
}
// PDF.js 6 combines a path and its painting operator in constructPath. Only
// standalone strokes are eligible; filled artwork/text/clipping stay untouched.
function pdfStrokes(list,ops){
 let color='#000000';const stack=[],strokes=[];
 for(let i=0;i<list.fnArray.length;i++){const op=list.fnArray[i],args=list.argsArray[i];
  if(op===ops.save||op===ops.paintFormXObjectBegin){stack.push(color);}
  else if(op===ops.restore||op===ops.paintFormXObjectEnd){color=stack.length?stack.pop():null;}
  else if(op===ops.setStrokeRGBColor)color=parse(args[0])?args[0].toLowerCase():null;
  else if(op===ops.setStrokeColorN||op===ops.setStrokeTransparent)color=null;
  else if(op===ops.constructPath&&color&&[ops.stroke,ops.closeStroke].includes(args[0]))strokes.push({index:i,color});
 }
 return strokes;
}
const api={parse,matches,repair,pdfStrokes};
if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxLineCleanup=api;
if(typeof WorkerGlobalScope!=='undefined'&&root instanceof WorkerGlobalScope)root.onmessage=e=>{try{const {data,w,h,colors,tolerance,width}=e.data,result=repair(new Uint8ClampedArray(data),w,h,colors,tolerance,width);root.postMessage(result,[result.data.buffer,result.changed.buffer]);}catch(error){root.postMessage({error:error.message});}};
})(globalThis);
