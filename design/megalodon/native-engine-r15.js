import*as THREE from'three';
import{OrbitControls}from'./vendor/OrbitControls.js';
import{arrays,setPersistence}from'./native-store-r15.js?v=1';
import{cadRuler}from'./cad-palaeo-ruler-r14.js?v=1';
export const NATIVE_FACES=74293846;
const CENTRE=136.73910524340096;
const VERT=`precision highp float;precision highp int;
in vec3 position;in vec3 color;in vec3 photoColour;in float nativeRoughness;
uniform float uPointSize;uniform mat4 projectionMatrix,modelViewMatrix;uniform mat3 uR,uInvR;uniform vec3 uT,uOffset,uMotionOrigin,uMotionHalfExtent,uMaskU,uMaskV;uniform float uSize;uniform int uGrid,uAppearance;
out vec3 vC,vSource,vColour,vPhoto,vView;out float vRough;
vec3 toLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
void main(){vec3 d;if(uGrid==1){vSource=position*.009;d=uR*vSource+uT;}else if(uGrid==2){vSource=uMotionOrigin+position.x*uMotionHalfExtent.x*uMaskU+position.y*uMotionHalfExtent.y*uMaskV;d=uR*vSource+uT;}else{d=position;vSource=uInvR*(d-uT);}vC=d-vec3(0.,0.,136.73910524340096);vColour=uAppearance==0?toLinear(color):vec3(0.);vPhoto=uAppearance==9?toLinear(photoColour):vec3(0.);vRough=.22+.05*nativeRoughness;vec4 p=modelViewMatrix*vec4(vC*uSize+uOffset,1.);vView=p.xyz;gl_Position=projectionMatrix*p;gl_PointSize=uPointSize;}`;
const FRAG=`precision highp float;precision highp int;precision highp sampler3D;
in vec3 vC,vSource,vColour,vPhoto,vView;in float vRough;
uniform sampler3D uVolume;uniform sampler2D uMask,uNeckGuide;
uniform mat4 viewMatrix;uniform mat3 uR;
uniform vec3 uVolumeOrigin,uVolumeExtent,uTexel,uAxis,uMaskOrigin,uMaskExtent,uMaskU,uMaskV,uPCACenter;
uniform float uClip,uSide,uRoot,uTransition,uCurvature,uMaskSpacing,uContourCoverage;uniform int uClipEnabled,uNativeClip,uPart,uAppearance,uVolumeReady,uPlane,uMaskBefore,uPoints,uContour;
out vec4 result;
vec3 toLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 toSRGB(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
float channel(vec4 s){if(uAppearance==3)return s.g;if(uAppearance==4||uAppearance==5||uAppearance==7)return s.b;return s.r;}
// This channel is the original mask’s material fraction per 8×8×8 block.
float pooledMask(vec3 p){
 vec3 uvw=(p-uVolumeOrigin)/uVolumeExtent;
 if(any(lessThan(uvw,vec3(0.)))||any(greaterThan(uvw,vec3(1.))))return 0.;
 return texture(uVolume,uvw).a;
}
float pooledCurvature(vec3 p,vec3 u,vec3 v,float f,out vec2 g){
 float l=pooledMask(p-u),r=pooledMask(p+u),b=pooledMask(p-v),t=pooledMask(p+v);
 g=.5*vec2(r-l,t-b);
 float g2=dot(g,g);
 if(g2<.0025)return 0.;
 float fuu=r+l-2.*f,fvv=t+b-2.*f;
 float fuv=.25*(pooledMask(p+u+v)+pooledMask(p-u-v)-pooledMask(p+u-v)-pooledMask(p-u+v));
 return abs(fuu*g.y*g.y-2.*fuv*g.x*g.y+fvv*g.x*g.x)/(g2*sqrt(g2));
}
bool materialAhead(vec3 p,vec3 d){
 // Sample farther into the slice so the exterior silhouette is excluded.
 return pooledMask(p+3.*d)>.86||pooledMask(p+7.*d)>.86||pooledMask(p+14.*d)>.86;
}
const float pooledIso=.79;
const vec4 contourBlue=vec4(.025,.30,.90,1.);
const vec4 contourRed=vec4(.90,.025,.09,1.);
int pooledMarker(vec3 p,float f,float lineWidth){
 if(abs(f-pooledIso)>=lineWidth)return 0;
 float spacing=uVolumeExtent.x*uTexel.x;
 vec3 u=uMaskU*spacing,v=uMaskV*spacing;
 if(!materialAhead(p,u)||!materialAhead(p,-u)||!materialAhead(p,v)||!materialAhead(p,-v))return 0;

 vec2 gradient;
 float bend=pooledCurvature(p,u,v,f,gradient);
 // Compare along the sampled contour, in units of one pooled sample.
 float cutoff=uContour==2?.70:.42;
 if(bend>cutoff){
  vec2 dir=normalize(vec2(-gradient.y,gradient.x));
  vec3 tangent=u*dir.x+v*dir.y;
  vec3 a=p+tangent,b=p-tangent;
  vec2 unused;
  float k1=pooledCurvature(a,u,v,pooledMask(a),unused);
  float k2=pooledCurvature(b,u,v,pooledMask(b),unused);
  if(bend>=max(k1,k2))return 2;
 }
 return 1;
}
vec3 coverageOffset(vec3 step){
 return step*min(uContourCoverage,.155/max(length(step),.0001));
}
vec4 pooledSlice(vec3 p){
 float f=pooledMask(p);
 float lineWidth=clamp(fwidth(f)*.50,.045,.145);
 vec3 dx=coverageOffset(dFdx(p)),dy=coverageOffset(dFdy(p));
 if(uContour>0){
  int marker=pooledMarker(p,f,lineWidth);
  // A marker can cover its immediate screen neighbourhood, never fresh data.
  for(int i=-1;i<=1;i+=2){
   for(int j=-1;j<=1;j+=2){
    if(marker==2)break;
    vec3 q=p+float(i)*dx+float(j)*dy;
    marker=max(marker,pooledMarker(q,pooledMask(q),lineWidth));
   }
  }
  if(marker==2)return contourRed;
  if(marker==1)return contourBlue;
 }
 if(uMaskBefore==1&&f<pooledIso)discard;
 return vec4(vec3(smoothstep(.1,pooledIso,f)*.84),1.);
}
vec2 maskUV(vec3 vector){
 return vec2(dot(vector,uMaskU),dot(vector,uMaskV))/uMaskExtent.xy;
}
vec2 exactMarker(vec2 uv){
 if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec2(0.);
 return texture(uMask,uv).gb;
}
void main(){
 if(uPoints==1&&length(gl_PointCoord-vec2(.5))>.5)discard;
 if(uPlane==0&&uClipEnabled==1){float c=uNativeClip==1?vSource.z:uNativeClip==2?dot(vSource-uPCACenter,uAxis):dot(vC,uAxis);if((c-uClip)*uSide>0.)discard;}
 if(uPart!=0){
  // The two rows hold contact heights / band widths and front / reverse contact depths.
  float node=32.*(1.+clamp(vC.x/34.5,-1.,1.));
  int left=min(int(floor(node)),63);
  float fraction=node-float(left);
  vec4 profile=mix(texelFetch(uNeckGuide,ivec2(left,0),0),texelFetch(uNeckGuide,ivec2(left+1,0),0),fraction);
  vec2 depth=mix(texelFetch(uNeckGuide,ivec2(left,1),0).xy,texelFetch(uNeckGuide,ivec2(left+1,1),0).xy,fraction);
  float frontWeight=smoothstep(0.,1.,(vC.y-depth.x)/max(.15,depth.y-depth.x));
  vec2 centre=texelFetch(uNeckGuide,ivec2(32,0),0).xy;
  vec2 contact=centre+(profile.xy-centre)*(uCurvature/8.);
  float upper=uRoot-1.3+mix(contact.x,contact.y,frontWeight);
  float lower=upper-max(.5,mix(profile.z,profile.w,frontWeight)*uTransition/10.);
  if(uPart==-1&&vC.z>=lower)discard;
  if(uPart==1&&vC.z<upper)discard;
  if(uPart==2&&(vC.z<lower||vC.z>=upper))discard;
 }
 if(uPlane==2){result=pooledSlice(vSource);return;}
 float mask=1.;
 if(uPlane==1){
  vec2 uv=maskUV(vSource-uMaskOrigin);
  if(uContour>0){
   vec2 dx=maskUV(coverageOffset(dFdx(vSource)));
   vec2 dy=maskUV(coverageOffset(dFdy(vSource)));
   vec2 markers=exactMarker(uv);
   vec2 texel=vec2(uMaskSpacing)/uMaskExtent.xy;
   for(int i=-1;i<=1;i++){
    for(int j=-1;j<=1;j++){
     markers=max(markers,exactMarker(uv+vec2(float(i),float(j))*texel));
    }
   }
   for(int i=-1;i<=1;i+=2){
    for(int j=-1;j<=1;j+=2){
     markers=max(markers,exactMarker(uv+float(i)*dx+float(j)*dy));
    }
   }
   if(markers.y>.5){result=contourRed;return;}
   if(markers.x>.5){result=contourBlue;return;}
  }
  if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))discard;
  mask=texture(uMask,uv).r;
  if(uMaskBefore==1&&mask<.5)discard;
 }
 if(uAppearance==9&&uPlane==0){result=vec4(toSRGB(vPhoto),1.);return;}
 if(uAppearance==0&&uPlane==0){result=vec4(toSRGB(vColour),1.);return;}
 if(uPlane==1&&(uAppearance==0||uAppearance==1||uAppearance==6||uAppearance==8||uAppearance==9)){vec3 c=vec3(mask);if(uAppearance==6){vec3 dd=vSource-uMaskOrigin;vec2 cell=vec2(dot(dd,uMaskU),dot(dd,uMaskV))/uMaskSpacing,edge=min(fract(cell),1.-fract(cell));vec2 pixel=max(fwidth(cell),vec2(.0001));float zoomed=1.-smoothstep(.5,1.2,max(pixel.x,pixel.y));float grid=1.-smoothstep(.02,.075,min(edge.x,edge.y));c=mix(c,vec3(.23,.46,.52),grid*zoomed*.65);}result=vec4(c,1.);return;}
 vec3 uvw=(vSource-uVolumeOrigin)/uVolumeExtent;bool inVolume=all(greaterThanEqual(uvw,vec3(0.)))&&all(lessThanEqual(uvw,vec3(1.)));
 vec4 density=uVolumeReady==1&&inVolume&&(uAppearance==2||uAppearance==3||uAppearance==4||uAppearance==5||uAppearance==7)?texture(uVolume,uvw):vec4(.72,.72,.72,1.);
 float value=channel(density);value=density.r+clamp(value-density.r,-12./255.,12./255.);
 vec3 n=uPoints==1?vec3(0.,0.,1.):normalize(cross(dFdx(vView),dFdy(vView)));if(!gl_FrontFacing)n=-n;
 if(uVolumeReady==1&&inVolume&&(uAppearance==3)){
  vec3 grad=vec3(channel(texture(uVolume,uvw+vec3(uTexel.x,0.,0.)))-channel(texture(uVolume,uvw-vec3(uTexel.x,0.,0.))),channel(texture(uVolume,uvw+vec3(0.,uTexel.y,0.)))-channel(texture(uVolume,uvw-vec3(0.,uTexel.y,0.))),channel(texture(uVolume,uvw+vec3(0.,0.,uTexel.z)))-channel(texture(uVolume,uvw-vec3(0.,0.,uTexel.z))));
  if(length(grad)>.001){vec3 q=normalize(mat3(viewMatrix)*uR*grad);if(dot(q,n)<0.)q=-q;n=normalize(mix(n,q,.62));}
 }
 float light=uPlane==1?1.:.63+.37*abs(dot(n,normalize(vec3(-.35,.55,1.))));vec3 c;
 if(uAppearance==0||uAppearance==1||uAppearance==6||uAppearance==8||uAppearance==9)c=vec3(.89,.91,.88)*light;
 else if(uAppearance==2||uAppearance==7)c=toLinear(vec3(value))*light;
 else if(uAppearance==4)c=toLinear(vec3(.20,.57,.70))*(.86+.14*abs(dot(n,normalize(vec3(-.35,.55,1.)))))*(.985+.03*value);
 else if(uAppearance==5){float delta=clamp((density.b-density.r)*255./12.,-1.,1.);c=toLinear(mix(vec3(.97),delta<0.?vec3(.14,.37,.83):vec3(.88,.22,.12),abs(delta)));}
 else{float t=clamp((value-.25)/.75,0.,1.);c=toLinear(mix(vec3(.055,.12,.27),vec3(.25,.78,.88),t))*light;if(uPlane==0)c+=vec3(.04)*pow(max(0.,dot(n,normalize(vec3(.3,.45,1.)))),mix(90.,15.,vRough));}
 result=vec4(toSRGB(clamp(c,0.,1.)),1.);
}`;
function released(array,size,normal=false){const a=new THREE.BufferAttribute(array,size,normal);a.onUpload(()=>{a.array=null;});return a;}
function readonlyGeometry(position,index,colour,rough){
 const g=new THREE.BufferGeometry();g.setAttribute('position',released(position,3));g.setAttribute('color',released(colour,3,true));g.setAttribute('photoColour',g.getAttribute('color'));g.setAttribute('nativeRoughness',released(rough,1));g.setIndex(released(index,1));g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1);return g;
}

