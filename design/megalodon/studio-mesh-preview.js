import { TouchNavigation, panFocus } from './touch-navigation.js';

const source = 'https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/5d5316eba77b04e9cea85228a942224c0d087960/assets/';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finishes = {
  resin: [50, 126, 168],
  abs: [54, 98, 140],
  pla: [77, 117, 151],
};

async function loadMesh(name) {
  const response = await fetch(source + name + '-soft.bin');
  if (!response.ok) throw new Error('Preview mesh unavailable.');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 8) throw new Error('Preview mesh is incomplete.');
  const header = new DataView(buffer);
  const vertices = header.getUint32(0, true);
  const faces = header.getUint32(4, true);
  if (!vertices || !faces || buffer.byteLength !== 8 + vertices * 24 + faces * 12) {
    throw new Error('Preview mesh dimensions do not match its data.');
  }
  const points = new Float32Array(buffer, 8, vertices * 6);
  const index = new Uint32Array(buffer, 8 + vertices * 24);
  if (index.some(value => value >= vertices)) throw new Error('Invalid preview mesh index.');
  return { name, points, stride: 6, index };
}

function hitTriangle(face, x, y) {
  const [a, b, c] = face.coordinates;
  const cross = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const u = cross(a, b), v = cross(b, c), w = cross(c, a);
  return (u >= 0 && v >= 0 && w >= 0) || (u <= 0 && v <= 0 && w <= 0);
}

