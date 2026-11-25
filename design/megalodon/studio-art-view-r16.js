import * as THREE from 'three';
import {ModelViewer} from './viewer.js';
import {cadRuler} from './cad-palaeo-ruler-r14.js?v=1';

const modelURL='https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/5d5316eba77b04e9cea85228a942224c0d087960/assets/model.json';
const rulerURL='https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/37ea516b75facd7dacbaacb332c4b5c522d15ad1/assets/palaeo-ruler-r14/Palaeontological_Ruler_50mm.json';
async function getJSON(url){
 const response=await fetch(url);
 if(!response.ok)throw new Error(`Artwork data unavailable (${response.status})`);
 return response.json();
}

function artTooth(finish='resin'){
 // These are the original studio Art display colours and material parameters.
 const resin={
  color:0xffffff,roughness:.19,metalness:.035,transmission:.12,thickness:1.2,
  ior:1.49,clearcoat:1,clearcoatRoughness:.065,envMapIntensity:1.15,side:THREE.DoubleSide
 };
 const matte=finish==='pla';
 const material=new THREE.MeshPhysicalMaterial(finish==='resin'?resin:{
  ...resin,roughness:matte?.7:.49,metalness:0,transmission:0,thickness:0,
  clearcoat:matte?0:.12,clearcoatRoughness:.3,envMapIntensity:matte?.5:.7
 });
 const colour=hex=>`vec3(${new THREE.Color(hex).toArray().map(channel=>channel.toFixed(8)).join(',')})`;
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nvarying float artHeight;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nartHeight=position.z;');
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nvarying float artHeight;')
   .replace('#include <color_fragment>',`#include <color_fragment>
    float h=clamp((artHeight-86.73910524340096)/100.0,0.0,1.0);
    vec3 enamel=mix(${colour('#48529f')},${colour('#389cb9')},smoothstep(.40,1.,h));
    diffuseColor.rgb*=mix(${colour('#07141d')},enamel,smoothstep(.35,.48,h));`);
 };
 return material;
}

