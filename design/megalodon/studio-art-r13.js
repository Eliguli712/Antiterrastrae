import * as THREE from 'three';

// This appearance is deliberately scoped to the studio's Art display. The
// original image is delivered byte-for-byte; numerical materials stay separate.
const $=id=>document.getElementById(id);
const words={
 artDisplay:['Art display','Kunstansicht','Καλλιτεχνική προβολή'],
 artOriginal:['Original render','Originaldarstellung','Αρχική απόδοση'],
 artInteractive:['Interactive 3D','Interaktives 3D','Διαδραστικό 3D'],
 artDownload:['Download original image','Originalbild herunterladen','Λήψη αρχικής εικόνας'],
 artCaption:['Glass / cobalt · original artist render','Glas / Kobalt · Originaldarstellung','Γυαλί / κοβάλτιο · αρχική απόδοση'],
 artGesture:['Glass / cobalt · drag to rotate; pinch to zoom','Glas / Kobalt · ziehen zum Drehen; zum Zoomen aufziehen','Γυαλί / κοβάλτιο · σύρετε για περιστροφή, τσιμπήστε για μεγέθυνση'],
 artViewLabel:['Original glass and cobalt tooth artwork','Originalkunstwerk aus Glas und Kobalt','Αρχικό έργο δοντιού από γυαλί και κοβάλτιο']
};
const state={enabled:false,render:'reference',viewer:null,snapshot:null};
function text(key){return window.designI18n?.t(key)||words[key]?.[0]||key;}
function register(){window.designI18n?.register(words);for(const e of document.querySelectorAll('[data-studio-art-text]'))e.textContent=text(e.dataset.studioArtText);}
const artButton=document.createElement('button');
artButton.id='editionArt';artButton.type='button';artButton.dataset.studioArtText='artDisplay';artButton.setAttribute('aria-pressed','false');
document.querySelector('.edition-tabs').append(artButton);
const original=document.createElement('figure');
original.className='studio-art-reference';original.id='studioArtReference';original.hidden=true;
const referenceImage=document.createElement('img');
referenceImage.src=new URL('./assets/studio-art-r13/artist-reference.png',import.meta.url).href;
referenceImage.width=1700;referenceImage.height=1850;referenceImage.decoding='async';referenceImage.alt='Glass and cobalt megalodon tooth on its clear resin frame, original supplied render';
original.append(referenceImage);$('viewer').append(original);
const actions=document.createElement('div');actions.className='studio-art-actions';actions.hidden=true;
for(const [render,key]of [['reference','artOriginal'],['interactive','artInteractive']]){
 const button=document.createElement('button');button.type='button';button.dataset.artRender=render;button.dataset.studioArtText=key;button.setAttribute('aria-pressed',String(render==='reference'));button.addEventListener('click',()=>setRender(render));actions.append(button);
}
const download=document.createElement('a');download.href=referenceImage.src;download.download='Astraeus_Krystallisia_Glass_Cobalt_Original.png';download.dataset.studioArtText='artDownload';actions.append(download);
document.querySelector('.field-controls').before(actions);
const hint=document.querySelector('.gesture-hint'),defaultHint=hint.textContent;

