import {loadChunkedModel} from './chunked-model.js';

const dialog = document.getElementById('model-dialog');
const model = dialog.querySelector('model-viewer');
const title = document.getElementById('model-dialog-title');
const status = document.getElementById('model-status');
const retry = document.getElementById('model-retry');
const download = document.getElementById('model-download');
const support = document.getElementById('model-support');
const supportDownload = document.getElementById('model-support-download');
let library;
let opener;
let current;
let request = 0;
let showSupport = false;
let savedCamera;
let controller;
let preparing = false;
let displayedSupport = false;
const modelBlobs = new Map();

function restoreCamera() {
  const wide = model.clientWidth / Math.max(model.clientHeight, 1) > 1.5;
  const radius = current?.exploreModel === 'skull' ? (wide ? '55%' : '100%') : (wide ? '65%' : '100%');
  model.setAttribute('camera-orbit', current?.cameraOrbit || `-10deg 75deg ${radius}`);
  model.setAttribute('camera-target', 'auto auto auto');
  model.setAttribute('field-of-view', '30deg');
}

async function load({resetCamera = true} = {}) {
  const id = ++request;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const withSupport = showSupport;
  preparing = true;
  support.disabled = true;
  status.textContent = showSupport ? 'Loading the complete model and print supports…' : 'Loading the complete textured model…';
  retry.hidden = true;
  model.setAttribute('poster', current.poster);
  if (resetCamera) restoreCamera();
  try {
    library ??= import('./model-viewer-4.1.0.min.js').catch(error => {
      library = undefined;
      throw error;
    });
    await library;
    if (id !== request || !dialog.open) return;
    const source = withSupport ? current.supportSrc : current.src;
    let resource = source;
    if (source.endsWith('.parts.json')) {
      resource = modelBlobs.get(source);
      if (!resource) {
        resource = await loadChunkedModel(source, {signal, onProgress(received, total) {
          if (id === request) status.textContent = `Loading and checking print supports… ${Math.round(received / total * 100)}%`;
        }});
        if (id !== request || !dialog.open) { URL.revokeObjectURL(resource); return; }
        modelBlobs.set(source, resource);
      }
    }
    if (id !== request || !dialog.open) return;
    preparing = false;
    displayedSupport = withSupport;
    if (model.loaded && model.getAttribute('src') === resource) finishLoad();
    else model.setAttribute('src', resource);
  } catch (error) {
    if (id === request && dialog.open && error.name !== 'AbortError') {
      preparing = false;
      support.disabled = false;
      showError();
    }
  }
}

function showError() {
  status.textContent = 'The 3D view could not load. Try again, or use the full-size image and 3MF download.';
  retry.hidden = false;
}

for (const button of document.querySelectorAll('[data-explore-model]')) {
  button.addEventListener('click', () => {
    opener = button;
    current = button.dataset;
    showSupport = false;
    savedCamera = undefined;
    support.hidden = !current.supportSrc;
    support.setAttribute('aria-pressed', 'false');
    support.textContent = 'Display support';
    supportDownload.hidden = !current.supportDownload;
    if (current.supportDownload) {
      supportDownload.href = current.supportDownload;
      supportDownload.download = current.supportDownload.split('/').at(-1);
    } else supportDownload.removeAttribute('href');
    title.textContent = current.title;
    download.href = current.download;
    download.setAttribute('download', current.download.split('/').at(-1));
    document.getElementById('model-original-image').href = current.image;
    model.setAttribute('alt', current.title + ', ' + (current.appearance || 'original Opal texture') + ', complete source geometry');
    dialog.showModal();
    document.body.classList.add('viewer-open');
    load();
  });
}

model.addEventListener('progress', event => {
  if (!dialog.open || !current || preparing) return;
  const progress = Math.round(event.detail.totalProgress * 100);
  if (progress < 100) status.textContent = `Loading the complete textured model… ${progress}%`;
});
function finishLoad() {
  if (dialog.open && current && !preparing) {
    support.disabled = false;
    if (savedCamera) {
      model.cameraOrbit = savedCamera.orbit;
      model.cameraTarget = savedCamera.target;
      model.fieldOfView = savedCamera.fov;
      savedCamera = undefined;
    }
    const appearance = current.appearance || 'Original Opal texture';
    status.textContent = displayedSupport
      ? `${current.faces} anatomy triangles · ${appearance} · Print supports visible`
      : `${current.faces} triangles · ${appearance} · Full geometry`;
  }
}
model.addEventListener('load', finishLoad);
model.addEventListener('error', () => {
  if (dialog.open && !preparing) { support.disabled = false; showError(); }
});
retry.addEventListener('click', () => {
  model.removeAttribute('src');
  load();
});
support.addEventListener('click', () => {
  if (!current?.supportSrc) return;
  const orbit = model.getCameraOrbit();
  const target = model.getCameraTarget();
  savedCamera = {
    orbit: `${orbit.theta}rad ${orbit.phi}rad ${orbit.radius}m`,
    target: `${target.x}m ${target.y}m ${target.z}m`,
    fov: `${model.getFieldOfView()}deg`,
  };
  showSupport = !showSupport;
  support.setAttribute('aria-pressed', String(showSupport));
  support.textContent = showSupport ? 'Hide support' : 'Display support';
  status.textContent = showSupport ? 'Loading print supports…' : 'Loading anatomy…';
  load({resetCamera: false});
});
document.getElementById('model-reset').addEventListener('click', restoreCamera);
document.getElementById('model-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  ++request;
  controller?.abort();
  preparing = false;
  model.removeAttribute('src');
  for (const url of modelBlobs.values()) URL.revokeObjectURL(url);
  modelBlobs.clear();
  document.body.classList.remove('viewer-open');
  opener?.focus();
});