export async function mountStudioArt(container,{onCapMove=()=>{}}={}){
 const viewer=new ModelViewer(container,await getJSON(modelURL));
 try{
  await viewer.load();
 }catch(error){
  viewer.controls.dispose();
  viewer.observer.disconnect();
  viewer.envTarget.dispose();
  viewer.renderer.dispose();
  viewer.renderer.domElement.remove();
  throw error;
 }
 const oldTooth=viewer.tooth.material;
 const toothFinishes={resin:artTooth()};
 viewer.tooth.material=toothFinishes.resin;
 container.dataset.toothFinish='resin';
 oldTooth.dispose();
 const glass=new THREE.MeshPhysicalMaterial({
  color:0xa9c1ce,roughness:.065,metalness:0,transmission:.96,thickness:6.4,
  ior:1.49,clearcoat:1,clearcoatRoughness:.045,envMapIntensity:.65,
  transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide
 });
 viewer.main.material=viewer.cap.material=glass;
 viewer.clear.dispose();
 viewer.scene.traverse(object=>{
  if(object.isMesh&&object.geometry.type==='PlaneGeometry')object.visible=false;
  if(object.isLight)object.intensity=object.isHemisphereLight?.35:.95;
 });
 viewer.renderer.toneMappingExposure=.85;
 const canvas=document.createElement('canvas');
 canvas.width=4;
 canvas.height=512;
 const context=canvas.getContext('2d'),gradient=context.createLinearGradient(0,0,0,512);
 gradient.addColorStop(0,'#070d10');
 gradient.addColorStop(.45,'#14232b');
 gradient.addColorStop(1,'#3c535f');
 context.fillStyle=gradient;
 context.fillRect(0,0,4,512);
 viewer.scene.background=new THREE.CanvasTexture(canvas);
 viewer.scene.background.colorSpace=THREE.SRGBColorSpace;

 let ruler,rulerTask,visible=false,frame=0,dirty=true,showRuler=false;
 const right=new THREE.Vector3(),up=new THREE.Vector3(),front=new THREE.Vector3();
 const rulerTurn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
 function draw(){
  if(ruler?.visible){
   viewer.camera.updateMatrixWorld();
   right.setFromMatrixColumn(viewer.camera.matrixWorld,0);
   up.setFromMatrixColumn(viewer.camera.matrixWorld,1);
   front.setFromMatrixColumn(viewer.camera.matrixWorld,2);
   const halfWidth=viewer.ortho.right/viewer.camera.zoom;
   const halfHeight=viewer.ortho.top/viewer.camera.zoom;
   ruler.position.copy(viewer.controls.target).addScaledVector(right,Math.max(0,halfWidth-21))
    .addScaledVector(up,Math.max(-halfHeight+6,-62)).addScaledVector(front,42);
   ruler.quaternion.copy(viewer.camera.quaternion).multiply(rulerTurn);
  }
  viewer.renderer.render(viewer.scene,viewer.camera);
  container.dataset.cameraPosition=viewer.camera.position.toArray().map(v=>v.toFixed(2)).join(',');
 }
 function invalidate(){
  dirty=true;
  if(visible&&!frame)frame=requestAnimationFrame(tick);
 }
 function tick(){
  frame=0;
  if(!visible)return;
  const changed=viewer.controls.update();
  if(dirty||changed)draw();
  dirty=false;
  if(changed&&!frame)frame=requestAnimationFrame(tick);
 }
 viewer.controls.addEventListener('change',invalidate);
 new ResizeObserver(invalidate).observe(container);

 const surface=viewer.renderer.domElement;
 const capSeat=viewer.cap.position.clone();
 const picker=new THREE.Raycaster();
 const pointer=new THREE.Vector2();
 const intersection=new THREE.Vector3();
 const reportPosition=()=>{
  const offset=viewer.cap.position.clone().sub(capSeat).toArray();
  container.dataset.capPosition=offset.map(value=>value.toFixed(3)).join(',');
  onCapMove(offset);
  invalidate();
 };
 let capMode='vertical',drag=null;
 surface.tabIndex=0;
 surface.setAttribute('aria-label',container.getAttribute('aria-label'));
 surface.setAttribute('aria-describedby','studioArtStatus studioArtCapHelp');

 function pointerRay(event){
  const rect=surface.getBoundingClientRect();
  pointer.set(2*(event.clientX-rect.left)/rect.width-1,1-2*(event.clientY-rect.top)/rect.height);
  viewer.camera.updateMatrixWorld();
  picker.setFromCamera(pointer,viewer.camera);
 }
 function stopCapDrag(){
  if(!drag)return;
  const {id}=drag;
  drag=null;
  viewer.controls.enabled=true;
  container.classList.remove('studio-cap-drag-active');
  if(surface.hasPointerCapture(id))surface.releasePointerCapture(id);
 }
 function resetCap(){
  stopCapDrag();
  viewer.cap.position.copy(capSeat);
  reportPosition();
 }
 function setCapDistance(value){
  if(capMode==='free'||!Number.isFinite(value))return;
  const distance=THREE.MathUtils.clamp(value,0,40);
  viewer.cap.position.copy(capSeat);
  if(capMode==='rail'){
   // Archived assembly travel, along the model's negative Y axis.
   viewer.cap.position.y-=distance;
  }else{
   viewer.cap.position.z+=distance;
  }
  reportPosition();
 }
 function setCapMode(next){
  if(!['vertical','free','rail'].includes(next))return;
  stopCapDrag();
  capMode=next;
  container.dataset.capMode=next;
  if(next==='free')reportPosition();
  else setCapDistance(next==='rail'?
   capSeat.y-viewer.cap.position.y:viewer.cap.position.z-capSeat.z);
 }

 surface.addEventListener('pointerdown',event=>{
  if(capMode!=='free'||drag||!event.isPrimary||event.button!==0)return;
  pointerRay(event);
  viewer.cap.updateWorldMatrix(true,false);
  const hit=picker.intersectObject(viewer.cap,false)[0];
  if(!hit)return;
  const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(
   viewer.camera.getWorldDirection(new THREE.Vector3()),hit.point);
  drag={id:event.pointerId,plane,grab:hit.point.clone(),position:viewer.cap.position.clone()};
  viewer.controls.enabled=false;
  container.classList.add('studio-cap-drag-active');
  surface.focus({preventScroll:true});
  surface.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopImmediatePropagation();
 },true);
 surface.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  pointerRay(event);
  if(picker.ray.intersectPlane(drag.plane,intersection)){
   viewer.cap.position.copy(drag.position).add(intersection.sub(drag.grab));
   reportPosition();
  }
  event.preventDefault();
  event.stopImmediatePropagation();
 },true);
 for(const type of ['pointerup','pointercancel','lostpointercapture']){
  surface.addEventListener(type,event=>{
   if(!drag||event.pointerId!==drag.id)return;
   stopCapDrag();
   event.stopImmediatePropagation();
  },true);
 }
 surface.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
   event.preventDefault();
   resetCap();
   return;
  }
  if(capMode!=='free'||event.altKey||event.ctrlKey||event.metaKey)return;
  const step=event.shiftKey?5:1;
  const moves={
   ArrowRight:[0,step],ArrowLeft:[0,-step],ArrowUp:[1,step],ArrowDown:[1,-step],
   PageUp:[2,step],PageDown:[2,-step]
  };
  if(!Object.hasOwn(moves,event.key))return;
  const [axis,distance]=moves[event.key];
  const direction=new THREE.Vector3(0,0,1);
  if(axis<2){
   viewer.camera.updateMatrixWorld();
   direction.setFromMatrixColumn(viewer.camera.matrixWorld,axis);
  }
  event.preventDefault();
  viewer.cap.position.addScaledVector(direction,distance);
  reportPosition();
 });
 setCapMode(capMode);

 function reset(){
  viewer.controls.target.set(0,0,93);
  viewer.camera.position.set(235,-470,257);
  viewer.camera.zoom=1;
  viewer.resize();
  viewer.controls.update();
  invalidate();
 }
 reset();
 return{
  setVisible(on){
   visible=on;
   if(on){viewer.resize();invalidate();}
   else stopCapDrag();
  },
  reset,
  setCapMode,
  resetCap,
  setCap:setCapDistance,
  setToothFinish(finish){
   if(!['resin','abs','pla'].includes(finish))return;
   toothFinishes[finish]??=artTooth(finish);
   viewer.tooth.material=toothFinishes[finish];
   container.dataset.toothFinish=finish;
   invalidate();
  },
  async setRuler(on){
   showRuler=on;
   if(on&&!rulerTask)rulerTask=getJSON(rulerURL).then(data=>{
    ruler=cadRuler(data);
    viewer.scene.add(ruler);
   }).catch(error=>{rulerTask=null;throw error;});
   if(on)await rulerTask;
   if(ruler)ruler.visible=showRuler;
   invalidate();
  }
 };
}
