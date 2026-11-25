import{mountInlineVideoControls}from'./inline-video-controls-r17.js?v=1';
import{mountSlicePanels,mountDomainMetrics,mountAxisMovies,foldSections,speedControl,syncSpeedLabel}from'./native-panels-r15.js?v=5';
import{NativeEngine,NATIVE_FACES}from'./native-engine-r15.js?v=5';
import{renderAnalysis,hydrateOtherContent}from'./native-content-r15.js?v=1';
import{layoutCadScale}from'./cad-palaeo-ruler-r14.js?v=1';
const get=async u=>{const r=await fetch(u);if(!r.ok)throw Error('HTTP '+r.status);return r.json();};
const count=n=>Number(n).toLocaleString('en-US'),q=s=>document.querySelector(s),qa=s=>document.querySelectorAll(s);
const state={size:50,part:'whole',root:51.3,gap:6,transition:10,curvature:8,pose:'front',rulerFixed:true,rulerX:0,rulerZ:0,sync:true};
const modes=[['0','Original 3MF colours'],['1','Voxel mask · before colour'],['2','Original masked CT intensity'],['3','Art · basic filtration'],['4','Art · matte MPPCA'],['5','MPPCA display residual'],['6','Native voxels · exact 18 µm plane'],['7','MPPCA reconstructed CT intensity'],['8','Cavities · blue contours / red peaks'],['9','Natural fossil colours · resin option'],['10','Region colours · matte PLA']];
let pub,interactive,engine,geometry,palette,fields,pca,stats,slicePanels,viewList=[];
const main=q('#native74-batch');
mountInlineVideoControls(document);
main.innerHTML=`<div class="batch-heading"><p class="eyebrow">CURRENT COLOUR FILES / SHARED NATIVE CT</p><h2>Astraeus Krystallisia</h2><p>The exterior, artistic and internal views share one complete CT surface. The complete renders and videos are available while the local data cache prepares.</p></div><div class="batch-statistics" id="native-statistics"><article><strong>32,687,264</strong><span>Archive surface triangles</span></article><article><strong>74,293,846</strong><span>Full native internal + external CT triangles</span></article><article><strong>37,951,699</strong><span>Native surface vertices · geometry</span></article><article><strong>18 µm</strong><span>Native CT specimen-mask sampling</span></article></div><div class="native-global-tools"><div class="batch-actions"><button data-native-size="50" aria-pressed="true">5 cm · paper reference</button><button data-native-size="100" aria-pressed="false">10 cm · closed-solid MR5 projection</button><button id="nativeFull3D" type="button">Load complete 3D</button></div><label><input type="checkbox" id="nativeSync" checked>Synchronize views</label><label><input type="checkbox" id="nativeRulerFixed" checked>Ruler fixed to view</label><label><input type="checkbox" id="nativeWoodRuler">Uneven wood-grain ruler</label><label>Display resolution<select id="nativeResolution"><option value="smooth" selected>High resolution · smooth colour</option><option value="balanced">Balanced · lower fill cost</option></select></label><div class="native-ruler-adjust" hidden><p>Drag the CAD ruler, or adjust its position. Its measured span stays 50 mm.</p><label>Horizontal / mm<input id="nativeRulerX" type="range" min="-60" max="40" step=".25" value="0"></label><label>Vertical / mm<input id="nativeRulerZ" type="range" min="-60" max="60" step=".25" value="0"></label><button id="nativeRulerReset">Reset ruler</button></div></div><div id="nativeExteriorMount"></div><div class="native-cache-panel"><p id="nativeCacheStatus" role="status">Preparing shared native catalogue…</p><progress id="nativeLoadProgress" aria-label="Triangles loaded for interactive 3D" max="74293846" value="0" hidden></progress><p id="nativeLoadingStatus" role="status">The first visit downloads the data; later visits reuse the verified local cache.</p><button id="nativePrepareCache">Check / complete local cache</button><span id="nativeStorageStatus"></span></div><div class="batch-captions"><article><h3>5 cm · preserved reference colours</h3><p>The current paper-reference 3MF RGB values remain unchanged. Its normalized colour coordinate is 0–1; no new Pa field is inferred from the colours.</p><div class="batch-downloads" id="batchDownloads50"></div></article><article><h3>10 cm · projected MR5 calculation</h3><p>The independently calculated nonlinear field uses a closed-solid mechanical proxy and documented RMS constraints. Its colours are projected onto the native CT surface, including any cavity walls revealed by a cut.</p><div class="batch-downloads" id="batchDownloads100"></div></article></div><div class="batch-downloads" id="batchCommonDownloads"></div><div id="batchStaticPlates"></div><div id="batchScientificAnalysis"></div>`;
function card(key,title,mode,cut){
 return `<section class="native-view-card" data-native-card="${key}"><div class="native-view-heading"><h3>${title}</h3><p class="native-pipeline">Original 18 µm voxel mask → full native surface → optional intensity filter → colour</p></div><div class="native-view-tools"><div class="batch-cameras"><button data-native-pose="front" aria-pressed="true">Front</button><button data-native-pose="oblique" aria-pressed="false">Oblique</button><button data-native-pose="reverse" aria-pressed="false">Reverse</button></div><div class="batch-cameras"><button data-native-nav="rotate" aria-pressed="true">Rotate</button><button data-native-nav="pan" aria-pressed="false">Pan</button><button data-native-nav="slice" aria-pressed="false">Move cut</button></div>${key==='internal'?'<a href="#native-pca-movies">PCA videos</a>':''}<label>Appearance<select class="native-appearance">${modes.map(([v,label])=>`<option value="${v}"${Number(v)===9?' disabled':''}${Number(v)===mode?' selected':''}>${label}</option>`).join('')}</select></label><label>Mesh display<select class="native-mesh"><option value="surface">Complete surface</option><option value="vertices">Native mesh vertices</option></select></label></div><div class="native-shared-stage native-poster-visible" id="native-${key}-viewport"><img class="native-stage-poster" alt="Complete original native tooth render"/><div class="native-hit-area" tabindex="0" aria-label="${title}; drag to rotate, two fingers to pan, pinch to zoom"></div><div class="native-view-count" role="status">Complete static reference · 74,293,846 source triangles</div></div><div class="native-legend"><div class="native-legend-gradient"></div><div class="batch-axis"><span>0</span><span>0.2</span><span>0.4</span><span>0.6</span><span>0.8</span><span>1</span></div><p class="native-legend-label"></p></div><div class="native-view-tools native-parts"><label>Tooth part<select class="native-part"><option value="whole">Whole tooth</option><option value="crown">Crown</option><option value="root">Root</option><option value="transition">Transitional zone</option><option value="split">Separate crown + transition + root</option></select></label><label>Curved neck height<input class="native-root" type="range" min="5" max="60" step=".1" value="51.3"><span class="native-root-label">51.3% of height</span></label><label>Transition depth / relative %<input class="native-transition" type="range" min="1" max="25" step=".5" value="10"><span class="native-transition-label">100%</span></label><label>Neck profile strength<input class="native-curvature" type="range" min="2" max="16" step=".5" value="8"><span class="native-curvature-label">1.00×</span></label><label class="native-gap-label" hidden>Separation / mm<input class="native-gap" type="range" min="0" max="20" step=".5" value="6"></label></div><details class="native-cut-tools"${key==='internal'?' id="native-interior-cut" open':''}><summary>Internal cut and native voxel mask</summary><div class="native-view-tools"><label>Cut<select class="native-cut"><option value="none"${cut==='none'?' selected':''}>Off</option><option value="x">Transverse X</option><option value="y"${cut==='y'?' selected':''}>Thickness Y</option><option value="z">Longitudinal Z</option><option value="native">Original native axial plane · 18 µm mask</option><option value="pca1">PCA axis 1 · source voxel frame</option><option value="pca2">PCA axis 2 · source voxel frame</option><option value="pca3">PCA axis 3 · source voxel frame</option></select></label><label class="native-cut-range-label">Position / mm<input class="native-cut-range" type="range" min="-6" max="6" step=".05" value="0"><span class="native-cut-value">0.00 mm</span></label><label><input type="checkbox" class="native-cut-flip">Reverse cut</label><label>Curvature peak rule<select class="native-peak-rule"><option value="tail99" selected>High-curvature tail · 99th percentile</option><option value="conservative6MAD">Conservative · median + 6 MAD</option></select></label><label><input type="checkbox" class="native-contours" checked>Blue void contours / red curvature peaks</label><label><input type="checkbox" class="native-mask-first" checked>Apply original voxel mask before colour</label><label class="native-pca-sampling-label" hidden>Plane sampling<select class="native-pca-sampling"><option value=".072" selected>0.072 mm / 72 µm · quick</option><option value=".018">0.018 mm / 18 µm</option></select></label><label class="native-plane-label" hidden><input type="checkbox" class="native-plane-show" checked>Show section and contours</label></div>${key==='internal'? `<div class="native-view-tools native-sweep-controls" role="group" aria-label="Live 3D section playback">
 <button type="button" class="native-sweep-play" disabled>Play 3D cut</button>
 ${speedControl('3D cut speed','native-sweep-speed')}
 <label>3D cut direction<select class="native-sweep-direction"><option value="forward">Increasing position</option><option value="reverse">Decreasing position</option><option value="bounce">Back and forth</option></select></label>
 </div>`:''}<p class="native-mask-readout">The complete native mesh retains every original cavity wall. Select a native axial plane for the exact 18 µm binary mask.</p></details><div class="native-view-tools native-view-footer"><button class="native-spin" aria-pressed="false">Play rotation</button><button class="native-reset">Reset view</button><button class="native-focus">Focus view</button><button class="native-paper-colours">Paper reference colours</button><button class="native-part-colour">Separate 3 regions · matte PLA</button><button class="native-zoom" data-zoom="16">Voxel zoom ×16</button><button class="native-zoom" data-zoom="64">Voxel zoom ×64</button><button class="native-photo" aria-pressed="false">Static reference</button><a href="#nativeRulerFixed">Lock / move ruler</a></div><p class="native-source-note">Complete 3D keeps every native triangle resident. The three-region display classifies the crown, transition and root in original coordinates before applying display offsets and colours. The upper guide follows the colour and gloss boundary of the archived natural 3MF. The lower guide follows the visible growth-line endings on the front. The reverse lower guide is estimated. <a href="./assets/curved-zone-guide.json?v=2">Boundary measurements</a>.</p></section>`;
}
q('#nativeExteriorMount').innerHTML=card('exterior','Exterior · current 3MF colours',0,'none');
q('#nativeArtMount').innerHTML=card('art','Artistic CT · mask, filtration and MPPCA',4,'none');
q('#nativeInternalMount').innerHTML=card('internal','Inside the tooth · complete native cavity walls',8,'none');
q('#nativeInternalMount .native-shared-stage').insertAdjacentHTML('afterend',`
 <div class="native-tube-tools">
   <label><input type="checkbox" id="nativeMicrotubes"> Show CT microtube candidates</label>
   <label><input type="checkbox" id="nativeMicrotubesOnly" disabled> Isolate tubes</label>
   <p id="nativeMicrotubeStatus" role="status">Traces of elongated internal voids from the original CT mask.</p>
   <a href="./assets/native-microtubes.json" download>Download tube trace data and methods (JSON)</a>
 </div>`);

