/* Full 32M source views; all lightweight views are 420K portable surfaces. */
(() => {
 for(const details of document.querySelectorAll('[data-model-viewer]')){
  const key=details.dataset.modelViewer,canvas=details.querySelector('canvas'),status=details.querySelector('[data-model-status]'),error=details.querySelector('[data-model-error]'),quality=details.querySelector('[data-model-quality]'),appearance=details.querySelector('[data-model-appearance]'),retry=details.querySelector('[data-model-retry]');
  const stream=Tooth3D.stream(key==='naturalct'?'data/natural32m-manifest.json':'data/full31m-manifest.json'),cam={q:[0,0,1,0],zoom:1};let renderer,light,queue=false;
  function schedule(){if(queue)return;queue=true;requestAnimationFrame(()=>{queue=false;draw();});}
  function draw(){if(!details.open||!renderer||!light)return;if(renderer.lost){status.textContent='Restoring 3D graphics; source geometry is preserved.';return;}error.hidden=true;try{renderer.clear();const full=quality.value==='detailed'&&stream.ready,meshes=full?stream.chunks:light.batches;for(const mesh of meshes)renderer.render(mesh,{appearance:appearance.value,lighting:true});
   const prefix=quality.value==='detailed'?stream.status():light.display_faces.toLocaleString()+' light display faces';const colorNote=appearance.value==='stress'?'paper-color reference; no numerical values':key==='naturalct'?'original embedded fossil colors':'registered natural colors on CT-derived geometry';status.textContent=prefix+(key==='native74'&&full?' · 32M reconstruction of the same CT; unchanged 74M native source downloadable below.':'')+' · '+colorNote;retry.hidden=!stream.error;
  }catch(e){error.hidden=false;error.textContent=e.message;}}
  async function load(){if(!details.open)return;try{if(!light)light=await Tooth3D.json('data/'+key+'-light420k.json.gz');if(!renderer)renderer=new Tooth3D.Renderer(canvas,cam,schedule);stream.setActive(key,quality.value==='detailed');schedule();}catch(e){error.hidden=false;error.textContent=e.message;}}
  stream.subscribe(schedule);details.addEventListener('toggle',()=>{if(details.open)load();else{stream.setActive(key,false);renderer?.release();}});quality.addEventListener('change',()=>{renderer?.release();load();});appearance.addEventListener('change',schedule);retry.addEventListener('click',()=>stream.load());if(details.open)load();
 }
})();
