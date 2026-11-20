import concurrent.futures,hashlib,json,os,subprocess,time,urllib.request
from pathlib import Path,PurePosixPath
repo=Path.cwd();manifest=json.loads((repo/'.github/megalodon-r10-assets.json').read_text());data=Path(os.environ['RUNNER_TEMP'])/'megalodon-data-r10';branch='megalodon-field-data-r10'
def git(*args,cwd=repo):return subprocess.run(['git',*args],cwd=cwd,text=True,capture_output=True,check=True).stdout.strip()
git('config','user.name','Eliguli Han');git('config','user.email','hh3494@nyu.edu')
exists=git('ls-remote','--heads','origin','refs/heads/'+branch)
if exists:
 git('fetch','--depth','1','origin',branch);git('worktree','add','--detach',str(data),'FETCH_HEAD')
else:
 git('worktree','add','--detach',str(data),'HEAD');git('checkout','--orphan','r10-data-build',cwd=data);git('rm','-rf','--ignore-unmatch','.',cwd=data)
def one(item):
 path=PurePosixPath(item['path'])
 if path.is_absolute() or '..' in path.parts or not str(path).startswith('assets/'):raise ValueError('Invalid asset path')
 dest=data/str(path);dest.parent.mkdir(parents=True,exist_ok=True)
 if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest()==item['sha256']:return
 for attempt in range(4):
  try:
   request=urllib.request.Request(manifest['origin'].rstrip('/')+'/'+str(path),headers={'User-Agent':'Megalodon-Publication/10'})
   with urllib.request.urlopen(request,timeout=120) as response:content=response.read()
   if len(content)!=item['bytes'] or hashlib.sha256(content).hexdigest()!=item['sha256']:raise ValueError('Asset checksum mismatch: '+str(path))
   dest.write_bytes(content);return
  except Exception:
   if attempt==3:raise
   time.sleep(2**attempt)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(one,manifest['files']))
(data/'assets/r10-publication.json').write_text(json.dumps({'revision':'R10','canonical_url':manifest['canonical_url'],'source_commit':manifest['source_commit'],'verified_assets':len(manifest['files']),'verified_bytes':sum(f['bytes'] for f in manifest['files']),'scope':'Additional print orientation, performance validation and poster/LaTeX assets; previous native geometry and numerical fields retain their pinned R7/R9 sources.'},indent=2))
git('add','assets',cwd=data)
if git('diff','--cached','--name-only',cwd=data):git('commit','-m','Publish full-surface minimum print orientations and compiled poster source R10',cwd=data)
sha=git('rev-parse','HEAD',cwd=data);git('push','origin','HEAD:refs/heads/'+branch,cwd=data);print(json.dumps({'asset_commit':sha,'assets':len(manifest['files']),'status':'verified_and_published'}))
