const controlsByVideo = new WeakSet();
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
  for (const video of root.querySelectorAll('video:not([data-inline-play])')) {
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
    const icon = doc.createElement('span');
    icon.className = 'inline-video-icon';
    icon.setAttribute('aria-hidden', 'true');
    const label = doc.createElement('span');
    label.className = 'inline-video-label';
    play.append(icon, label);
    frame.append(play);

    const status = doc.createElement('p');
    status.className = 'inline-video-status';
    status.setAttribute('role', 'status');
    status.hidden = true;
    frame.append(status);

    function update() {
      const paused = video.paused || video.ended;
      frame.hidden = video.hidden;
      play.dataset.state = paused ? 'paused' : 'playing';
      play.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
      play.title = paused ? 'Play video' : 'Pause video';
      label.textContent = paused ? 'Play video' : 'Pause';
    }
    play.addEventListener('click', async () => {
      if (video.closest('details:not([open])')) return;
      if (video.paused || video.ended) {
        try {
          if (video.error) video.load();
          await video.play();
          if (video.closest('details:not([open])')) video.pause();
          status.hidden = true;
        } catch (error) {
          if (error.name !== 'AbortError') {
            status.textContent = 'Playback is unavailable here. Use the MP4 download.';
            status.hidden = false;
          }
        }
      } else video.pause();
      update();
    });
    for (const event of ['play', 'pause', 'ended', 'emptied']) video.addEventListener(event, update);
    video.addEventListener('playing', () => { status.hidden = true; });
    video.addEventListener('error', () => {
      if (video.hidden) return;
      status.textContent = 'Playback could not start. Try Play video or use the MP4 download.';
      status.hidden = false;
      update();
    });
    new MutationObserver(update).observe(video, { attributes: true, attributeFilter: ['hidden'] });
    controlsByVideo.add(video);
    update();
  }
}
