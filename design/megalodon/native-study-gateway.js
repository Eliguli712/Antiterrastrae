const dialog = document.querySelector('#native-study-gateway');
const meter = dialog.querySelector('progress');
const status = dialog.querySelector('.study-entry-status');
const cacheStatus = dialog.querySelector('.study-entry-cache');
const enter = dialog.querySelector('.study-entry-enter');
const preview = dialog.querySelector('.study-entry-preview');
const format = new Intl.NumberFormat();
const target = '#native-statistics';
let monitor;
let downloadRequested = false;
let tubePreparation;
let tubeState = 'idle';

function goToStudy() {
  if (dialog.open) dialog.close();
  if (location.hash !== target) history.pushState(null, '', target);
  const section = document.querySelector(target) || document.querySelector('#native74-batch');
  section?.scrollIntoView({block: 'start'});
  if (section) {
    section.tabIndex = -1;
    section.focus({preventScroll: true});
  }
}

function showState(state, message) {
  dialog.dataset.state = state;
  if (status.textContent !== message) status.textContent = message;
  enter.disabled = state !== 'ready';
}

function storageReadout(engine) {
  const cache = document.querySelector('#nativeCacheStatus');
  const total = engine.config.geometry.chunks.length;
  const report = engine.cacheReport;
  const found = Number(report?.geometryAvailable ?? cache?.dataset.geometrySources ?? 0);
  const mb = Math.ceil(engine.config.geometry.chunks.reduce((sum, part) => sum + Number(part.bytes || 0), 0) / 1e6);
  if (found === total) return `All ${total} source bundles are in this browser’s cache.`;
  if (report?.supported === false) return 'Browser storage is unavailable. The full mesh can still stream for this visit.';
  if (document.querySelector('#nativeStorageStatus')?.dataset.warning) return 'Browser storage is full. The mesh can still stream for this visit.';
  if (engine.ready && !report) return 'The full mesh is ready. Checking which source bundles were retained.';
  if (found) return `${found} of ${total} source bundles already cached. Full source: ${mb} MB.`;
  return `Full source: ${mb} MB. Verified downloads can be reused from this browser’s cache.`;
}

function checkViewer() {
  if (!dialog.open) return;
  const engine = window.__nativeSharedR15?.engine;
  if (!engine) return;
  if (!downloadRequested && !engine.ready && !engine.failed && !engine.lost && !engine.fullUnavailable && !engine.unavailable) {
    downloadRequested = true;
    engine.loadFull3D();
  }
  if (engine.fullUnavailable || engine.unavailable || engine.failed || engine.lost) {
    const message = engine.fullUnavailable || engine.unavailable || 'Full 3D stopped on this device.';
    showState('paused', message);
    cacheStatus.textContent = 'The study remains available in preview.';
    meter.value = 0;
    return;
  }
  meter.value = engine.ready ? meter.max : Math.min(engine.faces, meter.max);
  const wasReady = dialog.dataset.state === 'ready';
  if (engine.ready) {
    const prepare = window.__nativeSharedR15.prepareTubeOverlay;
    if (!tubePreparation && prepare) {
      tubeState = 'pending';
      tubePreparation = Promise.resolve().then(prepare).then(
        survey => {tubeState = survey ? 'ready' : 'unavailable';},
        () => {tubeState = 'unavailable';}
      ).then(checkViewer);
    }
    if (tubeState === 'pending') {
      showState('loading', 'Full geometry ready. Preparing the original cavity tubes…');
      preview.textContent = 'Open study while tubes load';
    } else {
      const detail = tubeState === 'ready' ? ' All 2,317 candidate cavity traces are ready.' : '';
      showState('ready', 'All 74,293,846 surface triangles are ready.' + detail);
      preview.hidden = true;
      if (!wasReady) enter.focus();
    }
  } else {
    const percent = Math.floor(100 * meter.value / meter.max);
    const progress = meter.value ? `${format.format(meter.value)} / ${format.format(meter.max)} triangles · ${percent}%` : 'Checking this browser’s cache and preparing the full mesh…';
    if (status.textContent !== progress) showState('loading', progress);
  }
  const storage = storageReadout(engine);
  if (cacheStatus.textContent !== storage) cacheStatus.textContent = storage;
}

function openStudy() {
  if (!dialog.showModal || window.__nativeSharedR15?.engine?.ready && tubeState !== 'pending') {
    goToStudy();
    return;
  }
  if (dialog.open) return;
  preview.textContent = 'Continue with preview';
  preview.hidden = false;
  cacheStatus.textContent = '';
  meter.value = 0;
  showState('loading', 'Preparing the study viewer…');
  dialog.showModal();
  const started = performance.now();
  checkViewer();
  monitor = setInterval(() => {
    if (window.__nativeSharedR15?.engine) {
      checkViewer();
      return;
    }
    if (performance.now() - started > 25000) {
      showState('paused', 'The full viewer has not started yet.');
      cacheStatus.textContent = 'Open the study in preview and retry 3D from the viewer.';
      clearInterval(monitor);
    }
  }, 140);
}

for (const link of document.querySelectorAll('[data-native-study-entry]')) {
  link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    openStudy();
  });
}
enter.addEventListener('click', goToStudy);
preview.addEventListener('click', goToStudy);
dialog.querySelector('.study-entry-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  clearInterval(monitor);
  monitor = undefined;
});
window.addEventListener('native-study-ready', checkViewer);
window.addEventListener('native-study-unavailable', () => {
  if (!dialog.open) return;
  clearInterval(monitor);
  showState('paused', 'The full viewer could not start.');
  cacheStatus.textContent = 'Open the study to use the static plates and videos.';
});
if (location.hash === target || location.hash === '#study') openStudy();
