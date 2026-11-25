// One origin-wide, lossless decoded store shared by both native panels.
export const NATIVE_CACHE='megalodon-native-decoded-r13';
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const sha=b=>crypto.subtle.digest('SHA-256',b).then(hex);
function keyFor(url,hash){const key=new URL(url,location.href);key.searchParams.set('nativeDecodedSHA',hash);return key.href;}
export async function nativeBytes(url,hash,signal,stats={}){
 const key=keyFor(url,hash);
 const load=async()=>{
  const cache=globalThis.caches?await caches.open(NATIVE_CACHE).catch(()=>null):null;
  const old=cache?await cache.match(key):null;
  if(old){const bytes=await old.arrayBuffer();if(await sha(bytes)===old.headers.get('x-decoded-sha256')){stats.decoded_hits=(stats.decoded_hits||0)+1;return bytes;}await cache.delete(key);}
  signal?.throwIfAborted();const r=await fetch(url,{signal,cache:'force-cache'});if(!r.ok)throw Error('Native source HTTP '+r.status);
  let bytes=await r.arrayBuffer();if(bytes.byteLength>24*1024*1024)throw Error('Native transport budget exceeded');
  if(await sha(bytes)!==hash)throw Error('Native source checksum mismatch');stats.source_reads=(stats.source_reads||0)+1;
  if(new Uint8Array(bytes)[0]===31&&new Uint8Array(bytes)[1]===139){bytes=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();stats.decompressions=(stats.decompressions||0)+1;}
  if(bytes.byteLength>48*1024*1024)throw Error('Native decoded-chunk budget exceeded');signal?.throwIfAborted();
  if(cache){try{await cache.put(key,new Response(bytes,{headers:{'Content-Type':'application/octet-stream','x-source-sha256':hash,'x-decoded-sha256':await sha(bytes)}}));stats.decoded_writes=(stats.decoded_writes||0)+1;}catch(e){stats.cache_warning=String(e.message||e);}}
  return bytes;
 };
 return navigator.locks? navigator.locks.request('native:'+key,{signal},load):load();
}
export function nativeArrays(buffer){
 const b=new Uint8Array(buffer),dv=new DataView(buffer),length=dv.getUint32(0,true);if(length>buffer.byteLength-4)throw Error('Invalid native header');
 const header=JSON.parse(new TextDecoder().decode(b.subarray(4,4+length))),offset=4+Math.ceil(length/4)*4,out={},types={float32:Float32Array,int8:Int8Array,uint8:Uint8Array,uint32:Uint32Array};
 const repack=Object.values(header.segments).some(s=>types[s.dtype]&&(offset+s.offset)%types[s.dtype].BYTES_PER_ELEMENT);for(const[name,s]of Object.entries(header.segments)){const T=types[s.dtype],start=offset+s.offset;if(!T||start<offset||s.bytes%T.BYTES_PER_ELEMENT||start+s.bytes>buffer.byteLength)throw Error('Invalid native segment');out[name]=repack?new T(buffer.slice(start,start+s.bytes)):new T(buffer,start,s.bytes/T.BYTES_PER_ELEMENT);}
 return{header,out};
}
export async function nativeCacheInfo(){const cache=await caches.open(NATIVE_CACHE);const keys=await cache.keys();return{entries:keys.length,shared_by_both_panels:true,encoding:'uncompressed decoded typed arrays',estimate:await navigator.storage?.estimate?.()};}
