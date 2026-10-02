(function(root){
 'use strict';
 const FORMAT='tansan-box-project',VERSION=1,MAX_BYTES=250*1024*1024;
 const faces=['front','back','left','right','top','bottom','base-left','base-right','base-top','base-bottom'];
 const copy=v=>JSON.parse(JSON.stringify(v));
 const fail=()=>{throw new Error('プロジェクトの形式・内容が正しくありません。対応する保存ファイルを選んでください。');};
 function cleanConfig(value,schema){
  if(!value||typeof value!=='object')return fail();
  const out={};for(const [key,rule] of Object.entries(schema)){
   const v=value[key];
   if(rule&&rule.range){const n=v===undefined?rule.default:v;if(!Number.isFinite(n)||n<rule.range[0]||n>rule.range[1])return fail();out[key]=n;}
   else if(Array.isArray(rule)){if(!Number.isFinite(v)||v<rule[0]||v>rule[1])return fail();out[key]=v;}
   else if(rule==='boolean'){if(typeof v!=='boolean')return fail();out[key]=v;}
   else if(rule==='color'){if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))return fail();out[key]=v;}
   else if(rule.values){const selected=v===undefined?rule.default:v;if(!rule.values.includes(selected))return fail();out[key]=selected;}
   else out[key]=cleanConfig(v,rule);
  }return out;
 }
 function pngSize(data){
  if(typeof data!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(data))return fail();
  const head=typeof atob==='function'?atob(data.split(',')[1].slice(0,44)):Buffer.from(data.split(',')[1].slice(0,44),'base64').toString('binary');
  if(head.slice(0,8)!=='\x89PNG\r\n\x1a\n'||head.slice(12,16)!=='IHDR')return fail();
  const n=i=>((head.charCodeAt(i)*0x1000000)+(head.charCodeAt(i+1)<<16)+(head.charCodeAt(i+2)<<8)+head.charCodeAt(i+3));
  const w=n(16),h=n(20);if(!Number.isInteger(w)||!Number.isInteger(h)||w<2||h<2||w>16000||h>16000||w*h>65000000)return fail();return[w,h];
 }
 function rescaleCrop(crop,oldSize,newSize){
  const sx=newSize[0]/oldSize[0],sy=newSize[1]/oldSize[1];
  const x=Math.min(newSize[0]-2,Math.max(0,Math.round(crop.rect[0]*sx))),y=Math.min(newSize[1]-2,Math.max(0,Math.round(crop.rect[1]*sy)));
  const w=Math.max(2,Math.min(newSize[0]-x,Math.round(crop.rect[2]*sx))),h=Math.max(2,Math.min(newSize[1]-y,Math.round(crop.rect[3]*sy)));
  return{...crop,rect:[x,y,w,h],inset:Math.min(Math.max(0,Math.round(crop.inset*Math.min(sx,sy))),Math.max(0,(Math.min(w,h)-2)/2))};
 }
 function validate(doc,schema){
  if(!doc||doc.format!==FORMAT||doc.version!==VERSION||!['project','composition'].includes(doc.kind))return fail();
  const configuration=v=>cleanConfig(v,schema);
  const text=v=>typeof v==='string'?v.slice(0,200):'';
  const out={format:FORMAT,version:VERSION,kind:doc.kind,name:text(doc.name)};
  if(doc.kind==='composition'){out.config=configuration(doc.config);return out;}
  if(!Array.isArray(doc.assets)||doc.assets.length<1||doc.assets.length>217||!Array.isArray(doc.designs)||doc.designs.length>6)return fail();
  let pixels=0;out.assets=doc.assets.map(a=>{const [w,h]=pngSize(a?.data);pixels+=w*h;if(pixels>200000000)return fail();return{data:a.data,width:w,height:h,pdfImport:text(a.pdfImport)};});
  const imageId=id=>{if(!Number.isInteger(id)||id<0||id>=out.assets.length)return fail();return id;};
  const snapshot=s=>{
   if(!s||!s.crops||Object.keys(s.crops).length>10)return fail();
   const result={config:configuration(s.config),source:imageId(s.source),sourceName:text(s.sourceName),sampleMode:s.sampleMode===true,selectedFace:faces.includes(s.selectedFace)?s.selectedFace:'front',crops:{}};
   for(const [face,c] of Object.entries(s.crops)){
    if(!faces.includes(face)||!c||!Array.isArray(c.rect)||c.rect.length!==4||!c.rect.every(Number.isFinite)||![0,90,180,270].includes(c.rotation)||!Number.isFinite(c.inset)||c.inset<0)return fail();
    const id=imageId(c.asset),a=out.assets[id],[x,y,w,h]=c.rect;
    if(x<0||y<0||w<2||h<2||x+w>a.width+.001||y+h>a.height+.001||c.inset>Math.min(w,h)/2)return fail();
    result.crops[face]={rect:[...c.rect],rotation:c.rotation,inset:c.inset,asset:id,name:text(c.name)};
    if(c.cleanup!=null){const f=c.cleanup,id=imageId(f.asset),a=out.assets[id];if(typeof f.enabled!=='boolean'||a.width!==out.assets[c.asset].width||a.height!==out.assets[c.asset].height)return fail();result.crops[face].cleanup={enabled:f.enabled,name:text(f.name),asset:id};}
    if(c.finish!=null){const f=c.finish;if(!['none','varnish','gold','silver'].includes(f.kind)||!['source','face'].includes(f.alignment))return fail();result.crops[face].finish={kind:f.kind,alignment:f.alignment,name:text(f.name),asset:imageId(f.asset)};}
   }return result;
  };
  out.current=snapshot(doc.current);const slots=new Set();out.designs=doc.designs.map((d,i)=>{if(!d)return fail();const slot=d.slot===undefined?i:d.slot;if(!Number.isInteger(slot)||slot<0||slot>5||slots.has(slot))return fail();slots.add(slot);const size=pngSize(d.thumbnail);if(size.some(n=>n>1024)||d.thumbnail.length>2*1024*1024)return fail();return{slot,name:text(d.name)||'デザイン',thumbnail:d.thumbnail,snapshot:snapshot(d.snapshot)};});return out;
 }
 async function encode(current,designs,name){
  const images=[],ids=new Map();
  function id(image){if(!ids.has(image)){ids.set(image,images.length);images.push(image);}return ids.get(image);}
  function snapshot(s){return{config:copy(s.config),source:id(s.sourceImage),sourceName:s.sourceName,sampleMode:s.sampleMode,selectedFace:s.selectedFace,crops:Object.fromEntries(Object.entries(s.crops).map(([f,c])=>[f,{rect:[...c.rect],rotation:c.rotation,inset:c.inset,asset:id(c.image||s.sourceImage),name:c.name||'',...(c.cleanup?.image?{cleanup:{enabled:c.cleanup.enabled!==false,name:c.cleanup.name||'',asset:id(c.cleanup.image)}}:{}),...(c.finish?.image?{finish:{kind:c.finish.kind,alignment:c.finish.alignment,name:c.finish.name||'',asset:id(c.finish.image)}}:{})}]))};}
  const doc={format:FORMAT,version:VERSION,kind:'project',name,current:snapshot(current),designs:designs.map((d,i)=>({slot:d.slot??i,name:d.name,thumbnail:d.thumbnail,snapshot:snapshot(d.snapshot)})),assets:[]};
  let pixels=0;for(const image of images){pixels+=image.naturalWidth*image.naturalHeight;if(pixels>200000000)throw new Error('画像の合計が大きすぎます。比較案を減らすか、画像を小さくして保存してください。');const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);const data=c.toDataURL('image/png');c.width=c.height=1;doc.assets.push({data,pdfImport:image.pdfImport||''});await new Promise(r=>setTimeout(r,0));}return doc;
 }
 async function decode(doc,{currentOnly=false}={}){
  const used=new Set([doc.current.source]);for(const c of Object.values(doc.current.crops)){used.add(c.asset);if(c.finish)used.add(c.finish.asset);if(c.cleanup)used.add(c.cleanup.asset);}
  const images=[];for(let i=0;i<doc.assets.length;i++){if(currentOnly&&!used.has(i))continue;const a=doc.assets[i];const image=new Image();image.src=a.data;await image.decode();if(image.naturalWidth!==a.width||image.naturalHeight!==a.height)return fail();if(a.pdfImport)image.pdfImport=a.pdfImport;images[i]=image;}
  const snapshot=s=>({...s,sourceImage:images[s.source],crops:Object.fromEntries(Object.entries(s.crops).map(([f,c])=>{const crop={rect:[...c.rect],rotation:c.rotation,inset:c.inset,name:c.name};if(c.asset!==s.source)crop.image=images[c.asset];if(c.cleanup)crop.cleanup={enabled:c.cleanup.enabled,name:c.cleanup.name,image:images[c.cleanup.asset]};if(c.finish)crop.finish={kind:c.finish.kind,alignment:c.finish.alignment,name:c.finish.name,image:images[c.finish.asset]};return[f,crop];}))});
  return{current:snapshot(doc.current),designs:currentOnly?[]:doc.designs.map(d=>({...d,snapshot:snapshot(d.snapshot)}))};
 }
 const api={FORMAT,VERSION,MAX_BYTES,copy,cleanConfig,pngSize,rescaleCrop,validate,encode,decode};
 if(typeof module!=='undefined')module.exports=api;else root.BoxProjectData=api;
})(typeof globalThis!=='undefined'?globalThis:this);
