import * as THREE from 'three';

const MINIMUM_DISPLAY_DIAMETER_MM = 0.036;
const ASSET = new URL('./assets/native-microtubes-fine.json?v=1', import.meta.url);

function makeTube(trace, forward, translation) {
  const points = trace.points_registered_native_xyz_mm.map(point => new THREE.Vector3(...point));
  const path = new THREE.CurvePath();
  for (let i=1; i<points.length; i++) {
    path.add(new THREE.LineCurve3(points[i-1],points[i]));
  }
  // The centreline keeps its sampled coordinates. The display floor keeps
  // structures near the 18 µm resolution limit visible at whole-tooth zoom.
  const radius = Math.max(trace.median_native_diameter_mm,MINIMUM_DISPLAY_DIAMETER_MM)/2;
  const geometry = new THREE.TubeGeometry(path,Math.max(8,2*(points.length-1)),radius,8,false);
  const positions = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  for (let i=0; i<positions.count; i++) {
    point.fromBufferAttribute(positions,i).applyMatrix3(forward).add(translation);
    positions.setXYZ(i,point.x,point.y,point.z);
  }
  return {geometry, rgb: "envelope_diagonal_mm" in trace ? [20,122,202] : [213,45,55]};
}

export async function loadMicrotubes(forward,translation,material) {
  const response = await fetch(ASSET);
  if (!response.ok) throw Error(`CT cavity traces could not load (${response.status})`);
  const record = await response.json();
  if (record.schema !== 'native-ct-tubular-cavity-traces-v1' ||
      !Array.isArray(record.traces) ||
      record.traces.length !== record.survey?.traces_displayed) {
    throw Error('The CT cavity trace catalogue is incomplete');
  }
  const pieces = record.traces.map(trace => makeTube(trace,forward,translation));
  const vertexCount = pieces.reduce((sum,{geometry})=>sum+geometry.getAttribute('position').count,0);
  const indexCount = pieces.reduce((sum,{geometry})=>sum+geometry.index.count,0);
  const points = new Float32Array(vertexCount*3);
  const rgb = new Uint8Array(points.length);
  const indices = new Uint32Array(indexCount);
  let vertexOffset=0,indexOffset=0;
  for (const {geometry: piece, rgb: colour} of pieces) {
    const source=piece.getAttribute('position');
    points.set(source.array,vertexOffset*3);
    for(let i=0;i<source.count;i++)rgb.set(colour,3*(vertexOffset+i));
    for(let i=0;i<piece.index.count;i++) indices[indexOffset++]=piece.index.array[i]+vertexOffset;
    vertexOffset+=source.count;
    piece.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(points,3));
  geometry.setIndex(new THREE.BufferAttribute(indices,1));
  const colours=new THREE.Uint8BufferAttribute(rgb,3,true);
  geometry.setAttribute('color',colours);
  geometry.setAttribute('photoColour',colours);
  geometry.setAttribute('nativeRoughness',new THREE.Uint8BufferAttribute(new Uint8Array(vertexCount),1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(),300);
  const mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;
  const scene=new THREE.Scene();
  scene.add(mesh);
  return {record, scene};
}
