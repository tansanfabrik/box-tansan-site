(function(root){
'use strict';
// Smooth coated stock: roughness controls the width of reflection, never paper grain.
const finishes={matte:{roughness:.72,specularIntensity:.28,clearcoat:.12,clearcoatRoughness:.52},semi:{roughness:.58,specularIntensity:.32,clearcoat:.48,clearcoatRoughness:.26},gloss:{roughness:.48,specularIntensity:.32,clearcoat:1,clearcoatRoughness:.075}};
function softboxGeometry(T,w,h){
 const geometry=new T.PlaneGeometry(w,h,32,32),uv=geometry.attributes.uv,colors=[];
 // Feather only the perimeter, with a gentle bright centre. No noise or surface relief.
 const smooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
 for(let i=0;i<uv.count;i++){const x=uv.getX(i)*2-1,y=uv.getY(i)*2-1;const value=smooth((1-Math.abs(x))/.22)*smooth((1-Math.abs(y))/.16)*(1.12-.12*(x*x+y*y)/2);colors.push(value,value,value);}
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));return geometry;
}
const groundUp=[0,1,0];
const flatPose={x:90,y:0,z:-25,cameraAzimuth:0,cameraElevation:35};
const viewPresets={angle:{x:0,y:30,z:0,cameraAzimuth:0,cameraElevation:0},'angle-right':{x:0,y:-30,z:0,cameraAzimuth:0,cameraElevation:0},'angle-back':{x:0,y:-150,z:0,cameraAzimuth:0,cameraElevation:0},overhead:{x:0,y:30,z:0,cameraAzimuth:0,cameraElevation:20},'flat-overhead':{...flatPose},'top':{x:90,y:0,z:0,cameraAzimuth:0,cameraElevation:90},'low-angle':{x:0,y:-25,z:8,cameraAzimuth:0,cameraElevation:-20},front:{x:0,y:0,z:0,cameraAzimuth:0,cameraElevation:0},back:{x:0,y:180,z:0,cameraAzimuth:0,cameraElevation:0},side:{x:90,y:0,z:90,cameraAzimuth:0,cameraElevation:0}};
const references={hand:{label:'手のひらの目安 約110 × 180 mm（指を含む）',width:110,height:180,depth:0},bottle:{label:'500mlボトルの目安 約65 × 210 mm',width:65,height:210,depth:65},phone:{label:'スマホの目安 72 × 147 × 8 mm',width:72,height:147,depth:8}};
function layout(kind,w,h,d,gap){const match=/^(stack|flat)([3-5])$/.exec(kind);if(!match)return[[0,0,0]];const n=Number(match[2]);if(match[1]==='stack')return Array.from({length:n},(_,i)=>[0,0,(i-(n-1)/2)*d]);const cols=n===4?2:3,rows=Math.ceil(n/cols);return Array.from({length:n},(_,i)=>{const row=Math.floor(i/cols),count=Math.min(cols,n-row*cols);return[(i%cols-(count-1)/2)*(w+gap),((rows-1)/2-row)*(h+gap),0];});}
// Lift clear of the base before any sideways travel or rotation, then lower.
function lidTravel(T,from,to,w,h,d,baseTop,gap){
 const half=new T.Vector3(w/2,h/2,d/2),q=new T.Quaternion(),matrix=new T.Matrix4();let extent=0;
 const angle=from.quaternion.angleTo(to.quaternion),radius=half.length();
 for(let i=0;i<=100;i++){q.slerpQuaternions(from.quaternion,to.quaternion,i/100);matrix.makeRotationFromQuaternion(q);const e=matrix.elements;extent=Math.max(extent,Math.abs(e[2])*half.x+Math.abs(e[6])*half.y+Math.abs(e[10])*half.z);}
 const height=Math.max(from.position.z,to.position.z,baseTop+extent+radius*angle/200+gap);
 const ease=t=>t*t*(3-2*t);
 return progress=>{
  const t=Math.min(1,Math.max(0,progress)),position=from.position.clone(),quaternion=from.quaternion.clone();
  if(t<.25)position.z=T.MathUtils.lerp(from.position.z,height,ease(t*4));
  else if(t<.75){const f=ease((t-.25)*2);position.lerpVectors(from.position,to.position,f);position.z=height;quaternion.slerpQuaternions(from.quaternion,to.quaternion,f);}
  else{position.copy(to.position);position.z=T.MathUtils.lerp(height,to.position.z,ease((t-.75)*4));quaternion.copy(to.quaternion);}
  return{position,quaternion};
 };
}
// Work in the base's coordinates: arrange() recenters each pose differently.
function relativeLidTravel(T,from,to,baseFrom,baseTo,w,h,d,baseDepth,gap){
 const relative=p=>({position:p.position.clone(),quaternion:p.quaternion.clone()});
 const a=relative(from),b=relative(to);a.position.sub(baseFrom.position);b.position.sub(baseTo.position);
 const travel=lidTravel(T,a,b,w,h,d,baseDepth/2,gap);
 return t=>{const pose=travel(t),f=t*t*(3-2*t);pose.position.add(new T.Vector3().lerpVectors(baseFrom.position,baseTo.position,f));return pose;};
}
function liftedLidPose(T,w,h,d,baseTop,gap){
 const quaternion=new T.Quaternion().setFromEuler(new T.Euler(-22*Math.PI/180,0,-12*Math.PI/180)),e=new T.Matrix4().makeRotationFromQuaternion(quaternion).elements;
 const extent=(Math.abs(e[2])*w+Math.abs(e[6])*h+Math.abs(e[10])*d)/2;
 return {position:new T.Vector3(-w*.16,0,baseTop+extent+Math.max(gap,h*.1)),quaternion};
}
// First curl the inserted tab inside the cavity, withdraw it, then unfold it
// above the rim. The dust flaps open only after the main lid has cleared them.
function tuckOpeningPose(progress){
 const p=Math.min(1,Math.max(0,progress)),ease=(a,b)=>{const t=Math.min(1,Math.max(0,(p-a)/(b-a)));return t*t*(3-2*t);};
 return {lid:(90*ease(.18,.5)+20*ease(.78,.9))*Math.PI/180,fold:80*ease(.67,.78)*Math.PI/180,curl:ease(0,.18)*(1-ease(.5,.67)),dust:110*ease(.78,1)*Math.PI/180};
}
// One continuous sheet joins the closure panel and tab; no rectangular bridge.
// Group 0 is its printed exterior, group 1 is the lining and thin cut edges.
function tuckTabGeometry(T,w,height,corner,u,fold=0,curl=0){
 const radius=.16*u,thickness=.28*u,bend=Math.PI/2-fold,rows=48,cols=20,positions=[],indices=[],uv=[];
 const half=w/2-.81*u,r=Math.min(corner,height*.8,half/2),arc=curl*Math.PI;
 const row=j=>{if(j<=8){const a=bend*j/8;return {y:radius*(Math.cos(a)-1),z:-radius*Math.sin(a),angle:a,width:half};}
  const t=(j-8)/(rows-8),l=t*height,rollRadius=height/Math.PI,straight=Math.min(l,height-rollRadius*arc),a=bend+(l-straight)/rollRadius;
  let y=radius*(Math.cos(bend)-1),z=-radius*Math.sin(bend);
  y-=straight*Math.sin(bend);z-=straight*Math.cos(bend);
  y+=rollRadius*(Math.cos(a)-Math.cos(bend));z-=rollRadius*(Math.sin(a)-Math.sin(bend));
  const end=Math.max(0,l-(height-r));return {y,z,angle:a,width:half-r+Math.sqrt(Math.max(0,r*r-end*end))};
 };
 for(let side=0;side<2;side++)for(let j=0;j<=rows;j++){const q=row(j);for(let i=0;i<=cols;i++){positions.push((i/cols*2-1)*q.width,q.y-side*thickness*Math.cos(q.angle),q.z+side*thickness*Math.sin(q.angle));uv.push(i/cols,j/rows);}}
 const layer=(rows+1)*(cols+1);
 for(let side=0;side<2;side++)for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=side*layer+j*(cols+1)+i,b=a+1,c=a+cols+1,d=c+1;indices.push(...(side?[a,c,b,b,c,d]:[a,b,c,b,d,c]));}
 const exterior=rows*cols*6;
 // Leave the root open: it meets the closure panel's matching paper thickness.
 const edge=(a,b)=>indices.push(a,a+layer,b,b,a+layer,b+layer);
 for(let j=0;j<rows;j++){edge(j*(cols+1),(j+1)*(cols+1));edge((j+1)*(cols+1)+cols,j*(cols+1)+cols);}for(let i=0;i<cols;i++)edge(rows*(cols+1)+i,rows*(cols+1)+i+1);
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.addGroup(0,exterior,0);g.addGroup(exterior,indices.length-exterior,1);g.computeVertexNormals();return g;
}
// Convert the existing exterior into an open tray with a paper lining and thickness at its rim.
function hollow(T,group,w,h,d,openPositive,u,interiorColor=0xe7e1d5,radius=0){
 const removed=group.getObjectByName(group.name+'-'+(openPositive?'front':'back'));if(removed){group.remove(removed);removed.geometry.dispose();for(const key of ['map','metalnessMap','roughnessMap','clearcoatMap','clearcoatRoughnessMap','specularIntensityMap','clearcoatNormalMap'])removed.material[key]?.dispose();removed.material.dispose();}
 const t=Math.min(1.2*u,d/5,w*.005,h*.005),inner=new T.MeshStandardMaterial({color:interiorColor,roughness:.95,side:T.DoubleSide});
 const plane=(W,H,x,y,z,rx,ry,name)=>{const m=new T.Mesh(new T.PlaneGeometry(W,H),inner);m.position.set(x,y,z);m.rotation.set(rx,ry,0);m.name=name;m.castShadow=m.receiveShadow=true;group.add(m);};
 const inset=Math.max(t,radius);
 const floorZ=openPositive?-d/2+t:d/2-t,wallZ=openPositive?t/2:-t/2,rimZ=openPositive?d/2:-d/2;
 plane(w-2*inset,h-2*inset,0,0,floorZ,0,0,'plain-inner-floor');
 for(const sign of [-1,1]){
  plane(d-t,h-2*inset,sign*(w/2-t),0,wallZ,0,Math.PI/2,'inner-side');
  plane(w-2*inset,d-t,0,sign*(h/2-t),wallZ,Math.PI/2,0,'inner-side');
  plane(t,h-2*t,sign*(w/2-t/2),0,rimZ,0,0,'paper-rim');
  plane(w,t,0,sign*(h/2-t/2),rimZ,0,0,'paper-rim');
 }
}
function arrange(T,model,kind,w,h,totalDepth,u){const positions=layout(kind,w,h,totalDepth,15*u);if(positions.length>1){const originals=[...model.children],starts=originals.map(o=>o.position.clone());positions.forEach((p,i)=>{originals.forEach((original,j)=>{const child=i?original.clone(true):original;if(i)model.add(child);child.position.copy(starts[j]).add(new T.Vector3(...p));});});}
 model.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(model),center=bounds.getCenter(new T.Vector3());for(const child of model.children)child.position.sub(center);return positions.length;}
