import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {NativeRefinement,targetDimensions} from '../native-refinement-r8.js';
import {NativeViewer} from '../native74-viewer.js';
import {fieldColour,TOOTH_LO,TOOTH_HI} from '../field-colours-r7.js';
import {fieldColor as originalColour} from '../stress-palette.js';

const [geometryDirectory,fieldDirectory,metadataDirectory,output]=process.argv.slice(2);
assert.ok(output,'Pass geometry, field, metadata directories and an output audit path');
const geometry=JSON.parse(await fs.readFile(path.join(geometryDirectory,'geometry.json'),'utf8'));
geometry.chunks=geometry.chunks.map(c=>({...c,url:path.join(geometryDirectory,path.basename(c.url))}));
const palette=JSON.parse(await fs.readFile(new URL('../assets/native74-r5/palette.json',import.meta.url),'utf8'));
function decode(buffer){const bytes=zlib.gunzipSync(buffer),n=bytes.readUInt32LE(0),header=JSON.parse(bytes.subarray(4,4+n)),offset=4+Math.ceil(n/4)*4,out={};for(const[k,s]of Object.entries(header.segments)){const Type={float32:Float32Array,int8:Int8Array,uint32:Uint32Array}[s.dtype];out[k]=new Type(bytes.buffer.slice(bytes.byteOffset+offset+s.offset,bytes.byteOffset+offset+s.offset+s.bytes));}return{header,out};}

// Reproduce Three.js projectObject order: upload first, sort/bounds second.
const old=new THREE.BufferGeometry();const oldPosition=new THREE.BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3);oldPosition.onUpload(()=>oldPosition.array=null);old.setAttribute('position',oldPosition);oldPosition.onUploadCallback();assert.throws(()=>old.computeBoundingSphere(),TypeError);old.dispose();
let active=0,maxActive=0;
class FileWorker{postMessage(message){if(message.type==='abort')return;active++;maxActive=Math.max(maxActive,active);setImmediate(async()=>{try{const g=decode(await fs.readFile(message.chunk.url)),f=decode(await fs.readFile(message.field.url));assert.equal(g.header.vertices,f.header.vertices);active--;this.onmessage({data:{...g.out,...f.out,header:g.header,id:message.id,generation:message.generation}});}catch(e){active--;this.onerror(e);}});}terminate(){}}
globalThis.Worker=FileWorker;globalThis.devicePixelRatio=3;globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
class Renderer{
 constructor({interrupt=false,onDraw}={}){this.autoClear=true;this.draws=0;this.reads=0;this.interrupt=interrupt;this.onDraw=onDraw;}
 setRenderTarget(){}setClearColor(){}clear(){}getContext(){return{finish(){}};}
 render(scene){const meshes=[];scene.traverse(o=>{if(o.isMesh&&o.geometry.getAttribute('nativeValue'))meshes.push(o);});assert.ok(meshes.length<=1,'Only one source chunk may be resident');for(const mesh of meshes){const g=mesh.geometry;for(const a of [...Object.values(g.attributes),g.index])a.onUploadCallback();
   // Re-read actual uploaded arrays, including a repeated/transmission pass.
   for(let pass=0;pass<2;pass++){g.boundingSphere=null;g.computeBoundingSphere();assert.ok(Number.isFinite(g.boundingSphere.radius));g.computeBoundingBox();assert.ok(Number.isFinite(g.boundingBox.min.x));assert.ok(Number.isFinite(g.attributes.position.getX(0)));assert.ok(Number.isFinite(g.index.getX(0)));this.reads++;}
   this.draws++;this.onDraw?.();if(this.interrupt)throw Error('Simulated renderer interruption');
  }}
}
function view(renderer){return{gpu:true,faces:247031,el:{clientWidth:1300,clientHeight:700},renderer,scene:new THREE.Scene(),toothGroup:new THREE.Group(),meshes:[],camera:new THREE.OrthographicCamera(),material:new THREE.MeshStandardMaterial()};}
async function fields(size){const f=JSON.parse(await fs.readFile(path.join(metadataDirectory,`${size}mm-field.json`),'utf8'));f.chunks=f.chunks.map(c=>({...c,url:path.join(fieldDirectory,path.basename(c.url))}));return f;}
const cases=[];
for(const size of [50,100]){let completed=false,error;const r=new Renderer(),v=view(r);const native=new NativeRefinement(v,geometry,await fields(size),s=>{if(s.state==='complete')completed=true;if(s.state==='error')error=s.message;});clearInterval(native.timer);await native.refine();assert.equal(error,undefined);assert.equal(completed,true);assert.equal(r.draws,75);assert.equal(native.faces,74293846);assert.equal(native.stats.max_resident_chunks,1);assert.equal(native.stats.resident_chunks,0);assert.equal(native.group.children.length,0);cases.push({size_mm:size,source_faces:native.faces,source_chunks:r.draws,post_upload_bounds_passes:r.reads,maximum_resident_chunks:native.stats.max_resident_chunks,largest_source_bytes:native.stats.max_source_buffer_bytes});native.dispose();}

