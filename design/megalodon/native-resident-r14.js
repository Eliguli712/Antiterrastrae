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
  this.view=viewer;this.geometry=geometry;this.fields=fields;this.onStatus=onStatus;this.faces=0;this.enabled=true;this.ready=false;this.generation=0;this.meshes=[];
  this.group=new THREE.Group();this.group.visible=false;viewer.toothGroup.add(this.group);
  this.savedVisibility=new Map((viewer.meshes||[]).map(m=>[m,m.visible]));this.previousHook=viewer.beforePreview;
  this.hook=()=>{if(this.ready){for(const m of this.savedVisibility.keys())m.visible=false;this.group.visible=viewer.state?.layers?.tooth??true;const material=viewer.currentToothMaterial?.()||viewer.material;for(const m of this.meshes)m.material=material;}return this.previousHook?.()||false;};viewer.beforePreview=this.hook;
  this.stats={resident_chunks:0,source_triangles:NATIVE_FACE_COUNT,pose_culling:false,motion_LOD:false,completed:false};
  this.onStatus({state:'waiting',faces:0,total:NATIVE_FACE_COUNT,stats:this.stats});this.load().catch(error=>this.fail(error));
 }
 request(geometry,field,id){
  return new Promise((resolve,reject)=>{
   if(!this.worker){this.worker=new Worker(new URL('./native-resident-worker-r14.js?v=1',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{const p=this.pending;if(!p)return;this.pending=null;data.error?p.reject(Error(data.error)):p.resolve(data);};this.worker.onerror=e=>{this.pending?.reject(Error(e.message));this.pending=null;};}
   this.pending={resolve,reject};this.worker.postMessage({geometry,field,id});
  });
 }
 add(data){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(data.positions,3));g.setAttribute('normal',new THREE.BufferAttribute(data.normals,3,true));
  if(data.values){const factor=this.view.nativeValueScale??1e-6;if(factor!==1)for(let i=0;i<data.values.length;i++)data.values[i]*=factor;g.setAttribute('nativeValue',new THREE.BufferAttribute(data.values,1));}
  if(data.colors)g.setAttribute('color',new THREE.BufferAttribute(data.colors,3,true));if(data.roughness)g.setAttribute('nativeRoughness',new THREE.BufferAttribute(data.roughness,1,false));
  g.setIndex(new THREE.BufferAttribute(data.indices,1));
  const expected=this.geometry.chunks[data.id];if(g.index.count!==expected.triangles*3||g.attributes.position.count!==expected.vertices)throw Error('Decoded native geometry count mismatch');
  const mesh=new THREE.Mesh(g,this.view.currentToothMaterial?.()||this.view.material);mesh.frustumCulled=false;mesh.userData.nativeChunk=data.id;mesh.userData.nativeFaceCount=expected.triangles;this.meshes.push(mesh);this.group.add(mesh);this.faces+=expected.triangles;this.stats.resident_chunks=this.meshes.length;
 }
 async load(){
  const generation=++this.generation,fields=this.fields;
  for(let id=0;id<this.geometry.chunks.length;id++){
   if(!this.enabled||generation!==this.generation)return;const data=await this.request(this.geometry.chunks[id],fields.chunks[id],id);if(!this.enabled||generation!==this.generation)return;
   this.add(data);this.onStatus({state:'refining',faces:this.faces,total:NATIVE_FACE_COUNT,stats:this.stats});await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(this.faces!==NATIVE_FACE_COUNT)throw Error('Full native mesh is incomplete');this.ready=true;if(this.fields!==fields){await this.updateFields(this.fields);return;}this.stats.completed=true;this.group.visible=true;for(const m of this.savedVisibility.keys())m.visible=false;this.view.dirty=true;
  this.onStatus({state:'complete',faces:this.faces,total:NATIVE_FACE_COUNT,stats:this.stats});
 }
 async setFields(fields){
  if(!this.enabled)return;await this.loadingFields;this.fields=fields;if(!this.ready)return;
  this.loadingFields=this.updateFields(fields);try{await this.loadingFields;}catch(error){this.fail(error);}finally{this.loadingFields=null;}
 }
 async updateFields(fields){
  const generation=this.generation;this.ready=false;this.group.visible=false;for(const[m,visible]of this.savedVisibility)m.visible=visible;
  for(const mesh of this.meshes){
   const id=mesh.userData.nativeChunk,data=await this.request(null,fields.chunks[id],id);if(!this.enabled||generation!==this.generation)return;
   if(data.header.vertices!==mesh.geometry.attributes.position.count)throw Error('Updated field vertex count mismatch');
   if(data.values){const factor=this.view.nativeValueScale??1e-6;if(factor!==1)for(let i=0;i<data.values.length;i++)data.values[i]*=factor;this.replaceAttribute(mesh.geometry,'nativeValue',data.values,1,false);}
   if(data.colors)this.replaceAttribute(mesh.geometry,'color',data.colors,3,true);
   if(data.roughness)this.replaceAttribute(mesh.geometry,'nativeRoughness',data.roughness,1,false);
   this.onStatus({state:'refining',faces:this.geometry.chunks.slice(0,id+1).reduce((n,c)=>n+c.triangles,0),total:NATIVE_FACE_COUNT,stats:this.stats});
  }
  this.ready=true;this.group.visible=true;for(const m of this.savedVisibility.keys())m.visible=false;this.view.dirty=true;this.onStatus({state:'complete',faces:NATIVE_FACE_COUNT,total:NATIVE_FACE_COUNT,stats:this.stats});
 }
 replaceAttribute(geometry,name,array,itemSize,normalized){const old=geometry.getAttribute(name);if(old&&old.array.constructor===array.constructor&&old.array.length===array.length){old.array.set(array);old.needsUpdate=true;}else geometry.setAttribute(name,new THREE.BufferAttribute(array,itemSize,normalized));}
 fail(error){if(!this.enabled)return;this.dispose();this.onStatus({state:'error',faces:0,total:NATIVE_FACE_COUNT,message:String(error.message||error),stats:this.stats});}
 dispose(){
  if(!this.enabled)return;this.enabled=false;this.ready=false;this.generation++;this.pending?.reject(new DOMException('Stopped','AbortError'));this.pending=null;this.worker?.terminate();
  this.group.removeFromParent();for(const mesh of this.meshes)mesh.geometry.dispose();this.group.clear();this.meshes=[];for(const[m,visible]of this.savedVisibility)m.visible=visible;
  if(this.view.beforePreview===this.hook)this.view.beforePreview=this.previousHook;this.view.dirty=true;
 }
}
