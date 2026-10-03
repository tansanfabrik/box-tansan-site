(()=>{
'use strict';
const $=id=>document.getElementById(id);
const stage=$('stage'),rotation=$('rotation'),tilt=$('tilt'),roll=$('roll'),zoom=$('zoom'),status=$('status');
const exportButton=$('export'),resolution=$('resolution');
const lightingPreset=$('lighting-preset'),brightness=$('brightness'),lightDirection=$('light-direction');
const buttons=[...document.querySelectorAll('[data-view]')];
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n)),wrap=n=>((n+180)%360+360)%360-180;
const rad=THREE.MathUtils.degToRad;
const lightingStyles={
 neutral:{label:'色を確認',description:'元画像の色を優先し、面ごとの陰影を控えめに表示します。印刷物との色合わせを保証するものではありません。',ambient:1,key:1,fill:0,rim:0,room:0,softness:1,powers:[0,0,0,0],colors:['#ffffff','#ffffff','#ffffff'],exposure:1},
 studio:{label:'スタジオ',description:'元画像の色味を保ちながら、白い光と控えめな反射で立体感をつけます。',ambient:.85,key:2.1,fill:.65,rim:.65,room:.12,softness:1,powers:[2.4,1.1,1.8,.8],colors:['#ffffff','#ffffff','#ffffff'],exposure:1,environmentIntensity:.45},
 soft:{label:'やわらか',description:'光を広く回し、影をやわらげた明るい仕上がりです。',ambient:.90,key:1.65,fill:1.45,rim:.65,room:.28,softness:1.45,powers:[2.7,2.35,2,1.65],colors:['#ffffff','#ffffff','#ffffff'],exposure:1.04},
 contrast:{label:'陰影くっきり',description:'片側からの光を強め、側面の陰影と角の丸みを際立たせます。',ambient:.22,key:3.15,fill:.25,rim:1.25,room:.075,softness:.68,powers:[4.4,.55,3.7,.6],colors:['#ffffff','#edf3ff','#ffffff'],exposure:1.12},
 warm:{label:'暖かい光',description:'ほんのり暖色の光に、やわらかな補助光を合わせます。',ambient:.72,key:2.2,fill:.9,rim:.8,room:.21,softness:1.2,powers:[3.6,1.8,2.6,1.35],colors:['#ffd5a9','#eaf2ff','#ffead4'],exposure:1.12}
};
const detailDefaults={key:100,fill:100,rim:100,ambient:100,elevation:0,temperature:6500,spread:100,keyAzimuth:0,keyElevation:0,keyDistance:100};
const detailLimits={key:[0,200],fill:[0,200],rim:[0,200],ambient:[0,200],elevation:[-40,60],temperature:[3000,8000],spread:[50,180],keyAzimuth:[-180,180],keyElevation:[-80,80],keyDistance:[50,200]};
function cleanDetails(value){const out={...detailDefaults};for(const key in out)if(Number.isFinite(value?.[key]))out[key]=clamp(value[key],...detailLimits[key]);return out;}
let state={paired:false,pairGapMM:10,cameraAzimuth:0,cameraElevation:0,cameraDistance:100,x:0,y:30,z:0,zoom:1,view:'angle',lighting:'studio',brightness:100,lightDirection:0,details:{...detailDefaults},focusPosition:'middle',focusBlur:0,shadowBlur:25};
try{const s=JSON.parse(localStorage.getItem('box-photo-preferences-v1'));if(s&&['x','y','z','zoom'].every(k=>Number.isFinite(s[k])))state={...state,x:clamp(s.x,-180,180),y:wrap(s.y),z:clamp(s.z,-180,180),zoom:clamp(s.zoom,.7,3),view:s.view||'custom',lighting:Object.hasOwn(lightingStyles,s.lighting)?s.lighting:'studio',brightness:Number.isFinite(s.brightness)?clamp(s.brightness,65,145):100,lightDirection:Number.isFinite(s.lightDirection)?clamp(s.lightDirection,-100,100):0,details:cleanDetails(s.details),focusPosition:['near','middle','far'].includes(s.focusPosition)?s.focusPosition:'middle',focusBlur:Number.isFinite(s.focusBlur)?clamp(s.focusBlur,0,100):0};}catch(e){}
try{const s=JSON.parse(localStorage.getItem('box-photo-preferences-v1'));state.paired=s?.paired===true;for(const [key,min,max] of [['cameraAzimuth',-180,180],['cameraElevation',-75,90],['cameraDistance',70,180],['pairGapMM',0,100],['shadowBlur',0,100]])if(Number.isFinite(s?.[key]))state[key]=clamp(s[key],min,max);}catch(e){}
let renderer,scene,camera,model,companion,boxGroup,animation=0,drag=null,ready=false,exporting=false,lastURL=null;
let lightingRig,lightSources,environmentTarget,pmrem,environmentTimer=0;
let focusEngine,focusSupported=false,focusRAF=0,focusGeneration=0;
let resetting=false,comparisonActive=false;
const save=()=>{if(resetting)return;try{localStorage.setItem('box-photo-preferences-v1',JSON.stringify(state));localStorage.setItem('box-studio-settings-v2',JSON.stringify({box,output:readOutput()}));}catch(e){}};
function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
// Artwork never leaves this document. Only local object URLs are decoded.
let sourceImage=null, sourceName='', uploadGeneration=0, selectedFace='front';
const faceNames={front:'表面',back:'裏面',left:'左面',right:'右面',top:'上面',bottom:'下面','base-left':'身の左面','base-right':'身の右面','base-top':'身の上面','base-bottom':'身の下面'};
let autoLayoutDimensions=null,restoredColors=false;
let crops={},box={width:95,height:122,depth:22,radius:1,color:'#f1eee8',baseColor:'#f1eee8',interiorColor:'#e7e1d5',basePeekMM:2.4,baseArtwork:false,tuckNotch:true,type:'lid'};
let frontGuide=null,guessGeneration=0,guessing=false;
let faceGuess=null,cropDrag=null,cropView=null,ground=null,floorGrid=null,sampleMode=false,cancelExport=false,exportSamples=256,gifPairOffsets=null,referenceMesh=null,sceneBoxCount=1,previewScale=1;
const outputIds=['output-bg','background-color','output-aspect','placement','resolution','upright','gif-speed','gif-mode','gif-angle','paper-finish','lid-pose','box-arrangement','size-reference','dimension-caption'];
function readOutput(){return Object.fromEntries(outputIds.map(id=>[id,$(id)?.type==='checkbox'?$(id).checked:$(id)?.value]));}
function restoreSettings(){try{const saved=JSON.parse(localStorage.getItem('box-studio-settings-v2'))||{};const b=saved.box||{};for(const [key,min,max] of [['width',30,400],['height',30,400],['depth',3,250],['radius',.2,4]])if(Number.isFinite(b[key]))box[key]=clamp(b[key],min,max);if(/^#[0-9a-f]{6}$/i.test(b.color)){box.color=b.color;restoredColors=true;}box.baseColor=/^#[0-9a-f]{6}$/i.test(b.baseColor)?b.baseColor:box.color;if(/^#[0-9a-f]{6}$/i.test(b.interiorColor))box.interiorColor=b.interiorColor;box.baseArtwork=b.baseArtwork===true;box.tuckNotch=b.tuckNotch!==false;if(['lid','tuck'].includes(b.type))box.type=b.type;if(Number.isFinite(b.basePeekMM))box.basePeekMM=Math.max(0,b.basePeekMM);else if(typeof b.basePeek==='boolean')box.basePeekMM=b.basePeek?box.depth*.04:0;for(const id of outputIds){const el=$(id),value=id==='size-reference'&&saved.output?.[id]==='card'?'hand':saved.output?.[id];if(el.type==='checkbox'&&typeof value==='boolean')el.checked=value;else if(el.tagName==='SELECT'&&[...el.options].some(o=>o.value===value)||el.type==='color'&&/^#[0-9a-f]{6}$/i.test(value))el.value=value;else if(id==='gif-speed'&&Number.isFinite(Number(value))&&Number(value)>0)el.value=clamp(Number(value),.1,15);else if(id==='gif-angle'&&Number.isFinite(Number(value))&&Number(value)>0)el.value=Math.round(clamp(Number(value),10,180));}}catch(e){}
 for(const key of ['width','height','depth'])$('box-'+key).value=box[key];syncSurfaceColors();syncBasePeek();$('rounding').value=box.radius;$('rounding-value').textContent=box.radius.toFixed(1)+' mm';syncBoxType();syncSizePreset();syncGifSpeed();}
function syncSurfaceColors(){$('box-color').value=box.color;$('base-color').value=box.baseColor;$('interior-color').value=box.interiorColor;}
function faceColor(face){return box.type==='lid'&&(face==='back'||face.startsWith('base-'))?box.baseColor:box.color;}
function placedCrop(face,crop=crops[face]){return BoxStudio.uprightCrop(crop,face,box,$('upright').value);}
function checkRatios(){const mismatched=Object.keys(crops).filter(face=>!face.startsWith('base-')||box.type==='lid'&&box.baseArtwork).filter(face=>BoxStudio.ratioMismatch(placedCrop(face),BoxStudio.faceRatio(face,box)));$('ratio-warning').hidden=!mismatched.length;$('ratio-warning').textContent='画像の比率がズレています（'+mismatched.map(f=>faceNames[f]).join('・')+'）';$('fit-crop').hidden=!mismatched.includes(selectedFace);checkResolution();}
function checkResolution(){
 const info=BoxStudio.faceResolution(placedCrop(selectedFace),selectedFace,box),warning=$('resolution-warning');
 warning.hidden=!info||sampleMode;if(!info||sampleMode)return;
 const small=info.dpi<150;warning.classList.toggle('low-resolution',small);
 warning.textContent=faceNames[selectedFace]+'は約'+info.dpi+' dpi相当（使用範囲 '+info.width+' × '+info.height+' px）。'+(small?'大きく書き出すと文字や輪郭が粗くなる可能性があります。高解像度の画像に差し替えてください。':'実寸に対する解像度の目安です。');
}
function clearAutoLayoutNotice(){autoLayoutDimensions=null;$('auto-layout-notice').hidden=true;}
function showPDFResult(){const info=faceImage()?.pdfImport;$('pdf-result').hidden=!info;$('pdf-result').textContent=info||'';}
$('fit-crop').addEventListener('click',()=>{const c=crops[selectedFace];if(!c)return;c.rect=normalizeRect(BoxStudio.fitRect(placedCrop(selectedFace,c),BoxStudio.faceRatio(selectedFace,box)),faceImage());c.inset=0;updateCrop();});
function syncBackground(forceSolid=false){
 if(!renderer)return;const mode=$('output-bg').value;
 // Use a white working backdrop; exports keep the user's background and transparency.
 if(!exporting)renderer.setClearColor(0xffffff,1);else renderer.setClearColor(mode==='transparent'&&!forceSolid?0x000000:$('background-color').value,mode==='transparent'&&!forceSolid?0:1);
 $('export-layers').hidden=false;$('shadow-note').hidden=mode!=='shadow';
 if(ground){ground.visible=mode==='shadow';const normal=new THREE.Vector3(...BoxFeatures.groundUp),point=new THREE.Vector3();let min=Infinity;
  boxGroup.traverseVisible(mesh=>{if(!mesh.isMesh)return;const pos=mesh.geometry.attributes.position;for(let i=0;i<pos.count;i++){point.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);min=Math.min(min,point.dot(normal));}});
  ground.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);ground.position.copy(normal).multiplyScalar(min-.4);
  if(floorGrid){floorGrid.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),normal);floorGrid.position.copy(ground.position).addScaledVector(normal,.05);floorGrid.visible=ground.visible&&!exporting&&camera.position.clone().sub(ground.position).dot(normal)>0;}
 }
}

