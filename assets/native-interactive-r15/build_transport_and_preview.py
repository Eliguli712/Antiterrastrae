"""Pin decoded hashes for shared cache reuse, and a labelled immediate proxy."""
from pathlib import Path
import concurrent.futures,gzip,hashlib,json,struct,time,urllib.request
import numpy as np
from scipy.spatial import cKDTree

O=Path(__file__).resolve().parents[1];ROOT=O.parents[1]
OUT=O/'prepared';OUT.mkdir(parents=True,exist_ok=True)
OLD=ROOT/'output/web_native74_batch_2026-11-24/data-assets/assets/native74-paper-mr5'
g=json.loads((OLD/'geometry.json').read_text())
def sha(b):return hashlib.sha256(b).hexdigest()
def save(path,j):path.write_text(json.dumps(j,indent=2)+'\n')
def native_part(i):
 c=g['chunks'][i]
 for attempt in range(3):
  try:
   with urllib.request.urlopen(c['url'],timeout=90)as r:b=r.read()
   break
  except Exception:
   if attempt==2:raise
   time.sleep(.3)
 assert sha(b)==c['sha256'],i
 raw=gzip.decompress(b)
 return i,{**c,'decoded_sha256':sha(raw),'decoded_bytes':len(raw)}
with concurrent.futures.ThreadPoolExecutor(max_workers=3)as ex:
 for start in range(0,len(g['chunks']),3):
  for i,c in ex.map(native_part,range(start,min(start+3,len(g['chunks'])))):
   g['chunks'][i]=c;print('Pinned native decoded cache hash',i+1,'/ 75',flush=True)
save(OUT/'geometry.json',g)
for size in [50,100]:
 f=json.loads((OLD/f'{size}mm-field.json').read_text())
 for c in f['chunks']:
  b=(OLD/c['url']).read_bytes();assert sha(b)==c['sha256'];raw=gzip.decompress(b)
  c.update({'decoded_sha256':sha(raw),'decoded_bytes':len(raw),'url':'https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/37ea516b75facd7dacbaacb332c4b5c522d15ad1/assets/native74-paper-mr5/'+c['url']})
 save(OUT/f'{size}mm-field.json',f)

# Immediate, explicitly labelled closed-solid proxy; full native geometry replaces
# it automatically and remains resident thereafter. No preview is called 74M.
B=ROOT/'output/paper_native74_5cm_10cm_2026-11-22'
a=np.load(B/'review/mr5_run001/100mm_MR5_solution.npz')
points=a['points_m']*1000;faces=a['boundary_faces'];used,ix=np.unique(faces,return_inverse=True)
native=points[used]/(100/g['native_longitudinal_height_mm'])
positions=(native@np.array(g['display_affine_R']).T+np.array(g['display_affine_T'])).astype('f4')
indices=ix.reshape(-1,3).astype('u4');tri=positions[indices];n=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);normal=np.zeros_like(positions)
for corner in range(3):np.add.at(normal,indices[:,corner],n)
normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-12);normal=np.rint(normal*127).astype('i1')
V=ROOT/'output/current_native74_stress_2026-11-20/cache'
v=np.memmap(V/'vertices.f64',dtype='<f8',mode='r',shape=(37951699,3))
rgb=np.memmap(B/'cache/50mm-paper-reference-rgb.u8',dtype='u1',mode='r',shape=(37951699,3))
tree=cKDTree(np.array(v[::32]));distance,nearest=tree.query(native,workers=2);rgb50=np.array(rgb[nearest*32])
tet=a['tets'];vol=a['volumes_m3'];vm=a['element_von_mises_Pa'];numerator=np.zeros(len(points));denominator=np.zeros(len(points))
for corner in range(4):
 numerator+=np.bincount(tet[:,corner],weights=vm*vol,minlength=len(points));denominator+=np.bincount(tet[:,corner],weights=vol,minlength=len(points))
val=(numerator/np.maximum(denominator,1e-30))[used].astype('f4')
palette=np.array(json.loads((OLD/'palette.json').read_text()),dtype='u1');legend=json.loads((OLD/'100mm-field.json').read_text())['legend']
colour_index=np.minimum((np.clip((val-legend['display_min_Pa'])/(legend['display_max_Pa']-legend['display_min_Pa']),0,1)*256).astype('u4'),255);rgb100=palette[colour_index]
arrays=[('positions',positions),('normals',normal),('indices',indices),('colors50',rgb50),('colors100',rgb100),('values100',val)]
segments={};cursor=0;parts=[]
for key,array in arrays:
 pad=(-cursor)%4
 if pad:parts.append(bytes(pad));cursor+=pad
 b=array.tobytes();segments[key]={'offset':cursor,'bytes':len(b),'dtype':{'u1':'uint8','i1':'int8','f4':'float32','u4':'uint32'}[array.dtype.str[1:]]};parts.append(b);cursor+=len(b)
h={'schema':'native74-immediate-proxy-v1','vertices':len(positions),'triangles':len(indices),'preview_only':True,'segments':segments};j=json.dumps(h,separators=(',',':')).encode();raw=struct.pack('<I',len(j))+j+bytes((-len(j))%4)+b''.join(parts);b=gzip.compress(raw,compresslevel=5,mtime=0)
(OUT/'immediate-preview.bin.gz').write_bytes(b)
save(OUT/'immediate-preview.json',{'file':{'url':'immediate-preview.bin.gz','bytes':len(b),'sha256':sha(b),'decoded_sha256':sha(raw),'decoded_bytes':len(raw)},'vertices':len(positions),'triangles':len(indices),'source':'Existing 100mm closed-solid MR5 boundary; immediate navigation proxy only','paper_appearance_lookup':'Every 32nd native source vertex, only for the labelled temporary preview','appearance_lookup_distance_mm_max':float(distance.max()),'native_source_faces':74293846,'full_native_geometry_reduced':False})
print('SHARED CACHE METADATA AND IMMEDIATE PROXY COMPLETE',flush=True)
