import{sourceBytes}from'./native-store-r15.js?v=1';
const SHELL='megalodon-shell-r15-v2';
const files=['./','./exhibition.css','./native-batch-r14.css?v=1','./native-shared-r15.css?v=1','./native-app-r15.js?v=1','./native-engine-r15.js?v=1','./native-content-r15.js?v=1','./native-stream-r15.js?v=1','./native-store-r15.js?v=1','./native-section-r15.js?v=1','./native-contours-r15.js?v=1','./native-panels-r15.js?v=1','./cad-palaeo-ruler-r14.js?v=1','./vendor/three.module.js','./vendor/OrbitControls.js','./assets/native74-batch-publication.json?v=1','./assets/native-interactive-publication.json?v=1'];
self.addEventListener('install',e=>e.waitUntil(caches.open(SHELL).then(async c=>{await Promise.allSettled(files.map(f=>c.add(f)));await self.skipWaiting();})));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
let catalogue;
async function moviePart(url){if(!catalogue)catalogue=fetch('./assets/native-interactive-publication.json?v=1').then(r=>r.json()).catch(()=>({extra_sources:[]}));return(await catalogue).extra_sources?.find(p=>p.url===url);}
async function movieResponse(request){
 const part=await moviePart(request.url);if(!part)return fetch(request);const b=await sourceBytes(part),range=request.headers.get('Range'),headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'};
 if(!range)return new Response(b,{headers:{...headers,'Content-Length':String(b.byteLength)}});
 const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+b.byteLength}});let start=m[1]?Number(m[1]):Math.max(0,b.byteLength-Number(m[2])),end=m[1]&&m[2]?Number(m[2]):b.byteLength-1;end=Math.min(end,b.byteLength-1);
 if(start>end||start>=b.byteLength)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+b.byteLength}});return new Response(b.slice(start,end+1),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${b.byteLength}`}});
}
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);if(e.request.method!=='GET')return;
 const raw=u.hostname==='raw.githubusercontent.com'&&/\/Antiterrastrae\/[0-9a-f]{40}\/assets\//.test(u.pathname);
 if(raw&&u.pathname.includes('/native-interactive-r15/')&&u.pathname.endsWith('.mp4')){e.respondWith(movieResponse(e.request));return;}
 const local=u.origin===location.origin&&u.pathname.startsWith(new URL('./',location.href).pathname);if(!local&&!(raw&&u.pathname.endsWith('.json')))return;
 if(u.pathname.includes('/.native-source-r15/'))return;
 e.respondWith((async()=>{const cache=await caches.open(SHELL);if(raw){const old=await cache.match(e.request);if(old)return old;}try{const response=await fetch(e.request);if(response.ok&&(raw||e.request.mode==='navigate'||/\.(js|css|json|svg)$/.test(u.pathname)))await cache.put(e.request,response.clone());return response;}catch(error){const cached=await cache.match(e.request);if(cached)return cached;if(e.request.mode==='navigate'){const page=await cache.match('./');if(page)return page;}throw error;}})());
});
