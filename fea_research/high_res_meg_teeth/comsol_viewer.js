(async()=>{
 const data=JSON.parse(document.getElementById('tooth-data').textContent),canvas=document.querySelector('[data-comsol-canvas]'),status=document.querySelector('[data-comsol-status]'),error=document.querySelector('[data-comsol-error]'),retry=document.querySelector('[data-comsol-retry]');
 const camera={q:[0,0,0,1],zoom:1,preset:'front'},stream=Tooth3D.stream('data/natural32m-manifest.json');let light;
 const state={display:'continuous',appearance:'field',quality:'detailed',lighting:false};const palette=data.legend;
 Tooth3D.configure([{key:'comsol',limits:data.clim,palette,log:false}],stream);
 function colorize(mesh){const values=Tooth3D.decode(mesh.values,Float32Array),rgb=new Uint8Array(values.length*3);for(let i=0;i<values.length;i++){const j=Math.max(0,Math.min(palette.length-1,Math.round((values[i]-data.clim[0])/(data.clim[1]-data.clim[0])*(palette.length-1))));rgb.set(palette[j],i*3);}return rgb;}
 let renderer;try{renderer=new Tooth3D.Renderer(canvas,camera,draw,colorize);}catch(e){error.hidden=false;error.textContent=e.message;return;}
 let queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;draw();});}
 function draw(){if(!renderer||!light)return;if(renderer.lost){status.textContent='Restoring 3D graphics; downloaded source geometry is preserved.';return;}try{error.hidden=true;renderer.clear();const full=state.quality==='detailed'&&stream.ready;for(const mesh of full?stream.chunks:light.batches)renderer.render(mesh,{appearance:state.appearance,type:'comsol',lighting:state.lighting,points:state.display==='scattered'});
 status.textContent=(state.quality==='detailed'?stream.status():light.display_faces.toLocaleString()+' light display faces')+' · '+(state.appearance==='field'?'archived COMSOL field in Pa, projected onto the CT; no new solve':state.appearance==='natural'?'original embedded natural fossil colors':'paper-color reference; no numerical values');retry.hidden=!stream.error;
 document.querySelector('[data-comsol-legend]').hidden=state.appearance!=='field';document.querySelectorAll('[data-figure-mode]').forEach(f=>f.hidden=f.dataset.figureMode!==state.display);
 }catch(e){error.hidden=false;error.textContent=e.message;}}
 for(const [id,key]of [['display-select','display'],['appearance-select','appearance'],['model-quality','quality']])document.getElementById(id).addEventListener('change',e=>{state[key]=e.target.value;if(key==='quality')renderer.release();stream.setActive('comsol',state.quality==='detailed');schedule();});
 document.getElementById('comsol-lighting').addEventListener('change',e=>{state.lighting=e.target.checked;schedule();});
 const presets={front:[0,0,0,1],oblique:[0,Math.sin(Math.PI/12),0,Math.cos(Math.PI/12)],reverse:[0,1,0,0]};document.querySelectorAll('[data-comsol-camera]').forEach(b=>b.addEventListener('click',()=>{camera.q=[...presets[b.dataset.comsolCamera]];camera.zoom=1;schedule();}));
 const gradient=document.querySelector('[data-comsol-gradient]');gradient.style.background='linear-gradient(90deg,'+palette.map(c=>'rgb('+c.join(',')+')').join(',')+')';document.querySelector('[data-comsol-limits]').textContent=Math.round(data.clim[0]).toLocaleString()+' – '+Math.round(data.clim[1]).toLocaleString()+' Pa';
 retry.addEventListener('click',()=>stream.load());stream.subscribe(schedule);try{light=await Tooth3D.json('data/naturalct-light420k.json.gz');stream.setActive('comsol',true);schedule();}catch(e){error.hidden=false;error.textContent=e.message;}
})();