function createPreview(host, meshes, {
  target, yaw: defaultYaw, pitch: defaultPitch, size, onCapMove = () => {},
}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas preview unavailable.');
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', host.getAttribute('aria-label') || 'Interactive 3D preview');
  host.append(canvas);

  let yaw, pitch, zoom, focus;
  let visible = false, frame = 0, capMode = 'vertical', capDrag = null;
  let projectedCap = [], offset = [0, 0, 0], finish = 'resin';
  let showRuler = false, showWire = false;
  const gestures = new TouchNavigation();
  const viewHeight = () => Math.max(size, size * .55 * host.clientHeight / Math.max(1, host.clientWidth)) / zoom;

  function invalidate() {
    if (visible && !frame) frame = requestAnimationFrame(draw);
  }

  function setOffset(next) {
    offset = next;
    onCapMove(next);
    invalidate();
  }

  function viewBasis() {
    const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    return [[cy, sy, 0], [-sy * sp, cy * sp, cp], [sy * cp, -cy * cp, sp]];
  }

  function draw() {
    frame = 0;
    const w = host.clientWidth, h = host.clientHeight;
    if (!visible || !w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.round(w * dpr), height = Math.round(h * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#090f13');
    bg.addColorStop(1, '#3c535f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const [right, up, front] = viewBasis();
    const scale = h / viewHeight();
    const faces = [];
    for (const { name, points, stride, index } of meshes) {
      const cap = name === 'cap';
      const projected = [];
      for (let i = 0; i < points.length; i += stride) {
        const x = points[i] - focus[0] + (cap ? offset[0] : 0);
        const y = points[i + 1] - focus[1] + (cap ? offset[1] : 0);
        const z = points[i + 2] - focus[2] + (cap ? offset[2] : 0);
        projected.push([
          w / 2 + scale * (right[0] * x + right[1] * y),
          h / 2 - scale * (up[0] * x + up[1] * y + up[2] * z),
          front[0] * x + front[1] * y + front[2] * z,
          points[i + 2],
        ]);
      }
      for (let i = 0; i < index.length; i += 3) {
        const a = projected[index[i]], b = projected[index[i + 1]], c = projected[index[i + 2]];
        const bx = b[0] - a[0], by = b[1] - a[1], bz = (b[2] - a[2]) * scale;
        const cx = c[0] - a[0], cy = c[1] - a[1], cz = (c[2] - a[2]) * scale;
        const nz = bx * cy - by * cx;
        if (nz >= 0) continue;
        const nx = by * cz - bz * cy, ny = bz * cx - bx * cz;
        const brightness = .49 + .51 * Math.max(0, (-.25 * nx + .35 * ny - .9 * nz) / Math.hypot(nx, ny, nz));
        let colour, opacity;
        if (name === 'tooth') {
          const z = (a[3] + b[3] + c[3]) / 3;
          const shade = brightness * clamp((z - 85) / 100, .44, 1);
          colour = finishes[finish].map(channel => Math.round(channel * shade));
          opacity = 1;
        } else if (name === 'support') {
          colour = [185, 167, 223].map(channel => Math.round(channel * brightness));
          opacity = 1;
        } else {
          colour = [187, 215, 224].map(channel => Math.round(channel * brightness));
          opacity = cap ? .26 : .19;
        }
        faces.push({ coordinates: [a, b, c], depth: a[2] + b[2] + c[2], colour, opacity, cap });
      }
    }
    faces.sort((a, b) => a.depth - b.depth);
    projectedCap = [];
    for (const face of faces) {
      const { coordinates: [a, b, c], colour, opacity } = face;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      ctx.fillStyle = `rgb(${colour.join(' ')} / ${opacity})`;
      ctx.fill();
      if (showWire) {
        ctx.strokeStyle = '#403353';
        ctx.lineWidth = .7;
        ctx.stroke();
      } else if (opacity === 1) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = .5;
        ctx.stroke();
      }
      if (face.cap) projectedCap.push(face);
    }
    if (showRuler) {
      const x = w - 25, y = h - 20;
      ctx.strokeStyle = ctx.fillStyle = '#cde6ec';
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 50 * scale);
      ctx.moveTo(x - 5, y - 50 * scale);
      ctx.lineTo(x + 5, y - 50 * scale);
      ctx.stroke();
      ctx.font = '12px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText('50 mm', x - 8, y - 5);
    }
    host.dataset.cameraPosition = [yaw, pitch, zoom, ...focus].map(n => n.toFixed(3)).join(',');
  }

  function reset() {
    yaw = defaultYaw;
    pitch = defaultPitch;
    zoom = 1;
    focus = [...target];
    invalidate();
  }

  function rotate(dx, dy) {
    yaw -= dx * .009;
    pitch = clamp(pitch + dy * .009, -.75, 1.48);
    invalidate();
  }

  function setCap(distance) {
    if (capMode === 'free' || !Number.isFinite(distance)) return;
    const d = clamp(distance, 0, 40);
    setOffset(capMode === 'rail' ? [0, -d, 0] : [0, 0, d]);
  }

  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture(event.pointerId);
    const box = canvas.getBoundingClientRect();
    if (capMode === 'free' && event.isPrimary && event.button === 0 &&
        projectedCap.some(face => hitTriangle(face, event.clientX - box.left, event.clientY - box.top))) {
      capDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      host.classList.add('studio-cap-drag-active');
      canvas.focus({ preventScroll: true });
      return;
    }
    gestures.start(event);
  });
  canvas.addEventListener('pointermove', event => {
    if (capDrag?.id === event.pointerId) {
      const dx = event.clientX - capDrag.x, dy = event.clientY - capDrag.y;
      capDrag.x = event.clientX;
      capDrag.y = event.clientY;
      const [right, up] = viewBasis(), scale = viewHeight() / Math.max(1, host.clientHeight);
      setOffset(offset.map((value, i) => value + (right[i] * dx - up[i] * dy) * scale));
      return;
    }
    const gesture = gestures.move(event);
    if (!gesture) return;
    zoom = clamp(zoom * gesture.zoomRatio, .5, 4);
    focus = panFocus(focus, yaw, pitch, gesture.pan, viewHeight(), host.clientHeight);
    rotate(...gesture.rotate);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, event => {
      gestures.end(event);
      if (capDrag?.id === event.pointerId) {
        capDrag = null;
        host.classList.remove('studio-cap-drag-active');
      }
    });
  }
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    zoom = clamp(zoom * Math.exp(-event.deltaY * .001), .5, 4);
    invalidate();
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setOffset([0, 0, 0]);
      reset();
      return;
    }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction && !['PageUp', 'PageDown'].includes(event.key)) return;
    event.preventDefault();
    if (capMode !== 'free') {
      if (direction) rotate(...direction.map(value => 12 * value));
      return;
    }
    const amount = event.shiftKey ? 5 : 1;
    const [right, up] = viewBasis();
    setOffset(offset.map((value, i) => value + amount * (direction
      ? right[i] * direction[0] - up[i] * direction[1]
      : i === 2 ? (event.key === 'PageUp' ? 1 : -1) : 0)));
  });
  new ResizeObserver(invalidate).observe(host);
  host.dataset.renderMode = 'canvas';
  reset();
  return {
    reset,
    setVisible(on) {
      visible = on;
      if (visible) invalidate();
      else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    setCap,
    setCapMode(next) {
      if (!['vertical', 'rail', 'free'].includes(next)) return;
      capMode = next;
      host.dataset.capMode = next;
      setCap(next === 'rail' ? -offset[1] : offset[2]);
      if (next === 'free') setOffset(offset);
    },
    resetCap() { setOffset([0, 0, 0]); },
    setToothFinish(next) {
      if (!Object.hasOwn(finishes, next)) return;
      finish = next;
      host.dataset.toothFinish = finish;
      invalidate();
    },
    async setRuler(on) { showRuler = on; invalidate(); },
    setWireframe(on) { showWire = on; invalidate(); },
  };
}

export async function mountStudioMeshPreview(host, { onCapMove } = {}) {
  const meshes = await Promise.all(['main', 'cap', 'tooth'].map(loadMesh));
  return createPreview(host, meshes, {
    target: [0, 0, 93], yaw: .46, pitch: .3, size: 225, onCapMove,
  });
}

export function mountStudioSupportPreview(host, points) {
  const index = Uint32Array.from({ length: points.length / 3 }, (_, i) => i);
  return createPreview(host, [{ name: 'support', points, stride: 3, index }], {
    target: [0, 0, 46], yaw: .74, pitch: .38, size: 165,
  });
}
