export const SOURCE_CACHE='megalodon-native-lossless-r15';
const pending=new Map();
let persistent=true;
export function setPersistence(value){persistent=value!==false;}
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
export const digest=async b=>hex(await crypto.subtle.digest('SHA-256',b));
const cacheKey=part=>new URL('./.native-source-r15/'+part.sha256,import.meta.url).href;
export async function sourceBytes(part,stats={}){
 const key=cacheKey(part);if(pending.has(key))return pending.get(key);
 const run=async()=>{
  const cache=persistent&&globalThis.caches?await caches.open(SOURCE_CACHE).catch(()=>null):null;
  const old=cache?await cache.match(key):null;
  if(old){const b=await old.arrayBuffer();if(await digest(b)===part.sha256){stats.cacheHits=(stats.cacheHits||0)+1;return b;}await cache.delete(key);}
  const r=await fetch(part.url,{cache:cache?'no-store':'force-cache'});if(!r.ok)throw Error('Native source HTTP '+r.status);
  const b=await r.arrayBuffer();if(await digest(b)!==part.sha256)throw Error('Native source checksum mismatch');
  stats.sourceReads=(stats.sourceReads||0)+1;stats.sourceBytes=(stats.sourceBytes||0)+b.byteLength;
  if(cache){try{await cache.put(key,new Response(b,{headers:{'Content-Type':'application/octet-stream','x-native-source-sha256':part.sha256}}));stats.cacheWrites=(stats.cacheWrites||0)+1;}catch(e){stats.storageWarning=String(e.message||e);}}
  return b;
 };
 const promise=(navigator.locks?navigator.locks.request('native-r15:'+part.sha256,run):run()).finally(()=>pending.delete(key));pending.set(key,promise);return promise;
}
export async function decodeBuffer(part,b){
 const first=new Uint8Array(b,0,Math.min(2,b.byteLength));
 if(first[0]===31&&first[1]===139)b=await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 if(part.decoded_sha256&&await digest(b)!==part.decoded_sha256)throw Error('Decoded native checksum mismatch');return b;
}
export async function decodedBytes(part,stats={}){return decodeBuffer(part,await sourceBytes(part,stats));}
export function arrays(buffer){
 const types={uint8:Uint8Array,int8:Int8Array,uint16:Uint16Array,uint32:Uint32Array,float32:Float32Array};
 const n=new DataView(buffer).getUint32(0,true);if(n>buffer.byteLength-4)throw Error('Invalid native header');
 const header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,n))),offset=4+Math.ceil(n/4)*4,out={};
 for(const[name,s]of Object.entries(header.segments)){
  const T=types[s.dtype],start=offset+s.offset;if(!T||start<offset||start+s.bytes>buffer.byteLength||s.bytes%T.BYTES_PER_ELEMENT)throw Error('Invalid native array');
  out[name]=start%T.BYTES_PER_ELEMENT?new T(buffer.slice(start,start+s.bytes)):new T(buffer,start,s.bytes/T.BYTES_PER_ELEMENT);
 }
 return{header,out};
}
export async function cacheInfo(parts){
 if(!persistent||!globalThis.caches)return{available:0,total:parts.length,bytes:0,supported:false};
 const cache=await caches.open(SOURCE_CACHE),keys=new Set((await cache.keys()).map(k=>k.url));
 return{available:parts.filter(p=>keys.has(cacheKey(p))).length,total:parts.length,supported:true,bytes:parts.filter(p=>keys.has(cacheKey(p))).reduce((n,p)=>n+p.bytes,0)};
}
