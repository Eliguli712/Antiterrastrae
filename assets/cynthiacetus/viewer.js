const dialog = document.getElementById('model-dialog');
const model = dialog.querySelector('model-viewer');
const title = document.getElementById('model-dialog-title');
const status = document.getElementById('model-status');
const retry = document.getElementById('model-retry');
const download = document.getElementById('model-download');
let library;
let opener;
let current;
let request = 0;

function restoreCamera() {
  const wide = model.clientWidth / Math.max(model.clientHeight, 1) > 1.5;
  const radius = current?.exploreModel === 'skull' ? (wide ? '55%' : '100%') : (wide ? '65%' : '100%');
  model.setAttribute('camera-orbit', `-10deg 75deg ${radius}`);
  model.setAttribute('camera-target', 'auto auto auto');
  model.setAttribute('field-of-view', '30deg');
}

async function load() {
  const id = ++request;
  status.textContent = 'Loading the complete textured model…';
  retry.hidden = true;
  model.setAttribute('poster', current.poster);
  restoreCamera();
  try {
    library ??= import('./model-viewer-4.1.0.min.js').catch(error => {
      library = undefined;
      throw error;
    });
    await library;
    if (id !== request || !dialog.open) return;
    model.setAttribute('src', current.src);
  } catch {
    if (id === request && dialog.open) showError();
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
    title.textContent = current.title;
    download.href = current.download;
    download.setAttribute('download', current.download.split('/').at(-1));
    document.getElementById('model-original-image').href = current.image;
    model.setAttribute('alt', current.title + ', original Opal texture and complete source geometry');
    dialog.showModal();
    document.body.classList.add('viewer-open');
    load();
  });
}

model.addEventListener('progress', event => {
  if (!dialog.open || !current) return;
  const progress = Math.round(event.detail.totalProgress * 100);
  if (progress < 100) status.textContent = `Loading the complete textured model… ${progress}%`;
});
model.addEventListener('load', () => {
  if (dialog.open && current) status.textContent = `${current.faces} triangles · Original Opal texture · Full geometry`;
});
model.addEventListener('error', () => {
  if (dialog.open) showError();
});
retry.addEventListener('click', () => {
  model.removeAttribute('src');
  load();
});
document.getElementById('model-reset').addEventListener('click', restoreCamera);
document.getElementById('model-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  ++request;
  model.removeAttribute('src');
  document.body.classList.remove('viewer-open');
  opener?.focus();
});
