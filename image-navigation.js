/* Shared image viewport. Display transforms never modify artwork or selection data. */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function zoomAt(view,next,x,y,width,height){
 const zoom=clamp(next,.5,8),ratio=zoom/view.zoom;
 return{zoom,x:x-width/2-(x-width/2-view.x)*ratio,y:y-height/2-(y-height/2-view.y)*ratio};
}
function attach(host,{render,busy=()=>false,signal}={}){
 const events=new AbortController();let view={zoom:1,x:0,y:0},drag=null,key;
 const on=(el,type,fn,opts={})=>el.addEventListener(type,fn,{...opts,signal:events.signal});
 function end(e){if(!drag||e&&e.pointerId!==undefined&&e.pointerId!==drag.id)return;const id=drag.id;drag=null;host.classList.remove('image-panning');if(host.hasPointerCapture(id))host.releasePointerCapture(id);}
 function reset(notify=true){end();view={zoom:1,x:0,y:0};if(notify)render?.();}
 function layout(iw,ih,imageKey=key,padding=12){
  if(imageKey!==key){key=imageKey;reset(false);}
  const width=host.clientWidth,height=host.clientHeight;
  const scale=Math.max(.0001,Math.min((width-padding)/iw,(height-padding)/ih))*view.zoom;
  view.x=clamp(view.x,-Math.max(0,(width+iw*scale)/2-32),Math.max(0,(width+iw*scale)/2-32));
  view.y=clamp(view.y,-Math.max(0,(height+ih*scale)/2-32),Math.max(0,(height+ih*scale)/2-32));
  return{scale,ox:(width-iw*scale)/2+view.x,oy:(height-ih*scale)/2+view.y};
 }
 function setZoom(zoom,x=host.clientWidth/2,y=host.clientHeight/2){view=zoomAt(view,zoom,x,y,host.clientWidth,host.clientHeight);render?.();}
 on(host,'wheel',e=>{e.preventDefault();if(busy()||drag)return;const r=host.getBoundingClientRect(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?host.clientHeight:1);setZoom(view.zoom*Math.exp(-clamp(delta,-160,160)*.0025),e.clientX-r.left,e.clientY-r.top);},{passive:false,capture:true});
 on(host,'pointerdown',e=>{if(e.button!==1)return;e.preventDefault();e.stopImmediatePropagation();if(busy()||drag)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,from:{...view}};host.setPointerCapture(e.pointerId);host.classList.add('image-panning');},{capture:true});
 on(host,'pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;e.preventDefault();e.stopImmediatePropagation();view.x=drag.from.x+e.clientX-drag.x;view.y=drag.from.y+e.clientY-drag.y;render?.();},{capture:true});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])on(host,type,e=>{if(drag&&e.pointerId===drag.id){e.stopImmediatePropagation();end(e);}},{capture:true});
 on(host,'auxclick',e=>{if(e.button===1)e.preventDefault();});
 on(window,'blur',()=>end());
 const dispose=()=>{end();events.abort();};signal?.addEventListener('abort',dispose,{once:true});
 return{layout,reset,setZoom,get zoom(){return view.zoom;},get panning(){return !!drag;},dispose};
}
const api={zoomAt,attach};if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxImageNavigation=api;
})(globalThis);
