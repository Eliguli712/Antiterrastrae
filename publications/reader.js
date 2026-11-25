import { getDocument, GlobalWorkerOptions } from '../assets/vendor/pdfjs/pdf.min.mjs';

const vendor = new URL('../assets/vendor/pdfjs/', import.meta.url);
GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', vendor).href;
GlobalWorkerOptions.rendererSrc = new URL('pdf.renderer.min.mjs', vendor).href;
const params = new URLSearchParams(location.search);
document.body.classList.toggle('embedded', params.get('embedded') === '1');
const container = document.getElementById('paper-pages');
const status = document.getElementById('reader-status');
const input = document.getElementById('page-number');
const scale = document.getElementById('page-scale');
const slots = new Map();
let pdf, observer, renderGeneration = 0, renderQueue = Promise.resolve(), lastWidth = 0;
const pending = new Set();
const compactDevice = () => innerWidth <= 700 || (navigator.deviceMemory ?? 8) <= 4;

function clearBitmap(slot) {
  const bitmap = slot.querySelector('canvas');
  if (bitmap) bitmap.width = bitmap.height = 0;
  slot.replaceChildren();
  slot.dataset.rendered = 'false';
}

function queuePage(number, id, requested = false) {
  const key = `${id}:${number}`;
  if (pending.has(key)) return;
  pending.add(key);
  renderQueue = renderQueue.then(() => {
    const slot = slots.get(number);
    if (!slot || id !== renderGeneration) return;
    const rect = slot.getBoundingClientRect();
    const margin = compactDevice() ? 500 : 900;
    if (requested || (rect.bottom > -margin && rect.top < innerHeight + margin)) {
      return renderPage(number, id);
    }
  }).catch(error => {
    console.error('Paper page rendering:', error);
    if (id === renderGeneration) errorMessage(`Page ${number} could not render.`, slots.get(number));
  }).finally(() => pending.delete(key));
}

function goToPage(number) {
  const slot = slots.get(number);
  if (!slot) return;
  const offset = document.querySelector('.reader-header').offsetHeight + document.querySelector('.reader-tools').offsetHeight + 12;
  // Scroll this reader only. scrollIntoView also scrolls/reveals the outer CV.
  window.scrollTo({ top: window.scrollY + slot.getBoundingClientRect().top - offset, behavior: 'instant' });
}

function offsets() {
  const header = document.querySelector('.reader-header').getBoundingClientRect().height;
  document.documentElement.style.setProperty('--header-height', `${header}px`);
  const tools = document.querySelector('.reader-tools').getBoundingClientRect().height;
  document.documentElement.style.setProperty('--scroll-offset', `${header + tools + 12}px`);
}
new ResizeObserver(offsets).observe(document.querySelector('.reader-header'));

function errorMessage(message, slot) {
  const paragraph = document.createElement('p');
  paragraph.className = 'reader-error';
  paragraph.textContent = message + ' Use Download PDF to read the original, or return to the CV.';
  (slot || container).append(paragraph);
  status.textContent = 'Could not load the complete paper.';
}

async function renderPage(number, id) {
  const slot = slots.get(number);
  if (id !== renderGeneration || slot.dataset.rendered === 'true') return;
  const page = await pdf.getPage(number);
  if (id !== renderGeneration) return;
  const original = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: slot.clientWidth / original.width });
  slot.style.height = `${viewport.height}px`;
  const compact = compactDevice();
  const pixelBudget = compact ? 2_200_000 : 5_000_000;
  const ratio = Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 1.75,
    Math.sqrt(pixelBudget / (viewport.width * viewport.height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio);
  canvas.setAttribute('aria-label', `Page ${number}`); canvas.setAttribute('role', 'img');
  await page.render({ canvasContext: canvas.getContext('2d'), viewport,
    transform: [ratio, 0, 0, ratio, 0, 0] }).promise;
  if (id !== renderGeneration) { canvas.width = canvas.height = 0; return; }
  slot.replaceChildren(canvas); slot.dataset.rendered = 'true';
  const [text, annotations] = await Promise.all([page.getTextContent(), page.getAnnotations()]);
  if (id !== renderGeneration) { page.cleanup(); return; }
  const description = document.createElement('div'); description.className = 'page-text';
  description.textContent = text.items.map(item => item.str || '').join(' ');
  slot.append(description);
  for (const annotation of annotations) {
    if (!annotation.url || !annotation.rect) continue;
    const url = new URL(annotation.url, location.href);
    if (!['https:', 'http:'].includes(url.protocol)) continue;
    const [a,b,c,d,e,f] = viewport.transform;
    const [x1,y1,x2,y2] = annotation.rect;
    const box = [a*x1+c*y1+e,b*x1+d*y1+f,a*x2+c*y2+e,b*x2+d*y2+f];
    const link = document.createElement('a');
    link.className = 'pdf-annotation';
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Open cited source at ' + url.hostname);
    Object.assign(link.style, {
      left: Math.min(box[0], box[2]) + 'px',
      top: Math.min(box[1], box[3]) + 'px',
      width: Math.abs(box[2]-box[0]) + 'px',
      height: Math.abs(box[3]-box[1]) + 'px'
    });
    slot.append(link);
  }
  page.cleanup();
  status.textContent = `${pdf.numPages} pages · Complete document`;
  // Keep a bounded number of high-resolution page bitmaps on mobile devices.
  for (const [otherNumber, other] of slots) {
    if (Math.abs(otherNumber - number) > (compact ? 1 : 3) && other.dataset.rendered === 'true') {
      clearBitmap(other);
      observer?.unobserve(other);
      observer?.observe(other);
    }
  }
}

