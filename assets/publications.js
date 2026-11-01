for (const details of document.querySelectorAll('details.paper-entry')) {
  const frame = details.querySelector('iframe[data-reader]');
  if (!frame) continue;
  details.addEventListener('toggle', () => {
    if (details.open) frame.src = frame.dataset.reader;
    else frame.removeAttribute('src');
  });
}
function revealPaper() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const paper = document.getElementById(id);
  if (paper?.matches('details.paper-entry')) paper.open = true;
}
addEventListener('hashchange', revealPaper);
revealPaper();
