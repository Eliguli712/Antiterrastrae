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

export function createAxisMovieController({video,axisInput,directionInput,speedInput,playButton,restartButton,status,downloadLink,downloadGif,scrubber,sweepButton,traceNote,movies}){
 let active=null,activeDirection='forward',pending=null,playAttempt=0;
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
 const startPosition=()=>activeDirection==='reverse'?1:0;
 const firstPosition=()=>largestPosition(active)??startPosition();
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
  playButton.dataset.state=running?'playing':'paused';
  playButton.setAttribute('aria-label',running?'Pause MP4':'Play MP4');
  playButton.title=running?'Pause MP4':'Play MP4';
  if(scrubber){
   const frame=Math.round(position*Number(scrubber.max));
   scrubber.value=String(frame);
   scrubber.setAttribute('aria-valuetext',`Frame ${frame+1} of ${Number(scrubber.max)+1}`);
  }
  const rate=Number(video.playbackRate)||Number(speedInput.value)||1;
  const marker=largest!==null&&Math.abs(largest-position)<1e-6?' · largest section':'';
  const frame=Math.round(position*(Number(active?.frames||1)-1));
  const bounds=active?.cut_offsets_native_mm;
  const offset=Array.isArray(bounds)&&bounds.length===2&&bounds.every(Number.isFinite)
   ?` · offset ${(bounds[0]+position*(bounds[1]-bounds[0])).toFixed(3)} mm`:'';
  const traces=active?.trace_intersections_by_source_frame;
  const intersections=active?.trace_overlay===true&&Array.isArray(traces)&&traces.length===active.frames&&Number.isInteger(traces[frame])
   ?` · ${traces[frame]} candidate cavity centerline crossings`:'';
  const playback=pending?(pending.resume?' · loading clip':''):(video.seeking?' · seeking':'');
  status.textContent=`PCA axis ${axisInput.value} · ${directionInput.value==='reverse'?'Reverse':'Forward'} MP4 · ${rate.toFixed(2)}× · frame ${frame+1} of ${active?.frames||1}${offset}${intersections}${marker}${playback}`;
 }
 function begin(){
  const attempt=++playAttempt;
  if(video.error){video.load();}
  if(pending)pending.resume=true;
  else if(frameSpan()>0&&(video.ended||video.currentTime>=frameSpan()-.5/(Number(active?.fps)||25)))seekSource(startPosition());
  const promise=video.play();
  if(promise?.catch)promise.catch(error=>{
   if(attempt!==playAttempt)return;
   if(pending)pending.resume=false;
   render();
   if(error.name!=='AbortError')status.textContent=video.error
    ?'This MP4 could not be loaded. Its direct download remains available.'
    :'Playback paused by the browser. Select Play MP4 to try again.';
  });
  render();
 }
 function seekPosition(position){
  if(pending){
   pending.position=position;
   if(video.preload==='none'){video.preload='metadata';video.load();}
  }else seekSource(position);
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
  ++playAttempt;
  video.pause();
  active=movie;
  activeDirection=direction;
  pending={position,resume};
  video.poster=movie.poster;
  video.src=url;
  video.setAttribute('aria-label',`Native cavity walls, principal axis ${movie.axis}, ${direction} playback`);
  downloadLink.href=url;
  downloadLink.textContent=`Download PCA axis ${movie.axis} · ${direction} MP4`;
  const gifURL=direction==='reverse'?movie.reverse_gif_url:movie.gif_url;
  if(downloadGif){
   downloadGif.hidden=!gifURL;
   if(gifURL){
    downloadGif.href=gifURL;
    downloadGif.textContent=`Download PCA axis ${movie.axis} · ${direction} GIF`;
   }
  }
  if(scrubber)scrubber.max=String(movie.frames-1);
  if(traceNote)traceNote.hidden=movie.trace_overlay!==true;
  video.load();
  if(resume)begin();
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
  if(resume&&video.paused)begin();
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
 function pause(){
  ++playAttempt;
  if(pending)pending.resume=false;
  video.pause();
  render();
 }
 function toggle(){if(playing())pause();else begin();}
 playButton.onclick=toggle;
 if(scrubber)scrubber.oninput=()=>seekPosition(Number(scrubber.value)/Number(scrubber.max));
 restartButton.onclick=()=>{pause();seekPosition(firstPosition());};
 if(sweepButton)sweepButton.onclick=()=>{seekPosition(startPosition());begin();};
 switchSource();
 return{sourcePosition,playing,refresh:render,pause,toggle};
}

