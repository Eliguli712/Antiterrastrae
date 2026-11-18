// Shared gesture mathematics for the Canvas compatibility renderer.
// All coordinates here are CSS pixels; panning moves the camera focus in mm.
const snapshot=points=>{const [a,b]=[...points.values()];return {center:[(a[0]+b[0])/2,(a[1]+b[1])/2],distance:Math.hypot(a[0]-b[0],a[1]-b[1])};};
export class TouchNavigation{
 constructor(){this.points=new Map();this.single=null;this.pair=null;this.mousePan=false;}
 start(e){this.points.set(e.pointerId,[e.clientX,e.clientY]);if(this.points.size===1){this.single=[e.clientX,e.clientY];this.mousePan=e.button===2||e.shiftKey;}if(this.points.size===2)this.pair=snapshot(this.points);}
 move(e){
  if(!this.points.has(e.pointerId))return null;
  this.points.set(e.pointerId,[e.clientX,e.clientY]);
  if(this.points.size>=2){const current=snapshot(this.points),old=this.pair||current;this.pair=current;return {pan:current.center.map((x,i)=>x-old.center[i]),fromCenter:old.center,toCenter:current.center,rotate:[0,0],zoomRatio:old.distance>1?current.distance/old.distance:1};}
  const point=[e.clientX,e.clientY],delta=point.map((x,i)=>x-(this.single||point)[i]);this.single=point;
  const pan=this.mousePan||e.shiftKey;return {pan:pan?delta:[0,0],rotate:pan?[0,0]:delta,zoomRatio:1};
 }
 end(e){this.points.delete(e.pointerId);this.pair=this.points.size>=2?snapshot(this.points):null;this.single=this.points.size===1?[...this.points.values()][0]:null;this.mousePan=false;}
}
export function panFocus(focus,yaw,pitch,pixels,viewHeight,canvasHeight,perspective=false){
 const right=[Math.cos(yaw),Math.sin(yaw),0],up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(yaw)*Math.sin(pitch),Math.cos(pitch)],scale=viewHeight/Math.max(1,canvasHeight)*(perspective?1.08:1);
 return focus.map((x,i)=>x-pixels[0]*scale*right[i]+pixels[1]*scale*up[i]);
}
export function panZoomFocus(focus,yaw,pitch,from,to,oldHeight,newHeight,width,height,perspective=false){
 const factor=(perspective?1.08:1)/Math.max(1,height),right=[Math.cos(yaw),Math.sin(yaw),0],up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(yaw)*Math.sin(pitch),Math.cos(pitch)];
 const x=((from[0]-width/2)*oldHeight-(to[0]-width/2)*newHeight)*factor,y=(-(from[1]-height/2)*oldHeight+(to[1]-height/2)*newHeight)*factor;
 return focus.map((v,i)=>v+x*right[i]+y*up[i]);
}
