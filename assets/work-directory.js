const groups = [...document.querySelectorAll('.work-group')];
const search = document.getElementById('work-search');
const category = document.getElementById('work-category');
function filter() {
  const query = search.value.trim().toLowerCase();
  let count = 0, entries = 0;
  for (const group of groups) {
    group.hidden = !!((category.value && group.dataset.category !== category.value) ||
      (query && !(group.dataset.title + ' ' + group.dataset.category.toLowerCase()).includes(query)));
    if (!group.hidden) { count++; entries += group.querySelectorAll('[data-entry]').length; }
  }
  document.getElementById('work-results').textContent = `${count} groups · ${entries} catalog entries`;
  document.getElementById('work-empty').hidden = count > 0;
}
document.querySelector('.directory-tools').addEventListener('submit', event => event.preventDefault());
search.addEventListener('input', filter); category.addEventListener('change', filter);
document.getElementById('expand-all').addEventListener('click', () => groups.filter(group => !group.hidden).forEach(group => { group.open = true; }));
document.getElementById('collapse-all').addEventListener('click', () => groups.forEach(group => { group.open = false; }));
const selected = document.getElementById(location.hash.slice(1));
if (selected?.classList.contains('work-group')) selected.open = true;
