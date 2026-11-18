// Gouraud triangle rasterizer used when WebGL is unavailable.
// RGBA storage is unpremultiplied; translucent resin uses source-over blending.
export function rasterTriangle(data,width,height,points,colors,alpha=1,scale=1){
 const p=points.map(p=>[p[0]*scale,p[1]*scale]),[[x0,y0],[x1,y1],[x2,y2]]=p;
 const area=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0);if(Math.abs(area)<1e-8)return;
 const minX=Math.max(0,Math.floor(Math.min(x0,x1,x2))),maxX=Math.min(width-1,Math.ceil(Math.max(x0,x1,x2))),minY=Math.max(0,Math.floor(Math.min(y0,y1,y2))),maxY=Math.min(height-1,Math.ceil(Math.max(y0,y1,y2)));
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
  const px=x+.5,py=y+.5,w1=((px-x0)*(y2-y0)-(py-y0)*(x2-x0))/area,w2=((x1-x0)*(py-y0)-(y1-y0)*(px-x0))/area,w0=1-w1-w2;
  if(w0< -1e-7||w1< -1e-7||w2< -1e-7)continue;
  const k=(y*width+x)*4,oldA=data[k+3]/255,outA=alpha+oldA*(1-alpha),sa=alpha/outA,da=oldA*(1-alpha)/outA;
  for(let ch=0;ch<3;ch++){const rgb=colors[0][ch]*w0+colors[1][ch]*w1+colors[2][ch]*w2;data[k+ch]=rgb*sa+data[k+ch]*da;}
  data[k+3]=outA*255;
 }
}