const studio=q('.native-art-studio');
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==studio?.contentWindow||event.data?.type!=='megalodon-art-height')return;
  const height=Number(event.data.height);
  if(Number.isFinite(height)&&height>=240&&height<=3600)studio.style.height=`${Math.ceil(height)}px`;
 });
function note(t){q('#nativeLoadingStatus').textContent=t;}
function legends(){
 for(const entry of viewList){const root=entry.card,mode=entry.view.mode,gradient=root.querySelector('.native-legend-gradient'),label=root.querySelector('.native-legend-label');root.querySelector('.batch-axis').hidden=[4,8,9,10].includes(mode);
  gradient.dataset.scaleKind=[8,9,10].includes(mode)?'categorical':'continuous';
  if(mode===0){gradient.style.background='linear-gradient(90deg,'+palette.map((c,i)=>`rgb(${c.join(',')}) ${i*100/255}%`).join(',')+')';const l=fields[state.size].legend;label.textContent=state.size===50?'Normalized reference colour coordinate · 0–1. Paper appearance; no Pa values inferred from colours.':`Normalized display coordinate · 0–1 = ${l.display_min_Pa.toFixed(3)}–${l.display_max_Pa.toFixed(3)} Pa. Closed-solid MR5 field projected onto native geometry. The 2nd/98th-percentile limits apply to display; raw values remain downloadable.`;}
  else if(mode===9){gradient.style.background='linear-gradient(90deg,#3e3427,#6b6451,#414b48)';label.textContent='Resin colour reference from the registered natural fossil photographs. The view preserves the archived RGB values on the complete native surface.';}
  else if(mode===10){gradient.style.background='linear-gradient(90deg,#527c82 0% 33.33%,#c7ae76 33.33% 66.67%,#e9e0c9 66.67% 100%)';label.textContent='Matte PLA region colours · slate root, ochre transition, ivory crown.';}
  else if(mode===8){gradient.style.background='linear-gradient(90deg,#1fa1fa 0%,#1fa1fa 48%,#f52e1f 52%,#f52e1f 100%)';label.textContent='Blue marks gaps, and red marks local curvature peaks. The moving plane uses a 144 µm pooled CT preview. Paused native planes report enclosed gaps and kurtosis.';}
  else if(mode===4){gradient.style.background='#3391b3';label.textContent='Matte MPPCA surface · restrained contrast, no specular bloom or intensity-gradient normal warping. Choose reconstructed CT intensity for the quantitative 0–1 display.';}
  else if(mode===1||mode===6){gradient.style.background='linear-gradient(90deg,#02080c,#f2efdf)';label.textContent='Binary material mask · 0 background / void · 1 selected material. Original native cavity geometry; no colour-derived stress.';}
  else if(mode===5){gradient.style.background='linear-gradient(90deg,#245ed4,#f7f7f7,#e0381e)';label.textContent='MPPCA display change relative to original intensity · −12 to +12 grey levels. This residual is not an error against anatomical ground truth.';}
  else{gradient.style.background=(mode===2||mode===7)?'linear-gradient(90deg,#050505,#fff)':'linear-gradient(90deg,#0e1f45,#40c7e0)';label.textContent=`Normalized masked CT display intensity · 0–1 · ${mode===7?'MPPCA reconstructed intensity':mode===2?'original pooled intensity':mode===3?'basic filtration':'conditional patch-intensity MPPCA'}. Display cache 144 µm; original sampling and binary planes 18 µm. No Pa interpretation.`;}
 }
}
function posters(){for(const{card,view}of viewList){const image=card.querySelector('.native-stage-poster');image.src=pub.cases[state.size].views[state.pose];image.alt=`${state.size/10} cm complete native reference ${state.pose}`;let ruler=card.querySelector('.native-stage-ruler');if(!ruler){ruler=document.createElement('img');ruler.className='native-stage-ruler';ruler.alt='Traditional 50 mm palaeontological CAD scale';view.element.insertBefore(ruler,view.element.querySelector('.native-hit-area'));ruler.src=pub.ruler.png;const layout=()=>layoutCadScale(view.element,image,ruler,state.size,state.pose);image.onload=layout;ruler.onload=layout;new ResizeObserver(layout).observe(view.element);}layoutCadScale(view.element,image,ruler,state.size,state.pose);}}
function rootControls(){qa('.native-part').forEach(e=>e.value=state.part);qa('.native-root').forEach(e=>e.value=state.root);qa('.native-root-label').forEach(e=>e.textContent=`${state.root}% · z = ${((state.root-50)*state.size/100).toFixed(2)} mm`);qa('.native-gap').forEach(e=>e.value=state.gap);qa('.native-transition').forEach(e=>e.value=state.transition);qa('.native-transition-label').forEach(e=>e.textContent=(state.transition*10).toFixed(0)+'%');qa('.native-curvature').forEach(e=>e.value=state.curvature);qa('.native-curvature-label').forEach(e=>e.textContent=(state.curvature/8).toFixed(2)+'×');qa('.native-gap-label').forEach(e=>e.hidden=state.part!=='split');engine?.setPart(state.part,state.root-50,state.gap,state.transition,state.curvature);if(engine)sourceState();}
function updateDomain(){
 qa('[data-domain-size]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.domainSize)===state.size)));
 const status=q('#domainStatus');if(status)status.textContent='Awaiting solution · whole native porous tooth. Completed native tetrahedra: 0. Boundary displacement DOF lower bound: 113,855,097. Current stress colours are projections from the closed-solid proxy.';
 const dl=q('#nativeDomainNumbers');if(dl)dl.innerHTML=[['Selected height',state.size+' mm'],['Native faces','74,293,846'],['Native boundary vertices','37,951,699'],['Original material voxels','967,429,317'],['Retained void components','803,442'],['Boundary displacement DOFs · lower bound','≥113,855,097'],['Completed native tets','0']].map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}
const hasVoxelPlane=axis=>axis==='native'||axis.startsWith('pca');
function updatePlaneToggle(entry){
 const {card,view}=entry;
 const available=hasVoxelPlane(view.cut)||(view.mode===8&&view.cut!=='none');
 card.querySelector('.native-plane-label').hidden=!available;
 view.showPlane=available&&card.querySelector('.native-plane-show').checked;
}
function cutSetup(entry, sample=true){
 const {card,view,input}=entry,axis=card.querySelector('.native-cut').value;
 const native=axis==='native',principal=axis.startsWith('pca');
 const frame=principal?pca.axes[Number(axis.slice(3))-1]:null;
 view.cut=axis;
 updatePlaneToggle(entry);
 card.querySelector('.native-pca-sampling-label').hidden=!principal;
 input.min=native?0:principal?frame.offset_range_mm[0]:-state.size*(axis==='y'?.13:axis==='x'?.42:.5);
 input.max=native?2885:principal?frame.offset_range_mm[1]:-Number(input.min);
 input.step=native?1:'any';
 input.disabled=axis==='none';
 if(entry.playButton)entry.playButton.disabled=axis==='none'||!engine.ready;
 if(axis==='none')setSweep(entry,false);
 entry.lastSweepTime=null;
 entry.sweepPosition=null;
 positionCut(entry,native?1443:principal?frame.maximum_area_offset_mm:0,Boolean(entry.sweeping));
 if(sample&&!entry.sweeping)requestCut(entry);
}
function cutKey(entry){
 const {view,sampling}=entry;
 if(!hasVoxelPlane(view.cut))return null;
 return [view.cut,view.cutValue,view.cut==='native'?.018:Number(sampling.value),view.peakRule].join(':');
}
function cancelCutRequest(entry){
 if(!entry.pendingMask)return;
 entry.pendingMask=null;
 const {view}=entry;
 view.maskTicket++;
 engine.worker.postMessage({type:'cancel-section',target:view.element.id});
}
function setCutMotion(entry,moving){
 const {view}=entry;
 if(view.cutMoving===moving)return;
 view.cutMoving=moving;
 if(moving){
  clearTimeout(entry.cutTimer);
  cancelCutRequest(entry);
  entry.readout.textContent=view.mode===8&&view.cut!=='none'&&view.showPlane
   ?'Live contours on the 0.144 mm / 144 µm CT preview. Pause for the selected native voxel plane.'
   :'Live cut. Pause to show the selected native voxel plane.';
 }
 engine.dirty=true;
}
function positionCut(entry,position,moving){
 const {input,view,valueLabel}=entry;
 const bounded=Math.max(Number(input.min),Math.min(Number(input.max),position));
 const value=view.cut==='native'?Math.round(bounded):bounded;
 setCutMotion(entry,moving);
 input.value=String(value);
 view.cutValue=value;
 view.sectionKey=cutKey(entry);
 if(entry.pendingMask!==view.sectionKey)cancelCutRequest(entry);
 valueLabel.textContent=view.cut==='native'? 'Native grid '+value:
  view.cut.startsWith('pca')?value.toFixed(3)+' mm · source frame':value.toFixed(2)+' mm';
 engine.dirty=true;
}
function requestCut(entry){
 const {view,sampling,readout}=entry;
 clearTimeout(entry.cutTimer);
 if(view.cutMoving||!engine.ready)return;
 if(!view.sectionKey){
  if(view.cut==='none')readout.textContent='Choose an axis to move through the native cavity walls.';
  else if(view.mode===8&&view.showPlane)readout.textContent='Contours on the 144 µm CT preview. Choose a PCA or native axis for an exact sampled plane.';
  else readout.textContent='Clipped native cavity walls. Choose a PCA or native axis to sample a voxel plane.';
  return;
 }
 if(view.maskKey===view.sectionKey&&view.maskTexture){
  readout.textContent=entry.maskText;
  return;
 }
 if(entry.pendingMask===view.sectionKey)return;
 cancelCutRequest(entry);
 entry.pendingMask=view.sectionKey;
 readout.textContent='Sampling the selected position from the original CT mask…';
 if(view.cut==='native')engine.requestMask(view.cutValue,view);
 else engine.requestSection(Number(view.cut.slice(3)),view.cutValue,Number(sampling.value),view);
}
function changeCut(entry){
 positionCut(entry,Number(entry.input.value),Boolean(entry.sweeping||entry.manualCut));
 requestCut(entry);
}
function beginManualCut(entry){
 entry.manualCut=true;
 entry.dragPosition=entry.view.cutValue;
 setCutMotion(entry,true);
}
function endManualCut(entry){
 if(!entry.manualCut)return;
 entry.manualCut=false;
 entry.lastSweepTime=null;
 setCutMotion(entry,Boolean(entry.sweeping));
 requestCut(entry);
}
function setSweep(entry,playing){
 if(!entry.playButton||Boolean(entry.sweeping)===playing)return;
 entry.sweeping=playing;
 entry.lastSweepTime=null;
 entry.playButton.textContent=playing?'Pause 3D cut':'Play 3D cut';
 setCutMotion(entry,playing||Boolean(entry.manualCut));
 if(!playing)requestCut(entry);
}
function sweepFrame(now){
 const entry=viewList.find(v=>v.sweeping&&!v.manualCut);
 if(!entry)return;
 const {input,view}=entry;
 const previous=entry.lastSweepTime??now;
 entry.lastSweepTime=now;
 if(previous===now)return;
 const min=Number(input.min),max=Number(input.max),span=max-min;
 if(span<=0)return;
 const delta=Math.min(.25,(now-previous)/1000)*Number(entry.speed.value)*span/12;
 const direction=entry.direction.value;
 const at=entry.sweepPosition??view.cutValue;
 let next;
 if(direction==='bounce'){
  const phase=entry.bounceBack?2*span-(at-min):at-min;
  const advanced=(phase+delta)%(2*span);
  entry.bounceBack=advanced>=span;
  next=min+(entry.bounceBack?2*span-advanced:advanced);
 }else{
  const advanced=at+(direction==='reverse'?-delta:delta);
  next=advanced<min||advanced>max?min+((advanced-min)%span+span)%span:advanced;
 }
 positionCut(entry,next,true);
 entry.sweepPosition=next;
}
function linkPlane(d){
 const entry=viewList.find(e=>e.key==='internal');
 const {card,view}=entry;
 const native=d.axis==='native';
 setSweep(entry,false);
 cancelCutRequest(entry);
 view.cut=native?'native':'pca'+d.axis;
 card.querySelector('.native-cut').value=view.cut;
 entry.sampling.value=d.sampling_mm.toFixed(3).replace(/^0/,'');
 view.showPlane=true;
 card.querySelector('.native-plane-show').checked=true;
 // Set up the input before applying the panel's sampled position.
 cutSetup(entry,false);
 positionCut(entry,native?d.z:d.offset_mm,false);
 view.maskTicket=(view.maskTicket||0)+1;
 engine.setMask({...d,target:view.element.id,request_id:view.maskTicket});
}
async function changeSize(size){
 if(!engine||size===state.size)return;qa('[data-native-size]').forEach(b=>b.disabled=true);state.size=size;qa('[data-native-size]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.nativeSize)===size)));posters();legends();rootControls();updateDomain();for(const e of viewList)if(['none','x','y','z'].includes(e.view.cut))cutSetup(e);try{await engine.setSize(size);}finally{qa('[data-native-size]').forEach(b=>b.disabled=engine.graphicsStarted&&!engine.ready&&!engine.failed);}
}
function graphicsUI(status){
 const ready=status==='ready',busy=status==='loading',button=q('#nativeFull3D');
 q('.native-cache-panel').dataset.graphicsState=status;
 button.textContent=ready?'Use static views':busy?'Stop 3D loading':status==='error'?'Reset 3D session':'Load complete 3D';
 q('#nativeLoadProgress').hidden=!busy&&!ready;
 qa('[data-native-size],[data-domain-size]').forEach(b=>b.disabled=busy);
 const controls='.native-appearance,.native-mesh,.native-part,.native-root,.native-transition,.native-curvature,.native-gap,.native-spin,.native-reset,.native-paper-colours,.native-part-colour,.native-zoom,.native-photo,[data-native-nav]';
 qa(controls).forEach(el=>el.disabled=!ready);
 q('#nativeMicrotubes').disabled=!ready;
 qa('.native-appearance option[value="9"]').forEach(o=>o.disabled=!ready);
 for(const entry of viewList){
  if(entry.playButton)entry.playButton.disabled=!ready||entry.view.cut==='none';
  if(ready)requestCut(entry);
 }
 sourceState();
 if(status==='static')note(engine.recovering?'Complete static views restored. Load complete 3D when ready; the browser can reuse verified local data.':'Complete static views are ready. Local cache preparation uses compressed files; select Load complete 3D to rotate the exact mesh.');
}
function selectPLA(entry,value){
 state.part=value;
 if(value!=='whole'){
  const appearance=entry.card.querySelector('.native-appearance');
  appearance.value='10';
  appearance.dispatchEvent(new Event('change'));
 }
 rootControls();
}
function activateUI(){
 qa('[data-native-size]').forEach(b=>b.onclick=()=>changeSize(Number(b.dataset.nativeSize)));qa('[data-domain-size]').forEach(b=>b.onclick=()=>changeSize(Number(b.dataset.domainSize)));
 q('#nativeSync').onchange=e=>{state.sync=e.target.checked;engine.sync=state.sync;if(state.sync)engine.synchronize(viewList[0].view);};
 q('#nativeRulerFixed').onchange=e=>{state.rulerFixed=e.target.checked;engine.rulerFixed=state.rulerFixed;q('.native-ruler-adjust').hidden=state.rulerFixed;};
 q('#nativeWoodRuler').onchange=e=>engine.setWood(e.target.checked);q('#nativeResolution').onchange=e=>{engine.quality=e.target.value;engine.resize();};
 for(const axis of['X','Z'])q('#nativeRuler'+axis).oninput=e=>{engine.rulerOffset[axis.toLowerCase()]=Number(e.target.value);engine.dirty=true;};
 q('#nativeRulerReset').onclick=()=>{engine.rulerOffset={x:0,z:0};q('#nativeRulerX').value=q('#nativeRulerZ').value=0;engine.dirty=true;};
 q('#nativePrepareCache').onclick=()=>engine.prepareCache();
 q('#nativeFull3D').onclick=()=>{if(engine.graphicsStarted&&!engine.failed)engine.returnToStatic();else engine.loadFull3D();};
 const tubes=q('#nativeMicrotubes'),tubesOnly=q('#nativeMicrotubesOnly'),tubeStatus=q('#nativeMicrotubeStatus');
 const internal=viewList.find(entry=>entry.key==='internal');
 tubesOnly.onchange=()=>{
  internal.view.microtubesOnly=tubesOnly.checked;
  sourceState();
  engine.dirty=true;
 };
 tubes.onchange=async()=>{
  const visible=tubes.checked;
  tubesOnly.disabled=true;
  if(!visible){
   tubesOnly.checked=false;
   internal.view.microtubesOnly=false;
  }
  tubeStatus.textContent=visible?'Loading CT microtube traces…':'Traces of elongated internal voids from the original CT mask.';
  try{
   const record=await engine.setMicrotubes(internal.view,visible);
   sourceState();
   if(tubes.checked===visible&&visible){
    tubesOnly.disabled=false;
    internal.view.static=false;
    if(!engine.failed&&!engine.lost)internal.view.fallback(false);
    const staticToggle=internal.card.querySelector('.native-photo');
    staticToggle.setAttribute('aria-pressed','false');
    sourceState();
    const {traces_displayed,traces_qualified}=record.survey;
    tubeStatus.textContent=`${count(traces_displayed)} of ${count(traces_qualified)} tubular CT void candidates. The amber overlay has a 0.16 mm minimum display diameter at native scale. The source traces preserve their measured sizes; the voids are not anatomically identified.`;
   }
  }catch{
   if(tubes.checked!==visible)return;
   tubes.checked=false;
   tubeStatus.textContent='The tube traces could not load. Select the option again to retry.';
  }
 };
 document.addEventListener('toggle',event=>{
  const fold=event.target;
  if(fold.tagName!=='DETAILS'||fold.open)return;
  for(const entry of viewList)if(entry.sweeping&&fold.contains(entry.card))setSweep(entry,false);
 },true);

 for(const entry of viewList){const{card,view}=entry;
  card.querySelector('.native-appearance').onchange=e=>{view.mode=Number(e.target.value);updatePlaneToggle(entry);view.static=false;view.fallback(false);card.querySelector('.native-photo').setAttribute('aria-pressed','false');card.querySelector('.native-photo').disabled=view.mode===9;if(view.mode===9&&!engine.photoReady){note('Preparing original natural photograph colours; complete geometry is reused.');engine.ensureNatural().then(()=>{sourceState();engine.dirty=true;}).catch(error=>{view.mode=0;card.querySelector('.native-photo').disabled=false;card.querySelector('.native-appearance').value='0';legends();sourceState();note(error.message);engine.dirty=true;});}if(view.mode===6){const details=card.querySelector('.native-cut-tools');details.open=true;card.querySelector('.native-cut').value='pca3';card.querySelector('.native-pca-sampling').value='.018';cutSetup(entry);engine.camera(view,'front');}legends();engine.dirty=true;};card.querySelector('.native-mesh').onchange=e=>{view.mesh=e.target.value;sourceState();engine.dirty=true;};card.querySelectorAll('.native-zoom').forEach(b=>b.onclick=()=>engine.zoom(view,Number(b.dataset.zoom)));
  card.querySelectorAll('[data-native-pose]').forEach(b=>b.onclick=()=>{state.pose=b.dataset.nativePose;engine.camera(view,state.pose);if(engine.sync){qa('[data-native-pose]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.nativePose===state.pose)));}else card.querySelectorAll('[data-native-pose]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));posters();});
  card.querySelectorAll('[data-native-nav]').forEach(b=>b.onclick=()=>{engine.navigation(b.dataset.nativeNav);qa('[data-native-nav]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.nativeNav===b.dataset.nativeNav)));});
  card.querySelector('.native-part').onchange=e=>selectPLA(entry,e.target.value);card.querySelector('.native-root').oninput=e=>{state.root=Number(e.target.value);rootControls();};card.querySelector('.native-transition').oninput=e=>{state.transition=Number(e.target.value);rootControls();};card.querySelector('.native-curvature').oninput=e=>{state.curvature=Number(e.target.value);rootControls();};card.querySelector('.native-gap').oninput=e=>{state.gap=Number(e.target.value);rootControls();};
  card.querySelector('.native-peak-rule').onchange=e=>{view.peakRule=e.target.value;changeCut(entry);};card.querySelector('.native-contours').onchange=e=>{view.contours=e.target.checked;engine.dirty=true;};card.querySelector('.native-paper-colours').onclick=()=>{view.mode=0;card.querySelector('.native-photo').disabled=false;card.querySelector('.native-appearance').value='0';legends();engine.dirty=true;};card.querySelector('.native-pca-sampling').onchange=()=>changeCut(entry);card.querySelector('.native-part-colour').onclick=()=>selectPLA(entry,'split');card.querySelector('.native-cut').onchange=()=>{entry.sweepPosition=null;cutSetup(entry);};
  entry.input.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;
   beginManualCut(entry);
   const end=event=>{
    if(event.pointerId!==e.pointerId)return;
    window.removeEventListener('pointerup',end,true);
    window.removeEventListener('pointercancel',end,true);
    endManualCut(entry);
   };
   window.addEventListener('pointerup',end,true);
   window.addEventListener('pointercancel',end,true);
  });
  entry.input.oninput=()=>{
   positionCut(entry,Number(entry.input.value),true);
   entry.sweepPosition=view.cutValue;
   if(!entry.manualCut&&!entry.sweeping){
    clearTimeout(entry.cutTimer);
    entry.cutTimer=setTimeout(()=>{setCutMotion(entry,false);requestCut(entry);},150);
   }
  };
  if(entry.playButton){
   entry.playButton.onclick=()=>{entry.sweepPosition=view.cutValue;setSweep(entry,!entry.sweeping);};
   entry.direction.onchange=()=>{entry.bounceBack=false;};
   entry.speed.oninput=()=>syncSpeedLabel(entry.speed);
  }
  card.querySelector('.native-cut-flip').onchange=e=>{view.flip=e.target.checked?-1:1;engine.dirty=true;};card.querySelector('.native-plane-show').onchange=e=>{view.showPlane=e.target.checked;engine.dirty=true;};card.querySelector('.native-mask-first').onchange=e=>{view.maskBefore=e.target.checked;engine.dirty=true;};
  card.querySelector('.native-spin').onclick=()=>{engine.playing=!engine.playing;qa('.native-spin').forEach(b=>{b.textContent=engine.playing?'Pause rotation':'Play rotation';b.setAttribute('aria-pressed',String(engine.playing));});};
  card.querySelector('.native-focus').onclick=()=>{for(let p=view.element.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;view.element.scrollIntoView({behavior:'instant',block:'center'});engine.dirty=true;};card.querySelector('.native-reset').onclick=()=>engine.camera(view,state.pose);card.querySelector('.native-photo').onclick=e=>{view.static=!view.static;view.fallback(view.static);e.currentTarget.setAttribute('aria-pressed',String(view.static));sourceState();engine.dirty=true;};
 }
 q('#downloadNativeJob').onclick=()=>{const job={size_mm:state.size,domain:q('#domainMode').value,source_faces:74293846,source_vertices:37951699,selected_material_voxels:967429317,retained_closed_void_components:803442,completed_native_tetrahedra:0,status:'deferred by user',native_mask_unchanged_by_display_filters:true};const url=URL.createObjectURL(new Blob([JSON.stringify(job,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='native-domain-'+state.size+'mm.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};q('#domainMode').onchange=updateDomain;
}
function sourceState(){
 for(const{card,view}of viewList){const el=card.querySelector('.native-view-count');if(view.static||!engine.graphicsStarted||engine.failed||engine.lost){el.textContent='74,293,846 source triangles · complete static reference';}else if(view.microtubes&&view.microtubesOnly){el.textContent='CT microtube candidates · native surface hidden';}else if(engine.ready&&view.mode===9&&!engine.photoReady){el.textContent='74,293,846 source faces resident · preparing original natural photograph colours';}else if(engine.ready){el.textContent=`74,293,846 original source triangles · ${view.mesh==='vertices'?'complete native mesh vertices':'complete shared 3D'}${state.part==='whole'?'':state.part==='split'?' · crown / transition / root in three display passes':' · '+state.part+' visible'}`;}else if(engine.preview){el.textContent=`${count(engine.preview.userData.faces)}-face immediate proxy · preparing ${count(engine.faces)} / 74,293,846 native faces`;}view.element.dataset.sharedGpu=String(Boolean(engine.ready));}
}
try{
 [pub,interactive]=await Promise.all([get('./assets/native74-batch-publication.json?v=1'),get('./assets/native-interactive-publication.json?v=3')]);
 const data=await Promise.all([get(interactive.geometry),get(interactive.volume),get(interactive.mask),get(interactive.preview),get(pub.ruler.mesh),get(pub.palette),get(pub.cases[50].field),get(pub.cases[100].field),get(interactive.pca),get(interactive.counts),interactive.natural?.field?get(interactive.natural.field):Promise.resolve(null),get('./assets/curved-zone-guide.json?v=2')]);
 [geometry]=data;const volume=data[1],mask=data[2],preview=data[3],ruler=data[4];palette=data[5];fields={50:data[6],100:data[7]};pca=data[8];stats=data[9];const natural=data[10];if(natural)natural.chunks=natural.chunks.map(p=>({...p,url:new URL(p.url,interactive.natural.base).href}));
 const absolute=(part,base)=>({...part,url:new URL(part.url,base).href});geometry.chunks=geometry.chunks.map(p=>absolute(p,interactive.base));mask.slabs=mask.slabs.map(p=>absolute(p,interactive.base));volume.file=absolute(volume.file,interactive.base);preview.file=absolute(preview.file,interactive.base);
 engine=new NativeEngine({geometry,volume,mask,preview,ruler,pca,natural,neckGuide:data[11].active_display_guide,extra_sources:interactive.extra_sources.map(part=>absolute(part,location.href)),persistent:interactive.persistent},{
  preview:()=>{sourceState();note('Rotatable preview ready. Both sizes and every native face are preparing once for all views.');},
  progress:d=>{q('#nativeLoadProgress').value=d.faces;sourceState();note(`Native detail preparing · ${count(d.faces)} / 74,293,846. Camera movement does not discard loaded source data.`);},
  graphicsState:graphicsUI,
  ready:()=>{sourceState();note('Complete 74,293,846-face geometry ready in every view. Rotate either size with the same native triangles.');},
  cache:d=>{
   const complete=d.geometryAvailable===d.geometryTotal;
   q('#nativeCacheStatus').textContent=d.supported
    ? `Both sizes · ${d.geometryAvailable} / ${d.geometryTotal} verified native bundles cached${complete?' · complete original geometry and colour files':''}. All sources ${d.available} / ${d.total} · ${(d.bytes/1e6).toFixed(1)} MB retained.`
    : 'Persistent browser storage is unavailable. Static renders, videos and streaming 3D are still available online.';
   q('#nativeCacheStatus').dataset.sources=String(d.available);
   q('#nativeCacheStatus').dataset.geometrySources=String(d.geometryAvailable);
   q('#nativeCacheStatus').dataset.sourceFetches=String(d.stats.sourceReads);
   q('#nativeCacheStatus').dataset.cacheHits=String(d.stats.cacheHits);
   const capacity=q('#nativeStorageStatus');
   if(d.stats.storageWarning){capacity.textContent='Cache paused at the browser storage limit. Try again when space is available.';capacity.dataset.warning='true';}
   else if(capacity.dataset.warning){capacity.textContent='';delete capacity.dataset.warning;}
  },
  cacheWarning:()=>{q('#nativeStorageStatus').textContent='The local cache could not finish. Select Check / complete local cache to retry.';},
  colourProgress:n=>{viewList.forEach(e=>e.view.fallback(true));note(`Reusing all native geometry; restoring ${state.size/10} cm colours from local data · ${count(n)} / 74,293,846`);},
  colourComplete:()=>{viewList.forEach(e=>e.view.fallback(e.view.static));sourceState();note('Both views are synchronized. Original geometry reused; current 3MF colours restored.');},
  mask:d=>{
   if(slicePanels?.receive(d))return;
   const entry=viewList.find(e=>e.view.element.id===d.target);
   if(!entry)return;
   entry.pendingMask=null;
   const position=d.axis==='native'? `Native grid ${d.z} · scanner z = ${d.offset_mm.toFixed(3)} mm`:
    `PCA ${d.axis} plane · offset ${d.offset_mm.toFixed(3)} mm from voxel centroid`;
   const contour=d.contour_summary;
   entry.maskText=`${position} · ${count(d.selected_samples)} selected samples · plane grid ${d.sampling_mm.toFixed(3)} mm / ${(d.sampling_mm*1000).toFixed(0)} µm. Original CT sampling 18 µm.`;
   if(contour){
    const kurtosis=contour.curvature_excess_kurtosis;
    entry.maskText+=` Enclosed layer gaps ${count(contour.closed_components)} · red peak candidates ${count(contour.red_pixels)} · curvature excess kurtosis ${kurtosis==null?'undefined':kurtosis.toFixed(3)}.`;
   }
   entry.readout.textContent=entry.maskText;
  },
  maskError:d=>{
   const entry=viewList.find(e=>e.view.element.id===d.target);
   if(!entry){note(d.message);return;}
   if(d.request_id!==entry.view.maskTicket)return;
   entry.pendingMask=null;
   entry.readout.textContent='Voxel plane could not load. Move the cut to retry. '+d.message;
  },
  cutStart:view=>beginManualCut(viewList.find(e=>e.view===view)),
  cutMoved:(view,delta)=>{
   const entry=viewList.find(e=>e.view===view),{input}=entry;
   const min=Number(input.min),max=Number(input.max);
   entry.dragPosition=Math.max(min,Math.min(max,entry.dragPosition+delta*(max-min)));
   positionCut(entry,entry.dragPosition,true);
   entry.sweepPosition=view.cutValue;
  },
  cutEnd:view=>endManualCut(viewList.find(e=>e.view===view)),
  beforeFrame:sweepFrame,
  photoReady:()=>{sourceState();note('Original natural photographic colours ready. All native geometry is reused.');},
  rulerMoved:p=>{q('#nativeRulerX').value=p.x;q('#nativeRulerZ').value=p.z;},note,
  error:t=>{note(t);sourceState();}
 });
 for(const key of ['exterior','art','internal']){
  const card=q(`[data-native-card="${key}"]`);
  const view=engine.addView(card.querySelector('.native-shared-stage'),{mode:key==='exterior'?0:key==='art'?4:8,cut:'none'});
  viewList.push({
   key,card,view,input:card.querySelector('.native-cut-range'),sampling:card.querySelector('.native-pca-sampling'),
   readout:card.querySelector('.native-mask-readout'),valueLabel:card.querySelector('.native-cut-value'),
   playButton:card.querySelector('.native-sweep-play'),speed:card.querySelector('.native-sweep-speed'),
   direction:card.querySelector('.native-sweep-direction')
  });
 }
 document.addEventListener('visibilitychange',()=>{for(const entry of viewList)entry.lastSweepTime=null;});
 activateUI();posters();legends();rootControls();updateDomain();hydrateOtherContent(pub,interactive);renderAnalysis(q('#batchScientificAnalysis'),pub.analysis);
 engine.start();slicePanels=mountSlicePanels(engine,pca,stats,linkPlane);mountAxisMovies(interactive,stats);mountInlineVideoControls(document);mountDomainMetrics(stats);const internalEntry=viewList.find(e=>e.key==='internal');internalEntry.card.querySelector('.native-cut').value='pca3';internalEntry.card.querySelector('.native-pca-sampling').value='.018';cutSetup(internalEntry);viewList.filter(e=>e.key!=='internal').forEach(e=>cutSetup(e));foldSections(engine);navigator.storage?.persist?.().then(kept=>{const status=q('#nativeStorageStatus');if(!status.textContent)status.textContent=kept?'Persistent storage granted.':'Local cache enabled; retention follows browser storage limits.';}).catch(()=>{});
 window.addEventListener('native-shared-state',sourceState);

 if('serviceWorker'in navigator)navigator.serviceWorker.register('./native-precache-r15-sw.js?v=6',{scope:'./',type:'module'}).catch(e=>console.info('Offline shell',e.message));
 window.__nativeSharedR15={engine,state,publication:interactive};
}catch(e){note('The shared native visualizer could not start: '+e.message);console.error(e);}
