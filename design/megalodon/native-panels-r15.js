const count=n=>Number(n).toLocaleString('en-US');
export function domainMetrics(stats,extra=''){
 return `<div class="native-domain-metrics"><p>Whole unchanged source domain${extra?' · '+extra:''}</p><dl><div><dt>Material voxels</dt><dd>${count(stats.selected_material_voxels)}</dd></div><div><dt>Internal material voxels · six neighbours</dt><dd>${count(stats.strict_interior_material_voxels_6_neighbours)}</dd></div><div><dt>Enclosed background voxels · 6-connected</dt><dd>${count(stats.closed_internal_background_voxels_6_connectivity)}</dd></div><div><dt>Original source surface triangles</dt><dd>74,293,846</dd></div><div><dt>Complete native grid voxels</dt><dd>${count(stats.grid_voxels)}</dd></div><div><dt>Native sampling interval</dt><dd>0.018 mm / 18 µm</dd></div></dl><p class="native-metric-note">Counts refer to the complete source domain, before display clipping or crown–root separation. Sampling interval does not certify physical measurement accuracy.</p></div>`;
}
export function mountDomainMetrics(stats){
 document.querySelectorAll('.native-view-card,.ct-movies article,.batch-plate-fig,.batch-analysis figure,.native-filter-note').forEach(e=>{if(!e.querySelector('.native-domain-metrics'))e.insertAdjacentHTML('beforeend',domainMetrics(stats,e.matches('.native-filter-note')?'filtered intensity display 0.144 mm / 144 µm':''));});
}
export function speedControl(label, inputClass, id=''){
 return `<label class="native-speed-control"><span>${label}</span><input type="range" class="${inputClass}" ${id?`id="${id}"`:''} min="1" max="10" step=".1" value="1" aria-valuetext="1×"><output class="native-speed-readout">1×</output><span class="native-speed-limits" aria-hidden="true"><span>1×</span><span>10×</span></span></label>`;
}
export function syncSpeedLabel(input){
 const value=Number(input.value);
 const label=`${Number.isInteger(value)?value:value.toFixed(1)}×`;
 input.setAttribute?.('aria-valuetext',label);
 const readout=input.parentElement?.querySelector('.native-speed-readout');
 if(readout)readout.textContent=label;
 return value;
}

