import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const sourceURL = new URL('./assets/studio-support-r17/DoubleCube_CommonPoint_Height100mm.stl', import.meta.url);

// Binary STL uses a little-endian face count followed by 50 bytes per face.
export function readStudioSupportSTL(buffer) {
  const bytes = new DataView(buffer);
  if (bytes.byteLength < 84) throw new Error('Incomplete STL header.');
  const count = bytes.getUint32(80, true);
  if (count !== 72 || bytes.byteLength !== 84 + count * 50) {
    throw new Error('The file does not match the 72-facet source STL.');
  }
  const positions = new Float32Array(count * 9);
  for (let face = 0; face < count; face++) {
    const offset = 96 + face * 50;
    for (let coordinate = 0; coordinate < 9; coordinate++) {
      positions[face * 9 + coordinate] = bytes.getFloat32(offset + coordinate * 4, true);
    }
  }
  if (!positions.every(Number.isFinite)) throw new Error('The STL contains invalid coordinates.');
  return positions;
}

export async function mountStudioSupport(section) {
  const response = await fetch(sourceURL);
  if (!response.ok) throw new Error('The original STL could not be loaded.');
  const positions = readStudioSupportSTL(await response.arrayBuffer());

  const host = section.querySelector('.studio-support-viewport');
  const status = section.querySelector('.studio-support-status');
  const reset = section.querySelector('.studio-support-reset');
  const wire = section.querySelector('.studio-support-wireframe');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    const { mountStudioSupportPreview } = await import('./studio-mesh-preview.js?v=1');
    const preview = mountStudioSupportPreview(host, positions);
    host.dataset.viewerReady = 'true';
    host.dataset.triangles = String(positions.length / 9);
    reset.disabled = false;
    wire.disabled = false;
    status.textContent = 'Drag the lightweight 3D view to rotate. Pinch or scroll to zoom.';
    reset.addEventListener('click', preview.reset);
    wire.addEventListener('change', () => preview.setWireframe(wire.checked));
    let onScreen = false;
    const visibility = () => preview.setVisible(section.open && onScreen && !document.hidden);
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      visibility();
    }).observe(host);
    section.addEventListener('toggle', visibility);
    document.addEventListener('visibilitychange', visibility);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D view of the original DoubleCube STL');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(39, 1, 1, 1000);
  camera.up.set(0, 0, 1);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enablePan = true;
  orbit.minDistance = 105;
  orbit.maxDistance = 620;
  orbit.screenSpacePanning = true;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();

  const surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0xb9a7df, roughness: 0.63, metalness: 0.05, flatShading: true,
  }));
  scene.add(surface);
  const facets = new THREE.LineSegments(new THREE.WireframeGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x403353 }));
  facets.visible = false;
  scene.add(facets);

  const base = new THREE.GridHelper(140, 14, 0x646c82, 0x333a4e);
  base.rotation.x = Math.PI / 2;
  base.position.z = -0.3;
  scene.add(base, new THREE.HemisphereLight(0xf2ecff, 0x38254d, 2.1));
  const light = new THREE.DirectionalLight(0xfff6ed, 2.2);
  light.position.set(90, -45, 160);
  scene.add(light);

  let frame = 0;
  let onScreen = false;
  let lastWidth = 0, lastHeight = 0;
  const viewIsVisible = () => section.open && onScreen && !document.hidden;
  function requestDraw() {
    if (!viewIsVisible() || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!viewIsVisible()) return;
      const { clientWidth: width, clientHeight: height } = host;
      if (!width || !height) return;
      if (width !== lastWidth || height !== lastHeight) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        lastWidth = width;
        lastHeight = height;
      }
      renderer.render(scene, camera);
      host.dataset.cameraPosition = camera.position.toArray().map(value => value.toFixed(2)).join(',');
    });
  }
  function resetCamera() {
    camera.position.set(158, -172, 128);
    orbit.target.set(0, 0, 46);
    orbit.update();
    requestDraw();
  }

  orbit.addEventListener('change', requestDraw);
  new ResizeObserver(requestDraw).observe(host);
  // The observer accounts for clipping by an enclosing studio iframe.
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting && entry.intersectionRatio > 0;
    requestDraw();
  }).observe(host);
  document.addEventListener('visibilitychange', requestDraw);
  section.addEventListener('toggle', requestDraw);
  reset.addEventListener('click', resetCamera);
  wire.addEventListener('change', () => {
    facets.visible = wire.checked;
    requestDraw();
  });

  host.dataset.viewerReady = 'true';
  host.dataset.triangles = String(positions.length / 9);
  reset.disabled = false;
  wire.disabled = false;
  status.textContent = 'Drag to rotate, right-drag or use two fingers to pan, and scroll or pinch to zoom.';
  resetCamera();
}
