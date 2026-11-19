"""All 74,293,846 native faces, without topology reduction. Transfer-only packing."""
from pathlib import Path
import argparse, gzip, hashlib, json, struct
import numpy as np

NV, NF = 37951699, 74293846
def sha(p):
    with open(p, 'rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()
def packed(path, arrays, extra):
    segments={}; offset=0; body=[]
    for name,a in arrays.items():
        b=a.tobytes(); segments[name]={'offset':offset,'bytes':len(b),'dtype':str(a.dtype)};offset+=len(b);body.append(b)
    h=json.dumps({**extra,'segments':segments},separators=(',',':')).encode()
    raw=struct.pack('<I',len(h))+h+b'\0'*((-len(h))%4)+b''.join(body)
    with path.open('wb') as f:
        with gzip.GzipFile(fileobj=f,mode='wb',compresslevel=3,mtime=0) as z:z.write(raw)
    return {'url':path.name,'bytes':path.stat().st_size,'sha256':sha(path)}
def main():
    p=argparse.ArgumentParser();p.add_argument('--cache',required=True);p.add_argument('--out',required=True);a=p.parse_args()
    cache,out=Path(a.cache),Path(a.out);out.mkdir(parents=True,exist_ok=True)
    v=np.memmap(cache/'vertices.f32',dtype='<f4',mode='r',shape=(NV,3));f=np.memmap(cache/'triangles.u32',dtype='<u4',mode='r',shape=(NF,3));n=np.memmap(cache/'normals.f32',dtype='<f4',mode='r',shape=(NV,3))
    orient=np.load(cache/'orientation.npz');B=orient['basis'];C=orient['center_mm'];lo=orient['low'];hi=orient['high'];scale=100/(hi[1]-lo[1]);R=np.array([-B[:,0],-B[:,2],-B[:,1]])*scale
    T=np.array([(lo[0]+hi[0])*scale/2,(lo[2]+hi[2])*scale/2,hi[1]*scale+86.73910524340096])-R@C
    chunks=[];vertex_total=0
    for j,i in enumerate(range(0,NF,1000000)):
        path=out/f'geometry-{j:02}.bin.gz';idsfile=cache/f'ids-{j:02}.npy'
        if path.exists() and idsfile.exists():
            info=json.loads(path.with_suffix('.json').read_text());chunks.append(info);vertex_total+=info['vertices'];continue
        faces=f[i:i+1000000];ids,idx=np.unique(faces,return_inverse=True);np.save(idsfile,ids)
        xyz=(v[ids].astype('f8')@R.T+T).astype('<f4');nn=n[ids].astype('f4')@R.T;nn/=np.maximum(np.linalg.norm(nn,axis=1),1e-20)[:,None]
        info=packed(path,{'positions':xyz,'normals':np.rint(nn*127).astype('i1'),'indices':idx.astype('<u4')},{'vertices':len(ids),'triangles':len(faces),'source_first_face':i})
        info.update(vertices=len(ids),triangles=len(faces),source_first_face=i);path.with_suffix('.json').write_text(json.dumps(info));chunks.append(info);vertex_total+=len(ids)
        print('Geometry',j+1,'/75',info['bytes'],flush=True)
    m={'schema':'native74-r5','source_file':'Megalodon_FullCT_Native_Internal_74M_18um.3mf','source_sha256':'69928fc1d776a0cb2cd3da389802e0b08d226395005bbf4a2094180e90622b73','vertices':NV,'triangles':NF,'face_reduction':False,'all_source_triangle_indices_preserved':True,'position_encoding':'float32, canonical 100 mm display coordinates','normal_encoding':'area-weighted vertex normals, signed normalized int8; geometry unchanged','basis':B.tolist(),'center_mm':C.tolist(),'native_oriented_low_mm':lo.tolist(),'native_oriented_high_mm':hi.tolist(),'native_longitudinal_height_mm':float(hi[1]-lo[1]),'display_affine_R':R.tolist(),'display_affine_T':T.tolist(),'geometry_bytes':sum(x['bytes']for x in chunks),'gpu_buffer_bytes':vertex_total*15+NF*12,'chunks':chunks}
    (out/'geometry.json').write_text(json.dumps(m,indent=2)+'\n');print('COMPLETE',m['geometry_bytes'],flush=True)
if __name__=='__main__': main()
