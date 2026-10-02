(function(root){
'use strict';
const workerURL=new URL('line-cleanup.js'+new URL(document.currentScript.src).search,document.currentScript.src).href;
function open({image,crop,pdf,faceName,onApply}){
 const $=id=>document.getElementById(id),dialog=$('line-editor'),canvas=$('line-canvas'),host=$('line-stage'),events=new AbortController(),ctx=canvas.getContext('2d');
 const on=(el,event,fn)=>el.addEventListener(event,fn,{signal:events.signal}),make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
 const scale=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight)),w=Math.max(2,Math.round(image.naturalWidth*scale)),h=Math.max(2,Math.round(image.naturalHeight*scale));
 canvas.width=w;canvas.height=h;const original=make(w,h),overlay=make(w,h),sample=make(1,1);original.getContext('2d').drawImage(image,0,0,w,h);
 let colors=[],result=crop.cleanup?.image||null,busy=false,closed=false,revision=0,info=null,worker=null,renderAbort=null,resultName=crop.cleanup?.name||'',hasOverlay=false;
 const status=text=>$('line-status').textContent=text;
 $('line-title').textContent='裁断線・折り線を消す';$('line-face').textContent=faceName+'の元画像';$('line-method').value=pdf?'pdf':'pixels';$('line-pdf-option').disabled=!pdf;$('line-layer-list').replaceChildren();$('line-pdf-palette').replaceChildren();$('line-tolerance').value='8';$('line-width').value='6';$('line-view').value=result?'result':'original';$('line-all').checked=true;$('line-apply').disabled=!result;
 $('line-pdf-controls').hidden=!pdf;$('line-pixels-controls').hidden=!!pdf;
 const navigation=BoxImageNavigation.attach(host,{render:fit,signal:events.signal});
 function paint(){if(closed)return;ctx.clearRect(0,0,w,h);ctx.drawImage($('line-view').value==='result'&&result?result:original,0,0,w,h);if($('line-view').value==='mask'&&hasOverlay)ctx.drawImage(overlay,0,0);}
 function fit(){const {scale,ox,oy}=navigation.layout(w,h,canvas,16);canvas.style.width=w*scale+'px';canvas.style.height=h*scale+'px';canvas.style.left=ox+'px';canvas.style.top=oy+'px';paint();}
 function invalidate(){revision++;result=null;hasOverlay=false;$('line-apply').disabled=true;$('line-view').value='original';paint();status('「除去結果を確認」で仕上がりを確認してください。');}
 function renderColors(){const target=$('line-colors');target.replaceChildren();for(const color of colors){const b=document.createElement('button');b.type='button';b.textContent=color+' ×';b.style.borderLeft='14px solid '+color;b.setAttribute('aria-label',color+'を対象から外す');on(b,'click',()=>{colors=colors.filter(c=>c!==color);renderColors();invalidate();});target.append(b);}}
 function add(color){if(colors.includes(color))return;if(colors.length>=8){status('線の色は8色まで選べます。不要な色を外してください。');return;}colors.push(color);renderColors();invalidate();}
 function setBusy(value){busy=value;dialog.querySelectorAll('input,select,button').forEach(el=>{if(el.id!=='line-cancel')el.disabled=value;});$('line-pdf-option').disabled=!pdf||!info;$('line-apply').disabled=value||!result;}
 function difference(clean){const other=make(w,h),o=other.getContext('2d');o.drawImage(clean,0,0,w,h);const a=original.getContext('2d').getImageData(0,0,w,h),b=o.getImageData(0,0,w,h);for(let i=0;i<b.data.length;i+=4){const delta=Math.max(...[0,1,2,3].map(c=>Math.abs(a.data[i+c]-b.data[i+c])));b.data[i]=30;b.data[i+1]=120;b.data[i+2]=255;b.data[i+3]=delta>3?170:0;}overlay.getContext('2d').putImageData(b,0,0);other.width=other.height=1;hasOverlay=true;}
 async function toImage(c){const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('画像を作成できませんでした。')),'image/png')),url=URL.createObjectURL(blob);try{const img=new Image();img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}}
 async function pixels(){
  const W=image.naturalWidth,H=image.naturalHeight,maxWidth=Number($('line-width').value),pad=(maxWidth+2)*2,target=make(W,H),tile=make(W,1);let total=0;
  worker=new Worker(workerURL);
  try{for(let y=0;y<H;y+=256){if(closed)throw new DOMException('中止','AbortError');const height=Math.min(256,H-y),top=Math.max(0,y-pad),bottom=Math.min(H,y+height+pad);tile.height=bottom-top;const tc=tile.getContext('2d',{willReadFrequently:true});tc.drawImage(image,0,top,W,bottom-top,0,0,W,bottom-top);const data=tc.getImageData(0,0,W,bottom-top);
    const processed=await new Promise((resolve,reject)=>{const abort=()=>reject(new DOMException('中止','AbortError'));worker.onmessage=e=>{events.signal.removeEventListener('abort',abort);e.data.error?reject(Error(e.data.error)):resolve(e.data);};worker.onerror=()=>{events.signal.removeEventListener('abort',abort);reject(Error('線の除去に失敗しました。'));};events.signal.addEventListener('abort',abort,{once:true});worker.postMessage({data:data.data.buffer,w:W,h:bottom-top,colors,tolerance:Number($('line-tolerance').value),width:maxWidth},[data.data.buffer]);});
    if(closed)throw new DOMException('中止','AbortError');target.getContext('2d').putImageData(new ImageData(processed.data,W,bottom-top),0,top,0,y-top,W,height);
    for(let i=(y-top)*W;i<(y-top+height)*W;i++)total+=processed.changed[i];status('細い線を補修しています… '+Math.round((y+height)/H*100)+'%');
   }
   return {image:await toImage(target),count:total};
  }finally{worker?.terminate();worker=null;target.width=target.height=tile.width=tile.height=1;}
 }
 on(canvas,'click',e=>{if(busy||navigation.panning||e.button!==0)return;const r=canvas.getBoundingClientRect(),x=Math.min(image.naturalWidth-1,Math.max(0,Math.floor((e.clientX-r.left)/r.width*image.naturalWidth))),y=Math.min(image.naturalHeight-1,Math.max(0,Math.floor((e.clientY-r.top)/r.height*image.naturalHeight)));const sc=sample.getContext('2d',{willReadFrequently:true});sc.clearRect(0,0,1,1);sc.drawImage(image,x,y,1,1,0,0,1,1);const p=sc.getImageData(0,0,1,1).data;if(p[3]<16){status('透明な場所です。消したい線の上をクリックしてください。');return;}add('#'+[...p.slice(0,3)].map(n=>n.toString(16).padStart(2,'0')).join(''));});
 on($('line-add-color'),'click',()=>add($('line-color').value));on($('line-tolerance'),'input',invalidate);on($('line-width'),'input',invalidate);
 on($('line-method'),'change',()=>{$('line-pdf-controls').hidden=$('line-method').value!=='pdf';$('line-pixels-controls').hidden=$('line-method').value!=='pixels';invalidate();});
 on($('line-view'),'change',paint);on($('line-fit'),'click',()=>navigation.reset());
 on($('line-preview'),'click',async()=>{if(busy)return;for(const [id,min,max,fallback] of [['line-tolerance',0,100,8],['line-width',1,64,6]]){const n=Number($(id).value);$(id).value=Math.min(max,Math.max(min,Number.isFinite(n)?n:fallback));}const mode=$('line-method').value,layers=[...$('line-layer-list').querySelectorAll('input:checked')].map(el=>el.value);if(!colors.length&&!(mode==='pdf'&&layers.length)){status('画像の線をクリックするか、消す色・PDFレイヤーを選んでください。');return;}setBusy(true);const id=revision;renderAbort=new AbortController();status('除去結果を作成しています…');try{
   let next,count;if(mode==='pdf'){
    if(!info)throw Error('PDFの線情報を読み込み中です。少し待ってからお試しください。');const selected=colors.map(BoxLineCleanup.parse),indices=info.strokes.filter(s=>BoxLineCleanup.matches(BoxLineCleanup.parse(s.color),selected,Number($('line-tolerance').value))).map(s=>s.index);
    if(!indices.length&&!layers.length)throw Error('この色の独立した線は見つかりません。画像に焼き込まれた線は「周囲の色で細線を補修」に切り替えてください。');
    next=await BoxPhotoPDF.render(pdf.doc,pdf.page,renderAbort.signal,{indices,layers});resultName='PDFの線・レイヤーを非表示';count=indices.length;
   }else{const repaired=await pixels();next=repaired.image;count=repaired.count;resultName='指定色の細線を補修';}
   if(closed||id!==revision)return;if(next.naturalWidth!==image.naturalWidth||next.naturalHeight!==image.naturalHeight)throw Error('画像の寸法が変わったため適用できません。');result=next;difference(result);$('line-view').value='result';paint();status(mode==='pdf'?count+'個の線と'+layers.length+'個のレイヤーを非表示にしました。図柄が消えていないか確認してから適用してください。':count+'画素を補修しました。青い表示や元画像と比べて仕上がりを確認してください。');
  }catch(error){if(!closed)status(error.message||'除去に失敗しました。');}finally{if(!closed)setBusy(false);renderAbort=null;}
 });
 on($('line-apply'),'click',()=>{if(!result||busy)return;onApply({image:result,enabled:true,name:resultName},$('line-all').checked);dialog.close();});
 on($('line-cancel'),'click',()=>dialog.close());on(dialog,'close',()=>{closed=true;revision++;renderAbort?.abort();worker?.terminate();events.abort();observer.disconnect();navigation.dispose();for(const c of [canvas,original,overlay,sample])c.width=c.height=1;result=null;});
 const observer=new ResizeObserver(fit);observer.observe(host);renderColors();dialog.showModal();fit();status('消したい線の色を画像からクリックして選んでください。元画像は残り、面の推測には引き続き元画像を使います。');
 if(result)difference(result);
 if(pdf){$('line-preview').disabled=true;BoxPhotoPDF.inspect(pdf.doc,pdf.page,events.signal).then(data=>{if(closed)return;info=data;const counts=new Map();for(const s of data.strokes)counts.set(s.color,(counts.get(s.color)||0)+1);for(const [color,count] of counts){const b=document.createElement('button');b.type='button';b.textContent=color+' · '+count+'本';b.style.borderLeft='14px solid '+color;on(b,'click',()=>add(color));$('line-pdf-palette').append(b);}
   for(const layer of data.layers.filter(l=>l.visible)){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=layer.id;label.append(input,document.createTextNode(layer.name+'を非表示'));on(input,'change',invalidate);$('line-layer-list').append(label);}
   $('line-preview').disabled=false;status(data.strokes.length?'PDFの線色を選ぶと、下の図柄を保って線を非表示にできます。':'独立した線が見つかりません。専用レイヤーを選ぶか、画像の細線補修に切り替えてください。');
  }).catch(e=>{if(!closed){$('line-method').value='pixels';$('line-pdf-option').disabled=true;$('line-pdf-controls').hidden=true;$('line-pixels-controls').hidden=false;$('line-preview').disabled=false;status('PDFの線情報を取得できませんでした。画像の細線補修を使えます。');}});}
}
root.BoxLineCleanupEditor={open};
})(globalThis);