function texture(image,crop,face,finishMask=null){
 image=crop.image||image;crop=placedCrop(face,crop);
 const [x,y,w,h]=crop.rect;
 const inset=Math.min(crop.inset,Math.max(0,(Math.min(w,h)-2)/2));
 const sw=w-2*inset,sh=h-2*inset,turn=crop.rotation%180!==0;
 const scale=Math.min(1,3072/Math.max(sw,sh));
 const c=document.createElement('canvas');c.width=Math.max(2,Math.round((turn?sh:sw)*scale));c.height=Math.max(2,Math.round((turn?sw:sh)*scale));
 // Preserve the selected artwork's proportions when its upright orientation changes.
 if(BoxStudio.uprightTurn(box,$('upright').value)){const ratio=BoxStudio.faceRatio(face,box),cw=c.width,ch=c.height;const width=Math.max(cw,ch*ratio),height=Math.max(ch,cw/ratio),limit=Math.min(1,3072/Math.max(width,height));c.width=Math.max(2,Math.round(width*limit));c.height=Math.max(2,Math.round(height*limit));}
 const fit=Math.min(c.width/((turn?sh:sw)*scale),c.height/((turn?sw:sh)*scale));
 const ctx=c.getContext('2d');ctx.fillStyle=finishMask?'#000000':faceColor(face);ctx.fillRect(0,0,c.width,c.height);ctx.translate(c.width/2,c.height/2);ctx.rotate(rad(crop.rotation));ctx.scale(fit,fit);
 if(finishMask){
  const mask=BoxPrintFinish.prepared(finishMask.image).gray;
  const bounds=BoxPrintFinish.maskRect(crop,{width:image.naturalWidth,height:image.naturalHeight},mask,finishMask.alignment),[mx,my,mw,mh]=bounds;
  ctx.drawImage(mask,mx+inset/w*mw,my+inset/h*mh,mw*(1-2*inset/w),mh*(1-2*inset/h),-sw*scale/2,-sh*scale/2,sw*scale,sh*scale);
 }else ctx.drawImage(crop.cleanup?.enabled!==false&&crop.cleanup?.image||image,x+inset,y+inset,sw,sh,-sw*scale/2,-sh*scale/2,sw*scale,sh*scale);
 const t=new THREE.CanvasTexture(c);t.colorSpace=finishMask?THREE.NoColorSpace:THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();return t;
}
function disposeModel(){companion.clear();const materials=new Set(),maps=new Set();model.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const key of ['map','metalnessMap','roughnessMap','clearcoatMap','clearcoatRoughnessMap','specularIntensityMap','clearcoatNormalMap'])if(m[key])maps.add(m[key]);}}});for(const map of maps)map.dispose();for(const material of materials)material.dispose();model.clear();}
function faceMaterial(face){
 const crop=crops[face];if(!sourceImage||!crop)return paper(null,faceColor(face));
 const material=paper(texture(sourceImage,crop,face));
 if(crop.finish?.image&&crop.finish.kind!=='none')BoxPrintFinish.apply(THREE,material,texture(sourceImage,crop,face,crop.finish),crop.finish.kind);
 return material;
}
function rebuildBox(render=true){
 $('stage-dimensions').textContent=box.width+' × '+box.height+' × '+box.depth+' mm';
 if(!model)return;finishLidAnimation();syncSceneOptions();syncBasePeek();disposeModel();model.rotation.set(0,0,0);model.position.set(0,0,0);
 const u=330/Math.max(box.width,box.height,box.depth),w=box.width*u,h=box.height*u,d=box.depth*u;
 const radius=Math.min(box.radius*u,w/6,h/6,d/6);
 const mats=axes.map(a=>{const m=faceMaterial(a.name);if(state.lighting==='neutral')m.color.multiplyScalar(a.name==='front'||a.name==='back'?1:.88);return m;});
 if(box.type==='tuck'){
  tuckBox(w,h,d,radius,mats,u);
 }else{
  // Keep the lid and its artwork unchanged; extend the base behind the back plane.
  const profile=BoxStudio.lidProfile(d,(.2+box.basePeekMM)*u,Math.max(Math.min(1.2*u,d/5),Math.min(box.radius*u,w/6,h/6,d/6))),baseD=profile.baseDepth,lidD=profile.lidDepth;
  roundedBox(w*.985,h*.985,baseD,Math.min(radius*.8,baseD/6),axes.map(a=>{if(a.name==='back')return mats[5];const face='base-'+a.name,crop=box.baseArtwork&&crops[face];const material=crop?faceMaterial(face):paper(null,box.baseColor);if(state.lighting==='neutral'&&a.name!=='front')material.color.multiplyScalar(.88);return material;}),profile.baseCenter,'base');
  roundedBox(w,h,lidD,radius,mats.map((m,i)=>i===5?paper(null,box.color):m),profile.lidCenter,'lid');
 }
 if(box.type==='lid'){
  const base=model.getObjectByName('base'),lid=model.getObjectByName('lid'),profile=BoxStudio.lidProfile(d,(.2+box.basePeekMM)*u,Math.max(Math.min(1.2*u,d/5),Math.min(box.radius*u,w/6,h/6,d/6)));
  BoxFeatures.hollow(THREE,base,w*.985,h*.985,profile.baseDepth,true,u,box.interiorColor,radius*.8);BoxFeatures.hollow(THREE,lid,w,h,profile.lidDepth,false,u,box.interiorColor,radius);
  if($('lid-pose').value==='lifted'){const pose=BoxFeatures.liftedLidPose(THREE,w,h,d,profile.baseCenter+profile.baseDepth/2,2*u);lid.position.copy(pose.position);lid.quaternion.copy(pose.quaternion);}
  else if($('lid-pose').value==='beside'){lid.position.x=(w+w*Math.cos(rad(8))+h*Math.sin(rad(8)))/2+18*u;lid.position.z=-.2*u-box.basePeekMM*u;lid.rotation.z=rad(-8);}
 }
 syncClosedLining();
 sceneBoxCount=BoxFeatures.arrange(THREE,model,$('box-arrangement').value,w,h,d+(box.type==='lid'?.2+box.basePeekMM:0)*u,u);
 for(const child of model.children)companion.add(child.clone(true));
 if(referenceMesh){boxGroup.remove(referenceMesh);referenceMesh.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.dispose();}});}
 referenceMesh=BoxFeatures.reference(THREE,$('size-reference').value,u);if(referenceMesh)boxGroup.add(referenceMesh);

 $('stage').dataset.boxType=box.type;$('stage').dataset.basePeek=String(box.type==='lid');$('stage').dataset.basePeekMm=String(box.type==='lid'?box.basePeekMM:0);$('stage').dataset.surfaceColor=box.color;$('stage').dataset.baseSurfaceColor=box.baseColor;
 syncCamera();checkRatios();if(render)draw();else syncModel();fitFeaturePreview();if(render)draw();
}
function normalizeRect(rect,image=sourceImage){const W=image.naturalWidth,H=image.naturalHeight;let [x,y,w,h]=rect.map(Math.round);x=clamp(x,0,W-2);y=clamp(y,0,H-2);w=clamp(w,2,W-x);h=clamp(h,2,H-y);return[x,y,w,h];}
function setLayout(kind){
 if(!sourceImage)return;const W=sourceImage.naturalWidth,H=sourceImage.naturalHeight;crops={};
 const put=(name,r,rotation=0,inset=2)=>crops[name]={rect:normalizeRect(r),rotation,inset};
 if(kind==='single'){put('front',[0,0,W,H],0,0);}
 if(kind==='cross'){
  const u=Math.min(W/(box.width+2*box.depth),H/(box.height+2*box.depth)),w=box.width*u,h=box.height*u,d=box.depth*u,x=(W-w)/2,y=(H-h)/2;
  put('front',[x,y,w,h]);put('left',[x-d,y,d,h]);put('right',[x+w,y,d,h]);put('top',[x,y-d,w,d]);put('bottom',[x,y+h,w,d]);
 }
 if(kind==='double'){
  // A starting layout for two tray-style nets. Users can align every face.
  const rects={front:[.1197,.24196,.25876,.51544],left:[.0354,.24196,.0835,.51544],right:[.3794,.24196,.0837,.51544],top:[.1197,.074,.25876,.16635],bottom:[.1197,.7593,.25876,.16667],back:[.6235,.2497,.2513,.5006]};
  Object.entries(rects).forEach(([name,r])=>put(name,[r[0]*W,r[1]*H,r[2]*W,r[3]*H],0,Math.max(2,Math.round(W*.001))));
 }
 selectedFace='front';refreshCrop();rebuildBox();message('画像上で各面の範囲を調整できます。選び直すと、その範囲だけが箱に反映されます。');
}
let finishPreviewHeld=false;
function refreshCrop(){
 endFinishPreview();
 if(faceGuess&&(faceGuess.image!==faceImage()||faceGuess.dimensions!==[box.type,box.width,box.height,box.depth].join(',')))clearFaceGuess();
 syncFrontGuide();syncBaseArtwork();checkRatios();showPDFResult();
 document.querySelectorAll('[data-face]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.face===selectedFace)));
 const c=crops[selectedFace];$('face-upload-label').textContent=faceNames[selectedFace]+'の画像・PDFを選ぶ';$('crop-label').textContent=faceNames[selectedFace]+(c?' · '+c.rotation+'°':' · 未設定');
 $('inset').value=c?.inset||0;$('inset-value').textContent=(c?.inset||0)+' px';
 ['x','y','w','h'].forEach((k,i)=>{const input=$('crop-'+k);input.value=c?c.rect[i]:'';input.disabled=!c;});
 $('rotate-crop').disabled=!c;$('clear-face').disabled=!c;$('inset').disabled=!c;
 syncFinishControls();syncCleanupControls();BoxRangeInputs.sync();drawCrop();
}
function faceImage(){return selectedFace==='front'&&frontGuide?frontGuide.image:crops[selectedFace]?.image||sourceImage;}
function drawCrop(){
 const image=faceImage();if(!image)return;const c=$('crop-canvas'),width=c.clientWidth,height=c.clientHeight;if(!width||!height)return;
 const ratio=Math.min(devicePixelRatio||1,2);c.width=Math.round(width*ratio);c.height=Math.round(height*ratio);const ctx=c.getContext('2d');ctx.scale(ratio,ratio);
 const {scale,ox,oy}=cropNavigation.layout(image.naturalWidth,image.naturalHeight,image);
 $('crop-zoom-label').textContent=Math.round(cropNavigation.zoom*100)+'%';
 cropView={scale,ox,oy};
 if(finishPreviewHeld){ctx.fillStyle='#fff';ctx.fillRect(ox,oy,image.naturalWidth*scale,image.naturalHeight*scale);ctx.globalAlpha=.16;}
 ctx.drawImage(!faceGuess&&!frontGuide&&crops[selectedFace]?.cleanup?.enabled!==false&&crops[selectedFace]?.cleanup?.image||image,ox,oy,image.naturalWidth*scale,image.naturalHeight*scale);ctx.globalAlpha=1;
 if(($('finish-overlay').checked||finishPreviewHeld)&&crops[selectedFace]?.finish)BoxPrintFinish.paintOverlay(ctx,crops[selectedFace].finish,crops[selectedFace],image,scale,ox,oy);
 const active=crops[selectedFace];if(active){const [x,y,w,h]=active.rect;const px=ox+x*scale,py=oy+y*scale,pw=w*scale,ph=h*scale;
 ctx.fillStyle='#1f30254d';ctx.beginPath();ctx.rect(0,0,width,height);ctx.rect(px,py,pw,ph);ctx.fill('evenodd');ctx.strokeStyle='#0071e3';ctx.lineWidth=2;ctx.strokeRect(px,py,pw,ph);
 ctx.fillStyle='#fff';ctx.strokeStyle='#0071e3';ctx.lineWidth=2;for(const [key,hx,hy] of BoxCrop.handles([px,py,pw,ph])){const size=key.length===2?9:7;ctx.fillRect(hx-size/2,hy-size/2,size,size);ctx.strokeRect(hx-size/2,hy-size/2,size,size);}
 const inset=active.inset*scale;if(inset>0){ctx.setLineDash([3,3]);ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeRect(px+inset,py+inset,pw-2*inset,ph-2*inset);}
 }
 if(faceGuess&&faceGuess.image===image){ctx.setLineDash([6,3]);ctx.lineWidth=2;ctx.font='bold 13px sans-serif';for(const [face,candidate] of Object.entries(faceGuess.faces)){const [x,y,w,h]=candidate.rect,px=ox+x*scale,py=oy+y*scale;const color={front:'#0071e3',back:'#7b3fbb',left:'#b64b00',right:'#007d73',top:'#9b6500',bottom:'#b32c6c'}[face]||'#555';ctx.strokeStyle=color;ctx.strokeRect(px,py,w*scale,h*scale);const label=faceNames[face]+(face==='front'&&faceGuess.anchored?' 固定':' 候補'),tw=ctx.measureText(label).width;ctx.fillStyle='#fff';ctx.fillRect(px,py,tw+10,20);ctx.fillStyle=color;ctx.fillText(label,px+5,py+14);}ctx.setLineDash([]);}
 c.setAttribute('aria-label',faceNames[selectedFace]+'の範囲。辺・四隅をドラッグしてサイズ調整、内側で移動、外側で選び直し。矢印キーで1px移動。'+(active?active.rect.join(', '):'未設定'));
}
function cropPoint(e){const image=faceImage(),rect=$('crop-canvas').getBoundingClientRect();return[clamp((e.clientX-rect.left-cropView.ox)/cropView.scale,0,image.naturalWidth),clamp((e.clientY-rect.top-cropView.oy)/cropView.scale,0,image.naturalHeight)];}
function updateCrop(){clearFaceGuess();sampleMode=false;refreshCrop();rebuildBox();}
let activePDF=null,importController=null,importing=false;
function syncPDFControls(){
 syncFinishControls();syncCleanupControls();
 $('reset-all').disabled=!ready||importing||exporting||resetting;
 syncFrontGuide();
 $('pdf-controls').hidden=!activePDF||!!activePDF.face&&activePDF.face!==selectedFace;
 if(activePDF){$('pdf-page').value=activePDF.page;$('pdf-page').max=activePDF.doc.numPages;$('pdf-total').textContent='/ '+activePDF.doc.numPages+' ページ';}
 $('pdf-page').disabled=importing||exporting||!activePDF;
 $('pdf-prev').disabled=importing||exporting||!activePDF||activePDF.page<=1;
 $('pdf-next').disabled=importing||exporting||!activePDF||activePDF.page>=activePDF.doc.numPages;
 $('dropzone').setAttribute('aria-busy',String(importing));
 exportButton.disabled=!ready||!sourceImage||importing||exporting;syncExportButtons();
}
function startImport(){if(frontGuide){cancelFrontGuide();refreshCrop();rebuildBox();}clearFaceGuess();if(importController)importController.abort();importController=new AbortController();importing=true;const generation=++uploadGeneration;syncPDFControls();return{generation,signal:importController.signal};}
function releasePDF(pdf){if(pdf)pdf.doc.loadingTask.destroy().catch(()=>{});}
function applySource(img,name){
 const detectedColor=BoxPhotoColor.fromImage(img);
 box.color=detectedColor||'#f1eee8';box.baseColor=box.color;syncSurfaceColors();
 sourceImage=img;sourceName=name;sampleMode=false;$('mapping').hidden=false;const detected=box.type==='lid'?BoxDieline.detect(img):null;const guessed=detected?'double':BoxStudio.looksLikeCross(img,box)?'cross':'single';autoLayoutDimensions=detected?{width:box.width,height:box.height,depth:box.depth}:null;
 if(detected){if(detected.method!=='tray-structure'){box.height=Math.round(clamp(box.width*detected.ratio.height,30,400)*10)/10;box.depth=Math.round(clamp(box.width*detected.ratio.depth,3,250)*10)/10;$('box-height').value=box.height;$('box-depth').value=box.depth;syncSizePreset();}crops=Object.fromEntries(Object.entries(detected.rects).map(([face,rect])=>[face,{rect:normalizeRect(rect),rotation:0,inset:detected.inset}]));selectedFace='front';refreshCrop();rebuildBox();}else setLayout(guessed);
 $('auto-layout-notice').hidden=guessed==='single';$('auto-layout-text').textContent=guessed==='double'?'表・裏の展開図として読み込みました。':'十字型の展開図として読み込みました。';
 $('file-info').textContent=name+' · '+img.naturalWidth+' × '+img.naturalHeight+' px';$('upload-label').textContent='画像・PDFを差し替える';$('preview-badge').textContent=detected?'表裏の展開図を自動配置 · 寸法を確認':guessed==='cross'?'展開図として配置・各面を確認してください':'デザインを反映しました';$('file-info').dataset.autoLayout=detected?'double':guessed;
 if(lastURL){URL.revokeObjectURL(lastURL);lastURL=null;}$('result').hidden=true;$('result-image').removeAttribute('src');
}
function applyFaceSource(img,name,face){
 clearAutoLayoutNotice();
 if(!sourceImage)sourceImage=img;sampleMode=false;selectedFace=face;crops[face]={rect:[0,0,img.naturalWidth,img.naturalHeight],rotation:0,inset:0,image:img,name};
 $('mapping').hidden=false;$('preview-badge').textContent=faceNames[face]+'を差し替えました';$('file-info').textContent=faceNames[face]+'：'+name;$('file-info').dataset.autoLayout='faces';refreshCrop();rebuildBox();$('result').hidden=true;
}
let replacementRatioChanged=false;
function replaceArtwork(img,name,targetFace){
 const old=targetFace?(crops[targetFace]?.image||sourceImage):sourceImage;
 const oldSize=[old.naturalWidth,old.naturalHeight],newSize=[img.naturalWidth,img.naturalHeight];
 replacementRatioChanged=Math.abs((newSize[0]/newSize[1])/(oldSize[0]/oldSize[1])-1)>.02;
 for(const [face,crop] of Object.entries(crops)){
  if(targetFace?face===targetFace:(crop.image||sourceImage)===old){crops[face]=BoxProjectData.rescaleCrop(crop,oldSize,newSize);crops[face].image=img;crops[face].name=name;delete crops[face].cleanup;}
 }
 if(targetFace&&!crops[targetFace])crops[targetFace]={rect:[0,0,...newSize],rotation:0,inset:0,image:img,name};
 if(!targetFace){sourceImage=img;sourceName=name;for(const crop of Object.values(crops))if(crop.image===img)delete crop.image;}
 sampleMode=false;clearAutoLayoutNotice();$('file-info').textContent=name+' · 配置を引き継いで差し替え';$('preview-badge').textContent='配置を保って更新しました';$('result').hidden=true;refreshCrop();rebuildBox();
}
async function loadImage(file,targetFace=null,preserve=false){
 if(!file||!ready||exporting)return;
 const isPDF=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
 if(!isPDF&&!['image/png','image/jpeg','image/webp'].includes(file.type)){message('PDF・PNG・JPEG・WebPを選んでください。',true);$('upload').value='';return;}
 if(file.size>(isPDF?1024:30)*1024*1024){message(isPDF?'PDFは1 GB以下にしてください。':'画像は30 MB以下にしてください。',true);$('upload').value='';return;}
 const {generation,signal}=startImport();let url,candidate,importSucceeded=false;
 message(isPDF?'PDFの1ページ目を読み込んでいます…':'画像を読み込んでいます…');
 try{
  let img;
  if(isPDF){
   const doc=await BoxPhotoPDF.open(file,signal);candidate={doc,name:file.name,page:1,face:targetFace};img=await BoxPhotoPDF.render(doc,1,signal);candidate.image=img;
  }else{
   url=URL.createObjectURL(file);img=new Image();img.src=url;await img.decode();
   if(img.naturalWidth<2||img.naturalHeight<2||img.naturalWidth*img.naturalHeight>65000000||Math.max(img.naturalWidth,img.naturalHeight)>16000)throw new Error('画像の縦横を16,000 px以下・合計6,500万画素以下にしてください。');
  }
  if(generation!==uploadGeneration||signal.aborted)return;
  const name=isPDF?file.name+' · 1 / '+candidate.doc.numPages+' ページ':file.name;if(preserve&&sourceImage)replaceArtwork(img,name,targetFace);else if(targetFace)applyFaceSource(img,name,targetFace);else applySource(img,name);
  const previous=activePDF;activePDF=candidate||null;candidate=null;releasePDF(previous);importSucceeded=true;save();
  message(preserve?'画像を差し替えました。配置・箱のサイズ・構図を引き継いでいます。'+(replacementRatioChanged?'画像の縦横比が変わったため、面の範囲を確認してください。':''):(targetFace?faceNames[targetFace]+'を読み込みました。':$('file-info').dataset.autoLayout==='single'?'1枚のデザインとして読み込みました。':'展開図として読み込みました。')+'箱のサイズは「箱のかたち」タブで変更できます。');
 }catch(error){if(generation===uploadGeneration&&!signal.aborted){console.error(error);message(isPDF?BoxPhotoPDF.describeError(error):(error.message||'画像を読み込めませんでした。'),true);}}
 finally{if(generation===uploadGeneration&&importSucceeded&&(!preserve||replacementRatioChanged))openImageEditor();if(url)URL.revokeObjectURL(url);releasePDF(candidate);if(generation===uploadGeneration){importing=false;syncPDFControls();$('upload').value='';$('face-upload').value='';$('replace-artwork').value='';$('replace-face').value='';}}
}
async function selectPDFPage(requested){
 if(!activePDF||importing||exporting)return;
 const page=clamp(Math.round(Number(requested)||activePDF.page),1,activePDF.doc.numPages);
 if(page===activePDF.page){syncPDFControls();return;}
 const current=activePDF,{generation,signal}=startImport();message('PDFの '+page+' ページ目を読み込んでいます…');
 try{
  const img=await BoxPhotoPDF.render(current.doc,page,signal);
  if(generation!==uploadGeneration||signal.aborted)return;
  const name=current.name+' · '+page+' / '+current.doc.numPages+' ページ';if(current.face)applyFaceSource(img,name,current.face);else applySource(img,name);current.page=page;current.image=img;
  message(page+' ページ目を読み込みました。各面の範囲を合わせてください。');
 }catch(error){if(generation===uploadGeneration&&!signal.aborted){console.error(error);message(BoxPhotoPDF.describeError(error),true);}}
 finally{if(generation===uploadGeneration){importing=false;syncPDFControls();}}
}
$('pdf-prev').addEventListener('click',()=>selectPDFPage(activePDF?.page-1));
$('pdf-next').addEventListener('click',()=>selectPDFPage(activePDF?.page+1));
$('pdf-page').addEventListener('change',()=>selectPDFPage($('pdf-page').value));
function paper(map,color=0xffffff){if(state.lighting==='neutral')return new THREE.MeshBasicMaterial({map,color,toneMapped:false});return new THREE.MeshPhysicalMaterial({map,color,metalness:0,ior:1.48,...BoxFeatures.finishes[$('paper-finish').value],envMapIntensity:lightingStyles[state.lighting].environmentIntensity??.72});}
// Independent face UVs follow the physical folding of the supplied net.
const axes=[
 {name:'right',n:[1,0,0],u:[0,0,-1],v:[0,1,0]},
 {name:'left',n:[-1,0,0],u:[0,0,1],v:[0,1,0]},
 {name:'top',n:[0,1,0],u:[1,0,0],v:[0,0,-1]},
 {name:'bottom',n:[0,-1,0],u:[1,0,0],v:[0,0,1]},
 {name:'front',n:[0,0,1],u:[1,0,0],v:[0,1,0]},
 {name:'back',n:[0,0,-1],u:[-1,0,0],v:[0,1,0]}
];
function roundedBox(w,h,d,r,materials,z,name,foldsOnly=false,notch=0,notchDepth=notch){
 const group=new THREE.Group();group.position.z=z;group.name=name;
 const half=new THREE.Vector3(w/2,h/2,d/2),core=half.clone().addScalar(-r);if(foldsOnly)core.y=half.y;
 function grid(size){const half=size/2,out=[];for(let i=0;i<=7;i++)out.push(-half+r*i/7);for(let i=0;i<=7;i++)out.push(half-r+r*i/7);return out;}
 for(let f=0;f<6;f++){
  const def=axes[f],n=new THREE.Vector3(...def.n),u=new THREE.Vector3(...def.u),v=new THREE.Vector3(...def.v);
  const extent=axis=>Math.abs(axis.x)*w+Math.abs(axis.y)*h+Math.abs(axis.z)*d;
  const fw=extent(u),fh=extent(v),fd=extent(n),xs=grid(fw),ys=grid(fh),pos=[],norm=[],uv=[],idx=[];
  if(f===5&&notch){for(let k=0;k<=32;k++)xs.push(-notch+2*notch*k/32);xs.sort((a,b)=>a-b);ys.push(h/2-notchDepth,h/2-notchDepth/2);ys.sort((a,b)=>a-b);}
  for(let j=0;j<ys.length;j++)for(let i=0;i<xs.length;i++){
   const p=n.clone().multiplyScalar(fd/2).addScaledVector(u,xs[i]).addScaledVector(v,ys[j]);
   const q=new THREE.Vector3(clamp(p.x,-core.x,core.x),clamp(p.y,-core.y,core.y),clamp(p.z,-core.z,core.z));
   const normal=p.clone().sub(q).normalize();p.copy(q).addScaledVector(normal,r);if(foldsOnly&&n.y)normal.copy(n);
   let vy=ys[j];if(f===5&&notch&&Math.abs(xs[i])<notch){const amount=Math.sqrt(Math.max(0,1-xs[i]*xs[i]/(notch*notch)))*notchDepth*clamp((vy-(h/2-notchDepth))/notchDepth,0,1);p.y-=amount;vy-=amount;}
   pos.push(p.x,p.y,p.z);norm.push(normal.x,normal.y,normal.z);uv.push((xs[i]+fw/2)/fw,(vy+fh/2)/fh);
  }
  for(let j=0;j<ys.length-1;j++)for(let i=0;i<xs.length-1;i++){const a=j*xs.length+i,b=a+1,c=a+xs.length,d=c+1;idx.push(a,b,c,b,d,c);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);
  const mesh=new THREE.Mesh(geo,materials[f]);mesh.name=name+'-'+def.name;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
 }
 model.add(group);
}
// Closed tuck carton: a single paper shell, thumb notch, and closure seams.
function tuckBox(w,h,d,r,mats,u){
 const profile=BoxFeatures.tuckProfile(w,h,d,u),n=box.tuckNotch?profile.notchRadius:0,notchDepth=Math.min(profile.notchDepth,n),hw=w/2,hh=h/2;
 roundedBox(w,h,d,r,mats,0,'tuck',true,n,notchDepth);
 const shell=model.children[model.children.length-1];
 // Use the original clean top surface while closed. The articulated paper is
 // visible only while opening or when open; never draw both surfaces together.
 const closedTop=shell.getObjectByName('tuck-top');closedTop.name='tuck-top-closed';
 const edge=paper(null,box.interiorColor);edge.side=THREE.DoubleSide;
 const flap=new THREE.Mesh(BoxFeatures.tuckFlapGeometry(THREE,w,d,u,true),[closedTop.material,edge]);flap.name='tuck-top';flap.castShadow=flap.receiveShadow=true;
 const hinge=new THREE.Group();hinge.name='tuck-top-hinge';hinge.position.set(0,hh,d/2-.06*u);
 flap.position.set(0,0,-d/2+.06*u);hinge.add(flap);shell.add(hinge);
 const underside=new THREE.Mesh(flap.geometry.clone(),paper(null,box.interiorColor));underside.material.side=THREE.BackSide;underside.position.copy(flap.position);underside.position.y-=.28*u;underside.name='tuck-flap-lining';underside.receiveShadow=true;hinge.add(underside);
 if(box.tuckNotch){
  const geometry=BoxFeatures.tuckNotchGeometry(THREE,n,notchDepth,hh,-d/2,u);
  const rimMaterial=paper(null,box.color);rimMaterial.color.multiplyScalar(.65);rimMaterial.side=THREE.DoubleSide;
  const rim=new THREE.Mesh(geometry.rim,rimMaterial);rim.name='tuck-notch-paper-edge';rim.castShadow=rim.receiveShadow=true;shell.add(rim);
  const lip=new THREE.Mesh(geometry.lip,new THREE.MeshBasicMaterial({color:0x15151a,transparent:true,opacity:.38,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));lip.name='tuck-notch-contact-edge';shell.add(lip);
  const recessMaterial=paper(null,box.color);recessMaterial.vertexColors=true;recessMaterial.side=THREE.DoubleSide;
  const recess=new THREE.Mesh(geometry.recess,recessMaterial);recess.name='tuck-notch-recess';recess.receiveShadow=true;shell.add(recess);
 }
 // Rounded tuck tab stays attached to the lid via its own scored fold.
 const tongueHinge=new THREE.Group();tongueHinge.name='tuck-tongue-hinge';tongueHinge.position.set(0,.05*u,-d+.34*u);
 const inner=new THREE.Mesh(BoxFeatures.tuckTabGeometry(THREE,w,profile.tongueHeight,profile.tongueCorner,u),[paper(null,box.color),paper(null,box.interiorColor)]);inner.name='tuck-inner-flap';inner.castShadow=inner.receiveShadow=true;tongueHinge.add(inner);hinge.add(tongueHinge);
 shell.userData.tuckDimensions={w,h,d,u,profile};
 // Small side flaps seen under the lid in the supplied net.
 for(const sign of [-1,1]){
  const dustHinge=new THREE.Group();dustHinge.name=sign<0?'tuck-dust-left-hinge':'tuck-dust-right-hinge';dustHinge.position.set(sign*(hw-.25*u),hh-.32*u,0);const dust=new THREE.Mesh(new THREE.BoxGeometry(profile.dustLength,.28*u,Math.max(.5*u,d-.8*u)),[edge,edge,paper(null,box.color),paper(null,box.interiorColor),edge,edge]);dust.position.x=-sign*profile.dustLength/2;dust.name='tuck-dust-flap';dust.castShadow=dust.receiveShadow=true;dustHinge.add(dust);shell.add(dustHinge);dustHinge.rotation.z=$('lid-pose').value!=='closed'?-sign*rad(110):0;dustHinge.visible=$('lid-pose').value!=='closed';
 }
 // Lining is independent of the printed exterior and leaves the top opening clear.
 for(const face of ['front','back','left','right','bottom']){
  const exterior=shell.getObjectByName('tuck-'+face),lining=new THREE.Mesh(exterior.geometry.clone(),paper(null,box.interiorColor));
  lining.material.side=THREE.BackSide;const normal=axes.find(a=>a.name===face).n;lining.position.addScaledVector(new THREE.Vector3(...normal),-.3*u);lining.name='tuck-lining-'+face;lining.receiveShadow=true;shell.add(lining);
 }
 // A continuous rolled paper fold joins the front panel to the hinged lid.
 const foldGeometry=new THREE.CylinderGeometry(.18*u,.18*u,w-.32*u,12,1);foldGeometry.rotateZ(Math.PI/2);
 const foldPosition=foldGeometry.attributes.position,foldUV=foldGeometry.attributes.uv;
 for(let i=0;i<foldPosition.count;i++)foldUV.setXY(i,(foldPosition.getX(i)+w/2)/w,clamp(1+(foldPosition.getY(i)-.18*u)/h,0,1));
 const fold=new THREE.Mesh(foldGeometry,mats[4].clone());fold.position.set(0,hh,d/2-.06*u);fold.name='tuck-front-fold';fold.castShadow=fold.receiveShadow=true;shell.add(fold);
 const opened=$('lid-pose').value!=='closed';setTuckOpening(shell,opened?1:0);
 const recess=shell.getObjectByName('tuck-notch-recess');if(recess)recess.visible=!opened;closedTop.visible=!opened;hinge.visible=opened;fold.visible=opened;
 // Narrow shaded paper overlaps, not dieline artwork.
 for(const [x,y,z,width] of [[-(hw+n)/2,hh-.10*u,-d/2-.01*u,hw-n-r],[(hw+n)/2,hh-.10*u,-d/2-.01*u,hw-n-r],[0,-hh+.10*u,-d/2-.01*u,w-2*r]]){
  const material=new THREE.MeshBasicMaterial({color:0x393630,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false});
  const seam=new THREE.Mesh(new THREE.PlaneGeometry(width,.08*u),material);seam.position.set(x,y,z);seam.name='tuck-closure';shell.add(seam);
 }
}
function setTuckOpening(shell,progress){
 const pose=BoxFeatures.tuckOpeningPose(progress),{w,u,profile}=shell.userData.tuckDimensions;
 shell.userData.tuckOpen=progress;shell.getObjectByName('tuck-top-hinge').rotation.x=pose.lid;
 for(const [side,sign] of [['left',-1],['right',1]])shell.getObjectByName('tuck-dust-'+side+'-hinge').rotation.z=-sign*pose.dust;
 const tab=shell.getObjectByName('tuck-inner-flap');
 if(tab.userData.fold!==pose.fold||tab.userData.curl!==pose.curl){tab.geometry.dispose();tab.geometry=BoxFeatures.tuckTabGeometry(THREE,w,profile.tongueHeight,profile.tongueCorner,u,pose.fold,pose.curl);tab.userData.fold=pose.fold;tab.userData.curl=pose.curl;}
}
function setupLighting(){
 lightingRig=new THREE.Group();scene.add(lightingRig);
 const ambient=new THREE.AmbientLight(0xffffff,.65);scene.add(ambient);
 const key=new THREE.DirectionalLight(0xffffff,2.25);key.position.set(-500,650,1000);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-350,right:350,top:350,bottom:-350,near:300,far:2300});key.shadow.bias=-.00006;key.shadow.normalBias=.1;key.shadow.radius=4;key.shadow.blurSamples=8;lightingRig.add(key);
 const fill=new THREE.DirectionalLight(0xffffff,.75);fill.position.set(650,100,600);lightingRig.add(fill);
 const rim=new THREE.DirectionalLight(0xffffff,.95);rim.position.set(450,400,-700);lightingRig.add(rim);
 lightSources={ambient,key,fill,rim};pmrem=new THREE.PMREMGenerator(renderer);applyLighting(true);
}
function temperatureColor(kelvin){
 // Approximate white-balance tint, neutral at 6500 K.
 const t=kelvin/100;
 const r=t<=66?255:329.698727446*Math.pow(t-60,-.1332047592);
 const g=t<=66?99.4708025861*Math.log(t)-161.1195681661:288.1221695283*Math.pow(t-60,-.0755148492);
 const b=t>=66?255:t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307;
 return new THREE.Color(clamp(r/255,0,1),clamp(g/254.1,0,1),clamp(b/250.04,0,1));
}
function applyLighting(rebuildEnvironment=false){
 if(!lightSources)return;const style=lightingStyles[state.lighting],detail=state.details,tint=temperatureColor(detail.temperature),spread=style.softness*detail.spread/100;
 for(const name of ['ambient','key','fill','rim'])lightSources[name].intensity=style[name]*detail[name]/100;
 ['key','fill','rim'].forEach((name,i)=>lightSources[name].color.set(style.colors[i]).multiply(tint));lightSources.ambient.color.copy(tint);
 lightSources.key.position.set(...BoxFeatures.lightPosition([-500,650,1000],detail.keyAzimuth,detail.keyElevation,detail.keyDistance));
 lightingRig.rotation.set(rad(-detail.elevation),rad(state.lightDirection),0);syncShadowBlur();
 // Studio uses linear exposure to retain artwork hues; the other photographic presets keep their filmic look.
 renderer.toneMapping=state.lighting==='neutral'?THREE.NoToneMapping:state.lighting==='studio'?THREE.LinearToneMapping:THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=style.exposure*state.brightness/100;
 syncLightingControls();
 lightingPreset.value=state.lighting;brightness.value=state.brightness;lightDirection.value=state.lightDirection;
 $('brightness-value').textContent=state.brightness+'%';$('direction-value').textContent=state.lightDirection+'°';$('lighting-description').textContent=style.description;
 for(const key in detailDefaults){$('light-'+key).value=detail[key];$('light-'+key+'-value').textContent=detail[key]+(key==='temperature'?' K':['elevation','keyAzimuth','keyElevation'].includes(key)?'°':'%');}
 if(rebuildEnvironment){
  clearTimeout(environmentTimer);environmentTimer=0;
  const room=new THREE.Scene();room.background=new THREE.Color(style.room,style.room,style.room).multiplyScalar(detail.ambient/100).multiply(tint);
  const panels=new THREE.Group();panels.rotation.copy(lightingRig.rotation);room.add(panels);
  function softbox(x,y,z,w,h,power,color){if(power<=0)return;const material=new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiply(tint).multiplyScalar(power),vertexColors:true,toneMapped:false,side:THREE.DoubleSide});const m=new THREE.Mesh(BoxFeatures.softboxGeometry(THREE,w*spread,h*spread),material);m.position.set(x,y,z);m.lookAt(0,0,0);panels.add(m);}
  softbox(...BoxFeatures.lightPosition([-650,650,850],detail.keyAzimuth,detail.keyElevation,detail.keyDistance),750,1100,style.powers[0]*detail.key/100,style.colors[0]);softbox(700,150,450,500,1000,style.powers[1]*detail.fill/100,style.colors[1]);softbox(300,550,-800,420,1100,style.powers[2]*detail.rim/100,style.colors[2]);softbox(0,1100,0,1000,850,style.powers[3]*detail.ambient/100,style.colors[0]);
  const previous=environmentTarget;environmentTarget=pmrem.fromScene(room,.008,1,6000);scene.environment=environmentTarget.texture;if(previous)previous.dispose();
  room.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
 }
 draw();
}
function setupFocus(){
 focusEngine=new ApertureRenderer(renderer);focusSupported=focusEngine.supported;
 if(!focusSupported){state.focusBlur=0;$('focus-blur').disabled=true;$('focus-position').disabled=true;$('focus-blur-value').textContent='この端末は未対応';return;}
 syncFocusUI();
}
function syncFocusUI(){if(!focusSupported)return;$('focus-position').value=state.focusPosition;$('focus-blur').value=state.focusBlur;$('focus-blur-value').textContent=state.focusBlur?'f/'+BoxLens.fStop(state.focusBlur).toFixed(1):'全体くっきり';}
function stopFocusPreview(){cancelAnimationFrame(focusRAF);focusRAF=0;focusGeneration++;}
function focusSettings(cam,samples){
 cam.updateMatrixWorld();let near=Infinity,far=-Infinity;
 boxGroup.traverseVisible(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position,p=new THREE.Vector3();for(let i=0;i<positions.count;i++){p.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(cam.matrixWorldInverse);near=Math.min(near,-p.z);far=Math.max(far,-p.z);}});
 const point={near:.15,middle:.5,far:.85}[state.focusPosition];
 return{focusDistance:Math.max(1,near+(far-near)*point),radius:BoxLens.apertureRadius(state.focusBlur,330/Math.max(box.width,box.height,box.depth)),samples};
}
function renderWithFocus(cam){
 stopFocusPreview();
 if(!focusSupported||state.focusBlur===0){renderer.render(scene,cam);return;}
 focusEngine.begin(scene,cam,focusSettings(cam,96));const generation=focusGeneration;
 const refine=()=>{if(generation!==focusGeneration||exporting||!ready)return;const done=focusEngine.step(8);focusEngine.present();stage.dataset.focusSamples=focusEngine.count;if(!done)focusRAF=requestAnimationFrame(refine);};refine();
}
async function renderExportFocus(cam){
 stopFocusPreview();
 if(!focusSupported||state.focusBlur===0){renderer.render(scene,cam);return;}
 focusEngine.begin(scene,cam,focusSettings(cam,exportSamples));
 const label=status.textContent;
 while(focusEngine.count<exportSamples){if(cancelExport)throw new Error('書き出しを中止しました。');focusEngine.step(8);if(focusEngine.count%32===0)message(label+' '+Math.round(focusEngine.count/exportSamples*100)+'%');await tick();}
 if(cancelExport)throw new Error('書き出しを中止しました。');
 focusEngine.present();
}
function syncShadowBlur(){
 $('shadow-blur').value=state.shadowBlur;$('shadow-blur-value').textContent=state.shadowBlur+'%';
 if(lightSources){lightSources.key.shadow.radius=64*(state.shadowBlur/100)**2;lightSources.key.shadow.blurSamples=32;lightSources.key.shadow.needsUpdate=true;}
}
$('shadow-blur').addEventListener('input',()=>{state.shadowBlur=Number($('shadow-blur').value);syncShadowBlur();draw();});$('shadow-blur').addEventListener('change',save);
$('focus-position').addEventListener('change',()=>{state.focusPosition=$('focus-position').value;draw();save();});
$('focus-blur').addEventListener('input',()=>{state.focusBlur=Number($('focus-blur').value);syncFocusUI();draw();});$('focus-blur').addEventListener('change',save);
function syncCamera(){const az=rad(state.cameraAzimuth),el=rad(state.cameraElevation),distance=1420*state.cameraDistance/100;camera.position.set(distance*Math.cos(el)*Math.sin(az),distance*Math.sin(el),distance*Math.cos(el)*Math.cos(az));camera.up.set(-Math.sin(az)*Math.sin(el),Math.cos(el),-Math.cos(az)*Math.sin(el));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);}
function syncSceneOptions(){
 const lid=box.type==='lid';$('lid-pose-row').hidden=false;
 const lift=$('lid-pose').querySelector('[value="lifted"]'),beside=$('lid-pose').querySelector('[value="beside"]');
 lift.textContent=lid?'斜めに持ち上げる':'蓋を開く';beside.hidden=beside.disabled=!lid;
 if(!lid&&$('lid-pose').value==='beside')$('lid-pose').value='closed';
 if($('box-arrangement').value!=='single'){state.paired=false;$('lid-pose').value='closed';}
 $('interior-color-row').hidden=$('lid-pose').value==='closed';
 const ref=BoxFeatures.references[$('size-reference').value];$('reference-note').hidden=!ref;$('reference-badge').hidden=!ref;
 $('reference-note').textContent=ref?ref.label+($('size-reference').value==='hand'?'。大きさには個人差があります。':'。製品によって寸法は異なります。'):'';$('reference-badge').textContent=ref?ref.label:'';
}
function syncReference(){
 if(!referenceMesh)return;referenceMesh.visible=false;boxGroup.updateMatrixWorld(true);
 const normal=new THREE.Vector3(...BoxFeatures.groundUp),right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),floorRight=right.clone().addScaledVector(normal,-right.dot(normal)).normalize(),p=new THREE.Vector3();let bottom=Infinity,edge=-Infinity;
 boxGroup.traverseVisible(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld);bottom=Math.min(bottom,p.dot(normal));edge=Math.max(edge,p.dot(floorRight));}});
 const u=330/Math.max(box.width,box.height,box.depth),ref=BoxFeatures.references[$('size-reference').value];referenceMesh.position.copy(floorRight).multiplyScalar(edge+(ref.width/2+20)*u).addScaledVector(normal,bottom);
 const forward=new THREE.Vector3().crossVectors(floorRight,normal);referenceMesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(floorRight,normal,forward));referenceMesh.visible=true;boxGroup.updateMatrixWorld(true);
}
function fitFeaturePreview(){
 previewScale=1;
 if(state.paired||$('box-arrangement').value!=='single'||$('lid-pose').value!=='closed'||referenceMesh){
  boxGroup.updateMatrixWorld(true);const p=new THREE.Vector3();let radius=0;boxGroup.traverseVisible(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld);radius=Math.max(radius,p.length());}});previewScale=Math.min(1,200/Math.max(1,radius));
 }
 fitPreviewZoom();
}
function fitShadowCamera(){
 if(!lightSources)return;const bounds=new THREE.Box3();const p=new THREE.Vector3();boxGroup.traverseVisible(m=>{if(!m.isMesh)return;const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld);bounds.expandByPoint(p);}});
 const sphere=bounds.getBoundingSphere(new THREE.Sphere()),radius=Math.max(350,sphere.center.length()+sphere.radius)*1.15,cam=lightSources.key.shadow.camera,distance=lightSources.key.getWorldPosition(p).length();Object.assign(cam,{left:-radius,right:radius,top:radius,bottom:-radius,near:Math.max(1,distance-radius*1.5),far:distance+radius*2});cam.updateProjectionMatrix();
}
function stageFlat(){cancelAnimationFrame(animation);Object.assign(state,BoxFeatures.flatPose,{view:'custom'});$('placement').value='flat';}
$('paper-finish').addEventListener('change',()=>{if(state.lighting==='neutral'){state.lighting='studio';applyLighting(true);}rebuildBox();save();});
let lidAnimation=0;
const lidMovingNames=new Set(['lid','base','tuck']);
function finishLidAnimation(){cancelAnimationFrame(lidAnimation);lidAnimation=0;stage.dataset.lidAnimating='false';for(const root of [model,companion])root?.traverse(o=>{if(o.name==='tuck'&&o.userData.tuckTarget!==undefined){setTuckOpening(o,o.userData.tuckTarget);delete o.userData.tuckTarget;}if(o.userData.lidTarget){o.position.copy(o.userData.lidTarget.position);o.quaternion.copy(o.userData.lidTarget.quaternion);delete o.userData.lidTarget;}});syncTuckRecess();}
function syncClosedLining(){for(const root of [model,companion])root?.traverse(o=>{if(['plain-inner-floor','inner-side','paper-rim'].includes(o.name))o.visible=$('lid-pose').value!=='closed'||!!o.parent.userData.lidTarget;});}
function syncTuckRecess(){syncClosedLining();for(const root of [model,companion])root?.traverse(shell=>{
 if(shell.name!=='tuck')return;
 const hinge=shell.getObjectByName('tuck-top-hinge');if(!hinge)return;
 const articulated=shell.userData.tuckTarget!==undefined||shell.userData.tuckOpen>0;
 hinge.visible=articulated;
 for(const name of ['tuck-top-closed','tuck-front-fold','tuck-dust-left-hinge','tuck-dust-right-hinge']){const part=shell.getObjectByName(name);if(part)part.visible=name==='tuck-top-closed'?!articulated:articulated;}
 const recess=shell.getObjectByName('tuck-notch-recess');if(recess)recess.visible=Math.abs(hinge.rotation.x)<rad(12);
 });}
