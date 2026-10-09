/* Local monochrome processing plates. Black = finish; white/transparent = untouched. */
(function(root){
'use strict';
const caches=new WeakMap(),kinds=['none','varnish','gold','silver','color'];
const defaultColor='#d46fbe',validColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value),cleanColor=value=>validColor(value)?value.toLowerCase():defaultColor;
function bindColorInputs(picker,hex,change,options={}){
 picker.addEventListener('input',()=>{hex.value=picker.value;change(picker.value);},options);
 hex.addEventListener('input',()=>{const value=hex.value.trim();hex.setCustomValidity(validColor(value)?'':BoxI18n.t('#と6桁の英数字で入力してください。'));if(validColor(value)){picker.value=value;change(value.toLowerCase());}},options);
 hex.addEventListener('blur',()=>{hex.value=picker.value;hex.setCustomValidity('');},options);
}
const coverage=(r,g,b,a=255)=>Math.round((255-(.2126*r+.7152*g+.0722*b))*a/255);
function maskRect(crop,source,mask,alignment){const [x,y,w,h]=crop.rect;return alignment==='face'?[0,0,mask.width,mask.height]:[x/source.width*mask.width,y/source.height*mask.height,w/source.width*mask.width,h/source.height*mask.height];}
function prepared(image){
 if(caches.has(image))return caches.get(image);const scale=Math.min(1,3072/Math.max(image.naturalWidth,image.naturalHeight)),gray=document.createElement('canvas');gray.width=Math.max(2,Math.round(image.naturalWidth*scale));gray.height=Math.max(2,Math.round(image.naturalHeight*scale));const ctx=gray.getContext('2d');ctx.drawImage(image,0,0,gray.width,gray.height);const pixels=ctx.getImageData(0,0,gray.width,gray.height),blue=document.createElement('canvas');blue.width=gray.width;blue.height=gray.height;const bctx=blue.getContext('2d'),tint=bctx.createImageData(gray.width,gray.height);
 for(let i=0;i<pixels.data.length;i+=4){const value=coverage(...pixels.data.subarray(i,i+4));pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;tint.data[i]=20;tint.data[i+1]=125;tint.data[i+2]=255;tint.data[i+3]=Math.round(value*.55);}ctx.putImageData(pixels,0,0);bctx.putImageData(tint,0,0);const result={gray,blue};caches.set(image,result);return result;
}
function paintOverlay(ctx,finish,crop,image,scale,ox,oy){
 if(!finish?.image)return;const blue=prepared(finish.image).blue,[x,y,w,h]=crop.rect,inset=Math.min(crop.inset,Math.max(0,(Math.min(w,h)-2)/2));ctx.save();ctx.beginPath();ctx.rect(ox+(x+inset)*scale,oy+(y+inset)*scale,(w-2*inset)*scale,(h-2*inset)*scale);ctx.clip();if(finish.alignment==='face')ctx.drawImage(blue,ox+x*scale,oy+y*scale,w*scale,h*scale);else ctx.drawImage(blue,ox,oy,image.naturalWidth*scale,image.naturalHeight*scale);ctx.restore();
}
// Smooth meniscus at the edge of a thin varnish film, not paper grain or an embossed mesh.
function varnishNormals(pixels,w,h){
 const out=new Uint8ClampedArray(pixels.length),step=Math.max(1,Math.round(Math.min(w,h)/400));
 const at=(x,y)=>pixels[(Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x)))*4]/255;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,m=pixels[i]/255;
  const dx=(at(x+step,y-step)+2*at(x+step,y)+at(x+step,y+step)-at(x-step,y-step)-2*at(x-step,y)-at(x-step,y+step))/4;
  const dy=(at(x-step,y+step)+2*at(x,y+step)+at(x+step,y+step)-at(x-step,y-step)-2*at(x,y-step)-at(x+step,y-step))/4;
  const nx=-dx*.18*m,ny=dy*.18*m,nz=1,len=Math.hypot(nx,ny,nz);
  out[i]=Math.round((nx/len*.5+.5)*255);out[i+1]=Math.round((ny/len*.5+.5)*255);out[i+2]=Math.round((nz/len*.5+.5)*255);out[i+3]=255;
 }
 return out;
}
function apply(T,material,mask,kind,color){
 if(kind==='none'){mask.dispose();return material;}
 const source=mask.image,ctx=source.getContext('2d'),data=ctx.getImageData(0,0,source.width,source.height);
 const canvas=()=>{const c=document.createElement('canvas');c.width=source.width;c.height=source.height;return c;};
 const map=c=>{const t=new T.CanvasTexture(c);t.anisotropy=material.map?.anisotropy||1;return t;};
 if(kind==='varnish'){
  if(!material.isMeshPhysicalMaterial){mask.dispose();return material;}
  const normals=varnishNormals(data.data,source.width,source.height),normalCanvas=canvas(),nctx=normalCanvas.getContext('2d'),ndata=nctx.createImageData(source.width,source.height);ndata.data.set(normals);nctx.putImageData(ndata,0,0);material.clearcoatNormalMap=map(normalCanvas);
  const base=material.clearcoat,rough=material.clearcoatRoughness,inkRough=material.roughness,specular=material.specularIntensity;
  const roughCanvas=canvas(),rctx=roughCanvas.getContext('2d'),rdata=rctx.createImageData(source.width,source.height);
  const surface=canvas(),sctx=surface.getContext('2d'),sdata=sctx.createImageData(source.width,source.height);
  const reflection=canvas(),fctx=reflection.getContext('2d'),fdata=fctx.createImageData(source.width,source.height);
  // A spot varnish fills the printed surface and gives it a smooth dielectric reflection.
  // Keep the original ink and all uncoated material properties; no metallic tint or emission.
  for(let i=0;i<data.data.length;i+=4){
   const m=data.data[i]/255,c=Math.round((base+(1-base)*m)*255),r=Math.round((rough*(1-m)+.035*m)*255);
   const sr=Math.round((inkRough*(1-m)+.12*m)*255),spec=Math.round((specular*(1-m)+m)*255);
   data.data[i]=data.data[i+1]=data.data[i+2]=c;
   rdata.data[i]=rdata.data[i+1]=rdata.data[i+2]=r;rdata.data[i+3]=255;
   sdata.data[i]=sdata.data[i+1]=sdata.data[i+2]=sr;sdata.data[i+3]=255;
   // Three.js reads specularIntensityMap from alpha, not RGB.
   fdata.data[i]=fdata.data[i+1]=fdata.data[i+2]=255;fdata.data[i+3]=spec;
  }
  ctx.putImageData(data,0,0);rctx.putImageData(rdata,0,0);sctx.putImageData(sdata,0,0);fctx.putImageData(fdata,0,0);
  mask.needsUpdate=true;material.clearcoat=1;material.clearcoatMap=mask;material.clearcoatRoughness=1;material.clearcoatRoughnessMap=map(roughCanvas);
  material.roughness=1;material.roughnessMap=map(surface);material.specularIntensity=1;material.specularIntensityMap=map(reflection);
 }else{
  const art=material.map.image,artCtx=art.getContext('2d'),pixels=artCtx.getImageData(0,0,art.width,art.height),foil=kind==='color'?cleanColor(color).slice(1).match(/../g).map(v=>parseInt(v,16)):kind==='gold'?[245,202,114]:[239,241,244];
  const roughCanvas=canvas(),rctx=roughCanvas.getContext('2d'),rdata=rctx.createImageData(source.width,source.height),base=material.roughness??.8;
  for(let i=0;i<data.data.length;i+=4){const m=data.data[i]/255;for(let k=0;k<3;k++)pixels.data[i+k]=Math.round(pixels.data[i+k]*(1-m)+foil[k]*m);const r=Math.round((base*(1-m)+.13*m)*255);rdata.data[i]=rdata.data[i+1]=rdata.data[i+2]=r;rdata.data[i+3]=255;}
  artCtx.putImageData(pixels,0,0);material.map.needsUpdate=true;
  if(material.isMeshPhysicalMaterial){rctx.putImageData(rdata,0,0);material.metalness=1;material.metalnessMap=mask;material.roughness=1;material.roughnessMap=map(roughCanvas);
   // Exposed foil reflects as metal; retain PP only on the unfoiled printed stock.
   if(material.clearcoat>0){const coating=canvas(),cc=coating.getContext('2d'),values=cc.createImageData(source.width,source.height);for(let i=0;i<values.data.length;i+=4){const value=255-data.data[i];values.data[i]=values.data[i+1]=values.data[i+2]=value;values.data[i+3]=255;}cc.putImageData(values,0,0);material.clearcoatMap=map(coating);}}else mask.dispose();
 }
 material.needsUpdate=true;return material;
}
const api={coverage,maskRect,prepared,paintOverlay,apply,kinds,varnishNormals,defaultColor,cleanColor,validColor,bindColorInputs};if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxPrintFinish=api;
})(typeof window==='object'?window:globalThis);
