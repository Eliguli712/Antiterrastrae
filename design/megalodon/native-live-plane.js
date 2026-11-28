const add = (a,b) => a.map((x,i)=>x+b[i]);
const mul = (a,s) => a.map(x=>x*s);
const dot = (a,b) => a.reduce((sum,x,i)=>sum+x*b[i],0);
const rotate = (a,b,t) => [add(mul(a,Math.cos(t)),mul(b,Math.sin(t))),
                           add(mul(a,-Math.sin(t)),mul(b,Math.cos(t)))];

export function obliqueFrame(principal,bearing,tilt) {
  const base=principal.axes[2];
  const [yawed,right]=rotate(base.normal,base.u,bearing*Math.PI/180);
  const [normal,up]=rotate(yawed,base.v,tilt*Math.PI/180);
  const range=direction=>principal.axes.reduce(([low,high],axis)=>{
    const dotProduct=dot(direction,axis.normal);
    const values=axis.offset_range_mm.map(bound=>bound*dotProduct);
    return [low+Math.min(...values),high+Math.max(...values)];
  },[0,0]).map((x,i)=>x+(i?1:-1));
  return {normal,u:right,v:up,offset_range_mm:range(normal),u_range_mm:range(right),v_range_mm:range(up)};
}

// The recorder reads the actual current internal scissor rectangle immediately
// after WebGL renders. It never seeks or substitutes an archived movie.
export function createCutRecorder(status,download) {
  let active,previousURL;
  function end(){
    if(active?.recorder.state==='recording')active.recorder.stop();
  }
  function begin(engine,view){
    if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){
      status.textContent='This browser cannot record the live canvas. Fixed-axis MP4 and GIF downloads are available.';
      return false;
    }
    const r=view.element.getBoundingClientRect();
    if(r.bottom<=0||r.top>=innerHeight||r.width<2){
      status.textContent='Scroll the live section into view before recording.';
      return false;
    }
    download.hidden=true;
    const canvas=document.createElement('canvas');
    const scale=engine.canvas.width/innerWidth;
    canvas.width=Math.min(1920,Math.round(r.width*scale));
    canvas.height=Math.round(canvas.width*r.height/r.width);
    const ctx=canvas.getContext('2d',{alpha:false});
    const stream=canvas.captureStream(30);
    const mimeType=['video/mp4;codecs=avc1.420032','video/webm;codecs=vp9','video/webm']
      .find(type=>MediaRecorder.isTypeSupported(type));
    let recorder;
    try {recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);}
    catch(error){stream.getTracks().forEach(t=>t.stop());status.textContent=error.message;return false;}
    const chunks=[];
    const record={view,canvas,ctx,stream,recorder,frames:0};
    active=record;
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onerror=()=>{status.textContent='Live recording interrupted.';end();};
    recorder.onstop=()=>{
      stream.getTracks().forEach(t=>t.stop());
      if(active===record)active=null;
      if(previousURL)URL.revokeObjectURL(previousURL);
      if(!record.frames||!chunks.length){status.textContent='No rendered frames were recorded.';return;}
      const type=recorder.mimeType||chunks[0].type||'video/webm';
      previousURL=URL.createObjectURL(new Blob(chunks,{type}));
      download.href=previousURL;
      download.download='Megalodon-live-section.'+(type.includes('mp4')?'mp4':'webm');
      download.hidden=false;
      status.textContent='Recording ready. It contains the section and angles displayed during capture.';
    };
    recorder.start();
    engine.dirty=true;
    status.textContent='Recording the live section…';
    return true;
  }
  function frame(engine){
    if(!active||active.recorder.state!=='recording')return;
    const {view,canvas,ctx}=active;
    if(view.posterVisible||view.element.dataset.nativeLayer!=='section'){
      end();return;
    }
    const r=view.element.getBoundingClientRect(),src=engine.canvas;
    const sx=src.width/innerWidth,sy=src.height/innerHeight;
    const x0=Math.max(0,r.left),x1=Math.min(innerWidth,r.right);
    const y0=Math.max(0,r.top),y1=Math.min(innerHeight,r.bottom);
    if(x1<=x0||y1<=y0){end();return;}
    const dx=canvas.width/r.width,dy=canvas.height/r.height;
    ctx.fillStyle='#0b1921';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(src,x0*sx,y0*sy,(x1-x0)*sx,(y1-y0)*sy,
      (x0-r.left)*dx,(y0-r.top)*dy,(x1-x0)*dx,(y1-y0)*dy);
    active.frames++;
  }
  return {begin,end,frame,get recording(){return active?.recorder.state==='recording';}};
}
