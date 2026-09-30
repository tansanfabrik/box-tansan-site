(function(root){
 'use strict';
 // Thin-lens aperture integration; references and tradeoffs are documented in README.md.
 function fStop(strength){return strength<=0?Infinity:16*Math.pow(1.2/16,Math.min(100,strength)/100);}
 function apertureRadius(strength,unitsPerMM){return Number.isFinite(fStop(strength))?85*unitsPerMM/(2*fStop(strength)):0;}
 function sample(index,count){
  // Antipodal pairs keep the optical center fixed, including partial previews.
  const pair=Math.floor(index/2),pairs=Math.ceil(count/2),r=Math.sqrt((pair+.5)/pairs),a=pair*2.399963229728653+(index%2)*Math.PI;
  return [r*Math.cos(a),r*Math.sin(a)];
 }
 function shiftProjection(elements,x,y,focus){const out=Array.from(elements);out[8]-=out[0]*x/focus;out[9]-=out[5]*y/focus;return out;}
 const api={fStop,apertureRadius,sample,shiftProjection};
 if(typeof module==='object'&&module.exports){module.exports=api;return;}
 root.BoxLens=api;
 const T=root.THREE,vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
 class ApertureRenderer{
  constructor(renderer){
   this.renderer=renderer;this.supported=renderer.capabilities.isWebGL2&&renderer.extensions.has('EXT_color_buffer_float');if(!this.supported)return;
   const options={format:T.RGBAFormat,type:T.HalfFloatType,minFilter:T.NearestFilter,magFilter:T.NearestFilter};
   this.frame=new T.WebGLRenderTarget(1,1,options);this.sum=new T.WebGLRenderTarget(1,1,{...options,depthBuffer:false});
   this.quadScene=new T.Scene();this.quadCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
   this.add=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,transparent:true,blending:T.CustomBlending,blendSrc:T.OneFactor,blendDst:T.OneFactor,blendEquation:T.AddEquation,blendSrcAlpha:T.OneFactor,blendDstAlpha:T.OneFactor,uniforms:{tFrame:{value:this.frame.texture},weight:{value:1}},vertexShader:vertex,fragmentShader:'varying vec2 vUv;uniform sampler2D tFrame;uniform float weight;void main(){gl_FragColor=texture2D(tFrame,vUv)*weight;}'});
   this.display=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:true,premultipliedAlpha:true,uniforms:{tSum:{value:this.sum.texture},gain:{value:1},backgroundColor:{value:new T.Color()},backgroundAlpha:{value:0}},vertexShader:vertex,fragmentShader:`varying vec2 vUv;uniform sampler2D tSum;uniform float gain;uniform vec3 backgroundColor;uniform float backgroundAlpha;void main(){vec4 c=texture2D(tSum,vUv)*gain;gl_FragColor=vec4(c.a>.000001?c.rgb/c.a:vec3(0.),clamp(c.a,0.,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <premultiplied_alpha_fragment>
    float backgroundWeight=(1.-gl_FragColor.a)*backgroundAlpha;
    gl_FragColor.rgb+=linearToOutputTexel(vec4(backgroundColor,1.)).rgb*backgroundWeight;
    gl_FragColor.a+=backgroundWeight;
   }`});
   this.quad=new T.Mesh(new T.PlaneGeometry(2,2),this.add);this.quadScene.add(this.quad);
  }
  begin(scene,camera,{focusDistance,radius,samples}){
   const r=this.renderer,size=r.getDrawingBufferSize(new T.Vector2());
   if(this.frame.width!==size.x||this.frame.height!==size.y){this.frame.setSize(size.x,size.y);this.sum.setSize(size.x,size.y);}
   this.scene=scene;this.base=camera.clone();this.base.updateMatrixWorld(true);this.cam=this.base.clone();this.focus=focusDistance;this.radius=radius;this.total=samples;this.count=0;this.add.uniforms.weight.value=1;
   const target=r.getRenderTarget(),color=r.getClearColor(new T.Color()),alpha=r.getClearAlpha();this.display.uniforms.backgroundColor.value.copy(color);this.display.uniforms.backgroundAlpha.value=alpha;r.setRenderTarget(this.sum);r.setClearColor(0,0);r.clear();r.setClearColor(color,alpha);r.setRenderTarget(target);
  }
  step(batch=8){
   const r=this.renderer,target=r.getRenderTarget(),auto=r.autoClear,shadows=r.shadowMap.autoUpdate,color=r.getClearColor(new T.Color()),alpha=r.getClearAlpha();
   try{
    // Keep the backdrop out of photographic tone mapping and aperture accumulation.
    r.setClearColor(0,0);
    for(let n=0;n<batch&&this.count<this.total;n++,this.count++){
     const [u,v]=sample(this.count,this.total),x=u*this.radius,y=v*this.radius,c=this.cam;
     c.copy(this.base);c.translateX(x);c.translateY(y);c.projectionMatrix.fromArray(shiftProjection(this.base.projectionMatrix.elements,x,y,this.focus));c.projectionMatrixInverse.copy(c.projectionMatrix).invert();c.updateMatrixWorld(true);
     // Subpixel integration also antialiases lettering on the in-focus plane.
     const j=this.count%4;c.projectionMatrix.elements[8]+=(j%2? .5:-.5)/this.frame.width;c.projectionMatrix.elements[9]+=(j<2? .5:-.5)/this.frame.height;c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
     r.shadowMap.autoUpdate=this.count===0&&shadows;r.autoClear=true;r.setRenderTarget(this.frame);r.render(this.scene,c);
     r.autoClear=false;this.quad.material=this.add;r.setRenderTarget(this.sum);r.render(this.quadScene,this.quadCamera);
    }
   }finally{r.setClearColor(color,alpha);r.autoClear=auto;r.shadowMap.autoUpdate=shadows;r.setRenderTarget(target);}
   return this.count===this.total;
  }
  present(){const r=this.renderer,target=r.getRenderTarget();this.display.uniforms.gain.value=1/Math.max(1,this.count);this.quad.material=this.display;r.setRenderTarget(null);r.render(this.quadScene,this.quadCamera);r.setRenderTarget(target);}
 }
 root.ApertureRenderer=ApertureRenderer;
})(globalThis);
