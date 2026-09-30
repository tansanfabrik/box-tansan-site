(function(root){
'use strict';
function fromPixels(data,W,H,box){
 const vertical=new Uint8Array(W*H),horizontal=new Uint8Array(W*H),vx=new Float64Array(W),hy=new Float64Array(H);
 const diff=(a,b)=>Math.max(...[0,1,2].map(i=>Math.abs(data[a+i]-data[b+i])));
 for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const k=y*W+x;if(diff((k-1)*4,(k+1)*4)>18){vertical[k]=1;vx[x]++;}if(diff((k-W)*4,(k+W)*4)>18){horizontal[k]=1;hy[y]++;}}
 function peaks(values,limit){const found=[];for(let i=1;i<values.length-1;i++){if(values[i]<limit)continue;let end=i,best=i;while(end+1<values.length&&values[end+1]>=limit){end++;if(values[end]>values[best])best=end;}found.push(best);i=end;}const unique=[];for(const p of found.sort((a,b)=>values[b]-values[a]))if(!unique.some(x=>Math.abs(x-p)<=4))unique.push(p);return unique.slice(0,30).sort((a,b)=>a-b);}
 const xs=peaks(vx,H*.12),ys=peaks(hy,W*.08),ratio=box.width/box.height,candidates=[];
 function edge(map,fixed,start,end,isVertical){let found=0,n=0;for(let p=Math.ceil(start+2);p<end-2;p+=Math.max(1,Math.floor((end-start)/70))){n++;let yes=false;for(let d=-2;d<=2;d++){const x=isVertical?fixed+d:p,y=isVertical?p:fixed+d;if(x>=0&&x<W&&y>=0&&y<H&&map[y*W+x])yes=true;}if(yes)found++;}return found/Math.max(1,n);}
 const wanted=[ratio,box.depth/box.height,box.width/box.depth];
 for(let a=0;a<xs.length;a++)for(let b=a+1;b<xs.length;b++){const x=xs[a],w=xs[b]-x;if(w<6)continue;for(let c=0;c<ys.length;c++)for(let d=c+1;d<ys.length;d++){const y=ys[c],h=ys[d]-y;if(h<6||w*h<W*H*.002)continue;const r=w/h;if(!wanted.some(t=>Math.min(Math.abs(Math.log(r/t)),Math.abs(Math.log(r*t)))<.045))continue;
 const coverage=[edge(vertical,x,y,y+h,true),edge(vertical,x+w,y,y+h,true),edge(horizontal,y,x,x+w,false),edge(horizontal,y+h,x,x+w,false)];if(Math.min(...coverage)<.7)continue;
 candidates.push({rect:[x,y,w,h],quality:coverage.reduce((a,b)=>a+b,0)/4});}}
 const overlap=(a,b)=>Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
 function match(c,target){const r=c.rect[2]/c.rect[3],direct=Math.abs(Math.log(r/target)),turned=Math.abs(Math.log(r*target));return{...c,error:Math.min(direct,turned),rotation:direct<=turned?0:90};}
 const fronts=candidates.map(c=>match(c,ratio)).filter(c=>c.error<.045).sort((a,b)=>b.rect[2]*b.rect[3]-a.rect[2]*a.rect[3]);if(!fronts.length)return null;
 // Prefer a main panel with matching neighbours over isolated artwork frames.
 function sides(front){const scale=Math.sqrt(front.rect[2]*front.rect[3]/(box.width*box.height)),out={front},used=[front.rect];
 const specs=[['back',box.width,box.height],['left',box.depth,box.height],['right',box.depth,box.height],['top',box.width,box.depth],['bottom',box.width,box.depth]];
 for(const [name,w,h] of specs){const expected=w*h*scale*scale,list=candidates.map(c=>match(c,w/h)).filter(c=>c.error<.045&&Math.abs(Math.log(c.rect[2]*c.rect[3]/expected))<.18&&!used.some(r=>overlap(r,c.rect)>Math.min(r[2]*r[3],c.rect[2]*c.rect[3])*.12));
 const [fx,fy,fw,fh]=front.rect,targets={back:[fx+fw*2,fy+fh/2],left:[fx-scale*box.depth/2,fy+fh/2],right:[fx+fw+scale*box.depth/2,fy+fh/2],top:[fx+fw/2,fy-scale*box.depth/2],bottom:[fx+fw/2,fy+fh+scale*box.depth/2]},target=targets[name];
 list.sort((a,b)=>{const distance=c=>Math.hypot(c.rect[0]+c.rect[2]/2-target[0],c.rect[1]+c.rect[3]/2-target[1]);return distance(a)-distance(b);});if(list[0]){out[name]=list[0];used.push(list[0].rect);}}
 return out;}
 const proposals=fronts.slice(0,120).map(sides).sort((a,b)=>Object.keys(b).length-Object.keys(a).length||(Math.abs(Math.log((a.front.rect[2]*a.front.rect[3])/(b.front.rect[2]*b.front.rect[3])))<.08?a.front.rect[0]-b.front.rect[0]:b.front.rect[2]*b.front.rect[3]-a.front.rect[2]*a.front.rect[3]));
 const best=proposals[0];if(Object.keys(best).length<3)return null;
 return{faces:best,count:Object.keys(best).length};
}
function detect(image,box,anchor){if(anchor)return root.BoxAnchoredFaces.detect(image,box,anchor);const paired=box.type!=='tuck'?root.BoxDieline?.detect(image):null;if(paired){const heightError=Math.abs(Math.log(paired.ratio.height/(box.height/box.width))),depthError=Math.abs(Math.log(paired.ratio.depth/(box.depth/box.width)));if(heightError<.05&&depthError<.05||paired.method==='tray-structure'&&heightError<.12)return{count:6,sizeMismatch:heightError>.05||depthError>.08,frontAmbiguous:paired.frontAmbiguous,faces:Object.fromEntries(Object.entries(paired.rects).map(([face,rect])=>[face,{rect,rotation:0,inset:paired.inset}]))};}const W=image.naturalWidth,H=image.naturalHeight,scale=Math.min(1,900/Math.max(W,H)),c=document.createElement('canvas');c.width=Math.round(W*scale);c.height=Math.round(H*scale);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);const result=fromPixels(ctx.getImageData(0,0,c.width,c.height).data,c.width,c.height,box);if(result)for(const face of Object.values(result.faces))face.rect=face.rect.map((v,i)=>Math.round(v*(i%2?H/c.height:W/c.width)));return result;}
const api={fromPixels,detect};if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxFaceDetection=api;
})(globalThis);
