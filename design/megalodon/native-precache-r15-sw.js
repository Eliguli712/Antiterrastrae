import{SOURCE_CACHE,digest}from'./native-store-r15.js?v=2';
const SHELL='megalodon-shell-r15-v9';
const files=['./','./native-microtubes.js?v=2','./assets/native-microtubes-fine.json?v=1','./inline-video-controls-r17.js?v=1','./inline-video-controls-r17.css?v=1','./exhibition.css','./native-batch-r14.css?v=1','./native-shared-r15.css?v=5','./native-app-r15.js?v=7','./native-engine-r15.js?v=6','./native-packed-gpu-r18.js?v=1','./native-content-r15.js?v=1','./native-stream-r15.js?v=3','./native-store-r15.js?v=2','./native-section-r15.js?v=2','./native-contours-r15.js?v=1','./native-panels-r15.js?v=5','./cad-palaeo-ruler-r14.js?v=1','./vendor/three.module.js','./vendor/OrbitControls.js','./assets/native74-batch-publication.json?v=1','./assets/native-interactive-publication.json?v=3','./assets/curved-zone-guide.json?v=2','./assets/native-cut-playback/Native74_Internal_PCA_Axis_1_maximum_section.png','./assets/native-cut-playback/Native74_Internal_PCA_Axis_2_maximum_section.png','./assets/native-cut-playback/Native74_Internal_PCA_Axis_3_maximum_section.png'];
async function installShell(){
 const cache=await caches.open(SHELL);
 await Promise.allSettled(files.map(file=>cache.add(file)));
 // Keep both complete static cases usable when WebGL or the network is lost.
 // Decode no images here; the browser retains their original response bytes.
 try{
  const batch=await (await cache.match('./assets/native74-batch-publication.json?v=1')).json();
  const interactive=await (await cache.match('./assets/native-interactive-publication.json?v=3')).json();
  const cases=Object.values(batch.cases);
  const urls=[
   batch.ruler.png,batch.ruler.mesh,batch.palette,
   ...cases.flatMap(entry=>[entry.field,...Object.values(entry.views)]),
   interactive.geometry,interactive.volume,interactive.mask,interactive.preview,interactive.pca,
   interactive.counts,interactive.natural?.field
  ].filter(Boolean);
  // Static preparation overlaps neither a burst of image decodes nor a
  // full geometry transfer. Individual failures remain fetchable on demand.
  for(const url of new Set(urls))await cache.add(url).catch(()=>{});
 }catch{}
 await self.skipWaiting();
}
self.addEventListener('install',e=>e.waitUntil(installShell()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
const catalogueURL='./assets/native-interactive-publication.json?v=3';
let catalogue;
async function loadMovieCatalogue(){
 const cache=await caches.open(SHELL);
 try{
  const response=await fetch(catalogueURL);
  if(!response.ok)throw Error('Movie catalogue unavailable');
  const entries=await response.clone().json();
  await cache.put(catalogueURL,response).catch(()=>{});
  return entries;
 }catch(error){
  const cached=await cache.match(catalogueURL);
  if(cached)return cached.json();
  throw error;
 }
}
async function moviePart(url){
 catalogue??=loadMovieCatalogue();
 try{
  const {extra_sources}=await catalogue;
  return extra_sources?.find(part=>new URL(part.url,location.href).href===url);
 }catch{
  catalogue=null;
  return undefined;
 }
}
async function movieResponse(request){
 const part=await moviePart(request.url);if(!part)return fetch(request);const cache=await caches.open(SOURCE_CACHE),key=new URL('./.native-source-r15/'+part.sha256,import.meta.url).href,cached=await cache.match(key);if(!cached)return fetch(request);const b=await cached.arrayBuffer();if(await digest(b)!==part.sha256){await cache.delete(key);return fetch(request);}const range=request.headers.get('Range'),headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'};
 if(!range)return new Response(b,{headers:{...headers,'Content-Length':String(b.byteLength)}});
 const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+b.byteLength}});let start=m[1]?Number(m[1]):Math.max(0,b.byteLength-Number(m[2])),end=m[1]&&m[2]?Number(m[2]):b.byteLength-1;end=Math.min(end,b.byteLength-1);
 if(start>end||start>=b.byteLength)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+b.byteLength}});return new Response(b.slice(start,end+1),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${b.byteLength}`}});
}
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);if(e.request.method!=='GET')return;
 const raw=u.hostname==='raw.githubusercontent.com'&&/\/Antiterrastrae\/[0-9a-f]{40}\/assets\//.test(u.pathname);
 const local=u.origin===location.origin&&u.pathname.startsWith(new URL('./',location.href).pathname);if(u.pathname.endsWith('.mp4')&&((raw&&u.pathname.includes('/native-interactive-r15/'))||(local&&u.pathname.includes('/assets/native-cut-playback/')))){e.respondWith(movieResponse(e.request));return;}
 const staticArtwork=raw&&/\/(native74-paper-mr5|palaeo-ruler-r14)\/[^/]+\.png$/.test(u.pathname);
 if(!local&&!(raw&&u.pathname.endsWith('.json'))&&!staticArtwork)return;
 if(u.pathname.includes('/.native-source-r15/'))return;
 e.respondWith((async()=>{const cache=await caches.open(SHELL);if(raw){const old=await cache.match(e.request);if(old)return old;}try{const response=await fetch(e.request);if(response.ok&&(raw||e.request.mode==='navigate'||/\.(js|css|json|svg)$/.test(u.pathname)))await cache.put(e.request,response.clone());return response;}catch(error){const cached=await cache.match(e.request);if(cached)return cached;if(e.request.mode==='navigate'){const page=await cache.match('./');if(page)return page;}throw error;}})());
});
