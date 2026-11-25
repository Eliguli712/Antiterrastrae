"""Stage audited native meshlets, masks and artistic display data for the site."""
from pathlib import Path
import gzip,hashlib,json,struct,shutil,os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties

O=Path(__file__).resolve().parents[1];ROOT=O.parents[1]
RUN=O/'review/run001';COMPACT=O/'review/compact-run002'
DEST=ROOT/'output/web_native74_batch_2026-11-24/data-assets/assets/native-interactive-r15';DEST.mkdir(parents=True,exist_ok=True)
for folder in [RUN/'data',COMPACT/'data']:
 for path in folder.iterdir():
  if path.is_file():
   target=DEST/path.name
   if target.exists() and not os.path.samefile(path,target):target.unlink()
   if not target.exists():os.link(path,target)
for name in ['immediate-preview.bin.gz','immediate-preview.json']:shutil.copy2(O/'prepared'/name,DEST/name)
for source,name in [(RUN/'result.json','filter-result.json'),(RUN/'manifest.json','filter-run-manifest.json'),(COMPACT/'result.json','compact-result.json'),(COMPACT/'manifest.json','compact-run-manifest.json')]:shutil.copy2(source,DEST/name)
for path in (O/'scripts').glob('*.py'):shutil.copy2(path,DEST/path.name)
for source,name in [(O/'review/contract.json','filter-contract.json'),(O/'review/compact-contract-v2.json','compact-contract.json')]:shutil.copy2(source,DEST/name)

b=gzip.decompress((RUN/'data/masked-ct-display.bin.gz').read_bytes());n=struct.unpack_from('<I',b)[0];h=json.loads(b[4:4+n]);offset=4+(n+3)//4*4;s=h['segments']['rgba'];rgba=np.frombuffer(b,dtype='u1',count=s['bytes'],offset=offset+s['offset']).reshape(*h['shape_zyx'],4)
maximum=int(np.max(np.abs(rgba[...,2].astype('i2')-rgba[...,0].astype('i2'))))
# Full independent bit order/serialization roundtrip against every source mask.
metadata=json.loads((RUN/'data/native-mask.json').read_text());shape=tuple(metadata['native_shape_zyx']);native=np.memmap(ROOT/'output/ct_web_2026-11-19/cache/selected_native_mask.u8',dtype='u1',mode='r',shape=shape);checked=0
for p in metadata['slabs']:
 encoded=(RUN/'data'/p['url']).read_bytes();assert hashlib.sha256(encoded).hexdigest()==p['sha256'];decoded=gzip.decompress(encoded);n=struct.unpack_from('<I',decoded)[0];header=json.loads(decoded[4:4+n]);off=4+(n+3)//4*4;seg=header['segments']['packedMask'];packed=np.frombuffer(decoded,dtype='u1',count=seg['bytes'],offset=off+seg['offset']).reshape(p['planes'],shape[1],header['packed_width']);a=np.unpackbits(packed,axis=-1,count=shape[2],bitorder='little');assert np.array_equal(a,native[p['first_z']:p['first_z']+p['planes']]);checked+=a.size
assert checked==int(np.prod(shape))
review={'native_mask_binary_voxels_compared':checked,'every_native_bit_position_roundtrips':True,'source_mask_unchanged':True,'serialized_MPPCA_max_change_gray_levels':maximum,'GPU_filter_change_limit_gray_levels':12,'note':'The shader applies its declared 12-level cap again after U8 texture serialization.'}
(O/'review/serialization-validation.json').write_text(json.dumps(review,indent=2)+'\n');shutil.copy2(O/'review/serialization-validation.json',DEST/'serialization-validation.json')

fig,axes=plt.subplots(1,4,figsize=(16,8),facecolor='#0b1a23');serif=FontProperties(fname=str(ROOT/'output/acrylic_baskerville_v4_2026-11-20/review/font_cache/Baskerville-Italic.ttf'))
fig.text(.045,.96,'Astraeus Krystallisia',fontproperties=serif,fontsize=27,color='#e1eff0');fig.text(.045,.91,'Original mask before colour | basic filtration and conditional patch-intensity MPPCA',fontsize=12,color='#a9c9d2')
plane=rgba[:,:,rgba.shape[2]//2,:];inside=plane[...,3]>.5*255;lo,hi=np.quantile(plane[...,0][inside],[.02,.98]);lo=max(0,float(lo)-10);hi=min(255,float(hi)+10)
for ax,channel,title in zip(axes,[3,0,1,2],['Material fraction','Original masked intensity','Mask-aware basic filter','Conditional MPPCA']):
 ax.set_facecolor('#02080c');ax.imshow(plane[...,channel],origin='lower',cmap='gray',vmin=0 if channel==3 else lo,vmax=255 if channel==3 else hi,interpolation='nearest',extent=[0,plane.shape[1]*.144,0,plane.shape[0]*.144]);ax.set_title(title,color='#d1e6e8',fontsize=12);ax.set_xlabel('Native scanner Y / mm',color='#8eafb9');ax.tick_params(colors='#8eafb9');ax.set_ylabel('Native scanner Z / mm',color='#8eafb9')
fig.subplots_adjust(left=.045,right=.98,top=.85,bottom=.18,wspace=.3);fig.text(.045,.10,'144 µm artistic intensity display cache, pooled from every original acquired-grid voxel. Exact native 18 µm binary masks remain separate.',color='#9cbec7',fontsize=10);fig.text(.045,.055,'One shared contrast window across all three intensities. Filtering changes display values, not source geometry, original mask or FEM stresses.',color='#9cbec7',fontsize=10)
fig.savefig(DEST/'Masked_CT_Basic_MPPCA_Comparison.png',dpi=190);plt.close(fig)
(DEST/'README.txt').write_text('Native interactive display R15. The compact mesh retains all original 74,293,846 ordered source faces and both verified current 3MF RGB fields. Grid coordinates reconstruct original source vertices exactly at 0.009 mm half-voxel increments; no extra quantization or surface reduction is used. The preview is explicitly the earlier closed-solid boundary and is never called complete native geometry. Binary mask slabs preserve every original 18 um bit. The artistic intensity texture is an explicitly labelled 144 um pooled display derivative with mask-aware filtration and a 27-dimensional K=4, q=4 patch-intensity mixture PPCA model. These changes do not replace the original native mask, original stress field or geometry, and do not certify new acquired resolution. Native porous-volume FEM remains deferred by user request.\n')
records=[]
for p in sorted(DEST.iterdir()):
 if p.is_file():
  with p.open('rb')as f:hash_=hashlib.file_digest(f,'sha256').hexdigest()
  records.append({'name':p.name,'bytes':p.stat().st_size,'sha256':hash_})
(O/'review/data-publication-manifest.json').write_text(json.dumps({'files':records,'bytes':sum(r['bytes']for r in records),'status':'prepared'},indent=2)+'\n')
print('AUDITED R15 DATA STAGED',len(records),'files',sum(r['bytes']for r in records),'bytes',flush=True)
