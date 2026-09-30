(function(root){
 'use strict';
 const presets=[
  {id:'card',label:'トランプ箱',size:[75,105,20],title:'サンプルは踊る',lines:['サンプルは','踊る'],color:'#5d5d86'},
  {id:'japan-smart',label:'タイニーボックス',size:[65,110,35],title:'サンプル探険',lines:['サンプル','探険'],color:'#255f75'},
  {id:'german',label:'ドイツ小箱',size:[95,122,22],title:'サンプルパーティ',lines:['サンプル','パーティ'],color:'#e9ebe3'},
  {id:'domestic',label:'国内小箱',size:[100,150,30],title:'サンプルレター',lines:['サンプル','レター'],color:'#e60e11'},
  {id:'square',label:'正方形小箱',size:[110,110,33],title:'サンプルバスケット',lines:['サンプル','バスケット'],color:'#efbb32'},
  {id:'medium',label:'中箱',size:[260,260,60],title:'サンプール',lines:['サンプール'],color:'#eee8d8'},
  {id:'medium-rect',label:'中箱・長方形',size:[280,200,70],title:'サンプルのきらめき',lines:['サンプルの','きらめき'],color:'#2e2b2e'},
  {id:'large',label:'大箱',size:[300,300,70],title:'サンプル島の開拓者たち',lines:['サンプル島の','開拓者たち'],color:'#bf402b'},
  {id:'wide',label:'長方形大箱',size:[310,230,60],depthRange:[50,70],title:'サンプルミック',lines:['サンプルミック'],color:'#243b52'},
  ...[['graphic-large16','トレーディングカード 大・16枚用',64.5,90,7],['graphic-large32','トレーディングカード 大・32枚用',64.5,90,12.8],['graphic-small16','トレーディングカード 小・16枚用',60.5,88,7],['graphic-small32','トレーディングカード 小・32枚用',60.5,88,12.8]].map(([id,label,...size])=>({id,label,size,title:'サンプルカード',lines:['サンプル','カード'],color:'#5d5d86'}))
 ];
 const faces=['front','back','left','right','top','bottom'],names=['表面','裏面','左面','右面','上面','下面'];
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 function backArtwork(preset,w,h,ink){
  const s=Math.min(w,h),text=(x,y,label,size,weight=400)=>`<text x="${x*w}" y="${y*h}" font-size="${size*s}" font-weight="${weight}">${esc(label)}</text>`;
  let out=text(.08,.075,'SAMPLE / BOARD GAME',.025,600)+text(.08,.135,preset.title,Math.min(.062,.84/[...preset.title].length),700);
  out+=text(.08,.195,'サンプルの世界へようこそ。',.035,600);
  out+=text(.08,.24,'サンプルをならべて、サンプルをひとつ。',.026)+text(.08,.278,'あちらのサンプル、こちらのサンプル。',.026)+text(.08,.316,'最後まで、だいたいサンプルです。',.026);
  out+=`<rect x="${w*.08}" y="${h*.35}" width="${w*.84}" height="${h*.215}" rx="${s*.008}" fill="none" stroke="${ink}" stroke-opacity=".65" stroke-width="${s*.002}"/><text x="${w*.5}" y="${h*.4575}" text-anchor="middle" dominant-baseline="middle" font-size="${s*.07}" fill-opacity=".8">image</text>`;
  out+=text(.08,.625,'01 サンプル　→　02 サンプル　→　03 サンプル',.026,600);
  out+=`<path d="M${w*.08} ${h*.657}H${w*.92}M${w*.08} ${h*.84}H${w*.92}" stroke="${ink}" stroke-opacity=".45" stroke-width="${s*.002}"/>`;
  out+=text(.08,.70,'内容物',.027,700)+text(.08,.739,'サンプル × いくつか',.026)+text(.08,.775,'サンプル × もう少し',.026)+text(.08,.811,'サンプルの説明書 × 1部',.026);
  out+=text(.08,.876,'サンプル人用 ｜ サンプル分 ｜ サンプル歳から',.028,700)+text(.08,.924,'この箱も、文章も、すべてサンプルです。',.022)+text(.08,.956,'SAMPLE ONLY · NOT FOR SALE',.019);
  return out;
 }
 function find(box){return presets.find(p=>(p.id.startsWith('graphic-')?'tuck':'lid')===box.type&&p.size.every((n,i)=>i===2&&p.depthRange?box.depth>=p.depthRange[0]&&box.depth<=p.depthRange[1]:n===box[['width','height','depth'][i]]));}
 function create(box,upright='auto'){
  const preset=find(box)||{id:'custom',label:'自由なサイズ',title:'サンプルボックス',lines:['サンプル','ボックス'],color:'#255f75'};
  const turn=(upright==='portrait'&&box.width>box.height)||(upright==='landscape'&&box.height>box.width);
  const scale=Math.min(6,1200/Math.max(box.width,box.height,box.depth)),W=Math.round((turn?box.height:box.width)*scale),H=Math.round((turn?box.width:box.height)*scale),D=Math.round(box.depth*scale),pad=20,gap=40,netWidth=W+2*D,width=2*netWidth+gap+2*pad,height=H+2*D+2*pad,crops={};
  const rects={front:[pad+D,pad+D,W,H],back:[pad+netWidth+gap+D,pad+D,W,H],left:[pad,pad+D,D,H],right:[pad+D+W,pad+D,D,H],top:[pad+D,pad,W,D],bottom:[pad+D,pad+D+H,W,D]};
  const mapping=turn?{front:'front',back:'back',top:'left',bottom:'right',left:'bottom',right:'top'}:Object.fromEntries(faces.map(f=>[f,f]));
  const rgb=preset.color.match(/\w\w/g).map(x=>parseInt(x,16)),ink=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>155?'#20252b':'#ffffff';
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#fff"/><g font-family="Helvetica Neue, Arial, Hiragino Kaku Gothic ProN, Meiryo, sans-serif" fill="${ink}">`;
  const bx=rects.back[0],by=rects.back[1];svg+=`<path d="M${bx},${by-D}h${W}v${D}h${D}v${H}h-${D}v${D}h-${W}v-${D}h-${D}v-${H}h${D}Z" fill="${preset.color}"/>`;
  faces.forEach((face,i)=>{
   const visualFace=mapping[face],faceName=names[faces.indexOf(visualFace)];
   const [x,y,w,h]=rects[visualFace];crops[face]={rect:[x,y,w,h],rotation:0,inset:.6};
   svg+=`<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" fill="${preset.color}"/>`;
   if(i===1){svg+=backArtwork(preset,w,h,ink);}else if(i===0){
    const lines=w/h>1.15?[preset.title]:preset.lines,maxChars=Math.max(...lines.map(s=>[...s].length)),font=Math.min(w*.82/maxChars,h*.16),small=Math.max(9,Math.min(w,h)*.037);
    svg+=`<text x="${w*.09}" y="${h*.14}" font-size="${small}" letter-spacing="${small*.2}">SAMPLE / ${String(i+1).padStart(2,'0')}</text>`;
    lines.forEach((line,j)=>{svg+=`<text x="${w/2}" y="${h*.45+(j-(lines.length-1)/2)*font*1.4}" text-anchor="middle" dominant-baseline="middle" font-size="${font}" font-weight="700">${esc(line)}</text>`;});
    if(i===1)svg+=`<text x="${w/2}" y="${h*.70}" text-anchor="middle" font-size="${Math.min(small,w*.8/17)}">デザイン確認用のサンプルです</text>`;
    svg+=`<text x="${w*.09}" y="${h*.84}" font-size="${small}">${esc(preset.label)} / ${names[i]}</text><text x="${w*.09}" y="${h*.91}" font-size="${small*.8}">${box.width} × ${box.height} × ${box.depth} mm</text>`;
   }else{
    // Back (-Z) rests on the floor: every side's lettering points up toward front (+Z).
    const vertical=visualFace==='left'||visualFace==='right',long=vertical?h:w,short=vertical?w:h,font=Math.min(short*.35,long*.75/[...preset.title].length);
    const logoAngle={top:180,bottom:0,left:90,right:-90}[visualFace];
    svg+=`<g data-face="${face}" data-display-face="${visualFace}" data-logo-angle="${logoAngle}" transform="translate(${w/2} ${h/2}) rotate(${logoAngle})"><text text-anchor="middle" dominant-baseline="middle" font-size="${font}" font-weight="650">${esc(preset.title)}</text><text y="${short*.32}" text-anchor="middle" font-size="${Math.min(short*.14,long*.06)}">SAMPLE · ${faceName}</text></g>`;
   }
   svg+='</g>';
  });
  svg+='</g><g fill="none" stroke="#aab5c4" stroke-width="1">';for(const r of Object.values(rects))svg+=`<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}"/>`;
  svg+=`<path d="M${bx},${by-D}v${H+2*D}M${bx+W},${by-D}v${H+2*D}M${bx-D},${by}h${W+2*D}M${bx-D},${by+H}h${W+2*D}"/>`;
  return{svg:svg+'</g></svg>',width,height,crops,preset};
 }
 const api={presets,faces,find,create};if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxSamples=api;
})(globalThis);