export function createAxisMovieController({video,axisInput,directionInput,speedInput,playButton,restartButton,status,downloadLink,movies}){
 let active=null,activeDirection='forward',pending=null;
 const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
 const frameSpan=()=>Math.max(0,(Number.isFinite(video.duration)?video.duration:0)-1/(Number(active?.fps)||25));
 function largestPosition(movie){
  const frame=movie?.maximum_section?.source_frame_index;
  if(!Number.isInteger(frame)||!Number.isInteger(movie.frames)||movie.frames<2||frame<0||frame>=movie.frames||!(movie.fps>0))return null;
  return frame/(movie.frames-1);
 }
 function sourcePosition(){
  if(pending)return pending.position;
  if(!active)return 0;
  const span=frameSpan();
  let position=span>0?clamp(video.currentTime/span):0;
  if(largestPosition(active)!==null){
   const decoded=Math.min(active.frames-1,Math.floor(video.currentTime*active.fps+1e-6));
   position=clamp(decoded/(active.frames-1));
  }
  return activeDirection==='reverse'?1-position:position;
 }
 const playing=()=>Boolean(pending?.resume)||!video.paused&&!video.ended;
 const firstPosition=()=>largestPosition(active)??(activeDirection==='reverse'?1:0);
 function seekSource(position){
  if(!Number.isFinite(video.duration)||video.duration<=0)return;
  const encoded=activeDirection==='reverse'?1-clamp(position):clamp(position);
  if(largestPosition(active)!==null){
   const frame=Math.round(encoded*(active.frames-1));
   // Seek inside the frame interval so rounded frame-start PTS cannot show its neighbor.
   video.currentTime=Math.min(video.duration,(frame+.5)/active.fps);
  }else video.currentTime=encoded*frameSpan();
 }
 function render(){
  const running=playing(),position=sourcePosition(),largest=largestPosition(active);
  playButton.textContent=running?'Pause MP4':'Play MP4';
  playButton.setAttribute('aria-pressed',String(running));
  const rate=Number(video.playbackRate)||Number(speedInput.value)||1;
  const marker=largest!==null&&Math.abs(largest-position)<1e-6?' · largest section':'';
  status.textContent=`PCA axis ${axisInput.value} · ${directionInput.value==='reverse'?'Reverse':'Forward'} MP4 · ${rate.toFixed(2)}× · source position ${(position*100).toFixed(1)}%${marker}${pending?' · preparing selected clip':''}`;
 }
 function begin(){
  if(pending){pending.resume=true;render();return;}
  if(frameSpan()>0&&(video.ended||video.currentTime>=frameSpan()-.5/(Number(active?.fps)||25)))seekSource(firstPosition());
  const promise=video.play();
  if(promise?.catch)promise.catch(()=>{render();status.textContent='Playback paused by the browser. Use Play MP4 to start the selected clip.';});
  render();
 }
 function switchSource(){
  const movie=movies.find(m=>Number(m.axis)===Number(axisInput.value));
  if(!movie){status.textContent='The selected PCA clip is unavailable.';return;}
  const resume=playing(),position=movie!==active?largestPosition(movie)??sourcePosition():sourcePosition();
  const reverseURL=movie.reverse_url||movie.reverse?.url;
  const reverseOption=directionInput.querySelector('option[value="reverse"]');
  if(reverseOption)reverseOption.disabled=!reverseURL;
  if(directionInput.value==='reverse'&&!reverseURL)directionInput.value='forward';
  const direction=directionInput.value,url=direction==='reverse'?reverseURL:movie.url;
  video.pause();
  active=movie;
  activeDirection=direction;
  pending={position,resume};
  video.poster=movie.poster;
  video.src=url;
  video.setAttribute('aria-label',`Native cavity walls, principal axis ${movie.axis}, ${direction} playback`);
  downloadLink.href=url;
  downloadLink.textContent=`Download PCA axis ${movie.axis} · ${direction} MP4`;
  video.load();
  render();
 }
 const changeSpeed=()=>{
  const requested=syncSpeedLabel(speedInput)||1;
  try{
   video.playbackRate=requested;
   render();
  }catch{
   render();
   status.textContent=`This browser supports playback up to its current ${video.playbackRate}× rate.`;
  }
 };
 video.addEventListener('loadedmetadata',()=>{
  if(!pending||video.currentSrc&&video.currentSrc!==video.src)return;
  const {position,resume}=pending;
  changeSpeed();
  seekSource(position);
  pending=null;
  if(resume)begin();
  render();
 });
 for(const name of ['play','pause','ended','timeupdate','ratechange','seeked'])video.addEventListener(name,render);
 video.addEventListener('error',()=>{
  pending=null;
  render();
  status.textContent='This MP4 could not be loaded. Its direct download remains available.';
 });
 axisInput.onchange=switchSource;
 directionInput.onchange=switchSource;
 speedInput.oninput=changeSpeed;
 speedInput.onchange=changeSpeed;
 playButton.onclick=()=>{
  if(playing()){if(pending)pending.resume=false;video.pause();render();}
  else begin();
 };
 restartButton.onclick=()=>{
  const position=firstPosition();
  if(pending)pending.position=position;
  else seekSource(position);
  render();
 };
 switchSource();
 return{sourcePosition,playing,refresh:render};
}

