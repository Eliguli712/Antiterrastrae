/* Chunked full-topology loading and compact WebGL buffers shared by every edition. */
(() => {
 const worker=new Worker('geometry-worker.js'),pending=new Map(),assets=new Map(),streams=new Map();let serial=0;
 worker.onmessage=e=>{const p=pending.get(e.data.id);if(!p)return;pending.delete(e.data.id);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.result);};
 function asset(url,sha,kind='mesh'){const key=url+'|'+(sha||'');if(!assets.has(key)){const promise=new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});worker.postMessage({id,url:new URL(url,location.href).href,sha,kind});}).catch(e=>{assets.delete(key);throw e;});assets.set(key,promise);}return assets.get(key);}
 const decode=(x,T)=>{if(ArrayBuffer.isView(x))return x;const b=atob(x),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new T(a.buffer);};
 function fieldColors(mesh,fieldSpecs){if(!fieldSpecs.length||!mesh.values)return Promise.resolve(mesh);return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve:colors=>resolve({...mesh,fieldColors:colors}),reject});worker.postMessage({id,kind:'colors',values:decode(mesh.values,Float32Array),regions:mesh.regions?decode(mesh.regions,Uint8Array):new Uint8Array(mesh.vertices),specs:fieldSpecs});});}
 class SurfaceStream{
  constructor(url){this.url=url;this.manifest=null;this.chunks=[];this.listeners=new Set();this.loading=false;this.error='';this.active=new Set();this.paused=false;this.fieldSpecs=[];}
  setActive(owner,on){if(on){this.active.add(owner);this.paused=false;this.load();}else{this.active.delete(owner);if(!this.active.size)this.paused=true;}}
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  notify(){for(const fn of this.listeners)fn();}
  get ready(){return this.manifest&&this.chunks.filter(Boolean).length===this.manifest.chunks.length;}
  async load(){if(this.loading||this.ready)return;this.loading=true;this.error='';this.notify();try{
   if(!this.manifest)this.manifest=await asset(this.url,null,'json');let next=0;
   const run=async()=>{while(!this.paused&&next<this.manifest.chunks.length){const i=next++,c=this.manifest.chunks[i];if(this.chunks[i])continue;let m=await asset(c.url,c.sha256);
    if(m.triangles!==c.triangles||m.vertices!==c.vertices)throw Error('Source face count mismatch');
    if(c.projection){const p=await asset(c.projection.url,c.projection.sha256);if(p.vertices!==m.vertices)throw Error('Projection registration mismatch');m={...m,values:p.values,regions:p.regions};}
    this.chunks[i]=await fieldColors(m,this.fieldSpecs);this.notify();}};
   await Promise.all([run(),run()]);
  }catch(e){this.error=e.message;}finally{this.loading=false;this.notify();}}
  status(){const progress=this.manifest?Math.floor(100*this.chunks.reduce((n,m)=>n+(m?.triangles||0),0)/this.manifest.display_triangles):0;return this.error?'Full-model download interrupted. Use Resume full model to retry.':this.ready?this.manifest.display_triangles.toLocaleString()+' full source faces · no face reduction':'Loading full model: '+progress+'% · loading view';}
 }
 class Renderer{
  constructor(canvas,camera,changed,colorize){this.canvas=canvas;this.camera=camera;this.changed=changed;this.colorize=colorize;this.cache=new Map();this.lost=false;this.visible=true;
   this.gl=canvas.getContext('webgl',{alpha:true,antialias:false,preserveDrawingBuffer:true});if(!this.gl)throw Error('WebGL is unavailable on this device; source downloads remain available.');this.init();
   ToothGestures.bind(canvas,camera,()=>this.schedule());new ResizeObserver(()=>this.schedule()).observe(canvas);window.addEventListener('orientationchange',()=>this.schedule());
   canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.cache.clear();this.schedule();});canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.init();this.schedule();});
   new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;if(!this.visible)this.release();else this.schedule();},{rootMargin:'100px'}).observe(canvas);
  }
  schedule(){if(this.queued)return;this.queued=true;requestAnimationFrame(()=>{this.queued=false;this.changed();});}
  init(){const gl=this.gl;this.uint=gl.getExtension('OES_element_index_uint');const vertex=`attribute vec3 aPosition,aNormal,aColor;uniform vec4 uQ;uniform float uAspect,uZoom,uPointSize,uScale;varying vec3 vNormal,vColor;vec3 rot(vec3 p){return p+2.0*cross(uQ.xyz,cross(uQ.xyz,p)+uQ.w*p);}void main(){vec3 p=rot(aPosition*uScale);float fit=min(1.0,uAspect);gl_Position=vec4(p.x*uZoom*fit/uAspect,p.y*uZoom*fit,-p.z/4.0,1.0);gl_PointSize=uPointSize;vNormal=rot(aNormal);vColor=aColor;}`;
   const fragment=`precision mediump float;uniform float uLight,uPoints,uOpacity,uSpec;varying vec3 vNormal,vColor;void main(){if(uPoints>.5&&distance(gl_PointCoord,vec2(.5))>.5)discard;vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;vec3 l=normalize(vec3(-.35,.5,1.));float d=max(0.,dot(n,l));float s=pow(max(0.,dot(n,normalize(l+vec3(0.,0.,1.)))),45.)*uSpec;gl_FragColor=vec4(vColor*mix(1.,.75+.35*d,uLight)+vec3(s),uOpacity);}`;
   const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
   const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));this.program=program;gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
   this.attrs=['aPosition','aNormal','aColor'].map(n=>gl.getAttribLocation(program,n));this.uniform=Object.fromEntries(['uQ','uAspect','uZoom','uPointSize','uScale','uLight','uPoints','uOpacity','uSpec'].map(n=>[n,gl.getUniformLocation(program,n)]));
  }
  release(){if(this.lost)return;const gl=this.gl;for(const m of this.cache.values()){for(const b of [m.positions,m.normals,m.indices,...m.colors.values()])if(b)gl.deleteBuffer(b);}this.cache.clear();}
  buffer(target,values){const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(target,b);gl.bufferData(target,values,gl.STATIC_DRAW);return b;}
  geometry(mesh){if(this.cache.has(mesh))return this.cache.get(mesh);const gl=this.gl;let indices=null,indexType=null;if(mesh.indices){const f=decode(mesh.indices,Uint32Array);if(mesh.vertices<65536){indices=new Uint16Array(f);indexType=gl.UNSIGNED_SHORT;}else if(this.uint){indices=f;indexType=gl.UNSIGNED_INT;}else throw Error('Detailed geometry needs 32-bit indices on this device. Light uses portable 16-bit batches.');}
   const m={positions:this.buffer(gl.ARRAY_BUFFER,decode(mesh.positions,Int16Array)),normals:mesh.normals?this.buffer(gl.ARRAY_BUFFER,decode(mesh.normals,Int8Array)):null,indices:indices?this.buffer(gl.ELEMENT_ARRAY_BUFFER,indices):null,indexType,colors:new Map(),count:mesh.indices?mesh.triangles*3:mesh.vertices};this.cache.set(mesh,m);return m;
  }
  clear(){if(this.lost||!this.visible)return;const gl=this.gl,r=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,this.camera.moving?.75:1.5),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}gl.useProgram(this.program);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform4fv(this.uniform.uQ,this.camera.q);gl.uniform1f(this.uniform.uAspect,w/h);gl.uniform1f(this.uniform.uZoom,this.camera.zoom);gl.uniform1f(this.uniform.uPointSize,1.6*dpr);}
  render(mesh,{appearance='field',type='vm',lighting=false,opacity=1,ghost=false,points:forcePoints=false,colorKey}={}){if(this.lost||!this.visible)return;const gl=this.gl,m=this.geometry(mesh),a=this.attrs,points=forcePoints||!mesh.indices;
   gl.bindBuffer(gl.ARRAY_BUFFER,m.positions);gl.enableVertexAttribArray(a[0]);gl.vertexAttribPointer(a[0],3,gl.SHORT,true,0,0);gl.uniform1f(this.uniform.uScale,32767/32760*mesh.scale/(mesh.fit_scale||29));
   if(m.normals){gl.bindBuffer(gl.ARRAY_BUFFER,m.normals);gl.enableVertexAttribArray(a[1]);gl.vertexAttribPointer(a[1],3,gl.BYTE,true,0,0);}else{gl.disableVertexAttribArray(a[1]);gl.vertexAttrib3f(a[1],0,0,1);}
   if(appearance==='original'||ghost){gl.disableVertexAttribArray(a[2]);gl.vertexAttrib3f(a[2],.72,.73,.73);}else{const key=colorKey||(appearance==='field'?type:appearance);if(!m.colors.has(key)){const rgb=appearance==='field'?(mesh.fieldColors?.[key]||this.colorize(mesh,type)):decode(mesh.colors[appearance],Uint8Array);m.colors.set(key,this.buffer(gl.ARRAY_BUFFER,rgb));if(m.colors.size>2){const old=m.colors.keys().next().value;gl.deleteBuffer(m.colors.get(old));m.colors.delete(old);}}gl.bindBuffer(gl.ARRAY_BUFFER,m.colors.get(key));gl.enableVertexAttribArray(a[2]);gl.vertexAttribPointer(a[2],3,gl.UNSIGNED_BYTE,true,0,0);}
   gl.uniform1f(this.uniform.uLight,lighting&&!points&&!ghost?1:0);gl.uniform1f(this.uniform.uPoints,points?1:0);gl.uniform1f(this.uniform.uOpacity,opacity);gl.uniform1f(this.uniform.uSpec,lighting&&!points&&appearance==='natural'?.3:0);
   if(ghost){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);}if(points)gl.drawArrays(gl.POINTS,0,mesh.vertices);else{gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.indices);gl.drawElements(gl.TRIANGLES,m.count,m.indexType,0);}if(ghost){gl.depthMask(true);gl.disable(gl.BLEND);}
  }
 }
 window.Tooth3D={Renderer,decode,configure:(specs,stream)=>{stream.fieldSpecs=specs;},json:url=>asset(url,null,'json'),stream:url=>{if(!streams.has(url))streams.set(url,new SurfaceStream(url));return streams.get(url);}};
})();
