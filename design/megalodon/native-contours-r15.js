/** Original binary-layer geometry only; no stress or tissue classification.
 * overlay bits: 1 enclosed 4-connected background; 2 material-side contour;
 * 4 resolved local curvature-peak candidate on that material-side contour.
 * Cancellation returns null. The caller must then skip publication of the layer.
 */
const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
const BINS=4096,MAX_CURVATURE_CELL=2,ARC_WINDOW=5,MIN_LOOP_EDGES=24,MAX_LOOP_EDGES=1048576;
function weightedMedian(hist,total){let sum=0;for(let i=0;i<hist.length;i++){sum+=hist[i];if(sum>=total/2)return (i+.5)*MAX_CURVATURE_CELL/BINS;}return 0;}
function histogramQ99(hist,total){let sum=0;const rank=Math.ceil(total*.99);for(let i=0;i<hist.length;i++){sum+=hist[i];if(sum>=rank)return (i+1)*MAX_CURVATURE_CELL/BINS;}return MAX_CURVATURE_CELL;}
function histogramMAD(hist,median,total){const pairs=[];for(let i=0;i<hist.length;i++)if(hist[i])pairs.push([Math.abs((i+.5)*MAX_CURVATURE_CELL/BINS-median),hist[i]]);pairs.sort((a,b)=>a[0]-b[0]);let n=0;for(const[p,m]of pairs){n+=m;if(n>=total/2)return p;}return 0;}
function pointCurvature(vertices,i,n,stride){const w=ARC_WINDOW,a=vertices[(i+n-w)%n],b=vertices[i],c=vertices[(i+w)%n],ax=a%stride,ay=Math.floor(a/stride),bx=b%stride,by=Math.floor(b/stride),cx=c%stride,cy=Math.floor(c/stride),ab=Math.hypot(bx-ax,by-ay),bc=Math.hypot(cx-bx,cy-by),ca=Math.hypot(cx-ax,cy-ay),den=ab*bc*ca;if(den<=1e-10)return 0;return Math.min(MAX_CURVATURE_CELL,2*Math.abs((bx-ax)*(cy-ay)-(by-ay)*(cx-ax))/den);}
export async function analyzeContours(mask,width,height,sampling_mm,{current=()=>true,peak_rule='conservative6MAD'}={}){
 if(!(mask instanceof Uint8Array)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||mask.length!==width*height||!(sampling_mm>0))throw new Error('Invalid binary contour grid');
 if(!['conservative6MAD','conservative','tail99'].includes(peak_rule))throw new Error('Unknown geometric peak rule');
 const N=mask.length;if(N>12000000)throw new Error('Layer contour grid exceeds declared bound');if(!current())return null;
 const overlay=new Uint8Array(N),state=new Uint8Array(N),queue=new Uint32Array(N),stride=width+1,cap=Math.min(MAX_LOOP_EDGES,Math.max(32,N*4)),vertices=new Uint32Array(cap),cells=new Uint32Array(cap),curvatures=new Float32Array(cap),smoothed=new Float32Array(cap),hist=new Float64Array(BINS);
 let closedComponents=0,closedPixels=0,bluePixels=0,redPixels=0,resolvedLoops=0,skippedSmall=0,skippedLarge=0,openTrace=0,nMoment=0,mean=0,M2=0,M3=0,M4=0;
 const checkpoint=async()=>{await yieldTask();return current();};
 let tail=0;
 const seed=i=>{if(!mask[i]&&!state[i]){state[i]=1;queue[tail++]=i;}};
 for(let x=0;x<width;x++){seed(x);if(height>1)seed((height-1)*width+x);}for(let y=1;y<height-1;y++){seed(y*width);if(width>1)seed(y*width+width-1);}
 for(let head=0;head<tail;head++){
  const i=queue[head],x=i%width,y=Math.floor(i/width);if(x>0)seed(i-1);if(x+1<width)seed(i+1);if(y>0)seed(i-width);if(y+1<height)seed(i+width);
  if((head&65535)===65535&&!await checkpoint())return null;
 }
 const markBlue=i=>{if(!(overlay[i]&2)){overlay[i]|=2;bluePixels++;}};
 const setEdges=(i,blue)=>{const x=i%width,y=Math.floor(i/width);let bits=0;if(y>0&&mask[i-width]){bits|=4;if(blue)markBlue(i-width);}if(x+1<width&&mask[i+1]){bits|=8;if(blue)markBlue(i+1);}if(y+1<height&&mask[i+width]){bits|=16;if(blue)markBlue(i+width);}if(x>0&&mask[i-1]){bits|=32;if(blue)markBlue(i-1);}state[i]=2|bits;};
 const edgeAt=(vx,vy,dir)=>{let x,y;if(dir===0){x=vx;y=vy;}else if(dir===1){x=vx-1;y=vy;}else if(dir===2){x=vx-1;y=vy-1;}else{x=vx;y=vy-1;}if(x<0||x>=width||y<0||y>=height)return -1;const i=y*width+x;return state[i]&(4<<dir)?i*4+dir:-1;};
 const materialCell=(i,dir)=>dir===0?i-width:dir===1?i+1:dir===2?i+width:i-1;
 const trace=(first,pass,threshold)=>{
  let edge=first,length=0,closed=false,startVertex=-1,guard=0;
  while(edge>=0&&guard++<=N*4){
   const cell=Math.floor(edge/4),dir=edge%4,x=cell%width,y=Math.floor(cell/width),vx=dir===0||dir===3?x:x+1,vy=dir<2?y:y+1,vertex=vy*stride+vx;
   if(startVertex<0)startVertex=vertex;if(length<cap){vertices[length]=vertex;cells[length]=materialCell(cell,dir);}length++;state[cell]&=~(4<<dir);
   const ex=dir===0?x+1:dir===1?x+1:x,ey=dir===0?y:dir===1?y+1:dir===2?y+1:y,end=ey*stride+ex;
   if(end===startVertex){closed=true;break;}
   edge=-1;for(const nd of[(dir+1)%4,dir,(dir+3)%4,(dir+2)%4]){const next=edgeAt(ex,ey,nd);if(next>=0){edge=next;break;}}
  }
  if(!closed){if(pass===0)openTrace++;return;}
  if(length<MIN_LOOP_EDGES){if(pass===0)skippedSmall++;return;}
  if(length>cap){if(pass===0)skippedLarge++;return;}
  for(let i=0;i<length;i++)curvatures[i]=pointCurvature(vertices,i,length,stride);
  for(let i=0;i<length;i++)smoothed[i]=(curvatures[(i+length-2)%length]+curvatures[(i+length-1)%length]+curvatures[i]+curvatures[(i+1)%length]+curvatures[(i+2)%length])/5;
  if(pass===0){
   resolvedLoops++;
   for(let i=0;i<length;i++){
    const k=smoothed[i],bin=Math.min(BINS-1,Math.floor(k/MAX_CURVATURE_CELL*BINS));hist[bin]++;
    const n0=nMoment;nMoment++;const delta=k-mean,dn=delta/nMoment,dn2=dn*dn,term=delta*dn*n0;M4+=term*dn2*(nMoment*nMoment-3*nMoment+3)+6*dn2*M2-4*dn*M3;M3+=term*dn*(nMoment-2)-3*dn*M2;M2+=term;mean+=dn;
   }
  }else{
   for(let i=0;i<length;i++){
    const k=smoothed[i];if(k<=threshold)continue;let peak=true;
    for(let d=-2;d<=2;d++){if(!d)continue;const j=(i+length+d)%length,q=smoothed[j];if(q>k||(q===k&&j<i)){peak=false;break;}}
    if(peak){const cell=cells[i];if(!(overlay[cell]&4)){overlay[cell]|=4;redPixels++;}}
   }
  }
 };
 for(let i=0;i<N;i++){
  if(mask[i]||state[i])continue;closedComponents++;let head=0;tail=1;queue[0]=i;state[i]=2;
  const add=j=>{if(!mask[j]&&!state[j]){state[j]=2;queue[tail++]=j;}};
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);overlay[p]|=1;closedPixels++;if(x>0)add(p-1);if(x+1<width)add(p+1);if(y>0)add(p-width);if(y+1<height)add(p+width);if((head&65535)===0&&!await checkpoint())return null;}
  for(let j=0;j<tail;j++)setEdges(queue[j],true);
  for(let j=0;j<tail;j++){const p=queue[j];for(let dir=0;dir<4;dir++)if(state[p]&(4<<dir))trace(p*4+dir,0,0);}
  if((closedComponents&255)===0&&!await checkpoint())return null;
 }
 const median=nMoment?weightedMedian(hist,nMoment):null,mad=nMoment?histogramMAD(hist,median,nMoment):null,q99=nMoment?histogramQ99(hist,nMoment):null,threshold=nMoment?(peak_rule==='tail99'?Math.max(q99,median+1/(8*ARC_WINDOW)):Math.max(median+6*1.4826*mad,median+1/(8*ARC_WINDOW))):null;
 if(nMoment){
  for(let i=0;i<N;i++){if(overlay[i]&1)setEdges(i,false);if((i&262143)===262143&&!await checkpoint())return null;}
  for(let i=0;i<N;i++){if((state[i]&3)!==2)continue;for(let dir=0;dir<4;dir++)if(state[i]&(4<<dir))trace(i*4+dir,1,threshold);if((i&262143)===262143&&!await checkpoint())return null;}
 }
 if(!current())return null;
 return{overlay,summary:{closed_components:closedComponents,closed_pixels:closedPixels,blue_pixels:bluePixels,red_pixels:redPixels,curvature_median_per_mm:median===null?null:median/sampling_mm,curvature_threshold_per_mm:threshold===null?null:threshold/sampling_mm,peak_rule,curvature_q99_per_mm:q99===null?null:q99/sampling_mm,curvature_excess_kurtosis:nMoment>3&&M2>1e-20?nMoment*M4/(M2*M2)-3:null,resolved_contour_loops:resolvedLoops,resolved_curvature_samples:nMoment,unresolved_small_loops:skippedSmall,oversized_curvature_loops_skipped:skippedLarge,nonclosed_traces:openTrace,contour_arc_window_edges:ARC_WINDOW,curvature_smoothing_half_window_edges:2,min_resolved_loop_edges:MIN_LOOP_EDGES,median_histogram_bins:BINS,curvature_histogram_bin_width_per_mm:MAX_CURVATURE_CELL/BINS/sampling_mm,sampling_mm,peak_memory_working_bytes:overlay.byteLength+state.byteLength+queue.byteLength+vertices.byteLength+cells.byteLength+curvatures.byteLength+smoothed.byteLength+hist.byteLength,algorithm:"Red policy: "+(peak_rule==='tail99'?'local maxima strictly above max(layer Q99 upper histogram-bin edge, median+1/(8*5) per cell). ':'local maxima strictly above median+max(6*1.4826*MAD,1/(8*5) per cell). ')+"4-connected 2D background flood fill excludes crop-boundary-connected regions. Blue = adjacent material-side cell of every enclosed gap. Curvature = nonnegative circumcircle curvature at +/-5 unit contour edges, averaged across +/-2 neighbouring contour edges to reduce digital-staircase fluctuations; loops <24 edges are unresolved. Red candidates are local +/-2-edge maxima under the explicitly selected policy. Quantiles and median/MAD use a declared 4096-bin histogram over [0,2] per grid cell. Fisher excess kurtosis uses all resolved curvature samples and is not curvature or a significance level. Individual loops >1048576 edges retain all blue contours but skip curvature to bound RAM. Geometric candidates only; no stress, biological diagnosis, calibrated p-value, or new acquired resolution."}};
}
