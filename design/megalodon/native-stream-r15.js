import{NativeSections}from'./native-section-r15.js?v=2';
import{decodedBytes,decodeBuffer,sourceBytes,cacheInventory,setPersistence}from'./native-store-r15.js?v=2';
const NATIVE_FACES=74293846;
let config,sections,allParts=[],geometryStarted=false,geometryActive=false,stopped=false,naturalActive=false,naturalComplete=false,cacheRun;
let previewTask;
const waiting=new Map();
const stats={cacheHits:0,cacheWrites:0,sourceReads:0,sourceBytes:0};
const send=(type,data={})=>postMessage({type,...data,stats:{...stats}});
function upload(type,id,buffer){
 return new Promise((resolve,reject)=>{
  waiting.set(id+(type==='photo-bundle'?1000:0),{resolve,reject});
  postMessage({type,id,buffer},[buffer]);
 });
}
async function reportCache(type){
 const {missing,...info}=await cacheInventory(allParts);
 const missingKeys=new Set(missing.map(part=>part.sha256));
 const geometryTotal=config.geometry.chunks.length;
 const geometryAvailable=config.geometry.chunks.filter(part=>!missingKeys.has(part.sha256)).length;
 send(type,{...info,geometryTotal,geometryAvailable});
 return {missing,...info};
}
function loadPreview(){
 if(!previewTask){
  previewTask=decodedBytes(config.preview.file,stats).then(buffer=>{
   if(!stopped)postMessage({type:'preview',buffer},[buffer]);
  }).catch(error=>{
   previewTask=null;
   throw error;
  });
 }
 return previewTask;
}
async function loadGeometry(){
 if(geometryStarted||stopped)return;
 geometryStarted=true;
 geometryActive=true;
 try{
  // An explicitly requested complete load never waits on the independent light preview.
  loadPreview().catch(()=>{});
  if(stopped)return;
  const chunks=config.geometry.chunks,inflight=new Map();
  const concurrency=config.constrained?1:2;
  const prepare=i=>{
   if(i>=chunks.length)return;
   // Attach the rejection handler before work is queued. A later chunk can
   // fail while the current one is still being uploaded.
   inflight.set(i,sourceBytes(chunks[i],stats).then(encoded=>({encoded}),error=>({error})));
  };
  for(let i=0;i<concurrency;i++)prepare(i);
  let submitted=0;
  for(let i=0;i<chunks.length&&!stopped;i++){
   const {encoded,error}=await inflight.get(i);
   inflight.delete(i);
   if(error)throw error;
   if(stopped)return;
   if(!config.constrained)prepare(i+concurrency);
   const buffer=await decodeBuffer(chunks[i],encoded);
   if(stopped)return;
   await upload('bundle',i,buffer);
   submitted+=chunks[i].triangles;
   send('progress',{faces:submitted,total:NATIVE_FACES});
   if(config.constrained)prepare(i+concurrency);
  }
  if(stopped)return;
  if(submitted!==NATIVE_FACES)throw Error('Native source triangle coverage mismatch');
  send('geometry-complete',{faces:submitted});
  try{
   const volume=await decodedBytes(config.volume.file,stats);
   if(!stopped)postMessage({type:'volume',buffer:volume},[volume]);
  }catch(e){send('volume-error',{message:e.message});}
 }catch(e){if(!stopped)send('error',{message:String(e.message||e)});}
 finally{geometryActive=false;reportCache('cache-progress').catch(()=>{});}
}
async function loadNatural(){
 if(naturalActive||naturalComplete||stopped)return;
 naturalActive=true;
 try{
  if(!config.natural)throw Error('Original natural colour field is unavailable');
  for(let i=0;i<config.natural.chunks.length&&!stopped;i++){
   const buffer=await decodedBytes(config.natural.chunks[i],stats);
   if(stopped)return;
   await upload('photo-bundle',i,buffer);
  }
  if(!stopped){naturalComplete=true;send('photo-complete');}
 }catch(e){if(!stopped)send('natural-error',{message:String(e.message||e)});}
 finally{naturalActive=false;reportCache('cache-progress').catch(()=>{});}
}
function prepareCache(){
 if(cacheRun||geometryActive||naturalActive)return;
 cacheRun=(async()=>{
  const {missing,supported}=await reportCache('cache-progress');
  if(!supported)return;
  stats.storageWarning='';
  for(let i=0;i<missing.length;i++){
   if(geometryActive||naturalActive)return;
   await sourceBytes(missing[i],stats);
   if(stats.storageWarning){
    await reportCache('cache-progress');
    return;
   }
   if(i%5===4)await reportCache('cache-progress');
  }
  await reportCache('cache-ready');
 })().catch(error=>send('cache-warning',{message:String(error.message||error)})).finally(()=>{cacheRun=null;});
}
self.onmessage=({data:d})=>{
 if(d.type==='init'){
  config=d.config;
  setPersistence(config.persistent);
  sections=new NativeSections(config,stats,p=>postMessage(p,[p.data.buffer,...(p.overlay?[p.overlay.buffer]:[])]));
  allParts=[...config.geometry.chunks,config.preview.file,config.volume.file,...config.mask.slabs,...(config.extra_sources||[]),...(config.natural?.chunks||[])];
 }else if(d.type==='load-preview')loadPreview().catch(error=>send('preview-error',{message:String(error.message||error)}));
 else if(d.type==='load-geometry')loadGeometry();
 else if(d.type==='stop-geometry'){
  stopped=true;
  for(const job of waiting.values())job.reject(Error('Interactive 3D stopped'));
  waiting.clear();
 }else if(d.type==='ack'){
  waiting.get(d.id)?.resolve();
  waiting.delete(d.id);
 }else if(d.type==='cancel-section')sections.cancel(d.target);
 else if(d.type==='mask'||d.type==='section')sections.request(d).catch(e=>send('mask-error',{message:e.message,target:d.target,request_id:d.request_id}));
 else if(d.type==='cache'||d.type==='cache-only')prepareCache();
 else if(d.type==='cache-status')reportCache('cache-progress').catch(e=>send('cache-warning',{message:e.message}));
 else if(d.type==='natural')loadNatural();
};
