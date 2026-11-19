const TYPES={float32:Float32Array,int8:Int8Array,uint32:Uint32Array};
let current;
async function decode(url,hash,signal){
 const response=await fetch(url,{signal,cache:'force-cache'});if(!response.ok)throw Error('Native source HTTP '+response.status);
 let bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>24*1024*1024)throw Error('Native transport exceeds one-chunk budget');
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(actual!==hash)throw Error('Native source checksum mismatch');
 if(bytes[0]===31&&bytes[1]===139)bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 if(bytes.byteLength>48*1024*1024)throw Error('Decoded native chunk exceeds budget');
 const length=new DataView(bytes.buffer,bytes.byteOffset,4).getUint32(0,true),header=JSON.parse(new TextDecoder().decode(bytes.subarray(4,4+length))),offset=4+Math.ceil(length/4)*4,out={};
 for(const[name,segment]of Object.entries(header.segments)){const Type=TYPES[segment.dtype];if(!Type)throw Error('Unsupported native scalar type');const start=offset+segment.offset;out[name]=new Type(bytes.buffer.slice(bytes.byteOffset+start,bytes.byteOffset+start+segment.bytes));}
 return{header,out};
}
let queued=null,working=false;
async function pump(){if(working)return;working=true;while(queued){const data=queued;queued=null;const controller=current=new AbortController();try{const geometry=await decode(data.chunk.url,data.chunk.sha256,controller.signal);if(controller.signal.aborted)continue;const field=await decode(data.field.url,data.field.sha256,controller.signal);if(geometry.header.vertices!==field.header.vertices||geometry.header.triangles!==data.chunk.triangles)throw Error('Native geometry / field registration mismatch');const arrays={...geometry.out,...field.out};if(!controller.signal.aborted)postMessage({id:data.id,generation:data.generation,header:geometry.header,...arrays},Object.values(arrays).map(v=>v.buffer));}catch(error){if(!controller.signal.aborted)postMessage({id:data.id,generation:data.generation,error:String(error.message||error)});}finally{current=null;}}working=false;}
self.onmessage=({data})=>{if(data.type==='abort'){queued=null;current?.abort();return;}queued=data;current?.abort();pump();};
