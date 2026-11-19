import * as THREE from 'three';
export const NATIVE_POLICY=Object.freeze({resident_source_chunks:1,workers:1,max_target_pixels:1800000,max_transport_bytes:24*1024*1024,max_decoded_chunk_bytes:48*1024*1024,idle_delay_ms:450});
export function targetDimensions(width,height,dpr=1){const ratio=Math.min(dpr,1.4,Math.sqrt(NATIVE_POLICY.max_target_pixels/Math.max(1,width*height)));return[Math.max(1,Math.floor(width*ratio)),Math.max(1,Math.floor(height*ratio))];}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class NativeRefinement{
 constructor(viewer,geometry,fields,onStatus=()=>{}){
  if(!viewer.gpu)throw Error('Native refinement requires WebGL2');
  this.view=viewer;this.geometry=geometry;this.fields=fields;this.onStatus=onStatus;this.enabled=true;this.generation=0;this.faces=0;this.ready=false;this.lastMotion=performance.now();this.stats={resident_chunks:0,max_resident_chunks:0,loaded_faces:0,max_source_buffer_bytes:0,...NATIVE_POLICY};
  this.scene=new THREE.Scene();this.group=new THREE.Group();this.scene.add(this.group);for(const o of viewer.scene.children)if(o.isLight)this.scene.add(o.clone());this.scene.environment=viewer.scene.environment;
  this.displayScene=new THREE.Scene();this.displayCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);this.displayMaterial=new THREE.MeshBasicMaterial({depthTest:false,depthWrite:false,toneMapped:false});this.displayQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.displayMaterial);this.displayScene.add(this.displayQuad);
  this.worker=new Worker(new URL('./native-stream-worker-r8.js',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{if(this.pending&&data.generation===this.pending.generation){const p=this.pending;this.pending=null;data.error?p.reject(Error(data.error)):p.resolve(data);}};this.worker.onerror=e=>this.fail(Error(e.message));
  this.previousHook=viewer.beforePreview;viewer.beforePreview=()=>{this.previousHook?.();this.invalidate();};
  this.timer=setInterval(()=>{if(this.enabled&&!this.running&&!this.ready&&performance.now()-this.lastMotion>NATIVE_POLICY.idle_delay_ms)this.refine();},120);
  this.onVisibility=()=>{if(document.hidden)this.invalidate();};document.addEventListener('visibilitychange',this.onVisibility);
  this.onStatus({state:'waiting',faces:0,total:geometry.triangles,policy:NATIVE_POLICY});
 }
 setFields(fields){this.fields=fields;this.invalidate();}
 invalidate(){if(!this.enabled)return;this.lastMotion=performance.now();this.ready=false;this.generation++;this.worker.postMessage({type:'abort'});if(this.pending){this.pending.reject(new DOMException('Camera changed','AbortError'));this.pending=null;}this.onStatus({state:'interactive',faces:this.view.faces,total:this.geometry.triangles,policy:NATIVE_POLICY});}
 request(chunk,field,generation,id){return new Promise((resolve,reject)=>{this.pending={resolve,reject,generation};this.worker.postMessage({type:'load',chunk,field,generation,id});});}
 makeMesh(data){const g=new THREE.BufferGeometry();let bytes=0;for(const[name,array,size,normalized]of [['position',data.positions,3,false],['normal',data.normals,3,true],['nativeValue',data.values,1,false]]){if(name==='nativeValue')for(let i=0;i<array.length;i++)array[i]/=1e6;bytes+=array.byteLength;const a=new THREE.BufferAttribute(array,size,normalized);a.onUpload(()=>a.array=null);g.setAttribute(name,a);}bytes+=data.indices.byteLength;const index=new THREE.BufferAttribute(data.indices,1);index.onUpload(()=>index.array=null);g.setIndex(index);const mesh=new THREE.Mesh(g,this.view.currentToothMaterial?.()||this.view.material);mesh.frustumCulled=false;this.stats.resident_chunks++;this.stats.max_resident_chunks=Math.max(this.stats.max_resident_chunks,this.stats.resident_chunks);this.stats.max_source_buffer_bytes=Math.max(this.stats.max_source_buffer_bytes,bytes);if(this.stats.resident_chunks>1)throw Error('Native residency budget exceeded');return mesh;}
 releaseMesh(mesh){if(!mesh)return;this.group.remove(mesh);mesh.geometry.dispose();this.stats.resident_chunks=Math.max(0,this.stats.resident_chunks-1);}
 async finishGpu(){const gl=this.view.renderer.getContext();if(!gl.fenceSync){gl.finish();return;}const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();try{for(let i=0;i<250;i++){const state=gl.clientWaitSync(fence,0,0);if(state===gl.ALREADY_SIGNALED||state===gl.CONDITION_SATISFIED)return;if(state===gl.WAIT_FAILED)throw Error('Native GPU synchronization failed');await pause(4);}throw Error('Native GPU did not release the current chunk');}finally{gl.deleteSync(fence);}}
 dimensions(){return targetDimensions(this.view.el.clientWidth,this.view.el.clientHeight,devicePixelRatio);}
 present(){const r=this.view.renderer;r.setRenderTarget(null);r.autoClear=true;r.render(this.displayScene,this.displayCamera);this.view.onCamera?.();}
 async refine(){
  if(this.running||!this.enabled||document.hidden)return;this.running=true;const generation=this.generation;let mesh;const r=this.view.renderer,previousAuto=r.autoClear;
  try{const[w,h]=this.dimensions();if(!this.target||this.target.width!==w||this.target.height!==h){this.target?.dispose();this.target=new THREE.WebGLRenderTarget(w,h,{depthBuffer:true,stencilBuffer:false,type:THREE.UnsignedByteType,samples:0});this.displayMaterial.map=this.target.texture;this.displayMaterial.needsUpdate=true;}
   this.view.toothGroup.updateMatrixWorld(true);this.group.matrixAutoUpdate=false;this.group.matrix.copy(this.view.toothGroup.matrixWorld);this.group.matrixWorldNeedsUpdate=true;this.scene.environment=this.view.scene.environment;
   r.setRenderTarget(this.target);r.setClearColor(0x000000,0);r.clear(true,true,true);r.setRenderTarget(null);this.faces=0;
   for(let id=0;id<this.geometry.chunks.length;id++){
    if(generation!==this.generation||!this.enabled)return;const data=await this.request(this.geometry.chunks[id],this.fields.chunks[id],generation,id);if(generation!==this.generation||!this.enabled)return;
    mesh=this.makeMesh(data);this.group.add(mesh);r.setRenderTarget(this.target);r.autoClear=false;r.render(this.scene,this.view.camera);r.setRenderTarget(null);await this.finishGpu();this.releaseMesh(mesh);mesh=null;this.faces+=data.header.triangles;this.stats.loaded_faces=this.faces;this.onStatus({state:'refining',faces:this.faces,total:this.geometry.triangles,policy:NATIVE_POLICY,stats:this.stats});await pause(0);
   }
   if(generation!==this.generation||!this.enabled)return;if(this.faces!==this.geometry.triangles||this.faces!==74293846)throw Error('Incomplete native source render');
   const visible=this.view.meshes.map(o=>o.visible);this.view.meshes.forEach(o=>o.visible=false);try{r.setRenderTarget(this.target);r.autoClear=false;r.render(this.view.scene,this.view.camera);}finally{this.view.meshes.forEach((o,i)=>o.visible=visible[i]);r.setRenderTarget(null);}await this.finishGpu();
   if(generation!==this.generation||!this.enabled)return;this.ready=true;this.present();this.onStatus({state:'complete',faces:this.faces,total:this.geometry.triangles,policy:NATIVE_POLICY,stats:this.stats});
  }catch(error){if(error.name!=='AbortError'&&generation===this.generation)this.fail(error);}finally{this.releaseMesh(mesh);r.setRenderTarget(null);r.autoClear=previousAuto;this.running=false;}
 }
 fail(error){this.onStatus({state:'error',message:String(error.message||error),policy:NATIVE_POLICY});this.dispose();this.view.dirty=true;}
 dispose(){if(!this.enabled)return;this.enabled=false;this.generation++;clearInterval(this.timer);this.worker.terminate();this.pending?.reject(new DOMException('Stopped','AbortError'));this.pending=null;this.target?.dispose();this.displayQuad.geometry.dispose();this.displayMaterial.dispose();this.view.beforePreview=this.previousHook;document.removeEventListener('visibilitychange',this.onVisibility);this.view.dirty=true;}
}
