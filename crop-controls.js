(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function handles([x,y,w,h]){return [['nw',x,y],['ne',x+w,y],['sw',x,y+h],['se',x+w,y+h],['n',x+w/2,y],['s',x+w/2,y+h],['w',x,y+h/2],['e',x+w,y+h/2]];}
function hit(rect,[px,py],tolerance){
 if(!rect)return 'new';const [x,y,w,h]=rect;
 const corners=handles(rect).slice(0,4).map(([key,a,b])=>({key,d:Math.hypot(px-a,py-b)})).sort((a,b)=>a.d-b.d);
 if(corners[0].d<=tolerance)return corners[0].key;
 const edges=[['w',Math.abs(px-x),py>=y-tolerance&&py<=y+h+tolerance],['e',Math.abs(px-x-w),py>=y-tolerance&&py<=y+h+tolerance],['n',Math.abs(py-y),px>=x-tolerance&&px<=x+w+tolerance],['s',Math.abs(py-y-h),px>=x-tolerance&&px<=x+w+tolerance]].filter(a=>a[2]&&a[1]<=tolerance).sort((a,b)=>a[1]-b[1]);
 if(edges.length)return edges[0][0];return px>=x&&px<=x+w&&py>=y&&py<=y+h?'move':'new';
}
function adjust(rect,mode,start,point,W,H){
 const dx=Math.round(point[0]-start[0]),dy=Math.round(point[1]-start[1]);
 if(mode==='new'){const x=clamp(Math.round(Math.min(start[0],point[0])),0,W-2),y=clamp(Math.round(Math.min(start[1],point[1])),0,H-2);return[x,y,clamp(Math.round(Math.abs(point[0]-start[0])),2,W-x),clamp(Math.round(Math.abs(point[1]-start[1])),2,H-y)];}
 const [x,y,w,h]=rect;if(mode==='move')return[clamp(x+dx,0,W-w),clamp(y+dy,0,H-h),w,h];
 let l=x,r=x+w,t=y,b=y+h;
 if(mode.includes('w'))l=clamp(x+dx,0,r-2);if(mode.includes('e'))r=clamp(x+w+dx,l+2,W);
 if(mode.includes('n'))t=clamp(y+dy,0,b-2);if(mode.includes('s'))b=clamp(y+h+dy,t+2,H);
 return[l,t,r-l,b-t];
}
const cursor=mode=>({nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize',n:'ns-resize',s:'ns-resize',w:'ew-resize',e:'ew-resize',move:'move',new:'crosshair'}[mode]||'crosshair');
const api={handles,hit,adjust,cursor};if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxCrop=api;
})(globalThis);
