(function(root){
 'use strict';
 const base=new URL('vendor/pdfjs/',document.currentScript.src);
 let libraryPromise;
 const cancelled=signal=>{if(signal?.aborted)throw new DOMException('読み込みを中止しました。','AbortError');};
 function library(){
  if(!libraryPromise)libraryPromise=import(new URL('build/pdf.min.mjs',base).href).then(lib=>{lib.GlobalWorkerOptions.workerSrc=new URL('build/pdf.worker.min.mjs',base).href;return lib;}).catch(error=>{libraryPromise=null;throw error;});
  return libraryPromise;
 }
 async function open(file,signal){
  const lib=await library();cancelled(signal);
  const data=new Uint8Array(await file.arrayBuffer());cancelled(signal);
  const task=lib.getDocument({data,cMapUrl:new URL('cmaps/',base).href,cMapPacked:true,standardFontDataUrl:new URL('standard_fonts/',base).href,wasmUrl:new URL('wasm/',base).href,iccUrl:new URL('iccs/',base).href,useSystemFonts:true,enableXfa:false,canvasMaxAreaInBytes:96000000});
  const abort=()=>{task.destroy().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{const doc=await task.promise;cancelled(signal);return doc;}
  catch(error){await task.destroy().catch(()=>{});throw error;}
  finally{signal?.removeEventListener('abort',abort);}
 }
 async function inspect(doc,pageNumber,signal){
  const lib=await library(),page=await doc.getPage(pageNumber);cancelled(signal);const layers=await doc.getOptionalContentConfig({intent:'display'}),list=await page.getOperatorList();cancelled(signal);const strokes=BoxLineCleanup.pdfStrokes(list,lib.OPS);return {strokes,layers:[...layers].map(([id,g])=>({id,name:g.name||'名称なし',visible:g.visible}))};
 }
 async function render(doc,pageNumber,signal,removal=null){
  cancelled(signal);const page=await doc.getPage(pageNumber);cancelled(signal);
  const original=page.getViewport({scale:1});
  if(!Number.isFinite(original.width)||!Number.isFinite(original.height)||original.width<=0||original.height<=0)throw new Error('PDFのページサイズを読み取れませんでした。');
  // 300 dpi, bounded to 24 million pixels and 8192 pixels on either edge.
  const scale=Math.min(300/72,8192/Math.max(original.width,original.height),Math.sqrt(24000000/(original.width*original.height)));
  const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.floor(viewport.width));canvas.height=Math.max(2,Math.floor(viewport.height));
  const layers=await doc.getOptionalContentConfig({intent:'display'});cancelled(signal);
  const initialVisibility=[...layers].map(([id,g])=>[id,g.visible]);
  if(removal?.layers)for(const id of removal.layers)layers.setVisibility(id,false);
  const removed=new Set(removal?.indices||[]);
  const hiddenLayers=[...layers].map(([,group])=>group).filter(group=>!group.visible).map(group=>group.name||'名称なし');
  const task=page.render({canvasContext:canvas.getContext('2d'),viewport,optionalContentConfigPromise:Promise.resolve(layers),background:'rgb(255,255,255)',operationsFilter:removed.size?index=>!removed.has(index):null});
  const abort=()=>task.cancel();signal?.addEventListener('abort',abort,{once:true});let url;
  try{
   await task.promise;cancelled(signal);
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PDFの描画に失敗しました。')),'image/png'));cancelled(signal);
   url=URL.createObjectURL(blob);const image=new Image();image.src=url;await image.decode();cancelled(signal);image.pdfImport='PDFの表示範囲を約'+Math.round(scale*72)+' dpiで読み込みました。TrimBoxでの仕上がり切り抜きは未実施です。'+(hiddenLayers.length?'PDFの設定で非表示のレイヤー：'+hiddenLayers.join('、')+'。':'非表示のレイヤーはありません。');return image;
  }finally{for(const [id,visible] of initialVisibility)layers.setVisibility(id,visible,false);signal?.removeEventListener('abort',abort);if(url)URL.revokeObjectURL(url);canvas.width=canvas.height=1;page.cleanup();}
 }
 function describeError(error){
  if(error?.name==='PasswordException')return 'パスワード付きPDFです。ロックを解除したPDFを選んでください。';
  if(error?.name==='InvalidPDFException')return 'PDFを読み込めませんでした。PDFとして書き出し直したファイルをお試しください。';
  if(error?.name==='MissingPDFException')return 'PDFデータを読み込めませんでした。ファイルを選び直してください。';
  return 'PDFを読み込めませんでした。別のPDFを試すか、ページを画像として書き出して読み込んでください。';
 }
 root.BoxPhotoPDF={open,render,inspect,describeError};
})(globalThis);