function animateLidChange(){
 cancelAnimationFrame(lidAnimation);lidAnimation=0;
 const previous=new Map();model.traverse(o=>{if(lidMovingNames.has(o.name))previous.set(o.name,{position:o.position.clone(),quaternion:o.quaternion.clone(),tuckOpen:o.userData.tuckOpen});});
 if($('lid-pose').value!=='closed'){$('box-arrangement').value='single';if(box.type==='lid')stageFlat();}
 rebuildBox(false);
 const tracks=[];for(const root of [model,companion])root.traverse(o=>{const from=previous.get(o.name);if(from){
  const to={position:o.position.clone(),quaternion:o.quaternion.clone()},u=330/Math.max(box.width,box.height,box.depth),w=box.width*u,h=box.height*u,d=box.depth*u;
  o.userData.lidTarget=to;let travel=null;
  if(box.type==='lid'&&o.name==='lid'){
   const base=root.getObjectByName('base'),baseFrom=previous.get('base'),profile=BoxStudio.lidProfile(d,(.2+box.basePeekMM)*u,Math.max(Math.min(1.2*u,d/5),Math.min(box.radius*u,w/6,h/6,d/6)));
   travel=BoxFeatures.relativeLidTravel(THREE,from,to,baseFrom,{position:base.position.clone()},w,h,d,profile.baseDepth,2*u);
  }
  const tuck=o.name==='tuck'?{from:from.tuckOpen??0,to:o.userData.tuckOpen}:null;
  if(tuck)o.userData.tuckTarget=tuck.to;tracks.push({o,from,to,travel,tuck});
 }});
 for(const {o,from,tuck} of tracks){o.position.copy(from.position);o.quaternion.copy(from.quaternion);if(tuck)setTuckOpening(o,tuck.from);}syncTuckRecess();draw();
 const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:(box.type==='lid'?1000:1400),start=performance.now();
 function frame(now){const t=duration?Math.min(1,(now-start)/duration):1,e=t*t*(3-2*t);for(const {o,from,to,travel,tuck} of tracks){if(travel){const pose=travel(t);o.position.copy(pose.position);o.quaternion.copy(pose.quaternion);}else{o.position.lerpVectors(from.position,to.position,e);o.quaternion.slerpQuaternions(from.quaternion,to.quaternion,e);}if(tuck)setTuckOpening(o,tuck.from+(tuck.to-tuck.from)*t);}syncTuckRecess();draw();stage.dataset.lidAnimating=String(t<1);if(t<1)lidAnimation=requestAnimationFrame(frame);else{finishLidAnimation();draw();save();}}lidAnimation=requestAnimationFrame(frame);
}
$('lid-pose').addEventListener('change',animateLidChange);
$('box-arrangement').addEventListener('change',()=>{if($('box-arrangement').value!=='single'){state.paired=false;$('lid-pose').value='closed';stageFlat();}rebuildBox();save();});
$('size-reference').addEventListener('change',()=>{rebuildBox();save();});
function companionState(){return BoxFeatures.dragRotation(THREE,companion.quaternion,camera.quaternion,0,0,BoxStudio.uprightTurn(box,$('upright').value));}
function pairGap(){return state.pairGapMM*330/Math.max(box.width,box.height,box.depth);}
function syncModel(){
 syncCamera();const quarter=BoxStudio.uprightTurn(box,$('upright').value);
 model.rotation.set(rad(-state.x),rad(state.y),rad(-state.z+quarter),'XYZ');model.position.set(0,0,0);
 companion.visible=state.paired;companion.quaternion.copy(BoxFeatures.companionRotation(THREE,model.quaternion,quarter));companion.position.set(0,0,0);boxGroup.updateMatrixWorld(true);
 if(state.paired){
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),point=new THREE.Vector3();
  const extent=group=>{let min=Infinity,max=-Infinity;group.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);const x=point.dot(right);min=Math.min(min,x);max=Math.max(max,x);}});return[min,max];};
  const offsets=gifPairOffsets||BoxStudio.pairCenters(extent(model),extent(companion),pairGap());model.position.copy(right).multiplyScalar(offsets[0]);companion.position.copy(right).multiplyScalar(offsets[1]);boxGroup.updateMatrixWorld(true);
 }
 syncReference();stage.dataset.boxCount=String(state.paired?2:sceneBoxCount);syncBackground();fitShadowCamera();
}
function lockGifPairCenters(original){
 if(!state.paired)return;
 const samples=[[],[]],right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),point=new THREE.Vector3();
 for(const angle of [0,90,180]){
  Object.assign(state,BoxFeatures.spinPose(THREE,original,angle,BoxStudio.uprightTurn(box,$('upright').value)));syncModel();
  [model,companion].forEach((group,index)=>{const values=[],offset=group.position.dot(right);group.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);values.push(point.dot(right)-offset);}});samples[index].push(values);});
 }
 const [a,b]=samples.map(points=>BoxStudio.rotationHalfWidth(...points));gifPairOffsets=BoxStudio.pairCenters([-a,a],[-b,b],pairGap());
}
function updateUI(){$('paired-box').checked=state.paired;$('paired-box').disabled=exporting||$('box-arrangement').value!=='single';$('pair-gap-row').hidden=!state.paired;$('pair-gap').value=state.pairGapMM;$('pair-gap-value').textContent=state.pairGapMM+' mm';for(const [id,key] of [['camera-horizontal','cameraAzimuth'],['camera-height','cameraElevation'],['camera-distance','cameraDistance']])$(id).value=state[key];rotation.value=wrap(state.y);tilt.value=state.x;roll.value=state.z;zoom.value=Math.round(state.zoom*100);buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));BoxRangeInputs.sync();}
function draw(){if(!ready||exporting||comparisonActive)return;syncModel();fitFeaturePreview();updateUI();renderWithFocus(camera);syncCaptionPreview();window.BoxFriendly?.sync();}
function fitPreviewZoom(){camera.zoom=state.zoom*previewScale*Math.min(camera.aspect,1/camera.aspect);camera.updateProjectionMatrix();}
function resize(){if(!renderer||exporting||comparisonActive)return;const w=stage.clientWidth,h=stage.clientHeight;renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(w,h,false);camera.aspect=w/h;camera.setFocalLength(85);fitPreviewZoom();draw();}
async function init(){
 try{
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;
  renderer.domElement.setAttribute('aria-hidden','true');stage.prepend(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;exportButton.disabled=true;message('描画を中断しました。ページを再読み込みしてください。',true);});
  scene=new THREE.Scene();boxGroup=new THREE.Group();model=new THREE.Group();companion=new THREE.Group();model.name="primary-box";companion.name="opposite-box";boxGroup.add(model,companion);scene.add(boxGroup);camera=new THREE.PerspectiveCamera(23,1,1,5000);camera.position.set(0,0,1380);
  setupLighting();setupFocus();ground=new THREE.Mesh(new THREE.PlaneGeometry(5000,5000),new THREE.ShadowMaterial({opacity:.2}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.visible=false;scene.add(ground);
  floorGrid=new THREE.GridHelper(2400,48,0x8fc9f0,0x8fc9f0);floorGrid.name='preview-floor-grid';floorGrid.material.transparent=true;floorGrid.material.opacity=.3;floorGrid.material.depthWrite=false;floorGrid.material.toneMapped=false;floorGrid.visible=false;scene.add(floorGrid);
  rebuildBox();
  ready=true;resize();exportButton.disabled=true;message('画像・PDFを選ぶと箱にデザインが反映されます。');
 }catch(e){console.error(e);message('3D表示を読み込めませんでした。WebGLが利用できるブラウザで開き直してください。',true);}
}
const presets=BoxFeatures.viewPresets;
function select(view){if(exporting)return;$('placement').value=['flat-overhead','top'].includes(view)?'flat':'standing';cancelAnimationFrame(animation);const from={...state},target={...presets[view]},duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:(view==='top'?1000:450),start=performance.now();target.y=from.y+wrap(target.y-from.y);state.view=view;
 function frame(now){const t=duration?Math.min(1,(now-start)/duration):1;Object.assign(state,BoxFeatures.viewTransition(from,target,t,view==='top'));draw();if(t<1)animation=requestAnimationFrame(frame);else{state.y=wrap(state.y);draw();save();}}animation=requestAnimationFrame(frame);
}
buttons.forEach(b=>b.addEventListener('click',()=>select(b.dataset.view)));
stage.addEventListener('pointerdown',e=>{
 if(e.pointerType==='touch'||e.button!==0||!ready||exporting)return;
 cancelAnimationFrame(animation);syncModel();
 const rect=stage.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
 const hit=ray.intersectObjects(state.paired?[model,companion]:[model],true)[0];let picked=hit?.object;
 while(picked&&picked!==model&&picked!==companion)picked=picked.parent;
 const opposite=picked===companion;
 stage.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,orientation:(opposite?companion:model).quaternion.clone(),cameraRotation:camera.quaternion.clone(),quarter:BoxStudio.uprightTurn(box,$('upright').value),opposite};stage.classList.add('dragging');
});
stage.addEventListener('pointermove',e=>{
 if(!drag||drag.id!==e.pointerId)return;
 Object.assign(state,BoxFeatures.dragRotation(THREE,drag.orientation,drag.cameraRotation,e.clientX-drag.x,e.clientY-drag.y,drag.quarter,drag.opposite));
 state.view='custom';$('placement').value='current';draw();
});
function release(){if(!drag)return;drag=null;stage.classList.remove('dragging');save();}
stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);stage.addEventListener('lostpointercapture',release);
stage.addEventListener('wheel',e=>{if(matchMedia('(max-width:700px)').matches&&!e.ctrlKey)return;e.preventDefault();if(exporting)return;state.zoom=clamp(state.zoom-e.deltaY*.0008,.7,3);fitPreviewZoom();draw();save();},{passive:false});
for(const [control,axis] of [[tilt,'x'],[rotation,'y'],[roll,'z']])control.addEventListener('input',()=>{cancelAnimationFrame(animation);state[axis]=Number(control.value);state.view='custom';$('placement').value='current';draw();});zoom.addEventListener('input',()=>{state.zoom=Number(zoom.value)/100;fitPreviewZoom();draw();});[rotation,tilt,roll,zoom].forEach(el=>el.addEventListener('change',save));
function projectedBounds(cam){
 const bounds={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity};cam.updateMatrixWorld();
 boxGroup.traverseVisible(mesh=>{if(!mesh.isMesh)return;const attr=mesh.geometry.attributes.position,p=new THREE.Vector3();for(let i=0;i<attr.count;i++){p.fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld).project(cam);bounds.x0=Math.min(bounds.x0,p.x);bounds.x1=Math.max(bounds.x1,p.x);bounds.y0=Math.min(bounds.y0,p.y);bounds.y1=Math.max(bounds.y1,p.y);}});return bounds;
}
function outputBounds(cam){
 const bounds=projectedBounds(cam);if($('output-bg').value!=='shadow')return bounds;
 // Project the box along the key light onto the actual receiving plane, so long shadows fit too.
 scene.updateMatrixWorld(true);const normal=new THREE.Vector3(0,0,1).applyQuaternion(ground.quaternion),plane=ground.position.dot(normal);
 const origin=lightSources.key.getWorldPosition(new THREE.Vector3()),ray=lightSources.key.target.getWorldPosition(new THREE.Vector3()).sub(origin).normalize(),denom=ray.dot(normal);
 if(denom>=-.0001)return bounds;
 boxGroup.traverseVisible(mesh=>{if(!mesh.isMesh||!mesh.castShadow)return;const attr=mesh.geometry.attributes.position,p=new THREE.Vector3();for(let i=0;i<attr.count;i++){p.fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld);const distance=(plane-p.dot(normal))/denom;if(distance<0)continue;p.addScaledVector(ray,distance).project(cam);if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;bounds.x0=Math.min(bounds.x0,p.x);bounds.x1=Math.max(bounds.x1,p.x);bounds.y0=Math.min(bounds.y0,p.y);bounds.y1=Math.max(bounds.y1,p.y);}});
 return bounds;
}
function lightingChanged(){save();message('照明を調整しました。現在の設定は透過PNGにも反映されます。');}
lightingPreset.addEventListener('change',()=>{if(exporting)return;state.lighting=lightingPreset.value;if(state.lighting==='neutral')state.brightness=100;applyLighting(true);rebuildBox();lightingChanged();});
brightness.addEventListener('input',()=>{if(exporting)return;state.brightness=Number(brightness.value);applyLighting();});brightness.addEventListener('change',lightingChanged);
lightDirection.addEventListener('input',()=>{if(exporting)return;state.lightDirection=Number(lightDirection.value);applyLighting();clearTimeout(environmentTimer);environmentTimer=setTimeout(()=>{environmentTimer=0;applyLighting(true);},100);});
lightDirection.addEventListener('change',()=>{applyLighting(true);lightingChanged();});
for(const key in detailDefaults){
 $('light-'+key).addEventListener('input',()=>{if(exporting)return;state.details[key]=Number($('light-'+key).value);applyLighting();clearTimeout(environmentTimer);environmentTimer=setTimeout(()=>{environmentTimer=0;applyLighting(true);},120);});
 $('light-'+key).addEventListener('change',()=>{applyLighting(true);lightingChanged();});
}
$('reset-light-position').addEventListener('click',()=>{for(const key of ['keyAzimuth','keyElevation','keyDistance'])state.details[key]=detailDefaults[key];applyLighting(true);lightingChanged();});
$('reset-lighting-details').addEventListener('click',()=>{state.details={...detailDefaults};applyLighting(true);lightingChanged();});
const reviewURLs=[];
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function syncExportButtons(){for(const id of ['export-three','export-pair','export-gif','export-layers'])$(id).disabled=!ready||!sourceImage||importing||exporting;}
function captionLines(){
 const lines=[];if($('dimension-caption').checked)lines.push(box.width+' × '+box.height+' × '+box.depth+' mm');
 if(referenceMesh)lines.push(BoxFeatures.references[$('size-reference').value].label);return lines;
}
function paintCornerCaption(ctx,width,height,lines){
 if(lines.length){let font=Math.max(12,Math.round(Math.min(width,height)*.018));ctx.font='500 '+font+'px sans-serif';const measured=Math.max(...lines.map(t=>ctx.measureText(t).width))+font*1.3;if(measured>width*.88)font=Math.max(6,Math.floor(font*width*.88/measured));const pad=font*.65,margin=font*1.1;ctx.font='500 '+font+'px sans-serif';ctx.textBaseline='top';const labelW=Math.max(...lines.map(t=>ctx.measureText(t).width))+pad*2,labelH=font*1.5*lines.length+pad*2,x=width-margin-labelW,y=height-margin-labelH;ctx.fillStyle='rgba(255,255,255,.9)';ctx.fillRect(x,y,labelW,labelH);ctx.fillStyle='#35383e';lines.forEach((text,i)=>ctx.fillText(text,x+pad,y+pad+i*font*1.5));}
}
function syncCaptionPreview(){
 const canvas=$('stage-caption'),enabled=$('dimension-caption').checked;
 canvas.hidden=!enabled;stage.classList.toggle('caption-preview-enabled',enabled);if(!enabled)return;
 const w=stage.clientWidth,h=stage.clientHeight,ratio=Math.min(devicePixelRatio||1,2);if(!w||!h)return;
 const pw=Math.round(w*ratio),ph=Math.round(h*ratio);if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
 const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);const lines=captionLines();paintCornerCaption(ctx,w,h,lines);canvas.setAttribute('aria-label','書き出し時の右下の表記：'+lines.join('、'));
}
$('dimension-caption').addEventListener('change',()=>{syncCaptionPreview();save();});
function dimensionsFor(longEdge){const ratio={square:1,portrait:4/5,story:9/16,wide:16/9}[$('output-aspect').value]||1;return ratio>=1?[longEdge,Math.round(longEdge/ratio)]:[Math.round(longEdge*ratio),longEdge];}
function exportCameraFor(width,height,bounds,baseCamera=camera){
 const cam=baseCamera.clone();cam.aspect=width/height;cam.zoom=1;cam.clearViewOffset();cam.updateProjectionMatrix();const b={...(bounds||outputBounds(cam))};
 if(focusSupported&&state.focusBlur&&!bounds){const lens=focusSettings(cam,256);for(let i=0;i<8;i++){const x=Math.cos(i*Math.PI/4)*lens.radius,y=Math.sin(i*Math.PI/4)*lens.radius,c=cam.clone();c.translateX(x);c.translateY(y);c.projectionMatrix.fromArray(BoxLens.shiftProjection(cam.projectionMatrix.elements,x,y,lens.focusDistance));c.projectionMatrixInverse.copy(c.projectionMatrix).invert();c.updateMatrixWorld(true);const a=outputBounds(c);b.x0=Math.min(b.x0,a.x0);b.x1=Math.max(b.x1,a.x1);b.y0=Math.min(b.y0,a.y0);b.y1=Math.max(b.y1,a.y1);}}
 const margin=$('output-bg').value==='shadow'?.72:.82,span=Math.max(b.x1-b.x0,b.y1-b.y0)/(2*margin),cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;cam.setViewOffset(width,height,width*(.5+cx/2-span/2),height*(.5-cy/2-span/2),width*span,height*span);return cam;
}
async function capture(width,height,{cam,solid=false,png=true,layer=null,fixedScene=false}={}){
 if(cancelExport)throw new Error('書き出しを中止しました。');
 const limit=Math.min(renderer.capabilities.maxTextureSize,renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE));if(Math.max(width,height)>limit)throw new Error('この端末では指定サイズに対応していません。2048 pxを選んでください。');
 if(!fixedScene)syncModel();syncBackground(solid);cam=cam||exportCameraFor(width,height);renderer.setPixelRatio(1);renderer.setSize(width,height,false);
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true}),materialStates=new Map();
 // Keep the box in the shadow pass while omitting its color and depth from the shadow-only image.
 try{
  floorGrid.visible=false;
  if(layer){renderer.setClearColor(0x000000,0);ground.visible=layer==='shadow';}
  if(layer==='shadow')boxGroup.traverseVisible(mesh=>{if(!mesh.isMesh)return;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){if(materialStates.has(material))continue;materialStates.set(material,{colorWrite:material.colorWrite,depthWrite:material.depthWrite});material.colorWrite=false;material.depthWrite=false;}});
  await renderExportFocus(cam);ctx.drawImage(renderer.domElement,0,0);
 }finally{for(const [material,saved] of materialStates)Object.assign(material,saved);syncBackground(solid);}
 if(layer!=='shadow')paintCornerCaption(ctx,width,height,captionLines());
 const pixels=ctx.getImageData(0,0,width,height).data;let clear=0,opaque=0,soft=0,x0=width,y0=height,x1=-1,y1=-1;
 for(let i=3;i<pixels.length;i+=4){const a=pixels[i];if(!a){clear++;continue;}a===255?opaque++:soft++;const pos=(i-3)/4,x=pos%width,y=Math.floor(pos/width);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 if(layer!=='shadow'&&!opaque)throw new Error('箱を描画できませんでした。もう一度お試しください。');
 const transparent=!!layer||$('output-bg').value==='transparent'&&!solid;if(transparent&&layer!=='shadow'&&(x0<2||y0<2||x1>=width-2||y1>=height-2))throw new Error('余白を確認できませんでした。ぼかしを弱めて再度お試しください。');
 const metadata={boxCount:state.paired?2:sceneBoxCount,pairGapMM:state.paired?state.pairGapMM:0,oppositeRotation:state.paired?companionState():null,width,height,transparentPixels:clear,opaquePixels:opaque,antialiasedPixels:soft,bounds:[x0,y0,x1,y1],cornerAlpha:[pixels[3],pixels[(width-1)*4+3],pixels[width*(height-1)*4+3],pixels[pixels.length-1]],rotation:{x:state.x,y:state.y,z:state.z},camera:{azimuth:state.cameraAzimuth,elevation:state.cameraElevation,distance:state.cameraDistance},upright:$('upright').value,lighting:{preset:state.lighting,brightness:state.brightness,direction:state.lightDirection,details:{...state.details}},focus:{method:'thin-lens',fStop:state.focusBlur?BoxLens.fStop(state.focusBlur):null,focalLengthMM:85,position:state.focusPosition,blur:state.focusBlur,samples:state.focusBlur?exportSamples:0},boxType:box.type,basePeek:box.type==='lid',basePeekMM:box.type==='lid'?box.basePeekMM:0,surfaceColor:box.color,baseSurfaceColor:box.baseColor,interiorColor:box.interiorColor,sourcePDF:activePDF?{page:activePDF.page,pages:activePDF.doc.numPages}:null,dimensionsMM:{width:box.width,height:box.height,depth:box.depth,totalDepth:box.depth+(box.type==='lid'?.2+box.basePeekMM:0)},baseArtwork:box.type==='lid'&&box.baseArtwork,assignedFaces:Object.keys(crops).filter(face=>!face.startsWith('base-')||box.type==='lid'&&box.baseArtwork),background:transparent?'transparent':$('output-bg').value==='transparent'?'solid':$('output-bg').value,backgroundColor:$('background-color').value,sample:sampleMode};
 const blob=png?await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNGを作成できませんでした。')),'image/png')):null;
 metadata.tuckNotch=box.type==='tuck'&&box.tuckNotch;metadata.shadowBlur=state.shadowBlur;metadata.groundNormal=[...BoxFeatures.groundUp];metadata.groundPosition=ground.position.toArray();metadata.finish=$('paper-finish').value;metadata.lidPose=$('lid-pose').value;metadata.arrangement=$('box-arrangement').value;metadata.reference=$('size-reference').value;metadata.dimensionCaption=$('dimension-caption').checked&&layer!=='shadow';metadata.layer=layer||'combined';metadata.floorGrid=false;
 return{canvas,pixels,blob,metadata};
}
function showReview(blob,name,items,title){
 if(cancelExport)throw new Error('書き出しを中止しました。');
 if(lastURL)URL.revokeObjectURL(lastURL);for(const url of reviewURLs)URL.revokeObjectURL(url);reviewURLs.length=0;
 lastURL=URL.createObjectURL(blob);const link=$('download');link.href=lastURL;link.download=name;link.textContent=name.endsWith('.zip')?'ZIPを保存 ↓':name.endsWith('.gif')?'GIFを保存 ↓':'PNGを保存 ↓';$('result-title').textContent=title;
 $('batch-previews').replaceChildren();const first=items[0];$('result-image').src=name.endsWith('.gif')?lastURL:URL.createObjectURL(first.blob);if(!name.endsWith('.gif'))reviewURLs.push($('result-image').src);$('result-image').alt=name.endsWith('.gif')?(first.metadata.gifMode==='rock'?'1往復':'1周')+(first.metadata.durationMS/1000)+'秒で回転する箱のサンプル':'保存する箱の画像';$('result-image').dataset.pngValidation=JSON.stringify(first.metadata);$('result').dataset.cuts=JSON.stringify(items.map(i=>({label:i.label,...i.metadata})));
 if(items.length>1)for(const item of items){const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=URL.createObjectURL(item.blob);reviewURLs.push(img.src);img.alt=item.label;caption.textContent=item.label;figure.append(img,caption);$('batch-previews').append(figure);}
 $('result').hidden=false;if(!$('review-dialog').open)$('review-dialog').showModal();
}
async function runExport(kind){
 if(!ready||!sourceImage||exporting||importing)return;stopFocusPreview();cancelAnimationFrame(animation);finishLidAnimation();release();if(environmentTimer)applyLighting(true);const original={...state},previewSize=renderer.getSize(new THREE.Vector2()),oldRatio=renderer.getPixelRatio(),originalBackground=$('output-bg').value;exporting=true;cancelExport=false;
 const controls=[...document.querySelectorAll('button,input,select')];controls.forEach(el=>el.disabled=true);$('cancel-export').hidden=false;$('cancel-export').disabled=false;exportButton.textContent='作成中…';exportSamples=kind==='gif'?96:256;
 try{
  const liveOrbit=kind==='gif'&&originalBackground==='shadow',liveScale=512/Math.max(previewSize.x,previewSize.y);
  const [width,height]=liveOrbit?[Math.max(1,Math.round(previewSize.x*liveScale)),Math.max(1,Math.round(previewSize.y*liveScale))]:dimensionsFor(kind==='gif'?512:Number(resolution.value));const items=[];
  if(kind==='layers'){
   $('output-bg').value='shadow';syncModel();const cam=exportCameraFor(width,height);
   for(const layer of ['box','shadow']){message(layer==='box'?'箱を描画しています…':'影を描画しています…');await tick();const frame=await capture(width,height,{cam,layer});frame.canvas.width=frame.canvas.height=1;items.push({blob:frame.blob,metadata:frame.metadata,label:layer==='box'?'箱（上に重ねる）':'影（下に重ねる）',name:layer+'.png'});}
   if(cancelExport)throw new Error('書き出しを中止しました。');
   showReview(await BoxStudio.zip(items),'box-and-shadow.zip',items,'箱と影を別々に · '+width+' × '+height+' px');
  }else if(kind==='gif'){
   const orbit=originalBackground==='shadow';message(orbit?'箱と影を固定して、カメラを回すGIFを準備しています…':'回転GIFを準備しています…');
   const {GIFEncoder,quantize,applyPalette}=await import('./vendor/gifenc.mjs'),gif=GIFEncoder(),timing=BoxStudio.gifTiming($('gif-speed').value),gifMode=$('gif-mode').value,swingAngle=Number($('gif-angle').value);
   if(orbit)syncModel();else lockGifPairCenters(original);
   // Shadow GIFs use the live projection verbatim, including zoom and aspect.
   // Shadows or boxes may leave this chosen frame; never pull back to fit them.
   let fitted=camera.clone();
   if(!orbit){
    const base=camera.clone();base.aspect=width/height;base.zoom=1;base.clearViewOffset();base.updateProjectionMatrix();const union={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity};
    for(let i=0;i<72;i++){
     Object.assign(state,BoxFeatures.spinPose(THREE,original,BoxStudio.gifRotationAngle(i/72,gifMode,swingAngle),BoxStudio.uprightTurn(box,$('upright').value)));syncModel();
     const b=outputBounds(base);union.x0=Math.min(union.x0,b.x0);union.x1=Math.max(union.x1,b.x1);union.y0=Math.min(union.y0,b.y0);union.y1=Math.max(union.y1,b.y1);
    }
    fitted=exportCameraFor(width,height,union,base);
   }
   let metadata;
   for(let i=0;i<timing.frames;i++){
    if(cancelExport)throw new Error('書き出しを中止しました。');const angle=BoxStudio.gifRotationAngle(i/timing.frames,gifMode,swingAngle);
    const cam=orbit?BoxFeatures.orbitCamera(THREE,fitted,angle):fitted;
    if(!orbit)Object.assign(state,BoxFeatures.spinPose(THREE,original,angle,BoxStudio.uprightTurn(box,$('upright').value)));
    const frame=await capture(width,height,{cam,solid:true,png:false,fixedScene:orbit});
    const palette=quantize(frame.pixels,256,{format:'rgb565'}),index=applyPalette(frame.pixels,palette,'rgb565');gif.writeFrame(index,width,height,{palette,delay:timing.delays[i],repeat:0});metadata=frame.metadata;
    if(orbit)metadata.camera={...metadata.camera,azimuth:wrap(original.cameraAzimuth-angle),position:cam.position.toArray()};
    frame.canvas.width=frame.canvas.height=1;message((orbit?'カメラを回してGIFを作成しています… ':'回転GIFを作成しています… ')+Math.round((i+1)/timing.frames*100)+'%');await tick();
   }
   gif.finish();const blob=new Blob([gif.bytes()],{type:'image/gif'});metadata={...metadata,durationMS:timing.durationMS,frames:timing.frames,rotationSpeed:timing.speed,gifMode,swingAngle:gifMode==='rock'?swingAngle:null,gifMotion:orbit?'camera-orbit':'box-turntable',gifFraming:orbit?'live-preview':'auto-fit',cameraZoom:fitted.zoom,cameraAspect:fitted.aspect,pairCenterOffsets:gifPairOffsets?[...gifPairOffsets]:null};const seconds=timing.durationMS/1000;showReview(blob,(gifMode==='rock'?'box-rock-':'box-rotation-')+seconds+'s.gif',[{blob,metadata,label:seconds+'秒ループ'}],(gifMode==='rock'?'往復回転GIF':'回転GIF')+' · '+seconds+'秒ループ'+(orbit?' · ライブビューの画角':''));
  }else{
   const cuts=kind==='three'?[{label:'斜め',name:'01-angle.png',pose:presets.angle},{label:'正面',name:'02-front.png',pose:presets.front},{label:'裏面',name:'03-back.png',pose:presets.back}]:kind==='pair'?[{label:'現在の角度',name:'01-current.png',pose:original},{label:'同じ角度の反対面',name:'02-reverse.png',pose:{...original,...companionState()}}]:[{label:'現在の向き',name:'box-image.png',pose:original}];
   for(const cut of cuts){Object.assign(state,cut.pose);syncModel();message(cut.label+'を描画しています…');await tick();const frame=await capture(width,height);frame.canvas.width=frame.canvas.height=1;items.push({blob:frame.blob,metadata:frame.metadata,label:cut.label,name:cut.name});}
   if(cancelExport)throw new Error('書き出しを中止しました。');
   const blob=items.length===1?items[0].blob:await BoxStudio.zip(items);showReview(blob,items.length===1?'box-image.png':kind==='three'?'box-3cuts.zip':'box-front-back.zip',items,items.length===1?'仕上がりを確認 · '+width+' × '+height+' px':items.length+'カット · '+width+' × '+height+' px');
  }
  message('仕上がりを確認し、保存ボタンを押してください。');
 }catch(error){console.error(error);message(error.message||'書き出しに失敗しました。サイズを下げて再度お試しください。',!cancelExport);}
 finally{gifPairOffsets=null;$('output-bg').value=originalBackground;Object.assign(state,original);renderer.setPixelRatio(oldRatio);renderer.setSize(previewSize.x,previewSize.y,false);exporting=false;exportSamples=256;controls.forEach(el=>el.disabled=!ready);$('cancel-export').hidden=true;refreshCrop();syncPDFControls();syncBoxType();syncLightingControls();syncExportButtons();if(!focusSupported){$('focus-blur').disabled=true;$('focus-position').disabled=true;}exportButton.textContent='仕上がりを見る →';resize();}
}
exportButton.addEventListener('click',()=>runExport('single'));
$('export-three').addEventListener('click',()=>runExport('three'));
$('export-pair').addEventListener('click',()=>runExport('pair'));
// Use a six-face CSS model: no extra WebGL context or export scene mutations.
function startGifExample(){
 const host=$('gif-speed-example'),cube=host.querySelector('.gif-speed-box'),matrix=new THREE.Matrix4();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let visible=true,last=0,phase=0,signature='';
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;}).observe(host);
 function frame(now){
  const elapsed=last?Math.min(100,now-last):0;last=now;
  if(ready&&!exporting&&!comparisonActive&&!document.hidden&&visible){
   const quarter=BoxStudio.uprightTurn(box,$('upright').value),mode=$('gif-mode').value,span=Number($('gif-angle').value);
   const next=[state.x,state.y,state.z,state.cameraAzimuth,state.cameraElevation,quarter,mode,span].join(',');
   if(next!==signature){signature=next;phase=0;}else if(!reduced.matches)phase=(phase+elapsed/BoxStudio.gifTiming($('gif-speed').value).durationMS)%1;
   const angle=reduced.matches?0:BoxStudio.gifRotationAngle(phase,mode,span);
   const q=BoxFeatures.gifPreviewRotation(THREE,state,camera.quaternion,angle,quarter);
   // CSS uses downward Y, while the scene uses upward Y.
   q.set(-q.x,q.y,-q.z,q.w);matrix.makeRotationFromQuaternion(q);
   cube.style.transform='matrix3d('+matrix.elements.join(',')+')';
  }
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}
function syncGifSpeed(){
 $('gif-speed').value=String(BoxStudio.gifSpeedAtPosition(BoxStudio.gifSpeedPosition($('gif-speed').value)));
 const timing=BoxStudio.gifTiming($('gif-speed').value),seconds=timing.durationMS/1000,speed=timing.speed,rock=$('gif-mode').value==='rock',cycle=rock?'1往復':'1周',span=Number($('gif-angle').value);
 for(const radio of document.querySelectorAll('input[name=gif-motion]'))radio.checked=radio.value===$('gif-mode').value;
 $('gif-angle-control').hidden=!rock;
 $('gif-angle-value').textContent=span+'°（左右'+span/2+'°）';
 $('gif-speed-example').classList.toggle('is-rock',rock);
 $('gif-speed-example').style.setProperty('--gif-rock-half',span/2+'deg');
 $('gif-speed-value').textContent=speed+'×・'+cycle+seconds+'秒';
 $('export-gif').title=cycle+seconds+'秒の回転GIFを作成';
 const comment=speed<=.3?'ゆっくり確認':speed<=.75?'じっくり見せる':speed<=1.5?'見やすい速さ':speed<=2.5?'少し速め':speed<=3.5?'文字が読みづらい':'早すぎて見えない';
 $('gif-speed-comment').textContent=comment;
 $('gif-speed-example').style.setProperty('--gif-preview-duration',seconds+'s');
 $('gif-speed-example').title='速度見本：'+cycle+seconds+'秒';
}
for(const id of ['gif-speed','gif-mode','gif-angle'])$(id).addEventListener(id==='gif-mode'?'change':'input',()=>{syncGifSpeed();save();});
for(const radio of document.querySelectorAll('input[name=gif-motion]'))radio.addEventListener('change',()=>{if(radio.checked){$('gif-mode').value=radio.value;$('gif-mode').dispatchEvent(new Event('change',{bubbles:true}));}});
$('export-gif').addEventListener('click',()=>runExport('gif'));
$('export-layers').addEventListener('click',()=>runExport('layers'));
$('cancel-export').addEventListener('click',()=>cancelExport=true);
for(const [id,key] of [['camera-horizontal','cameraAzimuth'],['camera-height','cameraElevation'],['camera-distance','cameraDistance']]){$(id).addEventListener('input',()=>{cancelAnimationFrame(animation);state[key]=Number($(id).value);state.view='custom';draw();});$(id).addEventListener('change',save);}
$('paired-box').addEventListener('change',()=>{state.paired=$('paired-box').checked;draw();save();});
$('pair-gap').addEventListener('input',()=>{state.pairGapMM=Number($('pair-gap').value);draw();save();});
$('reset-all').addEventListener('click',()=>{
 if(!ready||importing||exporting||resetting)return;
 if(!window.confirm('すべての設定を初期状態に戻しますか？\n\n箱のサイズ・向き・光・ピント・背景・保存設定と、読み込んだ画像の配置をリセットし、ドイツ小箱のサンプルに戻します。\n元の画像・PDFファイルや保存済みの画像は削除されません。'))return;
 resetting=true;
 try{
  // Remove only this tool's preferences, never other data on the same origin.
  localStorage.removeItem('box-photo-preferences-v1');
  localStorage.removeItem('box-studio-settings-v2');
 }catch(e){resetting=false;window.alert('ブラウザーに保存した設定をリセットできませんでした。ブラウザーの保存設定を確認してください。');return;}
 $('reset-all').disabled=true;cancelAnimationFrame(animation);
 // Also clear live form values before reload, for browsers that restore forms.
 for(const el of document.querySelectorAll('input,select')){
  if(el.tagName==='SELECT'){el.selectedIndex=Math.max(0,[...el.options].findIndex(o=>o.defaultSelected));}
  else if(el.type==='checkbox')el.checked=el.defaultChecked;
  else el.value=el.type==='file'?'':el.defaultValue;
 }
 window.location.reload();
});
$('reset-view').addEventListener('click',()=>{state.cameraAzimuth=0;state.cameraElevation=0;state.cameraDistance=100;state.zoom=1;fitPreviewZoom();select('angle');});
$('upload').addEventListener('change',e=>loadImage(e.target.files[0]));
$('replace-artwork-button').addEventListener('click',()=>$('replace-artwork').click());
$('replace-artwork').addEventListener('change',e=>loadImage(e.target.files[0],null,true));
$('replace-face-button').addEventListener('click',()=>$('replace-face').click());
$('replace-face').addEventListener('change',e=>loadImage(e.target.files[0],selectedFace,true));
$('face-upload').addEventListener('change',e=>loadImage(e.target.files[0],selectedFace));
const dropzone=$('dropzone');
['dragenter','dragover'].forEach(name=>dropzone.addEventListener(name,e=>{e.preventDefault();dropzone.classList.add('over');}));
['dragleave','drop'].forEach(name=>dropzone.addEventListener(name,e=>{e.preventDefault();dropzone.classList.remove('over');}));
dropzone.addEventListener('drop',e=>loadImage(e.dataTransfer.files[0]));
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
document.querySelectorAll('[data-face]').forEach(button=>button.addEventListener('click',()=>{selectedFace=button.dataset.face;refreshCrop();syncPDFControls();}));
function syncCleanupControls(){
 const crop=crops[selectedFace],cleanup=crop?.cleanup;
 $('open-line-cleanup').disabled=!crop||!!frontGuide||importing||exporting;$('line-enabled-row').hidden=!cleanup;$('clear-line-cleanup').hidden=!cleanup;$('line-enabled').checked=cleanup?.enabled!==false;
 $('line-summary').textContent=cleanup?(cleanup.enabled===false?'元画像を表示中。':cleanup.name+'：適用中。')+'面の推測には線のある元画像を使います。':'';
}
$('open-line-cleanup').addEventListener('click',()=>{
 const face=selectedFace,crop=crops[face],image=faceImage();if(!crop||!image||frontGuide||importing||exporting)return;
 const pdf=activePDF?.image===image?{doc:activePDF.doc,page:activePDF.page}:null;
 BoxLineCleanupEditor.open({image,crop,pdf,faceName:faceNames[face],onApply:(cleanup,all)=>{
  if(crops[face]!==crop||(crop.image||sourceImage)!==image)return;
  for(const [key,item] of Object.entries(crops))if(key===face||(all&&(item.image||sourceImage)===image))item.cleanup={...cleanup};
  updateCrop();
 }});
});
$('line-enabled').addEventListener('change',()=>{const crop=crops[selectedFace];if(crop?.cleanup){crop.cleanup={...crop.cleanup,enabled:$('line-enabled').checked};updateCrop();}});
$('clear-line-cleanup').addEventListener('click',()=>{const crop=crops[selectedFace];if(crop){delete crop.cleanup;updateCrop();}});
function syncFinishControls(){
 const crop=crops[selectedFace],finish=crop?.finish;
 $('finish-face-name').textContent=faceNames[selectedFace];$('finish-kind').value=finish?.kind||'none';$('finish-alignment').value=finish?.alignment||'source';
 $('finish-edit-button').disabled=!crop||importing||exporting;$('finish-upload-button').disabled=!crop||importing||exporting;$('finish-kind').disabled=!crop||importing||exporting;$('finish-alignment').disabled=!finish||importing||exporting;$('finish-preview').disabled=!finish||importing||exporting;
 $('finish-file-name').textContent=finish?.name||'加工用画像はまだ読み込まれていません。';
}
$('finish-edit-button').addEventListener('click',()=>{
 const face=selectedFace,crop=crops[face];if(!crop||importing||exporting)return;
 BoxFinishEditor.open({image:crop.cleanup?.enabled!==false&&crop.cleanup?.image||faceImage(),crop,faceName:faceNames[face],kind:$('finish-kind').value,onApply:finish=>{
  if(crops[face]!==crop)return;crop.finish=finish;if(state.lighting==='neutral'){state.lighting='studio';applyLighting(true);}updateCrop();
 }});
});
$('finish-upload-button').addEventListener('click',()=>$('finish-upload').click());
$('finish-upload').addEventListener('change',async e=>{
 const file=e.target.files[0];e.target.value='';const face=selectedFace,crop=crops[face];if(!file||!crop||importing||exporting)return;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>30*1024*1024){$('finish-file-name').textContent='30 MB以下のPNG・JPEG・WebPを選んでください。';return;}
 const requestedKind=$('finish-kind').value,requestedAlignment=$('finish-alignment').value;let loadError='';const {generation,signal}=startImport();syncFinishControls();const url=URL.createObjectURL(file);
 try{const image=new Image();image.src=url;await image.decode();if(image.naturalWidth<2||image.naturalHeight<2||image.naturalWidth*image.naturalHeight>65000000||Math.max(image.naturalWidth,image.naturalHeight)>16000)throw new Error('各辺16,000 px以下・合計6,500万画素以下の画像を選んでください。');
  if(signal.aborted||generation!==uploadGeneration||crops[face]!==crop)return;
  crop.finish={image,name:file.name,kind:crop.finish?.kind&&crop.finish.kind!=='none'?crop.finish.kind:(requestedKind==='none'?'varnish':requestedKind),alignment:requestedAlignment};
  if(state.lighting==='neutral'){state.lighting='studio';applyLighting(true);}sampleMode=false;rebuildBox();refreshCrop();message(faceNames[face]+'に加工用画像を配置しました。青い部分が加工範囲です。');
 }catch(error){if(!signal.aborted){loadError=error.message||'加工用画像を読み込めませんでした。';}}
 finally{URL.revokeObjectURL(url);if(generation===uploadGeneration){importing=false;syncPDFControls();syncFinishControls();if(loadError)$('finish-file-name').textContent=loadError;}}
});
$('finish-kind').addEventListener('change',()=>{const c=crops[selectedFace];if(!c)return;if(c.finish){c.finish={...c.finish,kind:$('finish-kind').value};if(c.finish.kind!=='none'&&state.lighting==='neutral'){state.lighting='studio';applyLighting(true);}updateCrop();}else $('finish-file-name').textContent='加工用画像を読み込むと、黒い部分に選んだ加工を反映します。';});
$('finish-alignment').addEventListener('change',()=>{const c=crops[selectedFace];if(c?.finish){c.finish={...c.finish,alignment:$('finish-alignment').value};updateCrop();}});
$('finish-overlay').addEventListener('change',drawCrop);
// Inspection is transient: never change the processing plate or saved settings.
const finishPreviewButton=$('finish-preview');
let finishPreviewPointer=null,finishPreviewKey=null;
function beginFinishPreview(){
 if(finishPreviewButton.disabled||!crops[selectedFace]?.finish)return;
 finishPreviewHeld=true;finishPreviewButton.setAttribute('aria-pressed','true');drawCrop();
}
function endFinishPreview(){
 const wasHeld=finishPreviewHeld;finishPreviewHeld=false;finishPreviewKey=null;
 const pointer=finishPreviewPointer;finishPreviewPointer=null;
 if(pointer!==null&&finishPreviewButton.hasPointerCapture(pointer))finishPreviewButton.releasePointerCapture(pointer);
 finishPreviewButton.setAttribute('aria-pressed','false');if(wasHeld)drawCrop();
}
finishPreviewButton.addEventListener('pointerdown',e=>{
 if(e.button!==0||finishPreviewPointer!==null||finishPreviewButton.disabled)return;
 finishPreviewButton.focus({preventScroll:true});finishPreviewPointer=e.pointerId;
 finishPreviewButton.setPointerCapture(e.pointerId);beginFinishPreview();e.preventDefault();
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])finishPreviewButton.addEventListener(type,e=>{if(e.pointerId===finishPreviewPointer)endFinishPreview();});
finishPreviewButton.addEventListener('keydown',e=>{if(e.key!==' '&&e.key!=='Enter')return;e.preventDefault();if(!e.repeat){finishPreviewKey=e.key;beginFinishPreview();}});
finishPreviewButton.addEventListener('keyup',e=>{if(e.key===finishPreviewKey){e.preventDefault();endFinishPreview();}});
finishPreviewButton.addEventListener('click',e=>e.preventDefault());
finishPreviewButton.addEventListener('contextmenu',e=>e.preventDefault());
finishPreviewButton.addEventListener('blur',endFinishPreview);
window.addEventListener('blur',endFinishPreview);
document.addEventListener('visibilitychange',()=>{if(document.hidden)endFinishPreview();});
$('image-editor').addEventListener('close',endFinishPreview);
$('finish-options').addEventListener('toggle',()=>{if(!$('finish-options').open)endFinishPreview();});
$('rotate-crop').addEventListener('click',()=>{if(crops[selectedFace]){crops[selectedFace].rotation=(crops[selectedFace].rotation+90)%360;updateCrop();}});
$('clear-face').addEventListener('click',()=>{delete crops[selectedFace];updateCrop();});
$('inset').addEventListener('input',()=>{if(crops[selectedFace]){crops[selectedFace].inset=Number($('inset').value);updateCrop();}});
['x','y','w','h'].forEach(k=>$('crop-'+k).addEventListener('change',()=>{if(!crops[selectedFace])return;const values=['x','y','w','h'].map(key=>Number($('crop-'+key).value));if(values.every(Number.isFinite)){crops[selectedFace].rect=normalizeRect(values,faceImage());updateCrop();}}));
function openImageEditor(){if(!sourceImage)return;$('shooting-settings').close();document.body.classList.remove('shooting-open');$('open-shooting').setAttribute('aria-expanded','false');if(!$('image-editor').open)$('image-editor').showModal();refreshCrop();}
function useSingleImage(){
 cancelFrontGuide();
 if(autoLayoutDimensions){Object.assign(box,autoLayoutDimensions);for(const key of ['width','height','depth'])$('box-'+key).value=box[key];syncSizePreset();}
 clearFaceGuess();$('guess-message').textContent='元画像全体を表面に配置しました。展開図なら、面を推測して配置し直せます。';sampleMode=false;clearAutoLayoutNotice();$('file-info').dataset.autoLayout='single';setLayout('single');$('preview-badge').textContent='1枚のデザインを表面に';message('1枚絵の全体を表面に配置しました。箱のサイズは「箱のかたち」タブで変更できます。');save();
}
$('use-single-image').addEventListener('click',useSingleImage);
$('use-full-image').addEventListener('click',useSingleImage);
$('open-image-editor').addEventListener('click',openImageEditor);$('close-image-editor').addEventListener('click',()=>$('image-editor').close());
new ResizeObserver(drawCrop).observe($('crop-canvas'));
const cropCanvas=$('crop-canvas');
const cropNavigation=BoxImageNavigation.attach(cropCanvas,{render:drawCrop,busy:()=>!!cropDrag||exporting||importing});
$('crop-view-reset').addEventListener('click',()=>cropNavigation.reset());
function clearFaceGuess(){faceGuess=null;guessGeneration++;$('guess-actions').hidden=true;}
function syncFrontGuide(){
 const active=!!frontGuide;$('front-guide').hidden=!active;$('specify-front').hidden=active;$('guess-faces').hidden=active;
 $('guess-faces').disabled=guessing||importing;$('specify-front').disabled=guessing||importing;
 $('guess-from-front').disabled=guessing||importing||!crops.front;
 if(active)$('front-direction').value=String(crops.front?.rotation||0);
 for(const b of document.querySelectorAll('[data-face]'))b.disabled=active&&b.dataset.face!=='front';
}
function cancelFrontGuide(restore=true){
 if(!frontGuide)return;const {original,originalSampleMode}=frontGuide;frontGuide=null;clearFaceGuess();
 if(restore){if(original)crops.front=original;else delete crops.front;sampleMode=originalSampleMode;}
 syncFrontGuide();
}
$('specify-front').addEventListener('click',()=>{
 if(importing||exporting||cropDrag||guessing||!faceImage())return;
 const image=faceImage(),original=crops.front?{...crops.front,rect:[...crops.front.rect]}:null;
 const current=(crops.front?.image||sourceImage)===image?original:null;
 const candidate=faceGuess?.image===image?faceGuess.faces.front:null;
 frontGuide={image,original,originalSampleMode:sampleMode};selectedFace='front';
 if(current||candidate){const c=current||candidate;crops.front={...c,rect:[...c.rect],image};}else delete crops.front;
 clearFaceGuess();$('guess-message').textContent='表面だけを指定し、文字の上側を選んでください。その範囲を固定して残りの面を探します。';refreshCrop();syncPDFControls();
});
$('front-direction').addEventListener('change',()=>{if(!frontGuide||!crops.front)return;crops.front.rotation=Number($('front-direction').value);updateCrop();});
$('cancel-front-guide').addEventListener('click',()=>{cancelFrontGuide();$('guess-message').textContent='表面の指定を取り消しました。';refreshCrop();rebuildBox();});
async function guessFaces(anchored=false){
 if(importing||exporting||cropDrag||guessing||!faceImage()||anchored&&(!frontGuide||!crops.front))return;
 clearFaceGuess();const generation=guessGeneration,image=anchored?frontGuide.image:faceImage(),dimensions=[box.type,box.width,box.height,box.depth].join(','),anchor=anchored?{...crops.front,rect:[...crops.front.rect]}:null;
 guessing=true;syncFrontGuide();$('guess-message').textContent=anchored?'指定した表面を固定して、残りの面を探しています…':'面の候補を探しています…';await tick();
 try{
  if(generation!==guessGeneration)return;
  const result=BoxFaceDetection.detect(image,box,anchor);
  if(generation!==guessGeneration||image!==faceImage()||dimensions!==[box.type,box.width,box.height,box.depth].join(','))return;
  if(!result){$('guess-message').textContent=anchored?'表面以外の確かな候補は見つかりませんでした。表面の範囲・向きと箱の寸法を確認して再推測するか、残りの面を手動で指定してください。':'確かな候補が見つかりませんでした。「表面を指定して推測」をお試しください。';drawCrop();return;}
  // Keep independently uploaded artwork; this proposal only rearranges this image.
  const protectedFaces=['back','left','right','top','bottom'].filter(f=>crops[f]?.image&&crops[f].image!==image);
  const faces=Object.fromEntries(Object.entries(result.faces).filter(([f])=>!protectedFaces.includes(f)));
  const missing=['back','left','right','top','bottom'].filter(f=>!faces[f]&&!protectedFaces.includes(f));
  faceGuess={...result,faces,image,dimensions,anchor,protectedFaces,missing};$('guess-actions').hidden=false;
  $('guess-message').textContent=(anchored?'表面を固定し、残り'+(Object.keys(faces).length-1)+'面の候補を色分けして表示しました。':Object.keys(faces).length+'面の候補を色分けして表示しました。')+(result.sizeMismatch?'箱の寸法と画像の比率に差があります。範囲と寸法を確認してください。':'')+(result.frontAmbiguous?'表裏が違う場合は「表面を指定して推測」を選んでください。':'')+(anchored&&missing.length?'見つからない面（'+missing.map(f=>faceNames[f]).join('・')+'）は、適用時に未設定になります。':'')+(protectedFaces.length?'個別にアップロードした面は維持します。':'')+'表裏・範囲・向きを確認して「この配置を使う」で確定します。';drawCrop();
 }catch(e){$('guess-message').textContent='推測できませんでした。表面の範囲を確認するか、各面を手動で指定してください。';}
 finally{guessing=false;syncFrontGuide();}
}
$('guess-faces').addEventListener('click',()=>guessFaces());
$('guess-from-front').addEventListener('click',()=>guessFaces(true));
$('cancel-guess').addEventListener('click',()=>{clearFaceGuess();$('guess-message').textContent=frontGuide?'候補を取り消しました。表面を調整して再推測できます。':'候補を取り消しました。配置は変更していません。';drawCrop();});
$('apply-guess').addEventListener('click',()=>{
 if(!faceGuess||importing||exporting||cropDrag)return;const proposal=faceGuess;
 if(proposal.dimensions!==[box.type,box.width,box.height,box.depth].join(',')||proposal.image!==faceImage()){clearFaceGuess();return;}
 if(proposal.anchored){
  if(!frontGuide||JSON.stringify(crops.front?.rect)!==JSON.stringify(proposal.anchor.rect)||crops.front?.rotation!==proposal.anchor.rotation){clearFaceGuess();return;}
  for(const face of proposal.missing)delete crops[face];
 }
 for(const [face,item] of Object.entries(proposal.faces)){
  if(proposal.anchored&&face==='front')continue;
  const cleanup=(crops[face]?.image||sourceImage)===proposal.image?crops[face]?.cleanup:null;
  crops[face]={...(cleanup?{cleanup:{...cleanup}}:{}),rect:normalizeRect(item.rect,proposal.image),rotation:item.rotation,inset:item.inset||0,image:proposal.image,name:'推測した'+faceNames[face]};
 }
 const missing=proposal.anchored?proposal.missing:[];cancelFrontGuide(false);selectedFace='front';clearFaceGuess();clearAutoLayoutNotice();sampleMode=false;$('preview-badge').textContent='面の候補を反映しました';$('guess-message').textContent='配置を反映しました。'+(missing.length?'未設定の面（'+missing.map(f=>faceNames[f]).join('・')+'）は、面を選んで範囲を指定してください。':'各面の文字の向きを確認してください。');refreshCrop();rebuildBox();
});
$('image-editor').addEventListener('close',()=>{if(frontGuide){cancelFrontGuide();refreshCrop();rebuildBox();}else clearFaceGuess();});
function cropHit(e){return BoxCrop.hit(crops[selectedFace]?.rect,cropPoint(e),(e.pointerType==='touch'?20:9)/cropView.scale);}
cropCanvas.addEventListener('pointerdown',e=>{
 if(!sourceImage||exporting||importing||cropDrag||e.button!==0)return;
 e.preventDefault();clearFaceGuess();cropCanvas.focus({preventScroll:true});const start=cropPoint(e),old=crops[selectedFace],mode=cropHit(e);
 cropCanvas.setPointerCapture(e.pointerId);cropDrag={start,old,id:e.pointerId,mode,screen:[e.clientX,e.clientY],moved:false};cropCanvas.style.cursor=BoxCrop.cursor(mode);
});
cropCanvas.addEventListener('pointermove',e=>{
 if(!sourceImage||!cropView||cropNavigation.panning)return;
 if(!cropDrag){cropCanvas.style.cursor=BoxCrop.cursor(cropHit(e));return;}
 if(e.pointerId!==cropDrag.id)return;e.preventDefault();
 if(!cropDrag.moved&&Math.hypot(e.clientX-cropDrag.screen[0],e.clientY-cropDrag.screen[1])<2)return;
 cropDrag.moved=true;const image=faceImage(),rect=BoxCrop.adjust(cropDrag.old?.rect,cropDrag.mode,cropDrag.start,cropPoint(e),image.naturalWidth,image.naturalHeight);
 crops[selectedFace]={...cropDrag.old,rect,rotation:cropDrag.old?.rotation||0,inset:cropDrag.old?.inset||0};['x','y','w','h'].forEach((k,i)=>$('crop-'+k).value=rect[i]);drawCrop();
});
function endCrop(e){
 if(!cropDrag||e.pointerId!==cropDrag.id)return;const {old,id}=cropDrag;
 if(e.type==='pointercancel'){if(old)crops[selectedFace]=old;else delete crops[selectedFace];}
 const changed=JSON.stringify(old?.rect)!==JSON.stringify(crops[selectedFace]?.rect);cropDrag=null;
 if(cropCanvas.hasPointerCapture(id))cropCanvas.releasePointerCapture(id);
 cropCanvas.style.cursor='crosshair';if(changed)updateCrop();else refreshCrop();
}
cropCanvas.addEventListener('pointerup',endCrop);cropCanvas.addEventListener('pointercancel',endCrop);cropCanvas.addEventListener('lostpointercapture',endCrop);
cropCanvas.addEventListener('pointerleave',()=>{if(!cropDrag)cropCanvas.style.cursor='crosshair';});
cropCanvas.addEventListener('keydown',e=>{if(exporting)return;const c=crops[selectedFace],moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!c||!moves[e.key])return;e.preventDefault();const [dx,dy]=moves[e.key],step=e.shiftKey?10:1;const [x,y,w,h]=c.rect;c.rect=[clamp(x+dx*step,0,faceImage().naturalWidth-w),clamp(y+dy*step,0,faceImage().naturalHeight-h),w,h];updateCrop();});
const boxPresets=Object.fromEntries(BoxSamples.presets.map(p=>[p.id,p.size]));
const presetSelect=$('box-preset');presetSelect.replaceChildren(...BoxSamples.presets.map(p=>new Option(p.label,p.id)),new Option('自由に指定','custom'));
const presetType=id=>id.startsWith('graphic-')?'tuck':'lid';
function syncBasePeek(){
 const max=BoxStudio.basePeekLimit(box.depth);if(box.type==='lid')box.basePeekMM=clamp(box.basePeekMM,0,max);
 $('base-peek').max=max;$('base-peek').value=box.basePeekMM;$('base-peek-value').textContent=box.basePeekMM.toFixed(1)+' mm';
}
function syncBaseArtwork(){
 const available=box.type==='lid',enabled=available&&box.baseArtwork;
 $('base-artwork').disabled=!!frontGuide;$('base-artwork-option').hidden=!available;$('base-artwork').checked=box.baseArtwork;$('base-face-tabs').hidden=!enabled;
 if(!enabled&&selectedFace.startsWith('base-'))selectedFace='front';
 $('base-artwork-hint').hidden=!selectedFace.startsWith('base-');
}
$('base-artwork').addEventListener('change',()=>{box.baseArtwork=$('base-artwork').checked;if(box.baseArtwork)selectedFace='base-left';syncBaseArtwork();refreshCrop();rebuildBox();save();});
function syncBoxType(){
 syncSceneOptions();
 syncBaseArtwork();
 syncBasePeek();
 $('box-type').value=box.type;$('base-peek-row').hidden=box.type==='tuck';$('base-peek').disabled=box.type==='tuck'||exporting;
 $('tuck-notch-row').hidden=box.type!=='tuck';$('tuck-notch').value=box.tuckNotch?'yes':'no';$('tuck-note').hidden=box.type!=='tuck';$('lid-color-label').textContent=box.type==='lid'?'蓋':'箱';$('base-color-row').hidden=box.type!=='lid';
 for(const option of $('box-preset').options)option.hidden=option.value!=='custom'&&presetType(option.value)!==box.type;
}
function syncSizePreset(){const preset=BoxSamples.find(box);$('box-preset').value=preset?.id||'custom';$('preset-dimensions').textContent=[box.width,box.height,box.depth].join(' × ')+' mm';$('preset-name').textContent=preset?.label||'自由に指定';}
function applyBoxPreset(id){const values=boxPresets[id];if(!values){$('preset-name').textContent='自由に指定';return;}box.type=presetType(id);['width','height','depth'].forEach((key,i)=>{box[key]=values[i];$('box-'+key).value=values[i];});syncBoxType();syncSizePreset();if(sampleMode)loadSample();else rebuildBox();}
$('box-preset').addEventListener('change',()=>applyBoxPreset($('box-preset').value));
const rememberedShapes={};
$('tuck-notch').addEventListener('change',()=>{box.tuckNotch=$('tuck-notch').value==='yes';rebuildBox();save();});
$('box-type').addEventListener('change',()=>{
 rememberedShapes[box.type]={width:box.width,height:box.height,depth:box.depth,radius:box.radius};box.type=$('box-type').value;
 const previous=rememberedShapes[box.type];
 if(previous){Object.assign(box,previous);for(const key of ['width','height','depth'])$('box-'+key).value=box[key];}
 else {const values=boxPresets[box.type==='tuck'?'graphic-large16':'medium'];['width','height','depth'].forEach((key,i)=>{box[key]=values[i];$('box-'+key).value=values[i];});box.radius=box.type==='tuck'?.2:1;}
 $('rounding').value=box.radius;$('rounding-value').textContent=box.radius.toFixed(1)+' mm';syncBoxType();syncSizePreset();if(sampleMode)loadSample();else rebuildBox();
 message(box.type==='tuck'?'キャラメル箱に切り替えました。展開図は各面を選んで範囲を合わせてください。':'化粧箱に切り替えました。');
});
syncBoxType();
for(const key of ['width','height','depth'])$('box-'+key).addEventListener('change',()=>{const input=$('box-'+key);const value=Number(input.value);box[key]=Number.isFinite(value)&&value>0?clamp(value,Number(input.min),Number(input.max)):key==='depth'?52:160;input.value=box[key];syncSizePreset();if(sampleMode)loadSample(true);else rebuildBox();});
$('rounding').addEventListener('input',()=>{box.radius=Number($('rounding').value);$('rounding-value').textContent=box.radius.toFixed(1)+' mm';rebuildBox();});
$('base-peek').addEventListener('input',()=>{box.basePeekMM=Number($('base-peek').value);rebuildBox();});
$('box-color').addEventListener('input',()=>{box.color=$('box-color').value;rebuildBox();save();});
$('base-color').addEventListener('input',()=>{box.baseColor=$('base-color').value;rebuildBox();save();});
$('interior-color').addEventListener('input',()=>{box.interiorColor=$('interior-color').value;rebuildBox();save();});
new ResizeObserver(drawCrop).observe(cropCanvas);
// Optional browser-native tools operate on the exact same visible controls.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch(e){}};
 register({name:'read_box_studio',title:'箱の設定を確認',description:'Read the current box dimensions, image assignment, orientation and lighting.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({boxCount:state.paired?2:sceneBoxCount,pairGapMM:state.paired?state.pairGapMM:0,oppositeRotation:state.paired?companionState():null,imageLoaded:!!sourceImage,dimensions:{...box},finish:$('paper-finish').value,lidPose:$('lid-pose').value,arrangement:$('box-arrangement').value,reference:$('size-reference').value,baseArtwork:box.type==='lid'&&box.baseArtwork,assignedFaces:Object.keys(crops).filter(face=>!face.startsWith('base-')||box.type==='lid'&&box.baseArtwork),sample:sampleMode,sampleTitle:sampleMode?sourceName:null,camera:{azimuth:state.cameraAzimuth,elevation:state.cameraElevation,distance:state.cameraDistance},rotation:{x:state.x,y:state.y,z:state.z},lighting:state.lighting,lightingDetails:{...state.details},focus:{position:state.focusPosition,blur:state.focusBlur}})});
 register({name:'configure_box_lighting',title:'箱の照明を調整',description:'Change the visible lighting preset, brightness and direction. Does not export or upload anything.',inputSchema:{type:'object',properties:{preset:{type:'string',enum:Object.keys(lightingStyles)},brightness:{type:'number',minimum:65,maximum:145},direction:{type:'number',minimum:-100,maximum:100}},required:['preset'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!ready||exporting)throw new Error('Studio is not ready.');if(!input||!Object.hasOwn(lightingStyles,input.preset)||Object.keys(input).some(k=>!['preset','brightness','direction'].includes(k))||input.brightness!==undefined&&(!Number.isFinite(input.brightness)||input.brightness<65||input.brightness>145)||input.direction!==undefined&&(!Number.isFinite(input.direction)||input.direction < -100||input.direction>100))throw new Error('Invalid lighting settings.');state.lighting=input.preset;if(input.brightness!==undefined)state.brightness=input.brightness;if(input.direction!==undefined)state.lightDirection=input.direction;applyLighting(true);rebuildBox();lightingChanged();return{preset:state.lighting,brightness:state.brightness,direction:state.lightDirection};}});
}

function syncLightingControls(){$('finish-note').hidden=state.lighting!=='neutral';const neutral=state.lighting==='neutral';for(const id of ['brightness','light-direction',...Object.keys(detailDefaults).map(k=>'light-'+k),'reset-lighting-details','reset-light-position'])$(id).disabled=exporting||neutral;}
let pinch=null;
stage.addEventListener('touchstart',e=>{if(e.touches.length===2&&!exporting)pinch={distance:Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY),zoom:state.zoom};},{passive:true});
stage.addEventListener('touchmove',e=>{if(e.touches.length===2&&pinch&&!exporting){e.preventDefault();const distance=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);state.zoom=clamp(pinch.zoom*distance/pinch.distance,.7,3);fitPreviewZoom();draw();}},{passive:false});
stage.addEventListener('touchend',()=>{pinch=null;save();},{passive:true});stage.addEventListener('touchcancel',()=>pinch=null,{passive:true});
function syncHint(){$('stage-hint').textContent=matchMedia('(pointer:coarse), (max-width:700px)').matches?'ピンチで拡大 · 回転はボタン・スライダー':'ドラッグで回転 · スクロールで拡大';}
window.addEventListener('resize',syncHint);syncHint();
for(const id of ['output-bg','background-color','output-aspect','resolution'])$(id).addEventListener('input',()=>{draw();save();});
$('upright').addEventListener('input',()=>{if(sampleMode)loadSample(true);else{refreshCrop();rebuildBox();}save();});
$('placement').addEventListener('change',()=>{const poses={standing:presets.angle,flat:BoxFeatures.flatPose};if(poses[$('placement').value]){cancelAnimationFrame(animation);Object.assign(state,poses[$('placement').value],{view:'custom'});draw();}save();});
document.addEventListener('change',e=>{if(e.target.matches('input,select')&&e.target.type!=='file')save();});
async function loadSample(preserveColors=false,replaceImport=false){
 if(!ready||exporting)return;
 // Shape changes must not cancel a user-selected file that is still decoding.
 if(importing&&!replaceImport){rebuildBox();return;}
 const {generation,signal}=startImport();
 try{
  const data=BoxSamples.create(box,$('upright').value),img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(data.svg);await img.decode();
  if(signal.aborted||generation!==uploadGeneration)return;
  clearAutoLayoutNotice();sourceImage=img;sourceName=data.preset.title;sampleMode=true;crops=data.crops;if(!preserveColors){box.color=data.preset.color;box.baseColor=data.preset.color;}syncSurfaceColors();
  const previous=activePDF;activePDF=null;releasePDF(previous);$('mapping').hidden=false;
  $('file-info').textContent=data.preset.title+' · 6面のサンプル';$('upload-label').textContent='画像・PDFを差し替える';
  $('preview-badge').textContent=data.preset.title+' · SAMPLE';refreshCrop();rebuildBox();save();
  if(lastURL){URL.revokeObjectURL(lastURL);lastURL=null;}$('result').hidden=true;$('result-image').removeAttribute('src');
  message('6面のサンプルを表示しています。画像やPDFを選ぶと差し替えられます。');
 }catch(e){message('サンプルを読み込めませんでした。画像を選んで開始できます。',true);}
 finally{if(generation===uploadGeneration){importing=false;syncPDFControls();syncExportButtons();}}
}
$('sample').addEventListener('click',async()=>{await loadSample(false,true);openImageEditor();});
$('close-review').addEventListener('click',()=>$('review-dialog').close());
const resultImage=$('result-image'),resultHost=resultImage.parentElement;
const resultNavigation=BoxImageNavigation.attach(resultHost,{render:()=>{
 if(!resultImage.naturalWidth)return;
 const {scale,ox,oy}=resultNavigation.layout(resultImage.naturalWidth,resultImage.naturalHeight,resultImage.src);
 resultImage.style.width=resultImage.naturalWidth*scale+'px';resultImage.style.height=resultImage.naturalHeight*scale+'px';resultImage.style.left=ox+'px';resultImage.style.top=oy+'px';
}});
resultImage.addEventListener('load',()=>resultNavigation.reset());
new ResizeObserver(()=>resultNavigation.setZoom(resultNavigation.zoom)).observe(resultHost);
$('result-view-reset').addEventListener('click',()=>resultNavigation.reset());

