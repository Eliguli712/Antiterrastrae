/* Shared mouse, touch, pen, keyboard and trackpad camera controls. */
window.ToothGestures={bind(canvas,camera,changed){
  const active=new Map();let previous=null,wheelTimer;
  canvas.tabIndex=0;canvas.style.touchAction='none';
  function multiply(a,b){return[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
  function sample(){const p=[...active.values()];if(!p.length)return null;return{x:p.reduce((a,v)=>a+v.x,0)/p.length,y:p.reduce((a,v)=>a+v.y,0)/p.length,count:p.length,distance:p.length>1?Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y):0};}
  function rotate(dx,dy){camera.q=multiply([Math.sin(dy/2),0,0,Math.cos(dy/2)],multiply([0,Math.sin(dx/2),0,Math.cos(dx/2)],camera.q));const n=Math.hypot(...camera.q);camera.q=camera.q.map(v=>v/n);camera.preset='custom';canvas.dataset.cameraView='custom';}
  function update(){const next=sample();if(previous&&next&&next.count===previous.count){rotate((next.x-previous.x)*.006,(next.y-previous.y)*.006);if(next.count>1&&previous.distance>2)camera.zoom=Math.max(.35,Math.min(5,camera.zoom*next.distance/previous.distance));}previous=next;camera.moving=active.size>0;changed();}
  function release(e){active.delete(e.pointerId);previous=sample();camera.moving=active.size>0;changed();}
  if('PointerEvent' in window){
    canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;active.set(e.pointerId,{x:e.clientX,y:e.clientY});previous=sample();camera.moving=true;canvas.setPointerCapture(e.pointerId);changed();});
    canvas.addEventListener('pointermove',e=>{if(!active.has(e.pointerId))return;active.set(e.pointerId,{x:e.clientX,y:e.clientY});update();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,release);
  }else{
    function touch(e){e.preventDefault();const old=active.size;active.clear();for(const t of e.touches)active.set(t.identifier,{x:t.clientX,y:t.clientY});if(old!==active.size)previous=sample();update();}
    for(const event of ['touchstart','touchmove','touchend','touchcancel'])canvas.addEventListener(event,touch,{passive:false});
    canvas.addEventListener('mousedown',e=>{active.set('mouse',{x:e.clientX,y:e.clientY});previous=sample();});
    window.addEventListener('mousemove',e=>{if(active.has('mouse')){active.set('mouse',{x:e.clientX,y:e.clientY});update();}});window.addEventListener('mouseup',()=>{active.clear();previous=null;camera.moving=false;changed();});
  }
  canvas.addEventListener('wheel',e=>{e.preventDefault();camera.moving=true;if(e.ctrlKey||Math.abs(e.deltaY)>=50&&Math.abs(e.deltaX)<1)camera.zoom=Math.max(.35,Math.min(5,camera.zoom*Math.exp(-e.deltaY*.003)));else rotate(e.deltaX*.004,e.deltaY*.004);changed();clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{camera.moving=false;changed();},160);},{passive:false});
  let safariZoom=1;canvas.addEventListener('gesturestart',e=>{e.preventDefault();safariZoom=camera.zoom;camera.moving=true;},{passive:false});canvas.addEventListener('gesturechange',e=>{e.preventDefault();camera.zoom=Math.max(.35,Math.min(5,safariZoom*e.scale));changed();},{passive:false});canvas.addEventListener('gestureend',e=>{e.preventDefault();camera.moving=false;changed();},{passive:false});
  canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();rotate((e.key==='ArrowRight'?.12:e.key==='ArrowLeft'?-.12:0),(e.key==='ArrowDown'?.12:e.key==='ArrowUp'?-.12:0));}else if(['+','=','-'].includes(e.key)){e.preventDefault();camera.zoom=Math.max(.35,Math.min(5,camera.zoom*(e.key==='-'?.9:1.1)));}else if(e.key==='Home'){camera.q=[0,0,0,1];camera.zoom=1;camera.preset='front';}else return;changed();});
  window.addEventListener('blur',()=>{active.clear();previous=null;camera.moving=false;changed();});
}};
