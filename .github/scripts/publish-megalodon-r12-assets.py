"""GitHub Actions: verify staged archive transports and publish immutable assets."""
import concurrent.futures,gzip,hashlib,io,json,os,struct,subprocess,threading,time,urllib.request,zipfile
from pathlib import Path,PurePosixPath
repo=Path.cwd();manifest=json.loads((repo/'.github/megalodon-r12-assets.json').read_text());data=Path(os.environ['RUNNER_TEMP'])/'megalodon-data-r12';branch='megalodon-support-data-r12';cache={};lock=threading.Lock()
def git(*args,cwd=repo):return subprocess.run(['git',*args],cwd=cwd,text=True,capture_output=True,check=True).stdout.strip()
git('config','user.name','Eliguli Han');git('config','user.email','hh3494@nyu.edu')
exists=git('ls-remote','--heads','origin','refs/heads/'+branch)
if exists:
 git('fetch','--depth','1','origin',branch);git('worktree','add','--detach',str(data),'FETCH_HEAD')
else:
 git('worktree','add','--detach',str(data),'HEAD');git('checkout','--orphan','r12-data-build',cwd=data);git('rm','-rf','--ignore-unmatch','.',cwd=data)
def verify(content,rec):
 if len(content)!=rec['bytes'] or hashlib.sha256(content).hexdigest()!=rec['sha256']:raise ValueError('Asset checksum mismatch: '+str(rec.get('path')))
 return content
def transport(spec):
 key=spec['sha256']
 with lock:
  future=cache.get(key)
  if future is None:future=concurrent.futures.Future();cache[key]=future;owner=True
  else:owner=False
 if not owner:return future.result()
 try:
  buffers=[]
  for part in spec['parts']:
   for attempt in range(4):
    try:
     request=urllib.request.Request(manifest['origin'].rstrip('/')+'/'+part['path'],headers={'User-Agent':'Megalodon-Publication/12'})
     with urllib.request.urlopen(request,timeout=120) as response:raw=response.read()
     buffers.append(verify(raw,part));break
    except Exception:
     if attempt==3:raise
     time.sleep(2**attempt)
  content=verify(b''.join(buffers),spec)
  future.set_result(content);return content
 except Exception as error:future.set_exception(error);raise

def filter_zip(raw,names):
 wanted=set(names)
 if len(wanted)!=len(names):raise ValueError('Duplicate ZIP member request')
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  infos=z.infolist();byname={i.filename:i for i in infos}
  if not wanted<=byname.keys():raise ValueError('Missing ZIP member')
  offsets=sorted(i.header_offset for i in infos)+[z.start_dir]
  end={offsets[i]:offsets[i+1] for i in range(len(offsets)-1)}
  central={};p=z.start_dir
  while raw[p:p+4]==b'PK\x01\x02':
   nl,el,cl=struct.unpack_from('<HHH',raw,p+28);n=46+nl+el+cl;flags=struct.unpack_from('<H',raw,p+8)[0]
   name=raw[p+46:p+46+nl].decode('utf-8' if flags&0x800 else 'cp437');central[name]=raw[p:p+n];p+=n
  body=bytearray();directory=bytearray()
  for name in names:
   info=byname[name];offset=len(body);body.extend(raw[info.header_offset:end[info.header_offset]])
   rec=bytearray(central[name]);struct.pack_into('<I',rec,42,offset);directory.extend(rec)
  count=len(names);comment=z.comment
  eocd=struct.pack('<4s4H2IH',b'PK\x05\x06',0,0,count,count,len(directory),len(body),len(comment))+comment
  result=bytes(body+directory+eocd)
 with zipfile.ZipFile(io.BytesIO(result)) as z:
  if z.namelist()!=names or z.testzip() is not None:raise ValueError('Filtered ZIP verification failed')
 return result


def one(item):
 path=PurePosixPath(item['path'])
 if path.is_absolute() or '..' in path.parts or not str(path).startswith('assets/'):raise ValueError('Invalid asset path')
 dest=data/str(path);dest.parent.mkdir(parents=True,exist_ok=True)
 if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest()==item['sha256']:return
 spec=item['transport'];raw=transport(spec)
 if spec['encoding']=='gzip':content=gzip.decompress(raw)
 elif spec['encoding']=='zip-member':
  with zipfile.ZipFile(io.BytesIO(raw)) as archive:content=archive.read(spec['member'])
 elif spec['encoding']=='zip-filter':content=filter_zip(raw,spec['members'])
 elif spec['encoding']=='identity':content=raw
 else:raise ValueError('Unknown transport encoding')
 verify(content,item)
 if len(content)>100*1024*1024:raise ValueError('GitHub single asset too large')
 dest.write_bytes(content)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(one,manifest['files']))
record={'revision':'R12','canonical_url':manifest['canonical_url'],'source_commit':manifest['source_commit'],'verified_assets':len(manifest['files']),'verified_bytes':sum(f['bytes'] for f in manifest['files']),'source_geometry_sha256':manifest['source_geometry_sha256'],'scope':'Source-correct four-equilateral-cut support for both tooth sizes, measured-CAD independent support mechanics, smooth analytic surfaces, all-native tooth fit checks, full-source display plates and certified STL print directions. Legacy native tooth data and stored tooth fields remain pinned to prior immutable source commits.'}
(data/'assets/support-r12-publication.json').write_text(json.dumps(record,indent=2)+'\n')
git('add','assets',cwd=data)
if git('diff','--cached','--name-only',cwd=data):git('commit','-m','Publish source-correct common-apex support and manufacturing assets R12',cwd=data)
sha=git('rev-parse','HEAD',cwd=data);git('push','origin','HEAD:refs/heads/'+branch,cwd=data);print(json.dumps({'asset_commit':sha,'assets':len(manifest['files']),'status':'verified_and_published'}))