export function mountAxisMovies(interactive,stats){
 const host=document.createElement('section');
 host.className='native-axis-movies';
 host.id='native-pca-movies';
 host.innerHTML=`
  <h3>Fixed-axis reference and downloads</h3>
  <p>Each video faces its cut plane directly. The plane moves perpendicular to the selected PCA axis through 300 positions on the 74,293,846-triangle source mesh. Each MP4 is 1,920 × 1,080 pixels and runs for 12 seconds at 1×. The still frame shows the largest measured section. To record the actual interactive view at any angle, use Record this view in the live section above. Play full sweep to see the entire direction, or drag the source-frame slider to inspect an individual plane.</p>
  <article class="native-axis-movie">
   <h4>Three PCA axes</h4>
   <div class="native-movie-slot">
    <div class="native-movie-surface">
     <div class="native-view-tools native-movie-controls">
      <label>PCA playback axis
       <select id="nativeMovieAxis"><option value="1">PCA axis 1</option><option value="2">PCA axis 2</option><option value="3" selected>PCA axis 3</option></select>
      </label>
      <label>Playback direction
       <select id="nativeMovieDirection"><option value="forward">Forward</option><option value="reverse">Reverse</option></select>
      </label>
      ${speedControl('MP4 playback speed','native-movie-speed','nativeMovieSpeed')}
      <button id="nativeMovieSweep" type="button">Play full sweep</button>
      <button id="nativeMovieRestart" type="button">Largest section</button>
     </div>
     <div class="inline-video">
      <video id="nativePCAVideo" data-inline-play controls playsinline preload="none" width="1920" height="1080" aria-label="Native cavity walls, selected principal axis"></video>
      <button id="nativeMoviePlay" class="inline-video-play" type="button" aria-label="Play MP4" aria-controls="nativePCAVideo"><span aria-hidden="true"></span></button>
     </div>
     <label class="native-speed-control"><span>Source frame</span><input id="nativeMovieScrubber" type="range" min="0" max="299" value="80"></label>
     <p id="nativeMovieStatus" class="native-movie-status" role="status" aria-live="off"></p>
     <p class="native-movie-trace-note" hidden>Markers locate crossings of registered CT-derived candidate cavity centerlines with the selected principal-axis plane. Red rings mark the original trace subset. Blue squares mark the fine-envelope extension. Both symbols are enlarged for visibility. Tissue identity remains unverified.</p>
    </div>
   </div>
   <div class="batch-downloads">
    <a class="native-current-movie" download>Download selected axis · MP4</a>
    <a class="native-current-gif" download>Download selected axis · GIF</a>
    <a href="${interactive.movie_record}">Frame and source audit</a>
   </div>
   <div class="native-pca-metrics"></div>
  </article>`;
 const fallback=document.querySelector('#nativePCAFallback');
 if(fallback)fallback.replaceWith(host);
 else document.querySelector('#nativeInternalMount').insertAdjacentElement('afterend',host);
 const video=host.querySelector('video');
 const controller=createAxisMovieController({
  video,axisInput:host.querySelector('#nativeMovieAxis'),directionInput:host.querySelector('#nativeMovieDirection'),
  speedInput:host.querySelector('#nativeMovieSpeed'),playButton:host.querySelector('#nativeMoviePlay'),
  restartButton:host.querySelector('#nativeMovieRestart'),sweepButton:host.querySelector('#nativeMovieSweep'),scrubber:host.querySelector('#nativeMovieScrubber'),
  status:host.querySelector('#nativeMovieStatus'),downloadLink:host.querySelector('.native-current-movie'),
  downloadGif:host.querySelector('.native-current-gif'),traceNote:host.querySelector('.native-movie-trace-note'),movies:interactive.movies
 });
 const mountStats=counts=>{if(counts)host.querySelector('.native-pca-metrics').innerHTML=domainMetrics(counts,'video: 300 temporal cut positions');};
 document.addEventListener('toggle',event=>{
  const fold=event.target;
  if(fold.tagName==='DETAILS'&&!fold.open&&fold.contains(host))controller.pause();
 },true);
 mountStats(stats);
 return{host,toggle:controller.toggle,playing:controller.playing,pause:controller.pause,video,mountStats};
}
export function mountSlicePanels(engine,pca,stats,onLink){
 const host=document.querySelector('.ct-planes'),panels=new Map();
 const sourceImages=Array.from(host.querySelectorAll('img'),image=>image.src);
 host.innerHTML='';
 const root='https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/37ea516b75facd7dacbaacb332c4b5c522d15ad1/assets/ct-native-r14/';
 for(const [index,z]of[[0,1443],[1,2600]]){
  const target='native-mask-panel-'+index,figure=document.createElement('figure');figure.className='native-slice-panel';figure.innerHTML=`<h4>${index?'Near-root section':'Middle section'} · movable original mask</h4><div class="native-panel-tools"><label>Section axis<select class="native-panel-axis"><option value="native">Original axial Z</option><option value="1">PCA axis 1</option><option value="2">PCA axis 2</option><option value="3">PCA axis 3</option></select></label><label>Plane sampling<select class="native-panel-sampling"><option value=".072">0.072 mm / 72 µm · quick</option><option value=".018" selected>0.018 mm / 18 µm</option></select></label><label>Move section<input type="range" class="native-panel-offset" min="0" max="2885" step="1" value="${z}"></label><label>Peak rule<select class="native-panel-peak-rule"><option value="tail99" selected>99th-percentile curvature tail</option><option value="conservative6MAD">Conservative 6 MAD</option></select></label><label><input class="native-panel-contours" type="checkbox" checked>Show enclosed-gap contours</label><label><input class="native-panel-link" type="checkbox" ${''}>Link active plane to 3D</label>${speedControl('2D section speed','native-panel-speed')}<div><button class="native-panel-load">Load native section</button><button class="native-panel-play" aria-pressed="false">Play section sweep</button><button class="native-panel-maximum">Maximum-area PCA plane</button></div></div><canvas class="native-slice-canvas" width="746" height="1903" tabindex="0" hidden aria-label="${index?'Near-root':'Middle'} binary section; drag to move through the selected axis"></canvas><img class="native-slice-still" alt="Original 18 µm binary section" loading="lazy" width="746" height="1903"><figcaption class="native-panel-readout">Original 18 µm binary section. Select Load native section to adjust the plane.</figcaption><div class="batch-downloads"><a href="${root+(index?'native_mask_near_root_z2600.gif':'native_mask_middle_z1443.gif')}" download>Original pixel-exact GIF</a></div>${domainMetrics(stats)}`;host.append(figure);
  const still=figure.querySelector('.native-slice-still');
  if(sourceImages[index])still.src=sourceImages[index];
  else still.hidden=true;
  const load=figure.querySelector('.native-panel-load');
  const panel={target,figure,z,playing:false,timer:null};panels.set(target,panel);const axis=figure.querySelector('.native-panel-axis'),offset=figure.querySelector('.native-panel-offset'),sampling=figure.querySelector('.native-panel-sampling');
  const request=()=>{panel.timer=null;const value=Number(offset.value);figure.querySelector('.native-panel-readout').textContent=axis.value==='native'?`Preparing native plane ${Math.round(value)}…`:`Constructing PCA ${axis.value} at ${value.toFixed(6)} mm from original voxels…`;engine.worker.postMessage({type:'section',target,axis:axis.value,z:value,offset_mm:value,sampling_mm:Number(sampling.value),peak_rule:figure.querySelector('.native-panel-peak-rule').value});};
  panel.request=request;
  load.onclick=request;
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
  figure.querySelector('.native-panel-contours').onchange=()=>{if(panel.last)panel.paint(panel.last);};figure.querySelector('.native-panel-link').onchange=e=>{if(e.target.checked){panels.forEach(p=>{if(p!==panel)p.figure.querySelector('.native-panel-link').checked=false;});if(panel.last)onLink(panel.last);}};panel.link=()=>figure.querySelector('.native-panel-link').checked;panel.stop=stop;
 }
 document.addEventListener('toggle',event=>{
  const fold=event.target;
  if(fold.tagName!=='DETAILS'||fold.open)return;
  for(const panel of panels.values())if(fold.contains(panel.figure))panel.stop();
 },true);
 return{receive(d){const panel=panels.get(d.target);if(!panel)return false;const canvas=panel.figure.querySelector('canvas');panel.figure.querySelector('.native-slice-still').hidden=true;panel.figure.querySelector('.native-panel-load').hidden=true;canvas.hidden=false;canvas.width=d.width;canvas.height=d.height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(d.width,d.height);const enabled=panel.figure.querySelector('.native-panel-contours').checked;for(let i=0;i<d.data.length;i++){const j=i*4,flags=enabled?(d.overlay?.[i]||0):0,value=d.data[i];const shade=flags&2?46:flags&1?0:value;image.data.fill(shade,j,j+3);image.data[j+3]=255;}ctx.putImageData(image,0,0);canvas.dataset.selectedSamples=String(d.selected_samples);canvas.dataset.samplingMm=String(d.sampling_mm);panel.figure.querySelector('.native-panel-readout').textContent=d.axis==='native'?`Original axial grid ${d.z} · z = ${d.offset_mm.toFixed(6)} mm · ${count(d.selected_samples)} material pixels · 0.018 mm / 18 µm`:`PCA ${d.axis} · offset ${d.offset_mm.toFixed(6)} mm · ${count(d.selected_samples)} selected samples · display grid ${d.sampling_mm.toFixed(3)} mm / ${(d.sampling_mm*1000).toFixed(0)} µm. Nearest original 18 µm voxels; no interpolated detail.`;panel.last=d;panel.paint=value=>{const toggle=panel.figure.querySelector('.native-panel-link'),old=toggle.checked;toggle.checked=false;this.receive(value);toggle.checked=old;};if(panel.link())onLink(d);if(d.contour_summary)panel.figure.querySelector('.native-panel-readout').textContent+=` Enclosed-gap contours: ${count(d.contour_summary.closed_components)} components; curvature-tail pixels: ${count(d.contour_summary.red_pixels)}. Curvature excess kurtosis: ${d.contour_summary.curvature_excess_kurtosis==null?'undefined':d.contour_summary.curvature_excess_kurtosis.toFixed(3)}.`;if(panel.playing)panel.playTimer=setTimeout(()=>panel.advance?.(),100);return true;},fail(d){
  const panel=panels.get(d.target);
  if(!panel)return false;
  panel.stop();
  panel.figure.querySelector('.native-panel-load').hidden=false;
  panel.figure.querySelector('.native-panel-readout').textContent='The requested section could not load. Use Load native section to retry or download the original GIF.';
  return true;
 },stop(){panels.forEach(p=>p.stop());}};
}