export function mountAxisMovies(interactive,stats){
 const host=document.createElement('section');host.className='native-axis-movies';host.id='native-pca-movies';host.innerHTML='<h3>Inside the tooth · principal-axis player</h3><p>Choose any PCA axis in this shared player. Each axis opens at the largest measured section of its 300 frames. MP4 direction and speed are independent of the 3D camera. Each clip uses all 74,293,846 source triangles for its cavity-wall sweep: 50 mm model, 1,920 × 1,080 pixels, 25 fps, 300 positions, 12 seconds at 1×.</p><article class="native-axis-movie"><h4>Three PCA axes · one independent player</h4><div class="native-movie-slot"><div class="native-movie-surface"><div class="native-view-tools native-movie-controls"><label>PCA playback axis<select id="nativeMovieAxis"><option value="1">PCA axis 1</option><option value="2">PCA axis 2</option><option value="3">PCA axis 3</option></select></label><label>MP4 direction<select id="nativeMovieDirection"><option value="forward">Forward</option><option value="reverse">Reverse</option></select></label>' + speedControl('MP4 playback speed','native-movie-speed','nativeMovieSpeed') + '<button id="nativeMoviePlay" aria-pressed="false">Play MP4</button><button id="nativeMovieRestart">Largest section</button></div><div class="native-view-tools native-movie-dock-actions"><button id="nativeMovieDock" aria-pressed="false">Dock MP4</button><button id="nativeMovieFocus" hidden>Focus 3D</button><button id="nativeMovieControls" aria-expanded="true" hidden>Hide controls</button></div><video id="nativePCAVideo" controls playsinline preload="metadata" aria-label="Native cavity walls, selected principal axis"></video><p id="nativeMovieStatus" class="native-movie-status" role="status" aria-live="off"></p></div></div><div class="batch-downloads"><a class="native-current-movie" download>Download selected axis · MP4</a><a href="'+interactive.movie_record+'">Frame / source audit</a></div>'+domainMetrics(stats,'video: 300 temporal cut positions')+'</article>';
 document.querySelector('#nativeInternalMount').insertAdjacentElement('afterend',host);const video=host.querySelector('video'),surface=host.querySelector('.native-movie-surface'),slot=host.querySelector('.native-movie-slot'),dockButton=host.querySelector('#nativeMovieDock'),focusButton=host.querySelector('#nativeMovieFocus');
 const controller=createAxisMovieController({video,axisInput:host.querySelector('#nativeMovieAxis'),directionInput:host.querySelector('#nativeMovieDirection'),speedInput:host.querySelector('#nativeMovieSpeed'),playButton:host.querySelector('#nativeMoviePlay'),restartButton:host.querySelector('#nativeMovieRestart'),status:host.querySelector('#nativeMovieStatus'),downloadLink:host.querySelector('.native-current-movie'),movies:interactive.movies});
 const compactButton=host.querySelector('#nativeMovieControls');
 const controls=host.querySelector('.native-movie-controls');
 let docked=false;
 function setCompact(compact){
  controls.hidden=compact;
  compactButton.setAttribute('aria-expanded',String(!compact));
  compactButton.textContent=compact?'MP4 controls':'Hide controls';
 }
 function dock(value){
  if(value===docked)return;
  const time=video.currentTime,resume=!video.paused&&!video.ended;
  docked=value;
  if(docked){
   slot.style.height=surface.getBoundingClientRect().height+'px';
   surface.classList.add('native-movie-docked');
   document.body.append(surface);
  }else{
   surface.classList.remove('native-movie-docked');
   slot.append(surface);
   slot.style.height='';
   setCompact(false);
  }
  dockButton.setAttribute('aria-pressed',String(docked));
  dockButton.textContent=docked?'Undock MP4':'Dock MP4';
  focusButton.hidden=!docked;
  compactButton.hidden=!docked;
  if(Math.abs(video.currentTime-time)>.05)video.currentTime=time;
  if(resume&&video.paused)video.play().catch(()=>{});
  controller.refresh();
 }
 dockButton.onclick=()=>dock(!docked);
 compactButton.onclick=()=>setCompact(!controls.hidden);
 focusButton.onclick=()=>{
  setCompact(true);
  document.querySelector('[data-native-card="internal"] .native-focus')?.click();
 };
 surface.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||!docked)return;
  e.preventDefault();
  dock(false);
  dockButton.focus({preventScroll:true});
 });
}
export function mountSlicePanels(engine,pca,stats,onLink){
 const host=document.querySelector('.ct-planes'),panels=new Map();host.innerHTML='';
 const root='https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/37ea516b75facd7dacbaacb332c4b5c522d15ad1/assets/ct-native-r14/';
 for(const [index,z]of[[0,1443],[1,2600]]){
  const target='native-mask-panel-'+index,figure=document.createElement('figure');figure.className='native-slice-panel';figure.innerHTML=`<h4>${index?'Near-root section':'Middle section'} · movable original mask</h4><div class="native-panel-tools"><label>Section axis<select class="native-panel-axis"><option value="native">Original axial Z</option><option value="1">PCA axis 1</option><option value="2">PCA axis 2</option><option value="3">PCA axis 3</option></select></label><label>Plane sampling<select class="native-panel-sampling"><option value=".072">0.072 mm / 72 µm · quick</option><option value=".018" selected>0.018 mm / 18 µm</option></select></label><label>Move section<input type="range" class="native-panel-offset" min="0" max="2885" step="1" value="${z}"></label><label>Peak rule<select class="native-panel-peak-rule"><option value="tail99" selected>99th-percentile curvature tail</option><option value="conservative6MAD">Conservative 6 MAD</option></select></label><label><input class="native-panel-contours" type="checkbox" checked>Blue gaps / red curvature peaks</label><label><input class="native-panel-link" type="checkbox" ${''}>Link active plane to 3D</label>${speedControl('2D section speed','native-panel-speed')}<div><button class="native-panel-play" aria-pressed="false">Play section sweep</button><button class="native-panel-maximum">Maximum-area PCA plane</button></div></div><canvas class="native-slice-canvas" width="746" height="1903" tabindex="0" aria-label="${index?'Near-root':'Middle'} binary section; drag to move through the selected axis"></canvas><figcaption class="native-panel-readout">Preparing original binary mask…</figcaption><div class="batch-downloads"><a href="${root+(index?'native_mask_near_root_z2600.gif':'native_mask_middle_z1443.gif')}" download>Original pixel-exact GIF</a></div>${domainMetrics(stats)}`;host.append(figure);
  const panel={target,figure,z,playing:false,timer:null};panels.set(target,panel);const axis=figure.querySelector('.native-panel-axis'),offset=figure.querySelector('.native-panel-offset'),sampling=figure.querySelector('.native-panel-sampling');
  const request=()=>{panel.timer=null;const value=Number(offset.value);figure.querySelector('.native-panel-readout').textContent=axis.value==='native'?`Preparing native plane ${Math.round(value)}…`:`Constructing PCA ${axis.value} at ${value.toFixed(6)} mm from original voxels…`;engine.worker.postMessage({type:'section',target,axis:axis.value,z:value,offset_mm:value,sampling_mm:Number(sampling.value),peak_rule:figure.querySelector('.native-panel-peak-rule').value});};
  panel.request=request;
  const speed=figure.querySelector('.native-panel-speed');
  speed.oninput=()=>syncSpeedLabel(speed);
  const setup=()=>{if(axis.value==='native'){offset.min=0;offset.max=2885;offset.step=1;offset.value=z;}else{const a=pca.axes[Number(axis.value)-1];offset.min=Math.floor(a.offset_range_mm[0]/.018)*.018;offset.max=Math.ceil(a.offset_range_mm[1]/.018)*.018;offset.step=.018;offset.value=a.maximum_area_offset_mm;}request();};axis.onchange=setup;sampling.onchange=request;figure.querySelector('.native-panel-peak-rule').onchange=request;offset.oninput=()=>{clearTimeout(panel.timer);panel.timer=setTimeout(request,100);};
  figure.querySelector('.native-panel-maximum').onclick=()=>{if(axis.value==='native')axis.value='3';setup();};
  const stop=()=>{panel.playing=false;clearTimeout(panel.playTimer);const b=figure.querySelector('.native-panel-play');b.textContent='Play section sweep';b.setAttribute('aria-pressed','false');};
  figure.querySelector('.native-panel-play').onclick=()=>{if(panel.playing){stop();return;}panel.playing=true;const b=figure.querySelector('.native-panel-play');b.textContent='Pause section sweep';b.setAttribute('aria-pressed','true');panel.frameTime=performance.now();
   panel.advance=()=>{
    if(!panel.playing)return;
    const now=performance.now(),min=Number(offset.min),span=Number(offset.max)-min;
    if(span<=0)return;
    const elapsed=Math.min(.8,Math.max(.1,(now-panel.frameTime)/1000));
    panel.frameTime=now;
    offset.value=min+((Number(offset.value)-min+span*elapsed*Number(speed.value)/12)%span);
    request();
   };
   panel.advance();};
  const canvas=figure.querySelector('canvas');let drag=null;canvas.onpointerdown=e=>{stop();drag={x:e.clientX,start:Number(offset.value)};canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;const range=Number(offset.max)-Number(offset.min);offset.value=Math.max(Number(offset.min),Math.min(Number(offset.max),drag.start+(e.clientX-drag.x)/Math.max(1,canvas.clientWidth)*range));clearTimeout(panel.timer);panel.timer=setTimeout(request,120);};canvas.onpointerup=()=>{drag=null;clearTimeout(panel.timer);request();};canvas.onpointercancel=()=>drag=null;
  figure.querySelector('.native-panel-contours').onchange=()=>{if(panel.last)panel.paint(panel.last);};figure.querySelector('.native-panel-link').onchange=e=>{if(e.target.checked){panels.forEach(p=>{if(p!==panel)p.figure.querySelector('.native-panel-link').checked=false;});if(panel.last)onLink(panel.last);}};panel.link=()=>figure.querySelector('.native-panel-link').checked;panel.stop=stop;request();
 }
 return{receive(d){const panel=panels.get(d.target);if(!panel)return false;const canvas=panel.figure.querySelector('canvas');canvas.width=d.width;canvas.height=d.height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(d.width,d.height);const enabled=panel.figure.querySelector('.native-panel-contours').checked;for(let i=0;i<d.data.length;i++){const j=i*4,flags=enabled?(d.overlay?.[i]||0):0,value=d.data[i];image.data[j]=flags&4?245:flags&2?31:flags&1?5:value;image.data[j+1]=flags&4?46:flags&2?161:flags&1?25:value;image.data[j+2]=flags&4?31:flags&2?250:flags&1?52:value;image.data[j+3]=255;}ctx.putImageData(image,0,0);canvas.dataset.selectedSamples=String(d.selected_samples);canvas.dataset.samplingMm=String(d.sampling_mm);panel.figure.querySelector('.native-panel-readout').textContent=d.axis==='native'?`Original axial grid ${d.z} · z = ${d.offset_mm.toFixed(6)} mm · ${count(d.selected_samples)} material pixels · 0.018 mm / 18 µm`:`PCA ${d.axis} · offset ${d.offset_mm.toFixed(6)} mm · ${count(d.selected_samples)} selected samples · display grid ${d.sampling_mm.toFixed(3)} mm / ${(d.sampling_mm*1000).toFixed(0)} µm. Nearest original 18 µm voxels; no interpolated detail.`;panel.last=d;panel.paint=value=>{const toggle=panel.figure.querySelector('.native-panel-link'),old=toggle.checked;toggle.checked=false;this.receive(value);toggle.checked=old;};if(panel.link())onLink(d);if(d.contour_summary)panel.figure.querySelector('.native-panel-readout').textContent+=` Blue gap contours: ${count(d.contour_summary.closed_components)} components; red peak candidates: ${count(d.contour_summary.red_pixels)}. Curvature excess kurtosis: ${d.contour_summary.curvature_excess_kurtosis==null?'undefined':d.contour_summary.curvature_excess_kurtosis.toFixed(3)}.`;if(panel.playing)panel.playTimer=setTimeout(()=>panel.advance?.(),100);return true;},stop(){panels.forEach(p=>p.stop());}};
}

