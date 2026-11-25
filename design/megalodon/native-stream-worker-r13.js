import {nativeBytes,nativeArrays,nativeCacheInfo} from './native-source-cache-r13.js';
let current,queued,working=false;const stats={};
async function pump(){if(working)return;working=true;while(queued){const d=queued;queued=null;const controller=current=new AbortController();try{
 const g=nativeArrays(await nativeBytes(d.chunk.url,d.chunk.sha256,controller.signal,stats));
 const f=nativeArrays(await nativeBytes(d.field.url,d.field.sha256,controller.signal,stats));
 if(g.header.vertices!==f.header.vertices||g.header.triangles!==d.chunk.triangles)throw Error('Native field registration mismatch');
 const arrays={...g.out,...f.out};if(!controller.signal.aborted)postMessage({id:d.id,generation:d.generation,header:g.header,...arrays,cacheStats:{...stats}},[...new Set(Object.values(arrays).map(v=>v.buffer))]);
 }catch(e){if(!controller.signal.aborted)postMessage({generation:d.generation,error:String(e.message||e),cacheStats:{...stats}});}finally{current=null;}}working=false;}
self.onmessage=async({data:d})=>{if(d.type==='abort'){queued=null;current?.abort();return;}if(d.type==='precache'){
 try{for(let i=0;i<d.sources.length;i++){const s=d.sources[i];await nativeBytes(s.url,s.sha256,undefined,stats);postMessage({precache:true,completed:i+1,total:d.sources.length,cacheStats:{...stats}});}postMessage({precache:true,complete:true,info:await nativeCacheInfo(),cacheStats:{...stats}});}catch(e){postMessage({precache:true,error:String(e.message||e)});}return;}
 queued=d;current?.abort();pump();};
