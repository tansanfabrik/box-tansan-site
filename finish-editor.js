/* Manual finish plates: connected seed-color selection and additive/subtractive brush. */
(function(root){
'use strict';
function connected(pixels,w,h,x,y,tolerance){
 const selected=new Uint8Array(w*h);x=Math.floor(x);y=Math.floor(y);
 if(x<0||y<0||x>=w||y>=h)return selected;
 const seed=y*w+x,offset=seed*4;if(pixels[offset+3]<16)return selected;
 const threshold=Math.pow(Math.max(0,Math.min(100,tolerance))/100*255,2)*3,seen=new Uint8Array(w*h),queue=new Uint32Array(w*h);let head=0,tail=1;queue[0]=seed;seen[seed]=1;
 const visit=i=>{if(!seen[i]){seen[i]=1;queue[tail++]=i;}};
 while(head<tail){const i=queue[head++],p=i*4;if(pixels[p+3]<16)continue;let distance=0;for(let c=0;c<3;c++)distance+=(pixels[p+c]-pixels[offset+c])**2;if(distance>threshold)continue;selected[i]=1;const col=i%w;if(col>0)visit(i-1);if(col<w-1)visit(i+1);if(i>=w)visit(i-w);if(i<w*(h-1))visit(i+w);}
 return selected;
}
function rawPoint(x,y,w,h,rotation){switch(rotation){case 90:return[y,h-x];case 180:return[w-x,h-y];case 270:return[w-y,x];default:return[x,y];}}
function open({image,crop,faceName,kind,color,onApply}){
 const $=id=>document.getElementById(id),dialog=$('finish-editor'),canvas=$('finish-edit-canvas'),host=$('finish-edit-stage'),ctx=canvas.getContext('2d'),events=new AbortController();
 const on=(el,event,fn,opts={})=>el.addEventListener(event,fn,{...opts,signal:events.signal});
 const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
 const [rx,ry,rw,rh]=crop.rect,scale=Math.min(1,1536/Math.max(rw,rh)),w=Math.max(2,Math.round(rw*scale)),h=Math.max(2,Math.round(rh*scale)),rotation=((crop.rotation||0)%360+360)%360;
 const artwork=make(w,h),actx=artwork.getContext('2d',{willReadFrequently:true});actx.drawImage(image,rx,ry,rw,rh,0,0,w,h);const pixels=actx.getImageData(0,0,w,h).data;
 const mask=make(w,h),mctx=mask.getContext('2d',{willReadFrequently:true}),overlay=make(w,h),octx=overlay.getContext('2d');
 if(crop.finish?.image){const gray=BoxPrintFinish.prepared(crop.finish.image).gray,r=BoxPrintFinish.maskRect(crop,{width:image.naturalWidth,height:image.naturalHeight},gray,crop.finish.alignment);mctx.drawImage(gray,...r,0,0,w,h);const d=mctx.getImageData(0,0,w,h);for(let i=0;i<d.data.length;i+=4){d.data[i+3]=d.data[i];d.data[i]=d.data[i+1]=d.data[i+2]=0;}mctx.putImageData(d,0,0);}
 let history=[],pending=null,stroke=null,hover=null,closed=false,busy=false,frame=0;
 const cw=rotation%180?h:w,ch=rotation%180?w:h;canvas.width=cw;canvas.height=ch;
 $('finish-edit-title').textContent=faceName+'の加工範囲を選ぶ';$('finish-edit-kind').value=kind==='none'?'varnish':kind;$('finish-edit-tool').value='select';$('finish-edit-tolerance').value='18';$('finish-edit-size').value='30';$('finish-edit-zoom').value='100';
 $('finish-edit-color').value=BoxPrintFinish.cleanColor(color||crop.finish?.color);$('finish-edit-color-hex').value=$('finish-edit-color').value;$('finish-edit-color-hex').setCustomValidity('');
 const showColor=()=>{$('finish-edit-color-row').hidden=$('finish-edit-kind').value!=='color';};showColor();on($('finish-edit-kind'),'change',showColor);BoxPrintFinish.bindColorInputs($('finish-edit-color'),$('finish-edit-color-hex'),()=>{},{signal:events.signal});
 $('finish-edit-status').textContent='クリックで、つながった近い色の部分を追加します。許容範囲は直前のクリックに反映されます。';
 const snapshot=()=>mctx.getImageData(0,0,w,h);
 function push(){history.push(snapshot());if(history.length>8)history.shift();$('finish-edit-undo').disabled=false;}
 function paint(){if(closed)return;octx.clearRect(0,0,w,h);octx.globalCompositeOperation='source-over';octx.drawImage(mask,0,0);octx.globalCompositeOperation='source-in';octx.fillStyle='rgba(20,125,255,.55)';octx.fillRect(0,0,w,h);octx.globalCompositeOperation='source-over';ctx.clearRect(0,0,cw,ch);ctx.save();if(rotation===90){ctx.translate(h,0);ctx.rotate(Math.PI/2);}else if(rotation===180){ctx.translate(w,h);ctx.rotate(Math.PI);}else if(rotation===270){ctx.translate(0,w);ctx.rotate(-Math.PI/2);}ctx.drawImage(artwork,0,0);ctx.drawImage(overlay,0,0);if(hover&&$('finish-edit-tool').value!=='select'){ctx.beginPath();ctx.arc(hover.x,hover.y,Number($('finish-edit-size').value)/2,0,Math.PI*2);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle='#1d273a';ctx.lineWidth=1;ctx.stroke();}ctx.restore();}
 function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(paint);}
 const navigation=BoxImageNavigation.attach(host,{render:fit,busy:()=>busy||!!stroke,signal:events.signal});
 function fit(){const {scale,ox,oy}=navigation.layout(cw,ch,canvas,28);canvas.style.width=cw*scale+'px';canvas.style.height=ch*scale+'px';canvas.style.left=ox+'px';canvas.style.top=oy+'px';$('finish-edit-zoom').value=Math.round(navigation.zoom*100);BoxRangeInputs.sync();schedule();}
 function point(e){const r=canvas.getBoundingClientRect(),[x,y]=rawPoint((e.clientX-r.left)*cw/r.width,(e.clientY-r.top)*ch/r.height,w,h,rotation);return{x:Math.min(w-1,Math.max(0,x)),y:Math.min(h-1,Math.max(0,y))};}
 function select(){if(!pending)return;const found=connected(pixels,w,h,pending.x,pending.y,Number($('finish-edit-tolerance').value)),d=new ImageData(new Uint8ClampedArray(pending.base.data),w,h);let count=0;for(let i=0;i<found.length;i++)if(found[i]){d.data[i*4]=d.data[i*4+1]=d.data[i*4+2]=0;d.data[i*4+3]=255;count++;}mctx.putImageData(d,0,0);$('finish-edit-status').textContent=count?'選択を追加しました。許容範囲を変えると、直前の選択を調整できます。':'この場所は透明のため選択されません。';schedule();}
 function brush(from,to){mctx.globalCompositeOperation=stroke.tool==='erase'?'destination-out':'source-over';mctx.strokeStyle='#000';mctx.fillStyle='#000';mctx.lineCap=mctx.lineJoin='round';mctx.lineWidth=Number($('finish-edit-size').value);mctx.beginPath();mctx.moveTo(from.x,from.y);mctx.lineTo(to.x,to.y);mctx.stroke();mctx.beginPath();mctx.arc(to.x,to.y,mctx.lineWidth/2,0,Math.PI*2);mctx.fill();mctx.globalCompositeOperation='source-over';schedule();}
 function end(e){if(!stroke||e.pointerId!==stroke.id)return;const id=stroke.id;stroke=null;if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);$('finish-edit-status').textContent='加工範囲を修正しました。「ひとつ戻す」で1操作ずつ戻せます。';}
 on(canvas,'pointerdown',e=>{if(busy||e.button!==0||stroke)return;e.preventDefault();const p=point(e);hover=p;push();pending=null;if($('finish-edit-tool').value==='select'){pending={...p,base:history[history.length-1]};select();return;}stroke={id:e.pointerId,last:p,tool:$('finish-edit-tool').value};canvas.setPointerCapture(e.pointerId);brush(p,p);});
 on(canvas,'pointermove',e=>{if(navigation.panning)return;hover=point(e);if(stroke&&stroke.id===e.pointerId){brush(stroke.last,hover);stroke.last=hover;}else schedule();});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])on(canvas,name,end);
 on(canvas,'pointerleave',()=>{hover=null;schedule();});
 on($('finish-edit-tool'),'change',()=>{pending=null;hover=null;canvas.style.cursor=$('finish-edit-tool').value==='select'?'crosshair':'none';$('finish-edit-status').textContent=$('finish-edit-tool').value==='select'?'クリックした場所から、つながった近い色の部分を追加します。':'画像をなぞって加工範囲を'+($('finish-edit-tool').value==='erase'?'消去':'追加')+'します。';schedule();});
 on($('finish-edit-tolerance'),'input',select);on($('finish-edit-size'),'input',schedule);on($('finish-edit-zoom'),'input',()=>navigation.setZoom(Number($('finish-edit-zoom').value)/100));on($('finish-view-reset'),'click',()=>navigation.reset());
 on($('finish-edit-undo'),'click',()=>{if(!history.length)return;mctx.putImageData(history.pop(),0,0);pending=null;$('finish-edit-undo').disabled=!history.length;$('finish-edit-status').textContent='1操作戻しました。';schedule();});
 on($('finish-edit-clear'),'click',()=>{push();pending=null;mctx.clearRect(0,0,w,h);$('finish-edit-status').textContent='加工範囲をすべて消しました。「ひとつ戻す」で取り消せます。';schedule();});
 on($('finish-edit-cancel'),'click',()=>{if(!busy)dialog.close();});on(dialog,'cancel',e=>{if(busy)e.preventDefault();});
 on($('finish-edit-apply'),'click',async()=>{if(busy)return;busy=true;const controls=[...dialog.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);$('finish-edit-status').textContent='加工範囲を反映しています…';try{const plate=make(w,h),pctx=plate.getContext('2d');pctx.fillStyle='#fff';pctx.fillRect(0,0,w,h);pctx.drawImage(mask,0,0);const result=new Image();result.src=plate.toDataURL('image/png');await result.decode();onApply({image:result,name:'クリック・ブラシで指定',kind:$('finish-edit-kind').value,color:$('finish-edit-color').value,alignment:'face'});dialog.close();plate.width=plate.height=1;}catch(error){console.error(error);$('finish-edit-status').textContent='反映できませんでした。もう一度お試しください。';}finally{busy=false;controls.forEach(([el,disabled])=>el.disabled=disabled);}});
 const observer=new ResizeObserver(fit);observer.observe(host);
 on(dialog,'close',()=>{closed=true;cancelAnimationFrame(frame);events.abort();observer.disconnect();history=[];pending=null;stroke=null;for(const c of [artwork,mask,overlay,canvas])c.width=c.height=1;});
 $('finish-edit-undo').disabled=true;canvas.style.cursor='crosshair';dialog.showModal();BoxRangeInputs.sync();fit();paint();
}
const api={connected,rawPoint,open};if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxFinishEditor=api;
})(typeof window==='object'?window:globalThis);