export class NativeEngine{
 constructor(config,hooks={}){
  this.config=config;setPersistence(config.persistent);this.hooks=hooks;this.size=50;this.rootLevel=1.3;this.transition=10;this.curvature=8;this.part='whole';this.gap=6;this.nav='rotate';this.sync=true;this.rulerFixed=true;this.rulerOffset={x:0,z:0};this.views=[];this.bundles=[];this.faces=0;this.ready=false;this.active=true;this.uploadQueue=[];this.colourQueue=[];this.photoQueue=[];this.photoReady=false;this.photoVertices=0;this.caseTicket=0;this.playing=false;this.dirty=true;this.lastFrame=performance.now();
  this.canvas=document.createElement('canvas');this.canvas.className='native-shared-canvas';this.canvas.setAttribute('aria-hidden','true');document.body.append(this.canvas);
  this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,alpha:true,antialias:true,powerPreference:'high-performance'});this.renderer.autoClear=false;this.renderer.sortObjects=false;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;this.renderer.info.autoReset=false;
  this.renderer.debug.onShaderError=(gl,p,vs,fs)=>this.fail('Graphics shader: '+[gl.getProgramInfoLog(p),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs)].filter(Boolean).join(' '));
  this.pointScene=new THREE.Scene();this.pointGroups=[];this.pointCount=0;this.scene=new THREE.Scene();this.rulerScene=new THREE.Scene();this.scale=cadRuler(config.ruler);this.rulerScene.add(this.scale);this.configureWood();this.planeScene=new THREE.Scene();this.motionScene=new THREE.Scene();
  const r=new THREE.Matrix3().set(...config.geometry.display_affine_R.flat()),inverse=r.clone().invert(),v=config.volume;
  const stub=new THREE.Data3DTexture(new Uint8Array([180,180,180,255]),1,1,1);stub.format=THREE.RGBAFormat;stub.type=THREE.UnsignedByteType;stub.needsUpdate=true;
  const mask=new THREE.DataTexture(new Uint8Array([255]),1,1,THREE.RedFormat);mask.needsUpdate=true;this.stubMask=mask;
  const guide=config.neckGuide;
  const neckTexture=new THREE.DataTexture(
   Float32Array.from([...guide.heights_mm,...guide.depth_mm].flat()),
   guide.heights_mm.length,2,THREE.RGBAFormat,THREE.FloatType
  );
  neckTexture.minFilter=neckTexture.magFilter=THREE.NearestFilter;
  neckTexture.needsUpdate=true;
  this.uniforms={uNeckGuide:{value:neckTexture},uPointSize:{value:2},uPoints:{value:0},uContour:{value:0},uContourCoverage:{value:1},uR:{value:r},uInvR:{value:inverse},uT:{value:new THREE.Vector3(...config.geometry.display_affine_T)},uOffset:{value:new THREE.Vector3()},uMotionOrigin:{value:new THREE.Vector3()},uMotionHalfExtent:{value:new THREE.Vector3()},uSize:{value:.5},uGrid:{value:0},uVolume:{value:stub},uMask:{value:mask},uVolumeOrigin:{value:new THREE.Vector3(...v.source_edge_origin_xyz_mm)},uVolumeExtent:{value:new THREE.Vector3(...v.shape_xyz.map(n=>n*v.display_spacing_mm))},uTexel:{value:new THREE.Vector3(...v.shape_xyz.map(n=>1/n))},uVolumeReady:{value:0},uAxis:{value:new THREE.Vector3(0,1,0)},uClip:{value:0},uSide:{value:1},uRoot:{value:1.3},uTransition:{value:10},uCurvature:{value:8},uMaskSpacing:{value:.018},uMaskU:{value:new THREE.Vector3(1,0,0)},uMaskV:{value:new THREE.Vector3(0,1,0)},uPCACenter:{value:new THREE.Vector3(...config.pca.center_scanner_mm)},uClipEnabled:{value:0},uNativeClip:{value:0},uPart:{value:0},uAppearance:{value:0},uPlane:{value:0},uMaskBefore:{value:1},uMaskOrigin:{value:new THREE.Vector3(...config.mask.scanner_origin_xyz_mm.map(x=>x-.009))},uMaskExtent:{value:new THREE.Vector3(config.mask.native_shape_zyx[2]*.018,config.mask.native_shape_zyx[1]*.018,.018)}};
  this.material=new THREE.RawShaderMaterial({vertexShader:VERT,fragmentShader:FRAG,uniforms:this.uniforms,glslVersion:THREE.GLSL3,side:THREE.DoubleSide,toneMapped:false});
  this.configureMotionPlanes();
  this.worker=new Worker(new URL('./native-stream-r15.js?v=2',import.meta.url),{type:'module'});this.worker.onmessage=e=>this.message(e.data);this.worker.onerror=e=>this.fail(e.message);
  this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.worker.postMessage({type:'cache-only'});this.hooks.error?.('Graphics memory was released. Complete source data remain cached; reload to restore the full 3D view.');this.views.forEach(v=>v.fallback(true));});
  this.resize=()=>{const w=innerWidth,h=innerHeight,dpr=Math.min(this.quality==='balanced'?devicePixelRatio:Math.max(1.5,devicePixelRatio),this.quality==='balanced'?1.25:2,4096/w,2160/h);this.renderer.setPixelRatio(dpr);this.uniforms.uContourCoverage.value=Math.min(2.5,1.1*dpr);this.renderer.setSize(w,h,false);this.dirty=true;};window.addEventListener('resize',this.resize);window.addEventListener('scroll',()=>{this.dirty=true;this.lastScroll=performance.now();},{passive:true});this.resize();this.tick();
 }
 start(){this.worker.postMessage({type:'init',config:this.config});}
 addView(element,options={}){
  const view={element,mode:options.mode??0,cut:options.cut??'none',cutValue:0,flip:1,showPlane:false,maskBefore:true,contours:true,peakRule:'tail99',mesh:'surface',static:false};
  view.camera=new THREE.OrthographicCamera(-60,60,60,-60,.01,3000);view.camera.up.set(0,0,1);
  view.controls=new OrbitControls(view.camera,element.querySelector('.native-hit-area'));view.controls.enableDamping=true;view.controls.dampingFactor=.14;view.controls.screenSpacePanning=true;view.controls.minZoom=.4;view.controls.maxZoom=128;view.controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  view.controls.addEventListener('change',()=>{this.dirty=true;if(this.sync&&!this.syncing)this.synchronize(view);});
  view.fallback=on=>{element.classList.toggle('native-poster-visible',on);const poster=element.querySelector('.native-stage-poster'),ruler=element.querySelector('.native-stage-ruler');if(poster)poster.hidden=on&&view.mode===9;if(ruler)ruler.hidden=on&&view.mode===9;};
  view.observer=new ResizeObserver(()=>{this.fit(view);this.dirty=true;});view.observer.observe(element);this.views.push(view);this.navigation(this.nav);this.camera(view,'front');this.bindRulerDrag(view);this.bindSliceDrag(view);view.intersection=new IntersectionObserver(()=>this.dirty=true);view.intersection.observe(element);return view;
 }
 fit(v){const r=v.element.getBoundingClientRect();if(r.width<1||r.height<1)return;const s=this.size,H=Math.max(s*1.26+(this.part==='split'?2*this.gap:0),(s*.9+20)/(r.width/r.height));v.camera.left=-H*r.width/r.height/2;v.camera.right=-v.camera.left;v.camera.top=H/2;v.camera.bottom=-H/2;v.camera.updateProjectionMatrix();}
 camera(v,pose){const yaw=pose==='front'?Math.PI:pose==='reverse'?0:Math.PI-.49,pitch=pose==='oblique'?.2:0;v.controls.target.set(0,0,0);v.camera.position.set(Math.sin(yaw)*Math.cos(pitch)*350,-Math.cos(yaw)*Math.cos(pitch)*350,Math.sin(pitch)*350);v.camera.zoom=1;v.controls.update();this.fit(v);this.dirty=true;}
 synchronize(v){this.syncing=true;for(const o of this.views){if(o===v)continue;o.camera.position.copy(v.camera.position);o.camera.quaternion.copy(v.camera.quaternion);o.camera.zoom=v.camera.zoom;o.controls.target.copy(v.controls.target);o.camera.updateProjectionMatrix();o.controls.update();}this.syncing=false;}
 navigation(mode){this.nav=mode;for(const v of this.views){v.controls.enabled=mode!=='slice';v.controls.mouseButtons.LEFT=mode==='pan'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;v.controls.touches.ONE=mode==='pan'?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;}}
 ruler(v){const right=new THREE.Vector3().setFromMatrixColumn(v.camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(v.camera.matrixWorld,1);this.scale.position.copy(v.controls.target).addScaledVector(right,this.size*.36+7+this.rulerOffset.x).addScaledVector(up,-this.size/2+this.rulerOffset.z);this.scale.quaternion.copy(v.camera.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));this.scale.updateMatrixWorld(true);}
 bindRulerDrag(v){
  const hit=v.element.querySelector('.native-hit-area'),ray=new THREE.Raycaster();let drag=null;
  const cast=e=>{const r=hit.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),v.camera);};
  hit.addEventListener('pointerdown',e=>{if(this.rulerFixed||e.button!==0)return;this.ruler(v);cast(e);if(!ray.intersectObject(this.scale,true).length)return;const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(v.camera.getWorldDirection(new THREE.Vector3()),this.scale.position),point=ray.ray.intersectPlane(plane,new THREE.Vector3());if(!point)return;drag={plane,point,offset:{...this.rulerOffset},right:new THREE.Vector3().setFromMatrixColumn(v.camera.matrixWorld,0),up:new THREE.Vector3().setFromMatrixColumn(v.camera.matrixWorld,1)};v.controls.enabled=false;hit.setPointerCapture(e.pointerId);e.preventDefault();e.stopImmediatePropagation();},true);
  hit.addEventListener('pointermove',e=>{if(!drag)return;cast(e);const q=ray.ray.intersectPlane(drag.plane,new THREE.Vector3());if(q){q.sub(drag.point);this.rulerOffset.x=drag.offset.x+q.dot(drag.right);this.rulerOffset.z=drag.offset.z+q.dot(drag.up);this.hooks.rulerMoved?.({...this.rulerOffset});this.dirty=true;}e.preventDefault();e.stopImmediatePropagation();},true);
  const end=e=>{if(!drag)return;drag=null;v.controls.enabled=true;e.stopImmediatePropagation();};hit.addEventListener('pointerup',end,true);hit.addEventListener('pointercancel',end,true);
 }
 setPart(part,level=this.rootLevel,gap=this.gap,transition=this.transition,curvature=this.curvature){this.part=part;this.rootLevel=level;this.gap=gap;this.transition=transition;this.curvature=curvature;this.views.forEach(v=>this.fit(v));this.dirty=true;}
 async setSize(size){
  if(size===this.size)return;this.size=size;this.uniforms.uSize.value=size/100;this.views.forEach(v=>this.fit(v));this.dirty=true;
  if(!this.ready){if(this.preview){const a=this.preview.userData.colours[size];this.replaceColour(this.preview,a);}return;}
  const ticket=++this.caseTicket;this.caseChanging=true;this.hooks.colourProgress?.(0);
  this.renderer.setScissorTest(false);this.renderer.setClearColor(0,0);this.renderer.clear(true,true,true);
  let completed=false;try{for(const bundle of this.config.geometry.chunks){const{decodedBytes}=await import('./native-store-r15.js?v=1'),buffer=await decodedBytes(bundle),p=arrays(buffer);if(ticket!==this.caseTicket)return;const group=this.bundles[bundle.source_first_face/1000000];for(let j=0;j<p.header.meshlets.length;j++){const m=p.header.meshlets[j];this.replaceColour(group.children[j],p.out[m.prefix+(size===50?'_c50':'_c100')]);}await new Promise(resolve=>{this.colourQueue.push({group,resolve});this.dirty=true;});this.hooks.colourProgress?.(bundle.source_first_face+bundle.triangles);}completed=true;}catch(e){this.fail('Original-colour restoration failed: '+e.message);}
  finally{if(ticket===this.caseTicket){this.caseChanging=false;if(completed)this.hooks.colourComplete?.();this.dirty=true;}}
 }
 replaceColour(mesh,bytes){const a=mesh.geometry.getAttribute('color');a.array=new Uint8Array(bytes);a.needsUpdate=true;}
 message(d){
  if(d.type==='preview')this.makePreview(d.buffer);
  else if(d.type==='bundle'){const p=arrays(d.buffer),group=new THREE.Group();group.visible=false;let count=0;
   for(const m of p.header.meshlets){const prefix=m.prefix,position=p.out[prefix+'_grid'],index=p.out[prefix+'_index'],colour=p.out[prefix+(this.size===50?'_c50':'_c100')],rough=p.out[prefix+'_rough'];if(position.length!==m.vertices*3||index.length!==m.triangles*3||m.source_first_face!==p.header.source_first_face+count)throw Error('Native meshlet coverage mismatch');const geometry=readonlyGeometry(new Uint16Array(position),new Uint16Array(index),new Uint8Array(colour),new Uint8Array(rough)),mesh=new THREE.Mesh(geometry,this.material);mesh.frustumCulled=false;mesh.userData.nativeFaceCount=m.triangles;group.add(mesh);count+=m.triangles;}
   if(count!==p.header.triangles)throw Error('Native bundle face count mismatch');this.scene.add(group);const points=new THREE.Group();points.visible=false;for(const mesh of group.children){const g=new THREE.BufferGeometry();for(const name of['position','color','photoColour','nativeRoughness'])g.setAttribute(name,mesh.geometry.getAttribute(name));g.boundingSphere=mesh.geometry.boundingSphere;const point=new THREE.Points(g,this.material);point.frustumCulled=false;points.add(point);this.pointCount+=mesh.geometry.getAttribute('position').count;}this.pointGroups[d.id]=points;this.pointScene.add(points);this.bundles[d.id]=group;this.uploadQueue.push({group,id:d.id,faces:count});this.dirty=true;
  }else if(d.type==='photo-bundle'){const p=arrays(d.buffer),group=this.bundles[d.id],points=this.pointGroups[d.id];if(!group)throw Error('Photo field has no native geometry');for(let j=0;j<p.header.meshlets.length;j++){const m=p.header.meshlets[j],rgb=p.out[m.prefix+'_cnatural'];if(!rgb||rgb.length!==group.children[j].geometry.getAttribute('position').count*3)throw Error('Photo colour correspondence mismatch');let a=group.children[j].geometry.getAttribute('photoColour');if(a===group.children[j].geometry.getAttribute('color'))a=released(new Uint8Array(rgb),3,true);else{a.array=new Uint8Array(rgb);a.needsUpdate=true;}group.children[j].geometry.setAttribute('photoColour',a);points.children[j].geometry.setAttribute('photoColour',a);this.photoVertices+=a.count;}this.photoQueue.push({group,id:d.id});this.dirty=true;}
  else if(d.type==='photo-complete'){if(this.photoVertices!==this.pointCount)return this.fail('Photo vertex coverage mismatch');this.photoReady=true;this.resolvePhoto?.();this.hooks.photoReady?.();this.dirty=true;}
  else if(d.type==='volume')this.setVolume(d.buffer);
  else if(d.type==='mask')this.setMask(d);
  else if(d.type==='mask-error'){this.hooks.maskError?.(d);}
  else if(d.type==='progress')this.hooks.progress?.(d);
  else if(d.type==='geometry-complete'){if(this.faces!==NATIVE_FACES)return this.fail('Complete native face count mismatch');this.ready=true;this.bundles.forEach(g=>g.visible=true);this.pointGroups.forEach(g=>g.visible=true);if(this.preview){this.scene.remove(this.preview);this.preview.geometry.dispose();this.preview=null;}this.hooks.ready?.(d);this.dirty=true;}
  else if(d.type==='cache-progress'||d.type==='cache-ready')this.hooks.cache?.(d);
  else if(d.type==='natural-error'){this.rejectPhoto?.(Error(d.message));this.photoPromise=null;this.hooks.note?.('Natural colour source unavailable: '+d.message);}
  else if(d.type==='error')this.fail(d.message);else if(d.type.endsWith('-error'))this.hooks.note?.(d.message);
 }
 makePreview(buffer){const{header,out}=arrays(buffer),c=out[this.size===50?'colors50':'colors100'];this.preview=new THREE.Mesh(readonlyGeometry(new Float32Array(out.positions),new Uint32Array(out.indices),new Uint8Array(c),new Uint8Array(header.vertices)),this.material);this.preview.frustumCulled=false;this.preview.userData.colours={50:new Uint8Array(out.colors50),100:new Uint8Array(out.colors100)};this.preview.userData.faces=header.triangles;this.scene.add(this.preview);this.views.forEach(v=>v.fallback(false));this.hooks.preview?.(header.triangles);this.dirty=true;}
 setVolume(buffer){const p=arrays(buffer),s=this.config.volume.shape_xyz,data=p.out.rgba,texture=new THREE.Data3DTexture(data,s[0],s[1],s[2]);texture.format=THREE.RGBAFormat;texture.type=THREE.UnsignedByteType;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true;texture.onUpdate=()=>{texture.image.data=null;};this.uniforms.uVolume.value.dispose();this.uniforms.uVolume.value=texture;this.uniforms.uVolumeReady.value=1;this.dirty=true;}
 setMask(d){
  const view=this.views.find(v=>v.element.id===d.target);if(!view){this.hooks.mask?.(d);return;}if(d.request_id!==undefined&&d.request_id!==view.maskTicket)return;
  view.maskTexture?.dispose();const rgba=new Uint8Array(d.data.length*4);for(let i=0;i<d.data.length;i++){const k=i*4,flags=d.overlay?.[i]||0;rgba[k]=d.data[i];rgba[k+1]=(flags&2)?255:0;rgba[k+2]=(flags&4)?255:0;rgba[k+3]=(flags&1)?255:0;}const texture=new THREE.DataTexture(rgba,d.width,d.height,THREE.RGBAFormat);texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.unpackAlignment=1;texture.needsUpdate=true;texture.onUpdate=()=>{texture.image.data=null;};view.maskTexture=texture;view.maskRecord={...d,data:null,overlay:null};view.maskKey=view.sectionKey;
  if(view.nativePlane){this.planeScene.remove(view.nativePlane);view.nativePlane.geometry.dispose();}
  const origin=d.plane_origin_mm,u=d.u,v=d.v,ww=d.width*d.sampling_mm,hh=d.height*d.sampling_mm,R=this.uniforms.uR.value,T=this.uniforms.uT.value;
  const points=[[0,0],[ww,0],[ww,hh],[0,hh]].flatMap(([x,y])=>new THREE.Vector3(...origin.map((p,i)=>p+u[i]*x+v[i]*y)).applyMatrix3(R).add(T).toArray()),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setAttribute('color',new THREE.Uint8BufferAttribute(new Uint8Array(12).fill(255),3,true));geometry.setAttribute('photoColour',geometry.getAttribute('color'));geometry.setAttribute('nativeRoughness',new THREE.Uint8BufferAttribute(new Uint8Array(4),1));geometry.setIndex([0,1,2,0,2,3]);view.nativePlane=new THREE.Mesh(geometry,this.material);view.nativePlane.frustumCulled=false;view.nativePlane.visible=false;this.planeScene.add(view.nativePlane);this.hooks.mask?.(d);this.dirty=true;
 }
 bindSliceDrag(view){
  const hit=view.element.querySelector('.native-hit-area');let drag=null;
  hit.addEventListener('pointerdown',e=>{
   if(drag||this.nav!=='slice'||e.button!==0||view.cut==='none')return;
   drag={id:e.pointerId,y:e.clientY};hit.setPointerCapture(e.pointerId);
   this.hooks.cutStart?.(view);
   e.preventDefault();e.stopImmediatePropagation();
  },true);
  hit.addEventListener('pointermove',e=>{
   if(drag?.id!==e.pointerId)return;
   const delta=(drag.y-e.clientY)/Math.max(1,hit.clientHeight);drag.y=e.clientY;
   this.hooks.cutMoved?.(view,delta);
   e.preventDefault();e.stopImmediatePropagation();
  },true);
  const end=e=>{
   if(drag?.id!==e.pointerId)return;
   drag=null;this.hooks.cutEnd?.(view);
  };
  for(const event of ['pointerup','pointercancel','lostpointercapture'])hit.addEventListener(event,end,true);
 }
 configureMotionPlanes(){
  const u=this.uniforms;
  const half=u.uVolumeExtent.value.clone().multiplyScalar(.5);
  const centre=u.uVolumeOrigin.value.clone().add(half);
  const makeFrame=(origin,normal,side,up,scale=1,canonical=false)=>{
   const delta=centre.clone().sub(origin);
   const extent=d=>Math.abs(delta.dot(d))+Math.abs(d.x)*half.x+Math.abs(d.y)*half.y+Math.abs(d.z)*half.z;
   return {origin,normal,side,up,half:[extent(side),extent(up),0],scale,canonical};
  };
  const vector=xyz=>new THREE.Vector3(...xyz);
  this.motionFrames={};
  for(const frame of this.config.pca.axes){
   this.motionFrames['pca'+frame.axis]=makeFrame(u.uPCACenter.value.clone(),vector(frame.normal),vector(frame.u),vector(frame.v));
  }
  const scannerZ=this.config.mask.scanner_origin_xyz_mm[2];
  this.motionFrames.native=makeFrame(new THREE.Vector3(centre.x,centre.y,scannerZ),
   new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),.018);
  // Match the canonical clip equations when a physical X/Y/Z cut is selected.
  const inverse=u.uInvR.value;
  const canonicalOrigin=new THREE.Vector3(0,0,CENTRE).sub(u.uT.value).applyMatrix3(inverse);
  const scannerAxes=[[1,0,0],[0,1,0],[0,0,1]].map(d=>vector(d).applyMatrix3(inverse));
  for(const [i,key] of ['x','y','z'].entries()){
   const axis=scannerAxes[i],side=scannerAxes[(i+1)%3],up=scannerAxes[(i+2)%3];
   this.motionFrames[key]=makeFrame(canonicalOrigin,axis.clone().normalize(),
    side.clone().normalize(),up.clone().normalize(),axis.length(),true);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
  const colour=new THREE.Uint8BufferAttribute(new Uint8Array(12).fill(255),3,true);
  geometry.setAttribute('color',colour);
  geometry.setAttribute('photoColour',colour);
  geometry.setAttribute('nativeRoughness',new THREE.Uint8BufferAttribute(new Uint8Array(4),1));
  geometry.setIndex([0,1,2,0,2,3]);
  const plane=new THREE.Mesh(geometry,this.material);
  plane.frustumCulled=false;
  this.motionScene.add(plane);
 }
 drawMotionPlane(view,passes){
  const frame=this.motionFrames[view.cut],u=this.uniforms;
  const offset=view.cutValue*frame.scale/(frame.canonical?this.size/100:1);
  u.uMotionOrigin.value.copy(frame.origin).addScaledVector(frame.normal,offset);
  u.uMotionHalfExtent.value.set(...frame.half);
  for(const [part,z] of passes){
   this.configure(view,part,z);
   u.uMaskU.value.copy(frame.side);
   u.uMaskV.value.copy(frame.up);
   u.uPlane.value=2;
   u.uPoints.value=0;
   u.uGrid.value=2;
   this.material.uniformsNeedUpdate=true;
   this.renderer.render(this.motionScene,view.camera);
  }
 }
 configureWood(){
  const board=this.scale.children.find(m=>m.name==='Warm white scale board');this.scaleBoard=board;this.whiteMaterial=board.material;this.woodMaterial=board.material.clone();this.woodMaterial.color.set('#ffffff');
  this.woodMaterial.onBeforeCompile=shader=>{shader.vertexShader='varying vec3 vWoodP;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWoodP=position;');shader.fragmentShader='varying vec3 vWoodP;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float bend=sin(vWoodP.z*.29)*.55+sin(vWoodP.z*.071+2.)*1.6;float knot=exp(-pow((vWoodP.z-17.)/4.,2.))*sin(vWoodP.x*1.2)*2.1;float grain=sin((vWoodP.x+bend+knot)*9.+sin(vWoodP.z*2.7)*.4);float fine=sin(vWoodP.x*63.+sin(vWoodP.z*4.1)*.7);float stain=.5+.5*sin(vWoodP.z*.16+sin(vWoodP.x*.43));vec3 oak=mix(vec3(.56,.35,.16),vec3(.91,.78,.53),.63+.13*grain+.035*fine+.09*stain);diffuseColor.rgb*=pow(oak,vec3(2.2));`);};this.woodMaterial.customProgramCacheKey=()=> 'megalodon-cad-uneven-oak-r15';
 }
 setWood(enabled){this.scaleBoard.material=enabled?this.woodMaterial:this.whiteMaterial;this.dirty=true;}
 zoom(v,level){v.camera.zoom=level;v.camera.updateProjectionMatrix();v.controls.update();if(this.sync)this.synchronize(v);this.dirty=true;}
 ensureNatural(){if(this.photoReady)return Promise.resolve();if(!this.ready)return Promise.reject(Error('Complete native geometry is still preparing'));if(!this.photoPromise){this.photoVertices=0;this.photoPromise=new Promise((resolve,reject)=>{this.resolvePhoto=resolve;this.rejectPhoto=reject;this.worker.postMessage({type:'natural'});});}return this.photoPromise;}
 requestMask(z,view){view.maskTicket=(view.maskTicket||0)+1;this.worker.postMessage({type:'mask',axis:'native',z,target:view.element.id,peak_rule:view.peakRule,request_id:view.maskTicket});}
 requestSection(axis,offset_mm,sampling_mm,view){view.maskTicket=(view.maskTicket||0)+1;this.worker.postMessage({type:'section',axis,offset_mm,sampling_mm,target:view.element.id,peak_rule:view.peakRule,request_id:view.maskTicket});}
 configure(v,part=0,offset=0){const u=this.uniforms;u.uContour.value=!v.contours?0:v.peakRule==='conservative6MAD'?2:1;u.uPoints.value=v.mesh==='vertices'&&this.ready?1:0;u.uAppearance.value=v.mode;u.uPart.value=part;u.uRoot.value=this.rootLevel;u.uTransition.value=this.transition;u.uCurvature.value=this.curvature;const m=v.maskRecord;u.uMask.value=v.maskTexture||this.stubMask;if(m){u.uMaskOrigin.value.set(...m.plane_origin_mm);u.uMaskU.value.set(...m.u);u.uMaskV.value.set(...m.v);u.uMaskExtent.value.set(m.width*m.sampling_mm,m.height*m.sampling_mm,m.sampling_mm);u.uMaskSpacing.value=m.sampling_mm;}u.uOffset.value.set(0,0,offset);u.uPlane.value=0;u.uGrid.value=this.ready?1:0;u.uSize.value=this.size/100;u.uMaskBefore.value=v.maskBefore?1:0;u.uClipEnabled.value=v.cut==='none'?0:1;const pca=v.cut.startsWith('pca')?this.config.pca.axes[Number(v.cut.slice(3))-1]:null;u.uNativeClip.value=pca?2:v.cut==='native'?1:0;if(pca)u.uAxis.value.set(...pca.normal);else u.uAxis.value.set(v.cut==='x'?1:0,v.cut==='y'?1:0,v.cut==='z'?1:0);u.uClip.value=pca?v.cutValue:v.cut==='native'?this.config.mask.scanner_origin_xyz_mm[2]+v.cutValue*.018:v.cutValue/(this.size/100);u.uSide.value=v.flip;this.material.uniformsNeedUpdate=true;}
 upload(group){
  const visible=this.bundles.map(g=>g.visible);this.bundles.forEach(g=>g.visible=false);const priorPreview=this.preview?.visible;if(this.preview)this.preview.visible=false;group.visible=true;
  const v=this.views[0];this.configure({...v,mode:0,cut:'none'});this.uniforms.uGrid.value=1;this.uniforms.uPart.value=0;this.uniforms.uOffset.value.set(0,0,0);this.renderer.setScissorTest(true);this.renderer.setViewport(0,0,1,1);this.renderer.setScissor(0,0,1,1);this.renderer.setClearColor(0,0);this.renderer.clear(true,true,true);this.renderer.render(this.scene,v.camera);
  this.bundles.forEach((g,i)=>g.visible=visible[i]);group.visible=this.ready;if(this.preview)this.preview.visible=priorPreview;
  if(this.renderer.getContext().getError()!==0)throw Error('Graphics buffer allocation failed');
 }
 render(v){
  const r=v.element.getBoundingClientRect();if(this.caseChanging||v.static||(v.mode===9&&!this.photoReady)||r.width<1||r.height<1||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)return;
  this.renderer.setViewport(r.left,innerHeight-r.bottom,r.width,r.height);this.renderer.setScissor(Math.max(0,r.left),Math.max(0,innerHeight-r.bottom),Math.min(r.right,innerWidth)-Math.max(0,r.left),Math.min(r.bottom,innerHeight)-Math.max(0,r.top));this.renderer.setScissorTest(true);this.renderer.setClearColor(0,0);this.renderer.clear(true,true,true);this.renderer.info.reset();
  const split=this.part==='split',passes=split?[[-1,-this.gap],[2,0],[1,this.gap]]:[[this.part==='root'?-1:this.part==='crown'?1:this.part==='transition'?2:0,0]];
  for(const[p,z]of passes){this.configure(v,p,z);this.renderer.render(v.mesh==='vertices'&&this.ready?this.pointScene:this.scene,v.camera);}
  const actual=this.renderer.info.render.triangles;
  v.element.dataset.cutAxis=v.cut;
  v.element.dataset.cutPosition=String(v.cutValue);
  v.element.dataset.cutMoving=String(Boolean(v.cutMoving));
  if(this.ready){if(v.mesh==='vertices'){if(this.renderer.info.render.points!==this.pointCount*passes.length)return this.fail('Native submitted-vertex validation failed');}else if(actual!==NATIVE_FACES*passes.length)return this.fail('Native submitted-triangle validation failed');v.element.dataset.nativeSubmittedPoints=String(this.renderer.info.render.points);v.element.dataset.nativeSurfaceMode=v.mesh;v.element.dataset.nativeResidentFaces=String(NATIVE_FACES);v.element.dataset.nativeSubmittedTriangles=String(actual);v.element.dataset.nativeRenderPasses=String(passes.length);}
  if(v.showPlane&&v.nativePlane&&!v.cutMoving&&v.maskKey===v.sectionKey){
   v.nativePlane.visible=true;
   for(const [part,z] of passes){
    this.configure(v,part,z);
    this.uniforms.uPlane.value=1;
    this.uniforms.uPoints.value=0;
    this.uniforms.uGrid.value=0;
    this.material.uniformsNeedUpdate=true;
    this.renderer.render(this.planeScene,v.camera);
   }
   v.nativePlane.visible=false;
   v.element.dataset.cutContours='native-mask';
  }else if(v.showPlane&&v.mode===8&&v.contours&&this.uniforms.uVolumeReady.value&&this.motionFrames[v.cut]){
   this.drawMotionPlane(v,passes);
   v.element.dataset.cutContours='pooled-144um';
  }else{
   v.element.dataset.cutContours='hidden';
  }
  this.ruler(v);this.renderer.render(this.rulerScene,v.camera);
 }
 tick(){this.frame=requestAnimationFrame(()=>this.tick());const now=performance.now(),dt=Math.min(.06,(now-this.lastFrame)/1000);this.lastFrame=now;if(this.lost||this.failed||!this.active||!this.views.length)return;let changed=false;
  this.hooks.beforeFrame?.(now);
  for(const v of this.views)if(v.controls.update())changed=true;
  if(this.playing&&this.views.some(v=>{const r=v.element.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;})){const v=this.views[0],p=v.camera.position.clone().sub(v.controls.target),theta=dt*.22,c=Math.cos(theta),s=Math.sin(theta);v.camera.position.copy(v.controls.target).add(new THREE.Vector3(p.x*c-p.y*s,p.x*s+p.y*c,p.z));v.controls.update();changed=true;}
  if(this.uploadQueue.length){const q=this.uploadQueue.shift();try{this.upload(q.group);this.faces+=q.faces;this.worker.postMessage({type:'ack',id:q.id});}catch(e){this.fail(e.message);}changed=true;}
  if(this.photoQueue.length){const q=this.photoQueue.shift();try{this.upload(q.group);this.worker.postMessage({type:'ack',id:1000+q.id});}catch(e){this.fail(e.message);}changed=true;}
  if(this.colourQueue.length){const q=this.colourQueue.shift();this.upload(q.group);q.resolve();changed=true;}
  if(changed||this.dirty||now-(this.lastScroll||0)<180){this.renderer.setScissorTest(false);this.renderer.setClearColor(0,0);this.renderer.clear(true,true,true);if(this.preview||this.ready)this.views.forEach(v=>this.render(v));this.dirty=false;}
 }
 fail(message){if(this.failed)return;this.failed=true;this.playing=false;this.worker?.postMessage({type:'cache-only'});this.hooks.error?.(String(message));this.views.forEach(v=>{v.fallback(true);v.element.removeAttribute('data-nativeResidentFaces');});this.canvas.hidden=true;}
}