async function layout() {
  const id = ++renderGeneration;
  observer?.disconnect();
  const first = await pdf.getPage(1);
  if (id !== renderGeneration) return;
  const reference = first.getViewport({ scale: 1 });
  const width = Math.min(950, Math.max(240, document.documentElement.clientWidth - 32)) * Number(scale.value);
  for (const slot of slots.values()) clearBitmap(slot);
  container.replaceChildren(); slots.clear();
  lastWidth = document.documentElement.clientWidth;
  for (let number = 1; number <= pdf.numPages; number++) {
    const slot = document.createElement('section'); slot.className = 'pdf-page';
    slot.id = `page-${number}`; slot.dataset.page = number; slot.dataset.rendered = 'false';
    slot.setAttribute('aria-label', `Page ${number} of ${pdf.numPages}`);
    slot.style.width = `${width}px`; slot.style.height = `${width * reference.height / reference.width}px`;
    container.append(slot); slots.set(number, slot);
  }
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const number = Number(entry.target.dataset.page);
      queuePage(number, id);
    }
  }, { rootMargin: compactDevice() ? '180px 0px' : '500px 0px' });
  for (const slot of slots.values()) observer.observe(slot);
  const requested = Number(location.hash.match(/^#page=(\d+)$/)?.[1] || input.value);
  const number = requested > 0 && requested <= pdf.numPages ? requested : 1;
  if (number > 1) goToPage(number);
  queuePage(number, id, true);
}

input.addEventListener('change', () => {
  const number = Math.min(pdf?.numPages || 1, Math.max(1, Number(input.value) || 1));
  input.value = number; goToPage(number);
  if (pdf) queuePage(number, renderGeneration, true);
});
scale.addEventListener('change', () => { if (pdf) layout(); });
let resize;
addEventListener('resize', () => { clearTimeout(resize); resize = setTimeout(() => { if (pdf && lastWidth !== document.documentElement.clientWidth) layout(); }, 180); });

try {
  const response = await fetch(new URL('./catalog.json', import.meta.url));
  if (!response.ok) throw new Error('Catalog unavailable');
  const catalog = await response.json();
  const paper = catalog.documents.find(item => item.id === params.get('paper'));
  if (!paper) throw new Error('This paper is not in the catalog');
  document.title = `${paper.title} · Eliguli Han`;
  document.getElementById('paper-title').textContent = paper.title;
  document.getElementById('return-cv').href = `../cv.html#paper-${paper.id}`;
  const download = document.getElementById('paper-download');
  download.href = paper.file; download.download = paper.file; download.hidden = false;
  status.textContent = 'Loading the complete paper…';
  pdf = await getDocument({ url: new URL(paper.file, import.meta.url).href,
    cMapUrl: new URL('cmaps/', vendor).href, cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', vendor).href,
    wasmUrl: new URL('wasm/', vendor).href, iccUrl: new URL('iccs/', vendor).href,
    isEvalSupported: false }).promise;
  input.max = pdf.numPages;
  document.getElementById('page-total').textContent = `/ ${pdf.numPages}`;
  await layout(); offsets();
} catch (error) {
  errorMessage(error.message || 'The paper is unavailable.');
}
