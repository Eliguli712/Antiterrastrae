const controlsByVideo = new WeakMap();
const foldListeners = new WeakSet();
let nextId = 1;

function pauseIn(section) {
  for (const video of section.querySelectorAll('video')) video.pause();
  for (const frame of section.querySelectorAll('iframe')) {
    try {
      const embedded = frame.contentDocument;
      if (embedded) pauseIn(embedded);
    } catch {
      // The parent cannot control media in cross-origin frames.
    }
  }
}

function observeFolds(doc) {
  if (foldListeners.has(doc)) return;
  foldListeners.add(doc);
  doc.addEventListener('toggle', event => {
    const fold = event.target;
    if (fold.tagName === 'DETAILS' && !fold.open) pauseIn(fold);
  }, true);
}

export function mountInlineVideoControls(root = document) {
  const doc = root.ownerDocument ?? root;
  observeFolds(doc);
  for (const video of root.querySelectorAll('video')) {
    if (controlsByVideo.has(video)) continue;
    const frame = doc.createElement('div');
    frame.className = 'inline-video';
    video.before(frame);
    frame.append(video);

    const play = doc.createElement('button');
    play.type = 'button';
    play.className = 'inline-video-play';
    if (!video.id) video.id = `inline-video-${nextId++}`;
    play.setAttribute('aria-controls', video.id);
    frame.append(play);

    function update() {
      frame.hidden = video.hidden;
      play.textContent = video.paused || video.ended ? 'Play' : 'Pause';
    }
    play.addEventListener('click', async () => {
      if (video.closest('details:not([open])')) return;
      if (video.paused || video.ended) {
        try {
          await video.play();
          if (video.closest('details:not([open])')) video.pause();
        } catch {
          // Keep the button and the video's native controls available.
        }
      } else video.pause();
      update();
    });
    for (const event of ['play', 'pause', 'ended', 'emptied']) video.addEventListener(event, update);
    const hiddenChange = new MutationObserver(update);
    hiddenChange.observe(video, { attributes: true, attributeFilter: ['hidden'] });
    controlsByVideo.set(video, hiddenChange);
    update();
  }
}
