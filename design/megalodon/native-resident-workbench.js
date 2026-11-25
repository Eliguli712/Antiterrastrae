import * as THREE from 'three';
export const NATIVE_FACE_COUNT=74293846;

// A complete resident mesh is intentionally different from a pose-dependent
// detail cache: camera motion never selects fewer chunks or changes draw ranges.
export class NativeResident{
 constructor(viewer,geometry,fields,onStatus=()=>{}){
  if(!viewer.gpu)throw Error('Complete resident 3D requires WebGL2');
  if(geometry.triangles!==NATIVE_FACE_COUNT)throw Error('Unexpected native geometry');
  let first=0;for(const chunk of geometry.chunks){if(chunk.source_first_face!==first)throw Error('Native face coverage has a gap or overlap');first+=chunk.triangles;}
  if(first!==NATIVE_FACE_COUNT||fields.chunks.length!==geometry.chunks.length)throw Error('Incomplete native chunk coverage');
  this.started=performance.now();this.view=viewer;this.geometry=geometry;this.fields=fields;this.onStatus=onStatus;this.faces=0;this.drawMode='surface';this.pointSize=2;this.xray=false;this.wireMaterial=new THREE.MeshBasicMaterial({color:0x59b5f5,wireframe:true,side:THREE.DoubleSide,transparent:true,opacity:.7});this.wireMaterial.forceSinglePass=true;this.pointMaterial=new THREE.PointsMaterial({color:0xb0e8ff,size:2,sizeAttenuation:false,transparent:true,opacity:.9});this.enabled=true;this.ready=false;this.generation=0;this.meshes=[];
  this.fieldTicket=0;this.currentFieldKey=null;this.group=new THREE.Group();this.group.visible=false;viewer.toothGroup.add(this.group);
  this.partition={mode:{value:0},height:{value:110.73910524340096},gap:{value:0}};this.partitionMaterials=new WeakSet();this.partitionBases=new WeakMap();this.splitMaterials=new Map();this.savedTransmission=new Map();
  this.savedVisibility=new Map((viewer.meshes||[]).map(m=>[m,m.visible]));this.previousHook=viewer.beforePreview;
  this.hook=()=>{if(this.ready){for(const m of this.savedVisibility.keys())m.visible=false;this.group.visible=viewer.state?.layers?.tooth??true;this.applyGeometryMode();}return this.previousHook?.()||false;};viewer.beforePreview=this.hook;
  this.stats={resident_chunks:0,source_triangles:NATIVE_FACE_COUNT,pose_culling:false,motion_LOD:false,completed:false};
  this.onStatus({state:'waiting',faces:0,total:NATIVE_FACE_COUNT,stats:this.stats});this.load().catch(error=>this.fail(error));
 }
 request(geometry,field,id){
  return new Promise((resolve,reject)=>{
   if(!this.worker){this.worker=new Worker(new URL('./native-resident-workbench-worker.js?v=r13-1',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{const p=this.pending;if(!p)return;this.pending=null;data.error?p.reject(Error(data.error)):p.resolve(data);};this.worker.onerror=e=>{this.pending?.reject(Error(e.message));this.pending=null;};}
   this.pending={resolve,reject};this.worker.postMessage({geometry,field,id});
  });
 }
 add(data){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(data.positions,3));g.setAttribute('normal',new THREE.BufferAttribute(data.normals,3,true));
  if(data.values){const factor=this.view.nativeValueScale??1e-6;if(factor!==1)for(let i=0;i<data.values.length;i++)data.values[i]*=factor;g.setAttribute('nativeValue',new THREE.BufferAttribute(data.values,1));}
  if(data.colors)g.setAttribute('color',new THREE.BufferAttribute(data.colors,3,true));if(data.roughness)g.setAttribute('nativeRoughness',new THREE.BufferAttribute(data.roughness,1,false));
  g.setIndex(new THREE.BufferAttribute(data.indices,1));
  const expected=this.geometry.chunks[data.id];if(g.index.count!==expected.triangles*3||g.attributes.position.count!==expected.vertices)throw Error('Decoded native geometry count mismatch');
  const mesh=new THREE.Mesh(g,this.view.currentToothMaterial?.()||this.view.material);mesh.frustumCulled=false;mesh.userData.nativeChunk=data.id;mesh.userData.nativeFaceCount=expected.triangles;this.meshes.push(mesh);this.group.add(mesh);this.faces+=expected.triangles;this.stats.resident_chunks=this.meshes.length;this.stats.max_resident_chunks=this.meshes.length;
 }
 async load(){
  const generation=++this.generation,initialFields=this.fields;
  for(let id=0;id<this.geometry.chunks.length;id++){
   if(!this.enabled||generation!==this.generation)return;const data=await this.request(this.geometry.chunks[id],initialFields.chunks[id],id);if(!this.enabled||generation!==this.generation)return;
   this.stats.worker_cache=data.cacheStats||{};this.add(data);this.onStatus({state:'refining',faces:this.faces,total:NATIVE_FACE_COUNT,stats:this.stats});await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(this.faces!==NATIVE_FACE_COUNT)throw Error('Full native mesh is incomplete');this.ready=true;this.stats.completed=true;this.stats.elapsed_ms=performance.now()-this.started;this.stats.motion_LOD=false;this.applyGeometryMode();this.group.visible=true;for(const m of this.savedVisibility.keys())m.visible=false;this.view.dirty=true;
  this.currentFieldKey=initialFields.chunks.map(c=>c.sha256).join('|');if(this.fields!==initialFields)await this.setFields(this.fields);this.onStatus({state:'complete',faces:this.faces,total:NATIVE_FACE_COUNT,stats:this.stats});
 }
 async setFields(fields){
  if(!this.enabled)return;this.fields=fields;const ticket=++this.fieldTicket,prior=this.loadingFields;if(prior)await prior;if(!this.enabled||ticket!==this.fieldTicket||!this.ready)return;
  const key=fields.chunks.map(c=>c.sha256).join('|');if(key===this.currentFieldKey)return;const running=this.updateFields(fields);this.loadingFields=running;try{await running;this.currentFieldKey=key;}finally{if(this.loadingFields===running)this.loadingFields=null;}
 }
 async updateFields(fields){
  const generation=this.generation;this.ready=false;this.group.visible=false;for(const[m,visible]of this.savedVisibility)m.visible=visible;
  for(const mesh of this.meshes){
   const id=mesh.userData.nativeChunk,data=await this.request(null,fields.chunks[id],id);this.stats.worker_cache=data.cacheStats||{};if(!this.enabled||generation!==this.generation)return;
   if(data.header.vertices!==mesh.geometry.attributes.position.count)throw Error('Updated field vertex count mismatch');
   if(data.values){const factor=this.view.nativeValueScale??1e-6;if(factor!==1)for(let i=0;i<data.values.length;i++)data.values[i]*=factor;mesh.geometry.setAttribute('nativeValue',new THREE.BufferAttribute(data.values,1));}
   if(data.colors)mesh.geometry.setAttribute('color',new THREE.BufferAttribute(data.colors,3,true));
   if(data.roughness)mesh.geometry.setAttribute('nativeRoughness',new THREE.BufferAttribute(data.roughness,1));
   this.onStatus({state:'refining',faces:this.geometry.chunks.slice(0,id+1).reduce((n,c)=>n+c.triangles,0),total:NATIVE_FACE_COUNT,stats:this.stats});
  }
  this.ready=true;this.group.visible=true;for(const m of this.savedVisibility.keys())m.visible=false;this.view.dirty=true;this.onStatus({state:'complete',faces:NATIVE_FACE_COUNT,total:NATIVE_FACE_COUNT,stats:this.stats});
 }
 setDrawMode(mode,pointSize=2,xray=false){const leavingEdges=['wire','edges'].includes(this.drawMode)&&!['wire','edges'].includes(mode);if(leavingEdges)for(const mesh of this.meshes){mesh.userData.inspector?.points.geometry.dispose();mesh.geometry.dispose();}this.drawMode=mode;this.pointSize=Number(pointSize);this.xray=xray;this.applyGeometryMode();this.view.dirty=true;}
 setPartition(mode='whole',rootward=.76,gap=6){
  this.partition.mode.value={whole:0,crown:1,root:2,separated:3}[mode]??0;
  this.partition.height.value=86.73910524340096+100*(1-Number(rootward));
  this.partition.gap.value=mode==='separated'?Number(gap):0;
  this.stats.geometric_partition={mode,rootward:Number(rootward),display_gap_at_100mm:Number(gap),tissue_boundary:false};
  this.applyGeometryMode();this.view.dirty=true;
 }
 partitionMaterial(material,mode=null,offset=0){
  if(this.partitionMaterials.has(material))return;this.partitionMaterials.add(material);
  const before=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material),p=this.partition;
  this.partitionBases.set(material,{before,key});
  material.onBeforeCompile=function(shader,renderer){before.call(this,shader,renderer);
   Object.assign(shader.uniforms,{nativePartMode:mode===null?p.mode:{value:mode},nativePartHeight:p.height,nativePartGap:p.gap});
   shader.vertexShader='uniform float nativePartHeight; uniform float nativePartGap; varying float nativePartSide;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nnativePartSide=position.z-nativePartHeight;\ntransformed.z+=nativePartGap*'+offset.toFixed(1)+';');
   shader.fragmentShader='uniform float nativePartMode; varying float nativePartSide;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(nativePartMode>0.5&&nativePartMode<1.5&&nativePartSide<0.0)discard;\nif(nativePartMode>1.5&&nativePartMode<2.5&&nativePartSide>=0.0)discard;');
  };material.customProgramCacheKey=()=>key()+'|native-crown-root-r15-v2-'+mode+'-'+offset;material.needsUpdate=true;
 }
 splitPair(source){
  let pair=this.splitMaterials.get(source);if(pair)return pair;
  const base=this.partitionBases.get(source);
  pair=[1,2].map((mode)=>{const m=source.clone();m.onBeforeCompile=base.before;m.customProgramCacheKey=base.key;this.partitionMaterial(m,mode,mode===1?.5:-.5);return m;});
  this.splitMaterials.set(source,pair);return pair;
 }
 applyGeometryMode(){
  // Native mode retains all faces and uses alpha supports, avoiding a duplicate
  // opaque-scene refraction pass. Restore the optical settings on exit.
  this.view.scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m&&m.transmission>0){if(!this.savedTransmission.has(m))this.savedTransmission.set(m,m.transmission);m.transmission=0;m.needsUpdate=true;}});
  const source=this.view.currentToothMaterial?.()||this.view.material,planes=source.clippingPlanes||[],separated=this.partition.mode.value===3;
  for(const material of [source,this.wireMaterial,this.pointMaterial])this.partitionMaterial(material);
  this.wireMaterial.clippingPlanes=planes;this.pointMaterial.clippingPlanes=planes;this.wireMaterial.depthTest=!this.xray;this.pointMaterial.depthTest=!this.xray;this.pointMaterial.size=this.pointSize;
  const surfaces=separated?this.splitPair(source):[],wires=separated?this.splitPair(this.wireMaterial):[],points=separated?this.splitPair(this.pointMaterial):[];
  for(const m of [...surfaces,...wires,...points]){m.clippingPlanes=planes;}
  for(const m of wires){m.depthTest=!this.xray;m.opacity=this.wireMaterial.opacity;}
  for(const m of points){m.depthTest=!this.xray;m.size=this.pointSize;}
  for(const mesh of this.meshes){mesh.material=source;mesh.visible=!separated&&['surface','edges'].includes(this.drawMode);
   if(!mesh.userData.inspector){const holder=new THREE.Group();holder.matrixAutoUpdate=false;const wire=new THREE.Mesh(mesh.geometry,this.wireMaterial);wire.frustumCulled=false;holder.add(wire);const pg=new THREE.BufferGeometry();pg.setAttribute('position',mesh.geometry.getAttribute('position'));const pts=new THREE.Points(pg,this.pointMaterial);pts.frustumCulled=false;holder.add(pts);this.group.add(holder);mesh.userData.inspector={holder,wire,points:pts};}
   const o=mesh.userData.inspector;o.wire.visible=!separated&&['wire','edges'].includes(this.drawMode);o.points.visible=!separated&&this.drawMode==='vertices';
   if(separated&&!o.parts){o.parts=[0,1].map(i=>{const surface=new THREE.Mesh(mesh.geometry,surfaces[i]),wire=new THREE.Mesh(mesh.geometry,wires[i]),pts=new THREE.Points(o.points.geometry,points[i]);for(const x of [surface,wire,pts]){x.frustumCulled=false;o.holder.add(x);}return{surface,wire,points:pts};});}
   for(let i=0;i<(o.parts?.length||0);i++){let part=o.parts[i];if(separated){part.surface.material=surfaces[i];part.wire.material=wires[i];part.points.material=points[i];}part.surface.visible=separated&&['surface','edges'].includes(this.drawMode);part.wire.visible=separated&&['wire','edges'].includes(this.drawMode);part.points.visible=separated&&this.drawMode==='vertices';}
  }
 }
 fail(error){if(!this.enabled)return;this.dispose();this.onStatus({state:'error',faces:0,total:NATIVE_FACE_COUNT,message:String(error.message||error),stats:this.stats});}
 dispose(){
  if(!this.enabled)return;this.enabled=false;this.ready=false;this.generation++;this.pending?.reject(new DOMException('Stopped','AbortError'));this.pending=null;this.worker?.terminate();
  this.group.removeFromParent();for(const[m,t]of this.savedTransmission){m.transmission=t;m.needsUpdate=true;}this.savedTransmission.clear();for(const mesh of this.meshes){mesh.userData.inspector?.points.geometry.dispose();mesh.geometry.dispose();}for(const pair of this.splitMaterials.values())for(const m of pair)m.dispose();this.splitMaterials.clear();this.wireMaterial.dispose();this.pointMaterial.dispose();this.meshes=[];for(const[m,visible]of this.savedVisibility)m.visible=visible;
  if(this.view.beforePreview===this.hook)this.view.beforePreview=this.previousHook;this.view.dirty=true;
 }
}
