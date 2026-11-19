"""Retrieve verified public exhibition records for reproducible complete exports."""
import argparse, gzip, hashlib, json, shutil, struct, subprocess, urllib.request
from pathlib import Path
import numpy as np
from export_models import prepare, NV, NF

p=argparse.ArgumentParser();p.add_argument('--site',required=True);p.add_argument('--cache',type=Path,required=True);p.add_argument('--solutions',type=Path,required=True);a=p.parse_args();cache=a.cache.resolve();sol=a.solutions.resolve();cache.mkdir(parents=True,exist_ok=True);sol.mkdir(parents=True,exist_ok=True);site=a.site.rstrip('/')+'/'
def get(path,sha=None):
    req=urllib.request.Request(site+path,headers={'User-Agent':'Vrontiki-scientific-export'})
    with urllib.request.urlopen(req,timeout=120)as r:b=r.read()
    if sha:assert hashlib.sha256(b).hexdigest()==sha,path
    return b
def js(path):return json.loads(get(path))
source=Path(__file__).with_name('export_stream.cpp');helper=cache/'export_stream';subprocess.run(['g++','-O3','-std=c++17',str(source),'-o',str(helper)],check=True);prepare(cache,helper)
geo=js('assets/native74-r5/geometry.json');(cache/'geometry.json').write_text(json.dumps(geo));np.savez(cache/'orientation.npz',basis=np.array(geo['basis']),center_mm=np.array(geo['center_mm']),low=np.array(geo['native_oriented_low_mm']),high=np.array(geo['native_oriented_high_mm']));faces=np.memmap(cache/'triangles.u32',dtype='<u4',mode='r',shape=(NF,3))
for size in [50,100]:
    summary=get(f'assets/fem-r5/{size}mm-summary.json');(sol/f'{size}mm-summary.json').write_bytes(summary)
    m=js(f'assets/fem-r5/{size}mm-solution-manifest.json');target=sol/m['filename']
    with target.open('wb')as f:
        for part in m['parts']:f.write(get('assets/fem-r5/'+part['file'],part['sha256']))
    with target.open('rb')as f:assert hashlib.file_digest(f,'sha256').hexdigest()==m['sha256']
    field=js(f'assets/native74-r5/{size}mm-field.json');values=np.memmap(cache/f'{size}mm-values.f32',dtype='<f4',mode='w+',shape=(NV,));values[:]=np.nan
    for j,(chunk,scalar)in enumerate(zip(geo['chunks'],field['chunks'])):
        first=chunk['source_first_face'];ids=np.unique(faces[first:first+chunk['triangles']]);b=gzip.decompress(get('assets/native74-r5/'+scalar['url'],scalar['sha256']));n=struct.unpack_from('<I',b)[0];h=json.loads(b[4:4+n]);s=h['segments']['values'];data=np.frombuffer(b,dtype='<f4',offset=4+((n+3)//4)*4+s['offset'],count=s['bytes']//4);assert len(data)==len(ids);values[ids]=data
        if j%15==0:print('Verified numerical projection',size,j+1,'/75',flush=True)
    values.flush()
print('Both independently solved fields and complete source geometry verified',flush=True)
