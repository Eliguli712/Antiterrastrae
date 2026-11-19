from pathlib import Path
import argparse,json,struct,subprocess
import numpy as np
from PIL import Image
from matplotlib import colormaps

p=argparse.ArgumentParser();p.add_argument('--cache',required=True);p.add_argument('--site',required=True);p.add_argument('--size',required=True,type=int);a=p.parse_args();cache=Path(a.cache);site=Path(a.site);out=site/'assets/native74-r5';geo=json.loads((out/'geometry.json').read_text());R=np.array(geo['display_affine_R']);T=np.array(geo['display_affine_T']);NV=geo['vertices'];NF=geo['triangles'];v=np.memmap(cache/'vertices.f32',dtype='<f4',mode='r',shape=(NV,3));f=np.memmap(cache/'triangles.u32',dtype='<u4',mode='r',shape=(NF,3));n=np.memmap(cache/'normals.f32',dtype='<f4',mode='r',shape=(NV,3));values=np.memmap(cache/f'{a.size}mm-values.f32',dtype='<f4',mode='r',shape=(NV,));meta=json.loads((out/f'{a.size}mm-field.json').read_text());lo,hi=meta['color_scale']['min_pa'],meta['color_scale']['max_pa'];threshold=meta['threshold_pa'];palette=np.array(colormaps['turbo'](np.linspace(0,1,256))[:,:3],dtype='f4');renderdir=cache/f'plates-{a.size}';renderdir.mkdir(exist_ok=True)
def colors(s,wash=False):
    good=np.isfinite(s)&(s>0);safe=np.where(good,s,lo);q=np.clip((np.log(np.maximum(safe,lo))-np.log(lo))/(np.log(hi)-np.log(lo)),0,1);c=palette[np.rint(q*255).astype(int)]
    if wash:
        q=np.clip((safe-lo)/(threshold-lo),0,1);c=(np.outer(1-q,[28,49,78])+np.outer(q,[51,116,144]))/255;hot=safe>=threshold;q=np.clip((safe[hot]-threshold)/(hi-threshold),0,1);q=np.clip(q,0,1);low=q<.45;z=np.empty((len(q),3));w=q[low]/.45;z[low]=np.outer(1-w,[108,231,211])+np.outer(w,[191,235,195]);w=(q[~low]-.45)/.55;z[~low]=np.outer(1-w,[191,235,195])+np.outer(w,[246,220,155]);c[hot]=z/255
    c[~good]=[.6,.64,.68];return c
binary=cache/'raster74';proc=subprocess.Popen([str(binary),str(renderdir)],stdin=subprocess.PIPE)
for j,c in enumerate(geo['chunks']):
    ids=np.load(cache/f'ids-{j:02}.npy');faces=f[c['source_first_face']:c['source_first_face']+c['triangles']];_,idx=np.unique(faces,return_inverse=True);xyz=v[ids].astype('f4')@R.T+T;nn=n[ids].astype('f4')@R.T;nn/=np.maximum(np.linalg.norm(nn,axis=1),1e-30)[:,None];s=values[ids];data=np.column_stack([xyz,nn,colors(s),colors(s,True)]).astype('<f4');proc.stdin.write(struct.pack('<III',len(ids),c['triangles'],0));proc.stdin.write(data.tobytes());proc.stdin.write(idx.astype('<u4').tobytes())
    if j%10==0:print('Raster',a.size,j+1,'/75',flush=True)
for name in ['main','cap']:
    b=(site/f'assets/{name}.bin').read_bytes();nv,nf=struct.unpack_from('<II',b);q=np.frombuffer(b,dtype='<f4',offset=8,count=nv*6).reshape(-1,6);idx=np.frombuffer(b,dtype='<u4',offset=8+nv*24,count=nf*3);data=np.column_stack([q,np.tile([.63,.86,.93,.63,.86,.93],(nv,1))]).astype('<f4');proc.stdin.write(struct.pack('<III',nv,nf,1));proc.stdin.write(data.tobytes());proc.stdin.write(idx.tobytes())
proc.stdin.close();assert proc.wait()==0
records=[]
for file in renderdir.glob('*.rgba'):
    im=Image.frombytes('RGBA',(2400,2800),file.read_bytes());target=out/f'{a.size}mm-{file.stem}.webp';im.save(target,quality=98,method=6);file.unlink();records.append({'file':target.name,'width':im.width,'height':im.height,'bytes':target.stat().st_size})
(out/f'{a.size}mm-render-audit.json').write_text(json.dumps({'triangles_per_view':NF,'face_reduction':False,'light_and_camera_shared_between_sizes':True,'source_solution_sha256':meta['source_solution_sha256'],'source_geometry_sha256':geo['source_sha256'],'plates':records},indent=2));print('PLATES COMPLETE',a.size,flush=True)
