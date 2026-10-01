(function(root){
'use strict';
const finishes={matte:{roughness:.88,specularIntensity:.18,clearcoat:0,clearcoatRoughness:.85},semi:{roughness:.57,specularIntensity:.38,clearcoat:.12,clearcoatRoughness:.48},gloss:{roughness:.22,specularIntensity:.8,clearcoat:1,clearcoatRoughness:.1}};
const groundUp=[0,1,0];
const flatPose={x:90,y:0,z:-25,cameraAzimuth:0,cameraElevation:35};
const viewPresets={angle:{x:0,y:30,z:0,cameraAzimuth:0,cameraElevation:0},'angle-right':{x:0,y:-30,z:0,cameraAzimuth:0,cameraElevation:0},'angle-back':{x:0,y:-150,z:0,cameraAzimuth:0,cameraElevation:0},overhead:{x:0,y:30,z:0,cameraAzimuth:0,cameraElevation:20},'flat-overhead':{...flatPose},'top':{x:90,y:0,z:0,cameraAzimuth:0,cameraElevation:90},'low-angle':{x:0,y:-25,z:8,cameraAzimuth:0,cameraElevation:-20},front:{x:0,y:0,z:0,cameraAzimuth:0,cameraElevation:0},back:{x:0,y:180,z:0,cameraAzimuth:0,cameraElevation:0},side:{x:90,y:0,z:90,cameraAzimuth:0,cameraElevation:0}};
const references={hand:{label:'手のひらの目安 約110 × 180 mm（指を含む）',width:110,height:180,depth:0},bottle:{label:'500mlボトルの目安 約65 × 210 mm',width:65,height:210,depth:65},phone:{label:'スマホの目安 72 × 147 × 8 mm',width:72,height:147,depth:8}};
function layout(kind,w,h,d,gap){const match=/^(stack|flat)([3-5])$/.exec(kind);if(!match)return[[0,0,0]];const n=Number(match[2]);if(match[1]==='stack')return Array.from({length:n},(_,i)=>[0,0,(i-(n-1)/2)*d]);const cols=n===4?2:3,rows=Math.ceil(n/cols);return Array.from({length:n},(_,i)=>{const row=Math.floor(i/cols),count=Math.min(cols,n-row*cols);return[(i%cols-(count-1)/2)*(w+gap),((rows-1)/2-row)*(h+gap),0];});}
// Convert the existing exterior into an open tray with a paper lining and thickness at its rim.
function hollow(T,group,w,h,d,openPositive,u,interiorColor=0xe7e1d5){
 const removed=group.getObjectByName(group.name+'-'+(openPositive?'front':'back'));if(removed){group.remove(removed);removed.geometry.dispose();for(const key of ['map','metalnessMap','roughnessMap','clearcoatMap','clearcoatRoughnessMap'])removed.material[key]?.dispose();removed.material.dispose();}
 const t=Math.min(1.2*u,d/5),inner=new T.MeshStandardMaterial({color:interiorColor,roughness:.95,side:T.DoubleSide});
 const plane=(W,H,x,y,z,rx,ry,name)=>{const m=new T.Mesh(new T.PlaneGeometry(W,H),inner);m.position.set(x,y,z);m.rotation.set(rx,ry,0);m.name=name;m.castShadow=m.receiveShadow=true;group.add(m);};
 const floorZ=openPositive?-d/2+t:d/2-t,wallZ=openPositive?t/2:-t/2,rimZ=openPositive?d/2:-d/2;
 plane(w-2*t,h-2*t,0,0,floorZ,0,0,'plain-inner-floor');
 for(const sign of [-1,1]){
  plane(d-t,h-2*t,sign*(w/2-t),0,wallZ,0,Math.PI/2,'inner-side');
  plane(w-2*t,d-t,0,sign*(h/2-t),wallZ,Math.PI/2,0,'inner-side');
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
const api={tuckFlapGeometry,orbitCamera,spinPose,groundUp,viewPresets,flatPose,finishes,references,layout,hollow,arrange,reference,dragRotation,companionRotation};if(typeof module==='object'&&module.exports)module.exports=api;else root.BoxFeatures=api;
})(globalThis);
