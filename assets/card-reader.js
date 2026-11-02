try {
  const response = await fetch(new URL('./portfolio/cards.json', import.meta.url));
  if (!response.ok) throw new Error('Card data could not load.');
  const cards = await response.json();
  const key = new URLSearchParams(location.search).get('card');
  if (!Object.hasOwn(cards, key)) throw new Error('This card is not in the portfolio.');
  const card = cards[key];
  const front = document.getElementById('reader-front'), back = document.getElementById('reader-back');
  front.src = new URL(`./portfolio/${key}-card.jpg`, import.meta.url).href;
  back.src = new URL(`./portfolio/${card.backImage}`, import.meta.url).href;
  front.alt = `${card.name} · Original card front`; back.alt = `${card.name} · Supplied card back`;
  document.getElementById('card-name').textContent = card.name; document.title = `${card.name} · Full-size flip view`;
  for (const [id, image] of [['download-front', front], ['download-back', back]]) {
    const link = document.getElementById(id); link.href = image.src; link.download = new URL(image.src).pathname.split('/').at(-1);
  }
  const notes = document.getElementById('reader-transcript');
  for (const text of card.body.split('\n\n')) { const p = document.createElement('p'); p.textContent = text; notes.append(p); }
  let reversed = false;
  function flip() {
    reversed = !reversed; front.hidden = reversed; back.hidden = !reversed;
    document.getElementById('reader-notes').hidden = !reversed;
    document.getElementById('reader-card').setAttribute('aria-pressed', String(reversed));
    const control = document.getElementById('flip-card'); control.setAttribute('aria-pressed', String(reversed));
    control.textContent = reversed ? 'Show front ↻' : 'Show back ↻';
    document.getElementById('card-side').textContent = reversed ? 'Back · Click the card to flip' : 'Front · Click the card to flip';
  }
  document.getElementById('reader-card').addEventListener('click', flip);
  document.getElementById('flip-card').addEventListener('click', flip);
  document.getElementById('card-scale').addEventListener('click', () => {
    const actual = document.body.classList.toggle('actual-size');
    const control = document.getElementById('card-scale');control.setAttribute('aria-pressed', String(actual));control.textContent = actual ? 'Fit card' : 'Actual size';
  });
} catch (error) {
  document.getElementById('card-error').textContent = error.message;
}
