"""Recover full native display fields without changing any solved element stress."""
from pathlib import Path
import concurrent.futures, gzip, hashlib, json, os, struct, subprocess, sys, urllib.request
import numpy as np

DATA=Path(sys.argv[1]); OUT=DATA/'assets/field-r7'; CACHE=Path(os.environ['RUNNER_TEMP'])/'megalodon-recovery-cache';CACHE.mkdir(exist_ok=True)
geometry=json.loads((DATA/'assets/native74-r5/geometry.json').read_text())
R=np.array(geometry['display_affine_R']);T=np.array(geometry['display_affine_T']);inverse=np.linalg.inv(R)
native_origin='https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/native74-r5-data/data/'
def native(chunk):
    p=CACHE/Path(chunk['url']).name
    if not p.exists():
        with urllib.request.urlopen(native_origin+p.name,timeout=180) as r:p.write_bytes(r.read())
    assert hashlib.sha256(p.read_bytes()).hexdigest()==chunk['sha256']
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(native,geometry['chunks']))
print('Verified every native geometry chunk.',flush=True)
binary=CACHE/'project_boundary'
subprocess.run(['g++','-O3','-std=c++17',str(Path(__file__).with_name('project-boundary-r7.cpp')),'-o',str(binary)],check=True)
def packed(path,values):
    header=json.dumps({'vertices':len(values),'units':'Pa','independent_size_mm':size,
       'recovery':'r7 true boundary interpolation','segments':{'values':{'offset':0,'bytes':values.nbytes,'dtype':'float32'}}},separators=(',',':')).encode()
    raw=struct.pack('<I',len(header))+header+b'\0'*((-len(header))%4)+values.tobytes()
    with path.open('wb') as f:
        with gzip.GzipFile(fileobj=f,mode='wb',compresslevel=3,mtime=0) as z:z.write(raw)
    return {'url':'../field-r7/'+path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
for size in [50,100]:
    manifest=json.loads((DATA/f'assets/fem-r5/{size}mm-solution-manifest.json').read_text())
    solution=CACHE/f'{size}mm-solution.npz'
    with solution.open('wb') as f:
        for part in manifest['parts']:
            content=(DATA/'assets/fem-r5'/part['file']).read_bytes()
            assert hashlib.sha256(content).hexdigest()==part['sha256'];f.write(content)
    metadata=json.loads((OUT/f'{size}mm-field.json').read_text())
    assert hashlib.sha256(solution.read_bytes()).hexdigest()==metadata['source_solution_sha256']
    d=np.load(solution);p=d['points_m']*1000;t=d['tets'];faces=d['boundary_faces'];stress=d['element_von_mises_Pa'];volume=d['volumes_m3']
    accumulated=np.zeros(len(p));weight=np.zeros(len(p))
    for k in range(4):np.add.at(accumulated,t[:,k],stress*volume);np.add.at(weight,t[:,k],volume)
    nodal=accumulated/weight;assert np.isfinite(nodal).all()
    model=CACHE/f'{size}mm-model.bin'
    with model.open('wb') as f:
        f.write(struct.pack('<III',len(p),len(faces),len(t)));f.write(p.astype('<f8').tobytes());f.write(nodal.astype('<f8').tobytes());f.write(faces.astype('<u4').tobytes());f.write(t.astype('<u4').tobytes())
    scale=size/geometry['native_longitudinal_height_mm'];cutoff=.75*scale
    proc=subprocess.Popen([str(binary),str(model),str(cutoff)],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
    metadata['chunks']=[];vertices=zero=0;max_distance=0.
    for i,chunk in enumerate(geometry['chunks']):
        raw=gzip.decompress((CACHE/Path(chunk['url']).name).read_bytes());n=struct.unpack_from('<I',raw)[0];header=json.loads(raw[4:4+n]);offset=4+(n+3)//4*4;segment=header['segments']['positions'];xyz=np.frombuffer(raw,dtype=segment['dtype'],count=segment['bytes']//4,offset=offset+segment['offset']).reshape(-1,3)
        points=(xyz-T)@inverse.T*scale;proc.stdin.write(struct.pack('<I',len(points)));proc.stdin.write(points.astype('<f8').tobytes());proc.stdin.flush();data=bytearray();length=8*len(points)
        while len(data)<length:
            block=proc.stdout.read(length-len(data))
            if not block:raise RuntimeError('Recovery stopped')
            data.extend(block)
        result=np.frombuffer(data,dtype='<f4');values=result[:len(points)].copy();distance=result[len(points):]
        assert np.isfinite(values).all() and (values>=0).all();vertices+=len(values);zero+=int((values==0).sum());max_distance=max(max_distance,float(distance.max()))
        metadata['chunks'].append(packed(OUT/f'{size}mm-field-{i:02}.bin.gz',values))
        if i%15==0:print(f'Recovered {size} mm native chunk {i+1}/75',flush=True)
    proc.stdin.close();assert proc.wait()==0
    assert vertices==metadata['mapped_stream_vertices'] and zero==metadata['zero_stream_vertices']
    metadata['reproduced_from_original_numerical_archive']=True;metadata['maximum_boundary_projection_mm']=max_distance
    (OUT/f'{size}mm-field.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(f'Complete {size} mm field: {vertices} mapped, zero unsupported.',flush=True)
