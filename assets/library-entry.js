try {
  const response = await fetch(new URL('../publications/work-directory.json', import.meta.url));
  if (!response.ok) throw new Error('The directory could not load.');
  const directory = await response.json();
  const id = new URLSearchParams(location.search).get('entry');
  let found;
  for (const group of directory.groups) {
    const entry = group.entries.find(item => item.id === id);
    if (entry) { found = {group, entry}; break; }
  }
  if (!found) throw new Error('This entry is not in the supplied catalog.');
  const {group, entry} = found;
  document.title = `${group.title} · Library edition`;
  document.getElementById('library-title').textContent = entry.title;
  document.getElementById('library-category').textContent = group.category;
  document.getElementById('library-meta').textContent = [entry.kind === 'archive' ? 'Source archive' : (entry.pages ? `${entry.pages} pages` : 'Page count not recorded'), entry.listed_size, entry.saved_date].filter(Boolean).join(' · ');
  const source = new URL(entry.library_url);
  if (source.protocol !== 'https:' || source.hostname !== 'chatgpt.com' || source.pathname !== '/library') throw new Error('Unsupported library destination.');
  const open = document.getElementById('library-open'); open.href = source.href; open.hidden = false;
  if (group.hosted_document) {
    const hosted = document.getElementById('hosted-copy');
    hosted.href = `reader.html?paper=${encodeURIComponent(group.hosted_document)}`; hosted.hidden = false;
  }
  document.getElementById('directory-back').href = `research-index.html#work-${group.id}`;
  document.getElementById('library-status').textContent = 'Your CV remains available through the return link above.';
} catch (error) {
  document.getElementById('library-status').textContent = error.message;
}
