/* Local-only, alpha-weighted color histogram. No network or image synthesis. */
(function(root){
 'use strict';
 function fromPixels(pixels){
  // Group near-identical colors into 8-level RGB bins, preserving the actual
  // weighted color of the winning group rather than averaging the whole image.
  const weight=new Float64Array(32768),red=new Float64Array(32768),green=new Float64Array(32768),blue=new Float64Array(32768);
  for(let i=0;i+3<pixels.length;i+=4){
   const a=pixels[i+3];if(a<8)continue;
   const r=pixels[i],g=pixels[i+1],b=pixels[i+2],bin=((r>>3)<<10)|((g>>3)<<5)|(b>>3);
   weight[bin]+=a;red[bin]+=r*a;green[bin]+=g*a;blue[bin]+=b*a;
  }
  let winner=-1,total=0;
  for(let i=0;i<weight.length;i++)if(weight[i]>total){winner=i;total=weight[i];}
  if(winner<0)return null;
  return '#'+[red,green,blue].map(channel=>Math.round(channel[winner]/total).toString(16).padStart(2,'0')).join('');
 }
 function fromImage(image){
  // Nearest-neighbor sampling avoids inventing blended colors at print edges.
  // Cap the sampling canvas to keep even large uploaded dielines responsive.
  const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
  const scale=Math.min(1,512/Math.max(w,h)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const result=fromPixels(ctx.getImageData(0,0,canvas.width,canvas.height).data);canvas.width=canvas.height=1;return result;
 }
 const api={fromPixels,fromImage};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BoxPhotoColor=api;
})(typeof globalThis!=='undefined'?globalThis:this);