const f=await fields(100);let interruptState;
const failing=new NativeRefinement(view(new Renderer({interrupt:true})),geometry,f,s=>{if(s.state==='error')interruptState={message:s.message,enabled:failing.enabled};});clearInterval(failing.timer);await failing.refine();assert.equal(interruptState.enabled,false);assert.equal(failing.group.children.length,0);assert.equal(failing.stats.resident_chunks,0);
let stopped=false,cancelled;const cancelRenderer=new Renderer({onDraw(){if(!stopped){stopped=true;cancelled.invalidate();}}});cancelled=new NativeRefinement(view(cancelRenderer),geometry,f);clearInterval(cancelled.timer);await cancelled.refine();assert.equal(cancelled.ready,false);assert.equal(cancelled.stats.resident_chunks,0);assert.equal(cancelled.group.children.length,0);cancelled.dispose();

// The interactive GPU preview follows the same array-lifetime rule.
const first=decode(await fs.readFile(geometry.chunks[0].url)),scalar=decode(await fs.readFile(f.chunks[0].url));const preview={material:new THREE.MeshStandardMaterial(),toothGroup:new THREE.Group(),meshes:[],faces:0};NativeViewer.prototype.add.call(preview,{...first.out,...scalar.out,header:first.header,id:0});for(const mesh of preview.meshes){const g=mesh.geometry;for(const a of [...Object.values(g.attributes),g.index])a.onUploadCallback();g.boundingSphere=null;g.computeBoundingSphere();assert.ok(Number.isFinite(g.boundingSphere.radius));g.dispose();}
for(let i=0;i<=1024;i++){const value=TOOTH_LO+(TOOTH_HI-TOOTH_LO)*i/1024,a=fieldColour(value,palette,{mode:'linear'}),b=originalColour(value,{mode:'field',min:TOOTH_LO,max:TOOTH_HI,threshold:0});assert.ok(a.every((v,k)=>Math.abs(v-b[k])<1e-9));}
for(const[w,h,dpr]of[[430,932,3],[390,844,3],[3840,2160,2],[1300,700,3]]){const[a,b]=targetDimensions(w,h,dpr);assert.ok(a*b<=1800000);}
assert.equal(maxActive,1);
const audit={revision:'R9',original_null_array_failure_reproduced:true,real_three_post_upload_bounds_test:true,preview_post_upload_bounds_test:true,cases,camera_cancellation_releases_source:true,error_status_reports_disabled_controller:true,original_linear_turbo_comparison_samples:1025,original_linear_turbo_comparison:'exact within 1e-9 RGB units',maximum_pending_source_requests:maxActive,render_target_pixel_budget:1800000,method:'Real geometry and scalar chunks through the native controller, Three.js upload callbacks and bounds; renderer adapter, not a GPU image test',gpu_visual_execution_tested:false};await fs.writeFile(output,JSON.stringify(audit,null,2)+'\n');process.stdout.write(JSON.stringify(audit)+'\n');
