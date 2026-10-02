(function(root){
 'use strict';
 function faceBox(face,box){return face.startsWith('base-')?{...box,width:box.width*.985,height:box.height*.985,depth:lidProfile(box.depth,.2+(box.basePeekMM||0)).baseDepth}:box;}
 function faceRatio(face,box){box=faceBox(face,box);face=face.replace(/^base-/, '');return face==='left'||face==='right'?box.depth/box.height:face==='top'||face==='bottom'?box.width/box.depth:box.width/box.height;}
 function uprightTurn(box,upright){return (upright==='portrait'&&box.width>box.height)||(upright==='landscape'&&box.height>box.width)?90:0;}
 function uprightCrop(crop,face,box,upright){if(!crop)return crop;const turn=uprightTurn(box,upright);return {...crop,rotation:((crop.rotation+(face==='back'?-turn:turn))%360+360)%360};}
 function ratioMismatch(crop,ratio){if(!crop)return false;const inset=Math.min(crop.inset||0,Math.max(0,(Math.min(crop.rect[2],crop.rect[3])-2)/2));let w=crop.rect[2]-2*inset,h=crop.rect[3]-2*inset;if(crop.rotation%180!==0)[w,h]=[h,w];return Math.abs(Math.log((w/h)/ratio))>Math.log(1.03);}
 function fitRect(crop,ratio){let [x,y,w,h]=crop.rect;if(crop.rotation%180!==0)ratio=1/ratio;if(w/h>ratio){const width=h*ratio;x+=(w-width)/2;w=width;}else{const height=w/ratio;y+=(h-height)/2;h=height;}return[x,y,w,h];}
 // Conservative cross-net recognition: aspect AND blank corners AND printed arms.
 function looksLikeCross(image,box){
  const W=image.naturalWidth,H=image.naturalHeight,fw=box.width+2*box.depth,fh=box.height+2*box.depth;
  if(W/H<.7||W/H>1.43||Math.abs(Math.log((W/H)/(fw/fh)))>Math.log(1.04))return false;
  const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,96,96);const p=ctx.getImageData(0,0,96,96).data;
  return crossPixels(p,96,96,box);
 }
 function crossPixels(p,W,H,box){
  const fw=box.width+2*box.depth,fh=box.height+2*box.depth,dx=box.depth/fw,dy=box.depth/fh;
  function ink(x0,y0,x1,y1){let count=0,total=0;for(let y=Math.ceil(y0*H);y<Math.floor(y1*H);y++)for(let x=Math.ceil(x0*W);x<Math.floor(x1*W);x++){const i=(y*W+x)*4;total++;if(p[i+3]>32&&Math.min(p[i],p[i+1],p[i+2])<220)count++;}return total?count/total:0;}
  const corners=[[0,0,dx*.8,dy*.8],[1-dx*.8,0,1,dy*.8],[0,1-dy*.8,dx*.8,1],[1-dx*.8,1-dy*.8,1,1]];
  const arms=[[.05*dx,dy*1.1,dx*.85,1-dy*1.1],[1-dx*.85,dy*1.1,1-.05*dx,1-dy*1.1],[dx*1.1,.05*dy,1-dx*1.1,dy*.85],[dx*1.1,1-dy*.85,1-dx*1.1,1-.05*dy]];
  return corners.every(r=>ink(...r)<.06)&&arms.every(r=>ink(...r)>.22);
 }
 function faceResolution(crop,face,box){
  if(!crop)return null;
  box=faceBox(face,box);face=face.replace(/^base-/, '');
  const inset=Math.min(crop.inset||0,Math.max(0,(Math.min(crop.rect[2],crop.rect[3])-2)/2));
  let width=crop.rect[2]-2*inset,height=crop.rect[3]-2*inset;
  const scale=Math.min(1,3072/Math.max(width,height));width*=scale;height*=scale;
  if(crop.rotation%180!==0)[width,height]=[height,width];
  const mmWidth=face==='left'||face==='right'?box.depth:box.width;
  const mmHeight=face==='top'||face==='bottom'?box.depth:box.height;
  return {width:Math.round(width),height:Math.round(height),dpi:Math.round(Math.min(width/mmWidth,height/mmHeight)*25.4)};
 }
 // Reserve the last quarter of the GIF slider for fast turns (5x–15x).
 function gifSpeedPosition(speed){const s=Math.min(15,Math.max(.1,Number(speed)||.1));return s<=5?(s-.1)/4.9*75:75+(s-5)/10*25;}
 function gifSpeedAtPosition(position){const p=Math.min(100,Math.max(0,Number(position)||0)),s=p<=75?.1+p/75*4.9:5+(p-75)/25*10;return Math.round(s*20)/20;}
 function gifTiming(value){
  const speed=Number.isFinite(Number(value))&&Number(value)>0?Math.min(15,Math.max(.1,Number(value))):1,totalCS=Math.round(300/speed);
  // Slower turns gain frames; faster turns keep every delay at least 20ms for GIF players.
  const frames=Math.min(150,Math.max(50,Math.round(50/Math.sqrt(speed))),Math.floor(totalCS/2));
  const delays=Array.from({length:frames},(_,i)=>(Math.round((i+1)*totalCS/frames)-Math.round(i*totalCS/frames))*10);
  return {speed,frames,durationMS:totalCS*10,delays};
 }
 const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 function crc32(data){let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
 // ZIP STORE keeps already compressed PNGs intact. UTF-8 filenames, CRC, central directory.
 async function zip(files){const parts=[],central=[];let offset=0;for(const file of files){const bytes=new Uint8Array(await file.blob.arrayBuffer()),name=new TextEncoder().encode(file.name),crc=crc32(bytes);const h=new Uint8Array(30+name.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);h.set(name,30);parts.push(h,bytes);const d=new Uint8Array(46+name.length),dv=new DataView(d.buffer);dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);dv.setUint16(8,0x800,true);dv.setUint32(16,crc,true);dv.setUint32(20,bytes.length,true);dv.setUint32(24,bytes.length,true);dv.setUint16(28,name.length,true);dv.setUint32(42,offset,true);d.set(name,46);central.push(d);offset+=h.length+bytes.length;}
  const size=central.reduce((n,p)=>n+p.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});
 }
 function lidProfile(depth,extension){const baseDepth=depth*.99+extension;return{lidDepth:depth,lidCenter:0,baseDepth,baseCenter:-depth/2-extension+baseDepth/2};}
 function basePeekLimit(depth){return Math.floor(Math.min(10,depth*.4)*10)/10;}
 function oppositeYaw(yaw){return ((yaw+360)%360+360)%360-180;}
 // A rotating vertex projects as c + a*cos(yaw) + b*sin(yaw).
 // Samples 90 degrees apart give its exact full-turn horizontal envelope.
 function rotationHalfWidth(zero,quarter,half){
  let radius=0;for(let i=0;i<zero.length;i++){const c=(zero[i]+half[i])/2,a=(zero[i]-half[i])/2,b=quarter[i]-c;radius=Math.max(radius,Math.abs(c)+Math.hypot(a,b));}return radius;
 }
 function pairCenters(a,b,gap){const total=a[1]-a[0]+b[1]-b[0]+gap;return[-total/2-a[0],total/2-b[1]];}
 const api={faceBox,faceRatio,uprightTurn,uprightCrop,ratioMismatch,fitRect,looksLikeCross,crossPixels,faceResolution,gifSpeedPosition,gifSpeedAtPosition,gifTiming,zip,crc32,lidProfile,basePeekLimit,oppositeYaw,rotationHalfWidth,pairCenters};if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxStudio=api;
})(globalThis);