for(const tablist of document.querySelectorAll('[role="tablist"]')){
 const tabs=[...tablist.querySelectorAll('[role="tab"]')];
 const choose=button=>{for(const tab of tabs){const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$(tab.getAttribute('aria-controls')).hidden=!active;}drawCrop();};
 for(const tab of tabs){tab.addEventListener('click',()=>choose(tab));tab.addEventListener('keydown',e=>{const step=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!step)return;e.preventDefault();const next=tabs[(tabs.indexOf(tab)+step+tabs.length)%tabs.length];choose(next);next.focus();});}
}
// Project files share the complete scene settings with reusable composition files.
const projectSchema={
 state:{paired:'boolean',pairGapMM:[0,100],cameraAzimuth:[-180,180],cameraElevation:[-75,90],cameraDistance:[70,180],x:[-180,180],y:[-180,180],z:[-180,180],zoom:[.7,3],view:{values:[...Object.keys(presets),'custom']},lighting:{values:Object.keys(lightingStyles)},brightness:[65,145],lightDirection:[-100,100],details:{...detailLimits,...Object.fromEntries(['keyAzimuth','keyElevation','keyDistance'].map(k=>[k,{range:detailLimits[k],default:detailDefaults[k]}]))},focusPosition:{values:['near','middle','far']},focusBlur:[0,100],shadowBlur:[0,100]},
 box:{width:[30,400],height:[30,400],depth:[3,250],radius:[.2,4],color:'color',baseColor:'color',interiorColor:'color',basePeekMM:[0,100],baseArtwork:'boolean',tuckNotch:'boolean',type:{values:['lid','tuck']}},
 output:Object.fromEntries(outputIds.map(id=>{const el=$(id);return[id,el.type==='checkbox'?'boolean':el.type==='color'?'color':{...(id==='gif-mode'?{default:'rotate'}:id==='gif-angle'?{default:'60'}:{}),values:id==='gif-angle'?Array.from({length:171},(_,i)=>String(10+i)):el.tagName==='SELECT'?[...el.options].map(o=>o.value):Array.from({length:299},(_,i)=>String(Number((.1+i*.05).toFixed(2))))}];}))
};
function projectSnapshot(){return{config:{state:BoxProjectData.copy({...state,y:wrap(state.y)}),box:{...box},output:readOutput()},sourceImage,sourceName,sampleMode,selectedFace,crops:Object.fromEntries(Object.entries(crops).map(([f,c])=>[f,{...c,rect:[...c.rect],...(c.finish?{finish:{...c.finish}}:{}),...(c.cleanup?{cleanup:{...c.cleanup}}:{})}]))};}
function projectComposition(snapshot,config){
 const next={...snapshot,config:BoxProjectData.copy(snapshot.config)};
 next.config.state=BoxProjectData.copy(config.state);
 for(const id of outputIds)if(!['upright','paper-finish'].includes(id))next.config.output[id]=config.output[id];
 return next;
}
function applyProjectSnapshot(snapshot,keepPDF=false){
 cancelAnimationFrame(animation);stopFocusPreview();clearFaceGuess();frontGuide=null;clearAutoLayoutNotice();
 state=BoxProjectData.copy(snapshot.config.state);box={...snapshot.config.box};
 sourceImage=snapshot.sourceImage;sourceName=snapshot.sourceName;sampleMode=snapshot.sampleMode;selectedFace=snapshot.selectedFace;
 crops=Object.fromEntries(Object.entries(snapshot.crops).map(([f,c])=>[f,{...c,rect:[...c.rect],...(c.finish?{finish:{...c.finish}}:{}),...(c.cleanup?{cleanup:{...c.cleanup}}:{})}]));
 for(const id of outputIds){const el=$(id);if(el.type==='checkbox')el.checked=snapshot.config.output[id];else el.value=snapshot.config.output[id];}
 if(!keepPDF){releasePDF(activePDF);activePDF=null;$('result').hidden=true;$('result-image').removeAttribute('src');if(lastURL){URL.revokeObjectURL(lastURL);lastURL=null;}}
 for(const key of ['width','height','depth'])$('box-'+key).value=box[key];
 syncSurfaceColors();syncBoxType();syncSizePreset();$('rounding').value=box.radius;$('rounding-value').textContent=box.radius.toFixed(1)+' mm';syncGifSpeed();syncFocusUI();
 $('mapping').hidden=false;$('file-info').textContent=sourceName+' · '+sourceImage.naturalWidth+' × '+sourceImage.naturalHeight+' px';$('file-info').dataset.autoLayout='project';$('upload-label').textContent='画像・PDFを差し替える';$('preview-badge').textContent=sourceName+(sampleMode?' · SAMPLE':'');
 applyLighting(true);rebuildBox();refreshCrop();updateUI();syncPDFControls();
}
async function projectThumbnail(snapshot){
 const original=projectSnapshot(),oldRatio=renderer.getPixelRatio(),size=renderer.getSize(new THREE.Vector2()),oldSamples=exportSamples;
 try{
  applyProjectSnapshot(snapshot,true);exportSamples=64;cancelExport=false;
  const [w,h]=dimensionsFor(512),frame=await capture(w,h);const data=frame.canvas.toDataURL('image/png');frame.canvas.width=frame.canvas.height=1;return data;
 }finally{applyProjectSnapshot(original,true);exportSamples=oldSamples;renderer.setPixelRatio(oldRatio);renderer.setSize(size.x,size.y,false);}
}
// Detach independently owned geometry while borrowing the existing WebGL renderer.
function comparisonModels(designs){
 const original={state,box,sourceImage,sourceName,sampleMode,selectedFace,crops},output=readOutput(),items=[];
 try{
  for(const design of designs){
   const snapshot=design.snapshot;state=BoxProjectData.copy({...original.state,paired:false,focusBlur:0});box={...snapshot.config.box};sourceImage=snapshot.sourceImage;sourceName=snapshot.sourceName;sampleMode=snapshot.sampleMode;crops=snapshot.crops;
   for(const id of ['upright','paper-finish','lid-pose'])$(id).value=snapshot.config.output[id];$('box-arrangement').value='single';$('size-reference').value='none';
   rebuildBox();const detached=new THREE.Group();while(model.children.length)detached.add(model.children[0]);items.push({model:detached,name:design.name,quarter:BoxStudio.uprightTurn(box,$('upright').value)});
  }
 }catch(e){BoxComparison.dispose(items.map(i=>i.model));throw e;}
 finally{({state,box,sourceImage,sourceName,sampleMode,selectedFace,crops}=original);for(const id of outputIds){const el=$(id);if(el.type==='checkbox')el.checked=output[id];else el.value=output[id];}rebuildBox();}
 comparisonActive=true;
 return {items,renderer,environment:scene.environment,lights:[lightSources.ambient.clone(),lightingRig.clone(true)],pose:{x:state.x,y:state.y,z:state.z},background:output['background-color'],resume:()=>{comparisonActive=false;resize();}};
}
BoxProjects.install({schema:projectSchema,snapshot:projectSnapshot,withComposition:projectComposition,apply:applyProjectSnapshot,thumbnail:projectThumbnail,message,comparison:comparisonModels,
 busy:()=>!ready||importing||exporting||resetting||comparisonActive,
 closePanels:()=>{$('shooting-settings').close();$('image-editor').close();$('review-dialog').close();},
 run:async action=>{
  stopFocusPreview();cancelAnimationFrame(animation);finishLidAnimation();release();const controls=[...document.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);exporting=true;cancelExport=false;controls.forEach(([el])=>el.disabled=true);
  try{return await action();}finally{exporting=false;controls.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});syncBoxType();syncPDFControls();syncLightingControls();syncFocusUI();refreshCrop();resize();save();}
 }
});

restoreSettings();BoxRangeInputs.sync();
new ResizeObserver(resize).observe(stage);init().then(()=>{startGifExample();return loadSample(restoredColors);});

})();

// A non-modal settings window keeps the box available for live adjustment.
(()=>{const $=id=>document.getElementById(id);
$('open-shooting').addEventListener('click',()=>{
 const dialog=$('shooting-settings');
 if(dialog.open){dialog.close();return;}
 dialog.show();document.body.classList.add('shooting-open');$('open-shooting').setAttribute('aria-expanded','true');
});
$('close-shooting').addEventListener('click',()=>$('shooting-settings').close());
$('shooting-settings').addEventListener('close',()=>{document.body.classList.remove('shooting-open');$('open-shooting').setAttribute('aria-expanded','false');if(!document.getElementById('image-editor').open)$('open-shooting').focus();});
$('shooting-settings').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();$('shooting-settings').close();}});

})();
