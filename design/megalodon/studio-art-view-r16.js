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

function artTooth(){
 // These are the original studio Art display colours and material parameters.
 const material=new THREE.MeshPhysicalMaterial({
  color:0xffffff,roughness:.19,metalness:.035,transmission:.12,thickness:1.2,
  ior:1.49,clearcoat:1,clearcoatRoughness:.065,envMapIntensity:1.15,side:THREE.DoubleSide
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

export async function mountStudioArt(container){
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
 viewer.tooth.material=artTooth();
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
  },
  reset,
  setCap(distance){viewer.openCap(distance);invalidate();},
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