export function revealSection(element){for(let p=element.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;element.scrollIntoView({behavior:'auto',block:'start'});}
export function foldSections(engine){
 const fold=(element,heading,kind)=>{if(!heading||element.dataset.foldedNative)return;const details=document.createElement('details'),summary=document.createElement('summary'),content=document.createElement('div');details.className='native-fold '+kind;details.open=true;content.className='native-fold-content';element.dataset.foldedNative='true';heading.remove();summary.append(heading);summary.title='Collapse or expand this section';details.append(summary,content);while(element.firstChild)content.append(element.firstChild);element.append(details);};
 document.addEventListener('toggle',event=>{
  if(event.target.tagName!=='DETAILS')return;
  engine.dirty=true;
  engine.views.forEach(view=>engine.fit(view));
 },true);
 document.querySelectorAll('.native-view-card').forEach(e=>fold(e,e.querySelector('.native-view-heading h3'),'native-view-fold'));
 document.querySelectorAll('.native-axis-movie,.native-slice-panel').forEach(e=>fold(e,e.querySelector('h4'),'native-small-fold'));
 document.querySelectorAll('main>section:not(.introduction)').forEach(e=>fold(e,e.querySelector('h2'),'native-major-fold'));
 document.querySelectorAll('.batch-analysis,.native-filter-note,.native-axis-movies,.native-archive-note').forEach(e=>fold(e,e.querySelector('h3'),'native-small-fold'));
}
