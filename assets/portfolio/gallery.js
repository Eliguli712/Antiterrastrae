const viewer = document.getElementById('art-viewer');
const photo = document.getElementById('viewer-image');
const back = document.getElementById('viewer-card-back');
const flip = document.getElementById('viewer-flip');
const links = [...document.querySelectorAll('.zoom-art')];
let selected = 0, opener, current = [], cards, generation = 0, card, reversed = false;

function visibleLinks(source) {
  const group = source.closest('[data-image-gallery]') || source.closest('#artworks') || source.closest('#project-plates');
  return links.filter(link => link.getClientRects().length && (!group || group.contains(link)));
}

function setSide(showBack) {
  reversed = showBack && !!card;
  photo.hidden = reversed;
  back.hidden = !reversed;
  flip.setAttribute('aria-pressed', String(reversed));
  flip.textContent = reversed ? 'Show front ↻' : 'Flip card ↻';
  photo.classList.toggle('flippable', !!card);
  photo.tabIndex = card ? 0 : -1;
  if (card) photo.setAttribute('role', 'button');
  else photo.removeAttribute('role');
  photo.setAttribute('aria-label', card ? `${card.name} · Front. Click to flip.` : photo.alt);
  document.getElementById('viewer-side').textContent = card ? (reversed ? 'Back · Click to flip' : 'Front · Click to flip') : '';
}

async function render() {
  const id = ++generation;
  const link = current[selected], image = link.querySelector('img');
  card = undefined;
  flip.hidden = true;
  back.replaceChildren();
  photo.src = link.href;
  photo.alt = image.alt;
  viewer.classList.remove('actual-size');
  const scale = document.getElementById('viewer-scale');
  scale.setAttribute('aria-pressed', 'false');
  scale.textContent = 'Actual size';
  document.getElementById('viewer-title').textContent = link.dataset.artTitle;
  document.getElementById('viewer-count').textContent = `${selected + 1} / ${current.length}`;
  const original = document.getElementById('viewer-original');
  original.href = link.dataset.card ? new URL(`../../publications/card.html?card=${encodeURIComponent(link.dataset.card)}`, import.meta.url).href : link.href;
  original.textContent = link.dataset.card ? 'Open full-size flip view' : 'Open original image';
  for (const name of ['prev', 'next']) document.getElementById(`viewer-${name}`).hidden = current.length < 2;
  setSide(false);
  if (!link.dataset.card) return;
  try {
    cards ??= fetch(new URL('./cards.json', import.meta.url)).then(response => {
      if (!response.ok) throw new Error('Card text unavailable');
      return response.json();
    }).catch(error => { cards = undefined; throw error; });
    const data = await cards;
    if (id !== generation) return;
    card = data[link.dataset.card];
    if (!card) return;
    back.classList.toggle('card-back-source', !!card.backImage);
    let notes = back;
    if (card.backImage) {
      const image = document.createElement('img');
      image.className = 'card-back-image'; image.src = new URL(card.backImage, import.meta.url).href;
      image.width = 1000; image.height = 1400; image.alt = `${card.name} · Supplied card back`;
      image.tabIndex = 0; image.setAttribute('role', 'button'); image.setAttribute('aria-label', `Flip ${card.name} to the front`);
      image.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); toggle(); } });
      back.append(image);
      notes = document.createElement('details'); notes.className = 'card-notes';
      const summary = document.createElement('summary'); summary.textContent = 'Read complete card notes'; notes.append(summary); back.append(notes);
      original.href = new URL(`../../publications/card.html?card=${encodeURIComponent(link.dataset.card)}`, import.meta.url).href;
      original.textContent = 'Open full-size flip view';
    }
    const code = document.createElement('p');
    code.className = 'card-back-code'; code.textContent = `PALÆONTOLOGY / ${card.code}`;
    const title = document.createElement('h3'); title.textContent = card.heading || card.name;
    notes.append(code, title);
    for (const paragraph of card.body.split('\n\n')) {
      const p = document.createElement('p'); p.textContent = paragraph; notes.append(p);
    }
    flip.hidden = false;
    setSide(false);
  } catch {
    document.getElementById('viewer-side').textContent = 'Card back could not load. Reopen the card to retry.';
  }
}

function step(delta) { selected = (selected + delta + current.length) % current.length; render(); }
function toggle() {
  if (card && !window.getSelection()?.toString()) setSide(!reversed);
}
for (const link of links) link.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || typeof viewer.showModal !== 'function') return;
  event.preventDefault(); opener = link; current = visibleLinks(link); selected = current.indexOf(link);
  render(); viewer.showModal(); document.body.classList.add('viewer-open');
});
photo.addEventListener('click', toggle);
photo.addEventListener('keydown', event => {
  if (card && ['Enter', ' '].includes(event.key)) { event.preventDefault(); toggle(); }
});
back.addEventListener('click', event => { if (!event.target.closest('.card-notes')) toggle(); });
flip.addEventListener('click', () => setSide(!reversed));
document.getElementById('viewer-scale').addEventListener('click', () => {
  const actual = viewer.classList.toggle('actual-size');
  document.getElementById('viewer-scale').setAttribute('aria-pressed', String(actual));
  document.getElementById('viewer-scale').textContent = actual ? 'Fit image' : 'Actual size';
});
document.getElementById('viewer-close').addEventListener('click', () => viewer.close());
document.getElementById('viewer-prev').addEventListener('click', () => step(-1));
document.getElementById('viewer-next').addEventListener('click', () => step(1));
viewer.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
});
viewer.addEventListener('close', () => {
  ++generation;
  document.body.classList.remove('viewer-open'); photo.removeAttribute('src');
  card = undefined; setSide(false); opener?.focus();
});
