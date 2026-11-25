import{analyzeContours}from'./native-contours-r15.js?v=1';
import{decodedBytes,arrays}from'./native-store-r15.js?v=1';
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
export class NativeSections{
 constructor(config,stats,emit){this.config=config;this.stats=stats;this.emit=emit;this.tickets=new Map();this.slabs=new Map();this.pending=new Map();}
 async slab(part){
  if(this.slabs.has(part.sha256)){const a=this.slabs.get(part.sha256);this.slabs.delete(part.sha256);this.slabs.set(part.sha256,a);return a;}
  if(this.pending.has(part.sha256))return this.pending.get(part.sha256);
  const p=decodedBytes(part,this.stats).then(b=>{const a=arrays(b);this.slabs.set(part.sha256,a);while(this.slabs.size>2)this.slabs.delete(this.slabs.keys().next().value);return a;}).finally(()=>this.pending.delete(part.sha256));this.pending.set(part.sha256,p);return p;
 }
 cancel(target){this.tickets.set(target,(this.tickets.get(target)||0)+1);}
 async request(d){
  const target=d.target||'native-internal-viewport',ticket=(this.tickets.get(target)||0)+1;this.tickets.set(target,ticket);const current=()=>this.tickets.get(target)===ticket;
  const shape=this.config.mask.native_shape_zyx,[Z,H,W]=shape,origin=this.config.mask.scanner_origin_xyz_mm,spacing=.018;
  if(d.axis==='native'||!d.axis){
   const z=Math.max(0,Math.min(Z-1,Math.round(d.z??1443))),part=this.config.mask.slabs.find(p=>p.first_z<=z&&z<p.first_z+p.planes),{header,out}=await this.slab(part);if(!current())return;
   const stride=header.packed_width,start=(z-header.first_z)*H*stride,values=new Uint8Array(W*H);let selected=0;
   for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=(out.packedMask[start+y*stride+(x>>3)]>>(x&7)&1)*255;values[y*W+x]=v;if(v)selected++;}
   const derived=await analyzeContours(values,W,H,.018,{current,peak_rule:d.peak_rule||'tail99'});if(!current()||!derived)return;this.emit({overlay:derived.overlay,contour_summary:derived.summary,type:'mask',request_id:d.request_id,target,axis:'native',z,width:W,height:H,data:values,selected_samples:selected,sampling_mm:.018,plane_origin_mm:[origin[0]-.009,origin[1]-.009,origin[2]+z*.018],u:[1,0,0],v:[0,1,0],normal:[0,0,1],offset_mm:origin[2]+z*.018});return;
  }
  const axis=Number(d.axis),frame=this.config.pca.axes[axis-1];if(!frame)throw Error('Unknown principal section axis');const step=d.sampling_mm===.018?.018:.072,offset=Math.max(frame.offset_range_mm[0],Math.min(frame.offset_range_mm[1],Number(d.offset_mm)||0));
  const width=Math.ceil((frame.u_range_mm[1]-frame.u_range_mm[0])/step),height=Math.ceil((frame.v_range_mm[1]-frame.v_range_mm[0])/step),N=width*height;if(N>12000000)throw Error('Section grid exceeds declared bounds');
  const center=this.config.pca.center_scanner_mm,u=frame.u,v=frame.v,normal=frame.normal,edge=center.map((c,i)=>c+normal[i]*offset+u[i]*frame.u_range_mm[0]+v[i]*frame.v_range_mm[0]);
  const addresses=new Uint32Array(N);addresses.fill(0xffffffff);const counts=new Uint32Array(this.config.mask.slabs.length),planeSize=H*W;
  for(let y=0;y<height;y++){
   const base=edge.map((c,i)=>c+v[i]*(y+.5)*step+u[i]*step*.5);
   for(let x=0;x<width;x++){
    const ix=Math.floor((base[0]+u[0]*x*step-origin[0])/spacing+.5),iy=Math.floor((base[1]+u[1]*x*step-origin[1])/spacing+.5),iz=Math.floor((base[2]+u[2]*x*step-origin[2])/spacing+.5);
    if(ix<0||ix>=W||iy<0||iy>=H||iz<0||iz>=Z)continue;addresses[y*width+x]=(iz*H+iy)*W+ix;counts[iz>>6]++;
   }
   if(y%128===0){await pause();if(!current())return;}
  }
  const starts=new Uint32Array(counts.length+1);for(let i=0;i<counts.length;i++)starts[i+1]=starts[i]+counts[i];const grouped=new Uint32Array(starts[counts.length]),next=new Uint32Array(starts);
  for(let i=0;i<N;i++)if(addresses[i]!==0xffffffff){const slab=Math.floor(addresses[i]/planeSize)>>6;grouped[next[slab]++]=i;}
  const values=new Uint8Array(N);let selected=0;
  for(let i=0;i<counts.length;i++){
   if(!counts[i])continue;const part=this.config.mask.slabs[i],{header,out}=await this.slab(part);if(!current())return;const stride=header.packed_width;
   for(let j=starts[i];j<starts[i+1];j++){const pixel=grouped[j],a=addresses[pixel],z=Math.floor(a/planeSize),yx=a-z*planeSize,y=Math.floor(yx/W),x=yx-y*W,byte=(z-part.first_z)*H*stride+y*stride+(x>>3),value=(out.packedMask[byte]>>(x&7)&1)*255;values[pixel]=value;if(value)selected++;}
   await pause();if(!current())return;
  }
  const derived=await analyzeContours(values,width,height,step,{current,peak_rule:d.peak_rule||'tail99'});if(!current()||!derived)return;this.emit({overlay:derived.overlay,contour_summary:derived.summary,type:'mask',request_id:d.request_id,target,axis,width,height,data:values,selected_samples:selected,sampling_mm:step,plane_origin_mm:edge,u,v,normal,offset_mm:offset,source_sampling_mm:.018});
 }
}
