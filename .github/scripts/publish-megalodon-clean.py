"""Publish the verified gallery at the portfolio URL; pin bulk assets to a data commit."""
import concurrent.futures, hashlib, json, os, re, subprocess, time, urllib.request
from pathlib import Path, PurePosixPath

REPO = Path.cwd()
MANIFEST = json.loads((REPO / '.github/megalodon-clean-manifest.json').read_text())
ORIGIN = MANIFEST['source_origin'].rstrip('/') + '/'
BRANCH = 'megalodon-field-data-r7'
TARGET = REPO / 'design/megalodon'
DATA = Path(os.environ['RUNNER_TEMP']) / 'megalodon-field-data-r7'

def git(*args, cwd=REPO, check=True):
    return subprocess.run(['git', *args], cwd=cwd, check=check,
                          text=True, capture_output=True).stdout.strip()

def download(item, destination):
    relative = PurePosixPath(item['source'])
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Invalid manifest path')
    target = destination / item['path']
    if not target.resolve().is_relative_to(destination.resolve()):
        raise ValueError('Invalid destination path')
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == item['sha256']:
        return
    if 'content_utf8' in item:
        content=item['content_utf8'].encode()
        assert hashlib.sha256(content).hexdigest()==item['sha256']
        target.write_bytes(content)
        return
    for attempt in range(4):
        try:
            request = urllib.request.Request(ORIGIN + str(relative), headers={'User-Agent': 'Megalodon-Publication/7'})
            with urllib.request.urlopen(request, timeout=120) as response:
                content = response.read()
            if len(content) != item['bytes'] or hashlib.sha256(content).hexdigest() != item['sha256']:
                raise ValueError('Source checksum mismatch: ' + str(relative))
            target.write_bytes(content)
            return
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)

git('config', 'user.name', 'Eliguli Han')
git('config', 'user.email', 'hh3494@nyu.edu')
remote = git('ls-remote', '--heads', 'origin', 'refs/heads/' + BRANCH)
if remote:
    git('fetch', 'origin', BRANCH)
    parent = 'FETCH_HEAD'
else:
    parent = 'HEAD'
git('worktree', 'add', '--detach', *([] if remote else ['--no-checkout']), str(DATA), parent)
git('read-tree', '--empty', cwd=DATA)
asset_items = [x for x in MANIFEST['files'] if x['path'].startswith('assets/')]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(lambda item: download(item, DATA), asset_items))
subprocess.run(['python', str(REPO / '.github/scripts/recover-native-field-r7.py'), str(DATA)], check=True)
(DATA / 'publication.json').write_text(json.dumps({'revision':'R7', 'source_origin':ORIGIN,
    'source_commit':MANIFEST['source_commit'], 'files':len(asset_items),
    'asset_bytes':sum(x['bytes'] for x in asset_items),
    'native_field_recovery':'Containing tetrahedra and closest-boundary interpolation, reproduced from the original per-size numerical archives.'}, indent=2))
git('add', 'assets', 'publication.json', cwd=DATA)
if git('diff', '--cached', '--name-only', cwd=DATA):
    git('commit', '-m', 'Preserve complete megalodon gallery assets R7', cwd=DATA)
data_sha = git('rev-parse', 'HEAD', cwd=DATA)
git('push', 'origin', 'HEAD:refs/heads/' + BRANCH, cwd=DATA)
asset_origin = f'https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/{data_sha}/assets/'

# Keep the latest CV and unrelated concurrent changes before editing portfolio entries.
git('fetch', 'origin', 'main')
git('reset', '--hard', 'origin/main')
frontend = [x for x in MANIFEST['files'] if not x['path'].startswith('assets/')]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(lambda item: download(item, TARGET), frontend))
for item in frontend:
    path = TARGET / item['path']
    if path.suffix in {'.html', '.js', '.css'}:
        content = path.read_text()
        content = re.sub(r'''(["'`])(?:\./)?assets/''', lambda m:m[1] + asset_origin, content)
        path.write_text(content)

duplicate = TARGET / 'dual-scale-original-posters.html'
duplicate.unlink(missing_ok=True)
(TARGET / 'dual-scale.html').write_text('''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./"><link rel="canonical" href="https://eliguli712.github.io/Antiterrastrae/design/megalodon/"><title>Otodus megalodon · Form & Force</title></head><body><p><a href="./">Open Otodus megalodon · Form & Force</a></p><script>location.replace(new URL('./',location.href).href);</script></body></html>''')
cv_path = REPO / 'cv.html'
cv = cv_path.read_text()
cv = cv.replace('design/megalodon/dual-scale-original-posters.html', 'design/megalodon/')
cv = cv.replace('design/megalodon/dual-scale.html', 'design/megalodon/')
cv = cv.replace('https://megalodon-native-stress-eliguli.eliguli712.chatgpt.site', 'https://eliguli712.github.io/Antiterrastrae/design/megalodon/')
cv_path.write_text(cv)
assert cv.count('href="design/megalodon/"') >= 2, 'Both CV entrances must remain.'
assert not duplicate.exists()
(TARGET / 'publication.json').write_text(json.dumps({'revision':'R7','canonical_url':MANIFEST['canonical_url'],
    'asset_commit':data_sha,'source_commit':MANIFEST['source_commit'],
    'deleted_duplicate':'dual-scale-original-posters.html'},indent=2))
git('add', 'design/megalodon', 'cv.html')
if git('diff', '--cached', '--name-only'):
    git('commit', '-m', 'Publish clean megalodon gallery and retain both CV entrances')
    git('push', 'origin', 'HEAD:main')
print(json.dumps({'canonical_url':MANIFEST['canonical_url'],'main_commit':git('rev-parse','HEAD'),
                  'asset_commit':data_sha,'deleted_duplicate':True}))