function makeToothMaterial(){
 const material=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.19,metalness:.035,transmission:.12,thickness:1.2,ior:1.49,clearcoat:1,clearcoatRoughness:.065,envMapIntensity:1.15,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float artHeight;').replace('#include <begin_vertex>','#include <begin_vertex>\nartHeight=position.z;');
  const root=new THREE.Color('#07141d'),blue=new THREE.Color('#48529f'),cyan=new THREE.Color('#389cb9');
  const glsl=c=>`vec3(${c.r.toFixed(8)},${c.g.toFixed(8)},${c.b.toFixed(8)})`;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float artHeight;').replace('#include <color_fragment>',`#include <color_fragment>\nfloat h=clamp((artHeight-86.73910524340096)/100.0,0.0,1.0);\nvec3 enamel=mix(${glsl(blue)},${glsl(cyan)},smoothstep(.40,1.,h));\ndiffuseColor.rgb*=mix(${glsl(root)},enamel,smoothstep(.35,.48,h));`);
 };
 return material;
}
function applyArt(v){
 if(state.snapshot||!v?.tooth?.material||!v?.main||!v?.cap)return;
 state.snapshot={tooth:v.tooth.material,main:v.main.material,cap:v.cap.material,background:v.scene.background,exposure:v.renderer?.toneMappingExposure,planes:[],lights:[]};
 const snap=state.snapshot;
 v.scene.traverse(o=>{if(o.isMesh&&o.geometry?.type==='PlaneGeometry'){snap.planes.push({object:o,material:o.material,visible:o.visible});o.visible=false;}if(o.isLight){snap.lights.push({object:o,intensity:o.intensity});o.intensity=o.isHemisphereLight?.35:.95;}});
 state.artTooth=makeToothMaterial();
 state.artGlass=new THREE.MeshPhysicalMaterial({color:0xa9c1ce,roughness:.065,metalness:0,transmission:.96,thickness:6.4,ior:1.49,clearcoat:1,clearcoatRoughness:.045,envMapIntensity:.65,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide});
 v.tooth.material=state.artTooth;v.main.material=state.artGlass;v.cap.material=state.artGlass;
 if(v.renderer)v.renderer.toneMappingExposure=.85;
 const canvas=document.createElement('canvas');canvas.width=4;canvas.height=512;
 const context=canvas.getContext('2d'),gradient=context.createLinearGradient(0,0,0,512);
 gradient.addColorStop(0,'#070d10');gradient.addColorStop(.45,'#14232b');gradient.addColorStop(1,'#3c535f');context.fillStyle=gradient;context.fillRect(0,0,4,512);
 state.artBackground=new THREE.CanvasTexture(canvas);state.artBackground.colorSpace=THREE.SRGBColorSpace;v.scene.background=state.artBackground;
 v.home?.();
 if(v.camera&&v.controls){v.controls.target.set(0,0,93);v.camera.position.set(235,-470,257);v.camera.zoom=1;v.controls.update();v.resize?.();}
}
function restore(v){
 const s=state.snapshot;if(!s||!v)return;
 v.tooth.material=s.tooth;v.main.material=s.main;v.cap.material=s.cap;
 v.scene.background=s.background;if(v.renderer&&s.exposure!==undefined)v.renderer.toneMappingExposure=s.exposure;
 for(const {object,material,visible}of s.planes){object.material=material;object.visible=visible;}
 for(const {object,intensity}of s.lights)object.intensity=intensity;
 state.artTooth?.dispose();state.artGlass?.dispose();state.artBackground?.dispose();state.artTooth=null;state.artGlass=null;state.artBackground=null;state.snapshot=null;
}
function refresh(){
 document.body.dataset.studioArt=String(state.enabled);
 artButton.classList.toggle('active',state.enabled);artButton.setAttribute('aria-pressed',String(state.enabled));actions.hidden=!state.enabled;
 original.hidden=!(state.enabled&&state.render==='reference');
 for(const b of actions.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.artRender===state.render));
 for(const b of document.querySelectorAll('.camera-pills button'))b.classList.toggle('studio-art-camera-inactive',state.enabled&&state.render==='reference');
 if(state.enabled){hint.textContent=text(state.render==='reference'?'artCaption':'artGesture');for(const b of [$('editionField'),$('editionHigh')]){b.classList.remove('active');b.setAttribute('aria-pressed','false');}}
 else hint.textContent=window.designI18n?.t('gestureHint')||defaultHint;
 const interactive=actions.querySelector('[data-art-render=interactive]');interactive.disabled=!state.viewer?.renderer;
 register();
}
function enable(){state.enabled=true;state.render='reference';if(state.viewer){state.viewer.setMode('material');applyArt(state.viewer);}$('stressLegend').classList.add('hidden');refresh();}
function disable(){if(!state.enabled)return;restore(state.viewer);state.enabled=false;refresh();}
function setRender(mode){if(!state.enabled)return;if(mode==='interactive'&&!state.viewer?.renderer)return;state.render=mode;refresh();}
artButton.addEventListener('click',enable);
const editionObserver=new MutationObserver(()=>{
 if(!state.enabled)return;
 for(const button of [$('editionField'),$('editionHigh')]){
  if(button.classList.contains('active'))button.classList.remove('active');
  if(button.getAttribute('aria-pressed')!=='false')button.setAttribute('aria-pressed','false');
 }
});
editionObserver.observe(document.querySelector('.edition-tabs'),{subtree:true,attributes:true,attributeFilter:['class','aria-pressed']});
for(const id of ['editionField','editionHigh'])$(id).addEventListener('click',disable,{capture:true});
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',disable,{capture:true});
for(const button of document.querySelectorAll('[data-camera]'))button.addEventListener('click',()=>{if(state.enabled)setRender('interactive');},{capture:true});
for(const id of ['rootView','homeView','projection','assemblyClosed','assemblyOpen'])$(id)?.addEventListener('click',()=>{if(state.enabled)setRender('interactive');},{capture:true});
$('openCap').addEventListener('input',()=>{if(state.enabled)setRender('interactive');},{capture:true});
function connect(){const v=window.__designViewer;if(!v||v===state.viewer)return;state.viewer=v;if(state.enabled){v.setMode('material');applyArt(v);}refresh();}
window.addEventListener('design-viewer-ready',connect);
window.addEventListener('design-language-changed',()=>{register();refresh();});
connect();register();refresh();
if(new URLSearchParams(location.search).get('appearance')==='art')enable();
