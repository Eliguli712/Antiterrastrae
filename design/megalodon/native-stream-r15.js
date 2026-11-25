import{NativeSections}from'./native-section-r15.js?v=1';
import{decodedBytes,decodeBuffer,sourceBytes,arrays,cacheInfo,setPersistence}from'./native-store-r15.js?v=1';
let naturalStarted=false,sections,config,allParts=[],waiting=new Map(),started=false,maskTicket=0,maskCache=null;
const stats={cacheHits:0,cacheWrites:0,sourceReads:0,sourceBytes:0};
const send=(type,data={})=>postMessage({type,...data,stats:{...stats}});
async function load(){
 if(started)return;started=true;
 try{
  const p=await decodedBytes(config.preview.file,stats);postMessage({type:'preview',buffer:p},[p]);
  loadVolume().catch(e=>send('volume-error',{message:e.message}));
  const chunks=config.geometry.chunks,inflight=new Map();let submitted=0;
  const prepare=i=>{if(i<chunks.length&&!inflight.has(i))inflight.set(i,sourceBytes(chunks[i],stats));};
  for(let i=0;i<Math.min(3,chunks.length);i++)prepare(i);
  for(let i=0;i<chunks.length;i++){
   const encoded=await inflight.get(i);inflight.delete(i);prepare(i+3);
   const b=await decodeBuffer(chunks[i],encoded);
   await new Promise((resolve,reject)=>{waiting.set(i,{resolve,reject});postMessage({type:'bundle',id:i,buffer:b},[b]);});
   submitted+=chunks[i].triangles;send('progress',{faces:submitted,total:74293846});
  }
  send('geometry-complete',{faces:submitted});await prepareRemaining();
 }catch(e){send('error',{message:String(e.message||e)});}
}
async function loadNatural(){if(naturalStarted)return;naturalStarted=true;if(!config.natural)throw Error('Original natural colour field is unavailable');for(let i=0;i<config.natural.chunks.length;i++){const b=await decodedBytes(config.natural.chunks[i],stats);await new Promise((resolve,reject)=>{waiting.set(1000+i,{resolve,reject});postMessage({type:'photo-bundle',id:i,buffer:b},[b]);});}send('photo-complete');}
async function loadVolume(){const b=await decodedBytes(config.volume.file,stats);postMessage({type:'volume',buffer:b},[b]);}
async function prepareFullCache(){let next=0;await Promise.all([0,1,2].map(async()=>{while(next<allParts.length){await sourceBytes(allParts[next++],stats);send('cache-progress',await cacheInfo(allParts));}}));send('cache-ready',await cacheInfo(allParts));}
async function prepareRemaining(){
 const list=[...config.mask.slabs,...(config.extra_sources||[]),...(config.natural?.chunks||[])];let next=0;
 await Promise.all([0,1].map(async()=>{while(next<list.length){const p=list[next++];await sourceBytes(p,stats);send('cache-progress',await cacheInfo(allParts));}}));
 send('cache-ready',await cacheInfo(allParts));
}
self.onmessage=({data:d})=>{
 if(d.type==='init'){config=d.config;setPersistence(config.persistent);sections=new NativeSections(config,stats,d=>postMessage(d,[d.data.buffer,...(d.overlay?[d.overlay.buffer]:[])]));allParts=[...config.geometry.chunks,config.preview.file,config.volume.file,...config.mask.slabs,...(config.extra_sources||[]),...(config.natural?.chunks||[])];load();}
 else if(d.type==='ack'){waiting.get(d.id)?.resolve();waiting.delete(d.id);}
 else if(d.type==='cancel-section')sections.cancel(d.target);
 else if(d.type==='mask'||d.type==='section')sections.request(d).catch(e=>send('mask-error',{message:e.message,target:d.target,request_id:d.request_id}));
 else if(d.type==='cache-only')prepareFullCache().catch(e=>send('cache-warning',{message:e.message}));
 else if(d.type==='natural')loadNatural().catch(e=>{naturalStarted=false;send('natural-error',{message:e.message});});
 else if(d.type==='cache')prepareRemaining().catch(e=>send('error',{message:e.message}));
};