function reference(T,kind,u){const config=references[kind];if(!config)return null;const w=config.width*u,h=config.height*u,s=new T.Shape();
 if(kind==='hand'){
  // An open hand, from the wrist to the fingertips. Dimensions are illustrative.
  const move=(x,y)=>s.moveTo(x*u,y*u),line=(x,y)=>s.lineTo(x*u,y*u),q=(x,y,X,Y)=>s.quadraticCurveTo(x*u,y*u,X*u,Y*u);
  move(-20,0);line(25,0);q(25,22,37,42);q(55,65,55,87);line(55,123);q(55,133,49,133);q(43,133,43,124);line(43,96);q(43,92,40,96);line(39,151);q(39,164,32,164);q(25,164,25,153);line(25,105);q(25,101,22,105);line(21,168);q(21,180,14,180);q(7,180,7,168);line(7,108);q(7,103,4,108);line(2,153);q(2,165,-5,165);q(-12,165,-12,153);line(-12,90);q(-12,80,-18,75);line(-39,100);q(-49,110,-54,102);q(-58,96,-52,88);line(-34,61);q(-30,50,-30,36);q(-29,19,-20,0);s.closePath();
 }else if(kind==='bottle'){const points=[[-.4,0],[-.5,.08],[-.5,.66],[-.42,.76],[-.19,.85],[-.19,.94],[-.23,.94],[-.23,1],[.23,1],[.23,.94],[.19,.94],[.19,.85],[.42,.76],[.5,.66],[.5,.08],[.4,0]];points.forEach(([x,y],i)=>i?s.lineTo(x*w,y*h):s.moveTo(x*w,y*h));s.closePath();}else{const r=(kind==='phone'?8:2)*u;s.moveTo(-w/2+r,0);s.lineTo(w/2-r,0);s.quadraticCurveTo(w/2,0,w/2,r);s.lineTo(w/2,h-r);s.quadraticCurveTo(w/2,h,w/2-r,h);s.lineTo(-w/2+r,h);s.quadraticCurveTo(-w/2,h,-w/2,h-r);s.lineTo(-w/2,r);s.quadraticCurveTo(-w/2,0,-w/2+r,0);}
 const geometry=new T.ShapeGeometry(s);if(kind==='hand'){geometry.computeBoundingBox();const b=geometry.boundingBox,center=(b.min.x+b.max.x)/2,sy=h/(b.max.y-b.min.y),sx=w/(b.max.x-b.min.x);geometry.translate(-center,-b.min.y,0);geometry.scale(sx,sy,1);}
 const m=new T.Mesh(geometry,new T.MeshBasicMaterial({color:0x8b9098,side:T.DoubleSide}));m.name='scale-reference';
 if(kind==='phone'){
  const panel=(W,H,r,cx,cy,z,color,name)=>{const shape=new T.Shape();shape.moveTo(-W/2+r,0);shape.lineTo(W/2-r,0);shape.quadraticCurveTo(W/2,0,W/2,r);shape.lineTo(W/2,H-r);shape.quadraticCurveTo(W/2,H,W/2-r,H);shape.lineTo(-W/2+r,H);shape.quadraticCurveTo(-W/2,H,-W/2,H-r);shape.lineTo(-W/2,r);shape.quadraticCurveTo(-W/2,0,-W/2+r,0);const part=new T.Mesh(new T.ShapeGeometry(shape),new T.MeshBasicMaterial({color,side:T.DoubleSide}));part.position.set(cx,cy,z);part.name=name;m.add(part);};
  panel(w-8*u,h-8*u,5*u,0,4*u,.025*u,0xaab1ba,'phone-screen');
  panel(16*u,3*u,1.5*u,0,h-10*u,.05*u,0x7d838c,'phone-camera');
  panel(22*u,1.2*u,.6*u,0,7*u,.05*u,0xc6cbd1,'phone-home-indicator');
 }
 return m;
}
// Turn the second box over around its upright axis, sharing the first box's pose.
function companionRotation(T,rotation,quarter=0){
 const angle=T.MathUtils.degToRad(quarter),axis=new T.Vector3(Math.sin(angle),Math.cos(angle),0);
 return rotation.clone().multiply(new T.Quaternion().setFromAxisAngle(axis,Math.PI)).normalize();
}
// Apply a drag around the camera's screen axes, independent of the box's Euler angles.
function dragRotation(T,start,cameraRotation,dx,dy,quarter=0,opposite=false){
 const distance=Math.hypot(dx,dy),q=start.clone();
 if(distance){const axis=new T.Vector3(dy,dx,0).normalize().applyQuaternion(cameraRotation);q.premultiply(new T.Quaternion().setFromAxisAngle(axis,distance*Math.PI/180*.32)).normalize();}
 if(opposite)q.copy(companionRotation(T,q,quarter));
 const e=new T.Euler().setFromQuaternion(q,'XYZ'),deg=T.MathUtils.radToDeg,wrap=n=>((n+180)%360+360)%360-180;
 return{x:wrap(-deg(e.x)),y:wrap(deg(e.y)),z:wrap(quarter-deg(e.z))};
}
// Rotate around the floor normal, preserving height for flat and stacked boxes.
function spinPose(T,pose,angle,quarter=0){
 const rad=T.MathUtils.degToRad,q=new T.Quaternion().setFromEuler(new T.Euler(rad(-pose.x),rad(pose.y),rad(-pose.z+quarter),'XYZ'));
 q.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(...groundUp),rad(angle)));
 return dragRotation(T,q,new T.Quaternion(),0,0,quarter);
}
// Move the camera around the floor normal; geometry, lights and their shadows stay fixed.
function orbitCamera(T,base,angle,pivot=new T.Vector3()){
 const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(...groundUp),-T.MathUtils.degToRad(angle)),cam=base.clone();
 cam.position.sub(pivot).applyQuaternion(q).add(pivot);cam.quaternion.premultiply(q);cam.up.applyQuaternion(q);cam.updateMatrixWorld(true);return cam;
}
// Camera-space orientation shared by the small GIF example and the export motion.
// Orbiting the camera by -angle is equivalent to turning the object by +angle.
function gifPreviewRotation(T,pose,cameraRotation,angle,quarter=0){
 const turned=spinPose(T,pose,angle,quarter),rad=T.MathUtils.degToRad;
 const object=new T.Quaternion().setFromEuler(new T.Euler(rad(-turned.x),rad(turned.y),rad(-turned.z+quarter),'XYZ'));
 return cameraRotation.clone().invert().multiply(object);
}
function viewTransition(from,to,progress,placeFirst=false){
 const t=Math.min(1,Math.max(0,progress)),ease=t=>t*t*(3-2*t),result={};
 for(const key of ['x','y','z','cameraAzimuth','cameraElevation']){
  const camera=key.startsWith('camera'),phase=placeFirst?(camera?Math.max(0,(t-.5)*2):Math.min(1,t*2)):t;
  result[key]=from[key]+(to[key]-from[key])*ease(phase);
 }
 return result;
}
// A thin, slightly bowed closure flap with real cut-paper edges.
function tuckFlapGeometry(T,w,d,u,top=true){
 const nx=16,nz=12,sign=top?1:-1,thickness=.28*u,positions=[],uvs=[],indices=[],edges=[];
 const point=(i,j,lower=false)=>{
  const t=j/nz,z=d/2-.06*u-t*(d-.34*u);
  const trim=.16*u+Math.max(0,(t-.85)/.15)*.65*u,x=(i/nx*2-1)*(w/2-trim);
  const y=sign*(-.08*u+.13*u*Math.sin(t*Math.PI/2)+(lower?-thickness:0));
  return[x,y,z];
 };
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const p=point(i,j);positions.push(...p);uvs.push((p[0]+w/2)/w,(sign===1?-p[2]+d/2:p[2]+d/2)/d);}
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,e=c+1;indices.push(...(top?[a,b,c,b,e,c]:[a,c,b,b,c,e]));}
 const faceCount=indices.length;
 for(let i=0;i<nx;i++)edges.push([[i,0],[i+1,0]],[[i+1,nz],[i,nz]]);
 for(let j=0;j<nz;j++)edges.push([[0,j+1],[0,j]],[[nx,j],[nx,j+1]]);
 for(const [a,b] of edges){const start=positions.length/3;for(const [q,lower] of [[a,false],[b,false],[b,true],[a,true]]){positions.push(...point(...q,lower));uvs.push(0,0);}indices.push(start,start+1,start+2,start,start+2,start+3);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.addGroup(0,faceCount,0);geo.addGroup(faceCount,indices.length-faceCount,1);geo.computeVertexNormals();return geo;
}
// Graphic card-box templates: 16-card tuck is about 10 mm, 32-card about 12 mm.
function tuckProfile(w,h,d,u){const thick=d/u>10;return {notchRadius:Math.min(9*u,w*.3),notchDepth:Math.min((thick?8:6)*u,h*.2),tongueHeight:Math.min((thick?12:10)*u,h*.2,Math.max(.1*u,d-.6*u)*Math.PI/2),tongueCorner:Math.min(7*u,w/6),dustLength:Math.min((d/u-.6)*u,w*.22)};}
function tuckTongueGeometry(T,w,height,corner,u){
 const x=w/2-.2*u,r=Math.min(corner,height*.8,x/2),s=new T.Shape();
 s.moveTo(-x,0);s.lineTo(x,0);s.lineTo(x,-height+r);s.quadraticCurveTo(x,-height,x-r,-height);s.lineTo(-x+r,-height);s.quadraticCurveTo(-x,-height,-x,-height+r);s.lineTo(-x,0);
 const g=new T.ExtrudeGeometry(s,{depth:.28*u,bevelEnabled:false,curveSegments:12});g.translate(0,0,-.14*u);
 // Only the outward (-Z) face is printed. The reverse and cut edge are paper.
 g.clearGroups();const normal=g.attributes.normal;let start=0,last=normal.getZ(0)<-.5?0:1;
 for(let i=3;i<normal.count;i+=3){const material=normal.getZ(i)<-.5?0:1;if(material!==last){g.addGroup(start,i-start,last);start=i;last=material;}}
 g.addGroup(start,normal.count-start,last);return g;
}
// Recess visible through the thumb cut: curved paper edge and graded contact shading.
function tuckNotchGeometry(T,n,depth,hh,back,u){
 const steps=48,rows=8,inset=1.1*u,thickness=.28*u;
 const edge=[],edgeIndices=[],positions=[],colors=[],indices=[],lipPositions=[],lipIndices=[];
 for(let i=0;i<=steps;i++){
  const angle=Math.PI*i/steps,x=-n*Math.cos(angle),y=hh-depth*Math.sin(angle);
  edge.push(x,y,back,x,y,back+thickness);
  const fade=Math.sin(angle)**.35;lipPositions.push(x,y,back-.015*u,x,y-.45*u*fade,back-.015*u);
  if(i<steps){const a=i*2;lipIndices.push(a,a+1,a+2,a+1,a+3,a+2);}
  if(i<steps){const a=i*2;edgeIndices.push(a,a+1,a+2,a+1,a+3,a+2);}
  for(let j=0;j<=rows;j++){
   const t=j/rows,shade=.42+.58*(1-Math.exp(-t*6));
   positions.push(x,y+(hh-y)*t,back+inset-thickness/2-.01*u);
   colors.push(shade,shade,shade);
   if(i<steps&&j<rows){const a=i*(rows+1)+j,b=a+rows+1;indices.push(a,b,a+1,b,b+1,a+1);}
  }
 }
 const geometry=(p,idx)=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g;};
 const rim=geometry(edge,edgeIndices),recess=geometry(positions,indices);
 recess.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 return {rim,recess,lip:geometry(lipPositions,lipIndices),inset,thickness};
}
// Orbit the key light and its reflection panel together, retaining the original rig at defaults.
function lightPosition(base,azimuth=0,elevation=0,distance=100){
 const [x,y,z]=base,r=Math.hypot(x,y,z)*distance/100;
 const az=Math.atan2(x,z)+azimuth*Math.PI/180;
 const el=Math.max(-85,Math.min(85,Math.atan2(y,Math.hypot(x,z))*180/Math.PI+elevation))*Math.PI/180;
 return [r*Math.cos(el)*Math.sin(az),r*Math.sin(el),r*Math.cos(el)*Math.cos(az)];
}
const api={softboxGeometry,relativeLidTravel,liftedLidPose,tuckOpeningPose,tuckTabGeometry,gifPreviewRotation,viewTransition,lidTravel,lightPosition,tuckFlapGeometry,tuckProfile,tuckTongueGeometry,tuckNotchGeometry,orbitCamera,spinPose,groundUp,viewPresets,flatPose,finishes,references,layout,hollow,arrange,reference,dragRotation,companionRotation};if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxFeatures=api;
})(globalThis);