export function revealSection(element){for(let p=element.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;element.scrollIntoView({behavior:'auto',block:'start'});}
export function foldSections(engine){
 const fold=(element,heading,kind)=>{if(!heading||element.dataset.foldedNative)return;const details=document.createElement('details'),summary=document.createElement('summary'),content=document.createElement('div');details.className='native-fold '+kind;details.open=true;content.className='native-fold-content';element.dataset.foldedNative='true';heading.remove();summary.append(heading);summary.title='Collapse or expand this section';details.append(summary,content);while(element.firstChild)content.append(element.firstChild);element.append(details);details.addEventListener('toggle',()=>{engine.dirty=true;engine.views.forEach(v=>engine.fit(v));});};
 document.querySelectorAll('.native-view-card').forEach(e=>fold(e,e.querySelector('.native-view-heading h3'),'native-view-fold'));
 document.querySelectorAll('.native-axis-movie,.native-slice-panel').forEach(e=>fold(e,e.querySelector('h4'),'native-small-fold'));
 document.querySelectorAll('main>section:not(.introduction)').forEach(e=>fold(e,e.querySelector('h2'),'native-major-fold'));
 document.querySelectorAll('.batch-analysis,.native-filter-note,.native-axis-movies,.native-archive-note').forEach(e=>fold(e,e.querySelector('h3'),'native-small-fold'));
}
