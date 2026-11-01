/* Decode and validate off the UI thread; gzip fallback also supports older Safari. */
importScripts('vendor/fflate-0.8.2.min.js');
const controllers=new Map();
function parse(bytes){const n=new DataView(bytes.buffer,bytes.byteOffset,4).getUint32(0,true),h=JSON.parse(new TextDecoder().decode(bytes.subarray(4,4+n))),base=4+Math.ceil(n/4)*4;
 const types={int16:Int16Array,int8:Int8Array,float32:Float32Array,uint8:Uint8Array,uint32:Uint32Array},mesh={...h,colors:{}};
 for(const [name,s]of Object.entries(h.segments)){const Type=types[s.dtype];if(!Type||s.offset<0||base+s.offset+s.bytes>bytes.length)throw Error('Invalid geometry segment');const a=new Type(bytes.buffer,bytes.byteOffset+base+s.offset,s.bytes/Type.BYTES_PER_ELEMENT);if(name==='natural'||name==='stress')mesh.colors[name]=a;else mesh[name]=a;}
 if(mesh.indices&&mesh.indices.length!==h.triangles*3)throw Error('Incomplete source topology');return mesh;
}
function colors(values,regions,specs){const result={};for(const spec of specs){const rgb=new Uint8Array(values.length*3),lo=spec.log?Math.log(spec.limits[0]):spec.limits[0],range=(spec.log?Math.log(spec.limits[1]):spec.limits[1])-lo;for(let i=0;i<values.length;i++){let value=spec.regionValues?(regions[i]<6?spec.regionValues[regions[i]]:NaN):values[i];const color=Number.isFinite(value)?spec.palette[Math.max(0,Math.min(spec.palette.length-1,Math.round(((spec.log?Math.log(Math.max(value,spec.limits[0])):value)-lo)/range*(spec.palette.length-1))))]:[177,185,191];rgb.set(color,i*3);}result[spec.key]=rgb;}return result;}
onmessage=async e=>{if(e.data.kind==='colors'){const result=colors(e.data.values,e.data.regions,e.data.specs);postMessage({id:e.data.id,result},Object.values(result).map(a=>a.buffer));return;}const {id,url,sha,kind,cancel}=e.data;if(cancel){controllers.get(id)?.abort();return;}const controller=new AbortController();controllers.set(id,controller);let last;
 for(let attempt=0;attempt<3;attempt++)try{
  const r=await fetch(url,{signal:controller.signal,cache:attempt?'reload':'default'});if(!r.ok)throw Error('Download HTTP '+r.status);let bytes=new Uint8Array(await r.arrayBuffer());
  if(sha&&crypto.subtle){const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(digest!==sha)throw Error('Geometry checksum mismatch; retrying source download');}
  if(bytes[0]===31&&bytes[1]===139)bytes=fflate.gunzipSync(bytes);
  const result=kind==='json'?JSON.parse(new TextDecoder().decode(bytes)):parse(bytes);const buffers=new Set();if(kind!=='json'){for(const v of Object.values(result))if(ArrayBuffer.isView(v))buffers.add(v.buffer);for(const v of Object.values(result.colors||{}))if(ArrayBuffer.isView(v))buffers.add(v.buffer);}
  postMessage({id,result},[...buffers]);controllers.delete(id);return;
 }catch(error){last=error;if(error.name==='AbortError')break;if(attempt<2)await new Promise(r=>setTimeout(r,600*(attempt+1)));}
 postMessage({id,error:last?.message||'Geometry download failed'});controllers.delete(id);
};
