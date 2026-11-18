from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib,json,urllib.request,urllib.parse
root=Path(__file__).resolve().parents[1]
m=json.loads((root/'.github/studio-transfer.json').read_text())
def get(c):
 p=Path(c['path']);assert not p.is_absolute()and'..'not in p.parts
 data=urllib.request.urlopen(m['source']+urllib.parse.quote(p.as_posix()),timeout=120).read()
 assert len(data)==c['bytes']and hashlib.sha256(data).hexdigest()==c['sha256'],p
 target=root/'design/megalodon/assets'/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
with ThreadPoolExecutor(max_workers=6)as pool:list(pool.map(get,m['files']))
print('Verified and imported',len(m['files']),'studio assets.')
