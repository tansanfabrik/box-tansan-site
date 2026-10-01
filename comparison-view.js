/* One shared orientation, independent pivots, and one renderer for up to six designs. */
(function(root){
'use strict';
const layout=(count,columns,radius,gap)=>{
 const cols=Math.min(count,Math.max(1,columns)),rows=Math.ceil(count/cols),step=2*radius+gap;
 return {width:cols*step,height:rows*step,positions:Array.from({length:count},(_,i)=>{const row=Math.floor(i/cols),n=Math.min(cols,count-row*cols);return[(i%cols-(n-1)/2)*step,((rows-1)/2-row)*step,0];})};
};
function dispose(models){const geometries=new Set(),materials=new Set(),textures=new Set();for(const model of models)model.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const key of ['map','metalnessMap','roughnessMap','clearcoatMap','clearcoatRoughnessMap'])if(m[key])textures.add(m[key]);}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());}
function open(context){
 const T=root.THREE,$=id=>document.getElementById(id),dialog=$('comparison-live'),host=$('comparison-stage'),labels=$('comparison-labels'),renderer=context.renderer;
 const originalParent=renderer.domElement.parentElement,originalNext=renderer.domElement.nextSibling,oldSize=renderer.getSize(new T.Vector2()),oldRatio=renderer.getPixelRatio(),oldClear=renderer.getClearColor(new T.Color()),oldAlpha=renderer.getClearAlpha(),oldShadows=renderer.shadowMap.enabled;renderer.shadowMap.enabled=false;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(23,1,1,20000),items=context.items;
 camera.position.set(0,0,3000);camera.lookAt(0,0,0);camera.updateMatrixWorld();scene.environment=context.environment;scene.add(...context.lights);
 const pose={x:context.pose.x,y:context.pose.y,z:context.pose.z},startPose={...pose};
 let closed=false,exportBusy=false,drag=null,pinch=null,frame=0,layoutInfo;
 const events=new AbortController(),on=(el,type,fn,options={})=>el.addEventListener(type,fn,{...options,signal:events.signal});
 const clamp=(n,a,b)=>Math.min(b,Math.max(a,n)),rad=T.MathUtils.degToRad;
 let radius=1;labels.replaceChildren();
 for(const item of items){item.model.rotation.set(0,0,0);item.model.position.set(0,0,0);item.model.updateMatrixWorld(true);const sphere=new T.Box3().setFromObject(item.model).getBoundingSphere(new T.Sphere());radius=Math.max(radius,sphere.radius+sphere.center.length());scene.add(item.model);const label=document.createElement('span');label.textContent=item.name;labels.append(label);item.label=label;}
 $('comparison-columns').value=String(Math.min(matchMedia('(max-width:700px)').matches?2:3,Math.ceil(Math.sqrt(items.length))));
 $('comparison-zoom').value='100';$('comparison-gap').value='30';$('comparison-background').value='transparent';$('comparison-bg-color').value=context.background;
 $('comparison-count').textContent=items.length+'案をライブ比較';$('comparison-message').textContent='どの箱をドラッグしても、すべて一緒に回転します。';
 renderer.domElement.setAttribute('aria-hidden','true');host.prepend(renderer.domElement);
 function sync(){for(const axis of ['x','y','z'])$('comparison-'+axis).value=String(Math.round(pose[axis]));BoxRangeInputs.sync();}
 function position(){layoutInfo=layout(items.length,Number($('comparison-columns').value),radius,Number($('comparison-gap').value));items.forEach((item,i)=>{item.model.rotation.set(rad(-pose.x),rad(pose.y),rad(-pose.z+item.quarter),'XYZ');item.model.position.fromArray(layoutInfo.positions[i]);item.model.updateMatrixWorld(true);});}
 function configure(w,h){const aspect=w/h,span=Math.max(layoutInfo.height,layoutInfo.width/aspect)*1.10;camera.aspect=aspect;camera.position.z=span/(2*Math.tan(T.MathUtils.degToRad(camera.fov)/2))+radius;camera.zoom=Number($('comparison-zoom').value)/100;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);}
 function labelPositions(w,h){return items.map((item,i)=>{const p=new T.Vector3(layoutInfo.positions[i][0],layoutInfo.positions[i][1]-radius-8,0).project(camera);return{x:(p.x+1)*w/2,y:(1-p.y)*h/2};});}
 function paint(){if(closed)return;position();const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(w,h,false);configure(w,h);renderer.setClearColor($('comparison-bg-color').value,$('comparison-background').value==='transparent'?0:1);renderer.render(scene,camera);labelPositions(w,h).forEach((p,i)=>{items[i].label.style.left=p.x+'px';items[i].label.style.top=p.y+'px';});host.dataset.boxCount=String(items.length);host.dataset.rotation=[pose.x,pose.y,pose.z].map(x=>x.toFixed(3)).join(',');}
 function schedule(){if(closed||exportBusy)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;paint();});}
 const observer=new ResizeObserver(schedule);observer.observe(host);
 function finish(){if(closed)return;closed=true;cancelAnimationFrame(frame);events.abort();observer.disconnect();drag=null;pinch=null;labels.replaceChildren();dispose(items.map(i=>i.model));scene.environment=null;for(const light of context.lights)light.traverse(o=>{if(o.isLight)o.shadow?.dispose();});scene.clear();renderer.shadowMap.enabled=oldShadows;renderer.setClearColor(oldClear,oldAlpha);renderer.setPixelRatio(oldRatio);renderer.setSize(oldSize.x,oldSize.y,false);originalParent.insertBefore(renderer.domElement,originalNext?.parentElement===originalParent?originalNext:null);context.resume();}
 on(dialog,'close',finish);on(dialog,'cancel',e=>{if(exportBusy)e.preventDefault();});on($('close-comparison-live'),'click',()=>{if(!exportBusy)dialog.close();});
 for(const axis of ['x','y','z'])on($('comparison-'+axis),'input',()=>{pose[axis]=Number($('comparison-'+axis).value);sync();schedule();});
 for(const id of ['comparison-columns','comparison-zoom','comparison-gap','comparison-background','comparison-bg-color'])on($(id),'input',schedule);
 for(const button of dialog.querySelectorAll('[data-comparison-view]'))on(button,'click',()=>{const key=button.dataset.comparisonView;Object.assign(pose,key==='reset'?startPose:BoxFeatures.viewPresets[key]);sync();schedule();});
 on(host,'pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0||exportBusy)return;const q=new T.Quaternion().setFromEuler(new T.Euler(rad(-pose.x),rad(pose.y),rad(-pose.z),'XYZ'));drag={id:e.pointerId,x:e.clientX,y:e.clientY,q};host.setPointerCapture(e.pointerId);host.classList.add('dragging');});
 on(host,'pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;Object.assign(pose,BoxFeatures.dragRotation(T,drag.q,camera.quaternion,e.clientX-drag.x,e.clientY-drag.y));sync();schedule();});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])on(host,type,()=>{drag=null;host.classList.remove('dragging');});
 on(host,'wheel',e=>{if(host.clientWidth<600&&!e.ctrlKey)return;e.preventDefault();if(exportBusy)return;$('comparison-zoom').value=String(clamp(Number($('comparison-zoom').value)-e.deltaY*.08,50,200));sync();schedule();},{passive:false});
 on(host,'touchstart',e=>{if(e.touches.length===2&&!exportBusy)pinch={distance:Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY),zoom:Number($('comparison-zoom').value)};},{passive:true});
 on(host,'touchmove',e=>{if(e.touches.length!==2||!pinch||exportBusy)return;e.preventDefault();$('comparison-zoom').value=String(clamp(pinch.zoom*Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)/pinch.distance,50,200));sync();schedule();},{passive:false});on(host,'touchend',()=>{pinch=null;});on(host,'touchcancel',()=>{pinch=null;});
 on($('comparison-export'),'click',async()=>{
  if(exportBusy)return;exportBusy=true;cancelAnimationFrame(frame);drag=null;pinch=null;const controls=[...dialog.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);$('comparison-message').textContent='並べた箱のPNGを作成しています…';
  try{position();const aspect=host.clientWidth/host.clientHeight,size=Number($('comparison-resolution').value),w=Math.round(aspect>=1?size:size*aspect),h=Math.round(aspect>=1?size/aspect:size);renderer.setPixelRatio(1);renderer.setSize(w,h,false);configure(w,h);renderer.setClearColor($('comparison-bg-color').value,$('comparison-background').value==='transparent'?0:1);renderer.render(scene,camera);
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.drawImage(renderer.domElement,0,0);if($('comparison-include-names').checked){ctx.font='500 '+Math.max(16,Math.round(w/host.clientWidth*13))+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#25282b';labelPositions(w,h).forEach((p,i)=>ctx.fillText(items[i].name,p.x,p.y,w/Number($('comparison-columns').value)*.88));}
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=1;if(!blob)throw new Error('画像を作成できませんでした。');const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download='箱のデザイン比較.png';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);$('comparison-message').textContent=items.length+'案を並べたPNG（'+w+' × '+h+' px）を保存しました。';
  }catch(e){console.error(e);$('comparison-message').textContent='保存できませんでした。サイズを下げて再度お試しください。';}
  finally{exportBusy=false;controls.forEach(([el,disabled])=>el.disabled=disabled);paint();}
 });
 try{dialog.showModal();sync();paint();}catch(e){finish();throw e;}
 return {close:()=>dialog.close()};
}
const api={layout,dispose,open};if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxComparison=api;
})(typeof window==='object'?window:globalThis);
