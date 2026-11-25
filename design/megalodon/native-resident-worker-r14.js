const types={float32:Float32Array,int8:Int8Array,uint8:Uint8Array,uint32:Uint32Array};
async function read(part){
 const response=await fetch(part.url,{cache:'force-cache'});if(!response.ok)throw Error('Native chunk HTTP '+response.status);
 let bytes=new Uint8Array(await response.arrayBuffer());
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 if(digest!==part.sha256)throw Error(`Native chunk checksum mismatch (${part.url.split('/').slice(-2).join('/')}; received ${bytes.length} bytes; prefix ${Array.from(bytes.slice(0,4)).join(',')}; SHA ${digest}; expected ${part.sha256})`);
 if(bytes[0]===31&&bytes[1]===139)bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 const length=new DataView(bytes.buffer,bytes.byteOffset,4).getUint32(0,true),header=JSON.parse(new TextDecoder().decode(bytes.subarray(4,4+length))),offset=4+Math.ceil(length/4)*4;
 const arrays={};
 for(const[name,segment]of Object.entries(header.segments)){
  const Type=types[segment.dtype];if(!Type)throw Error('Unsupported native attribute');const start=bytes.byteOffset+offset+segment.offset;
  if(start+segment.bytes>bytes.byteOffset+bytes.byteLength||segment.bytes%Type.BYTES_PER_ELEMENT)throw Error('Native attribute range mismatch');
  arrays[name]=start%Type.BYTES_PER_ELEMENT?new Type(bytes.buffer.slice(start,start+segment.bytes)):new Type(bytes.buffer,start,segment.bytes/Type.BYTES_PER_ELEMENT);
 }
 return{header,arrays};
}
self.onmessage=async({data})=>{
 try{
  const geometry=data.geometry?await read(data.geometry):null,field=await read(data.field);
  if(geometry&&(geometry.header.vertices!==field.header.vertices||geometry.header.triangles!==data.geometry.triangles))throw Error('Native geometry / field count mismatch');
  const arrays={...geometry?.arrays,...field.arrays};postMessage({id:data.id,header:geometry?.header||field.header,...arrays},[...new Set(Object.values(arrays).map(a=>a.buffer))]);
 }catch(error){postMessage({id:data.id,error:String(error.message||error)});}
};
