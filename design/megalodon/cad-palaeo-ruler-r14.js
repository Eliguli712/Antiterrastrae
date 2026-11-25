import * as THREE from 'three';

// Original OpenCASCADE boundary tessellation, with true millimetre coordinates.
// This separate scene is rendered after the native tooth-count measurement.
export function cadRuler(data){
 if(data.units!=='mm'||data.measured_span_mm!==50)throw Error('Unexpected CAD ruler scale');
 const group=new THREE.Group();group.userData.measuredSpanMm=50;
 for(const part of data.parts){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));geometry.setIndex(part.indices);
  const material=new THREE.MeshBasicMaterial({color:part.colour,side:THREE.DoubleSide,toneMapped:false});
  const mesh=new THREE.Mesh(geometry,material);mesh.name=part.name;mesh.frustumCulled=false;group.add(mesh);
 }
 group.userData.triangles=data.parts.reduce((n,p)=>n+p.triangles,0);return group;
}

// Static source images were rasterized at 26 px / canonical 100-mm-display mm.
// A 50-mm case has 52 source pixels per physical mm; the 100-mm case has 26.
// Use the same measured scale for the original CAD-face image, including its
// 0.1-mm orthographic margin, rather than fitting a decorative image by eye.
export function layoutCadScale(stage,tooth,scale,size,view){
 if(!tooth.naturalWidth||!scale.naturalWidth)return;
 const W=stage.clientWidth,H=stage.clientHeight,ppm=2600/size,tilt=view==='oblique'?Math.cos(.20):1;
 const tw=tooth.naturalWidth/ppm,th=tooth.naturalHeight/ppm,base=-size/2;
 const lo=Math.min(-th/2,(base-4.1)*tilt),hi=Math.max(th/2,(base+54.1)*tilt),width=tw+4+10.2;
 const px=Math.min((W-40)/width,(H-72)/(hi-lo)),left=(W-width*px)/2,top=(H-(hi-lo)*px)/2;
 Object.assign(tooth.style,{left:left+'px',top:(top+(hi-th/2)*px)+'px',width:(tw*px)+'px',height:(th*px)+'px'});
 Object.assign(scale.style,{left:(left+(tw+4)*px)+'px',top:(top+(hi-(base+54.1)*tilt)*px)+'px',width:(10.2*px)+'px',height:(58.2*tilt*px)+'px'});
}
