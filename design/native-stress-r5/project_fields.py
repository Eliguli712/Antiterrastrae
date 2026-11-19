"""Project independently recomputed volume stresses to the complete native surface."""
import argparse,gzip,hashlib,json,struct
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
from prepare_geometry import packed,sha,NV

p=argparse.ArgumentParser();p.add_argument('--cache',required=True);p.add_argument('--out',required=True);p.add_argument('--solutions',required=True);p.add_argument('--size',required=True,type=int);a=p.parse_args()
cache,out,sol=Path(a.cache),Path(a.out),Path(a.solutions);v=np.memmap(cache/'vertices.f32',dtype='<f4',mode='r',shape=(NV,3));geo=json.loads((out/'geometry.json').read_text());size=a.size
summary=json.loads((sol/f'{size}mm-summary.json').read_text());d=np.load(sol/f'{size}mm-solution.npz');pts=d['points_m'];tets=d['tets'];values=d['element_von_mises_Pa'];centers=pts[tets].mean(axis=1)
scale=size/geo['native_longitudinal_height_mm'];tree=cKDTree(centers);fieldfile=cache/f'{size}mm-values.f32';distfile=cache/f'{size}mm-distance.f32'
fields=np.memmap(fieldfile,dtype='<f4',mode='w+',shape=(NV,));dist=np.memmap(distfile,dtype='<f4',mode='w+',shape=(NV,));mapped=0;distmax=0.;samples=[]
for i in range(0,NV,400000):
    q=np.asarray(v[i:i+400000],dtype='f8')*scale/1000;dd,ix=tree.query(q,workers=2);ss=values[ix].astype('f4');valid=dd<=.00075*scale;ss[~valid]=np.nan;fields[i:i+len(q)]=ss;dist[i:i+len(q)]=dd*1000;mapped+=int(valid.sum());distmax=max(distmax,float(dd.max()*1000));samples.append(ss[::32]);print('Projection',size,i+len(q),'/',NV,flush=True)
fields.flush();dist.flush();chunks=[]
for j,c in enumerate(geo['chunks']):
    ids=np.load(cache/f'ids-{j:02}.npy',mmap_mode='r');path=out/f'{size}mm-field-{j:02}.bin.gz';info=packed(path,{'values':np.asarray(fields[ids])},{'vertices':len(ids),'units':'Pa','independent_size_mm':size});chunks.append(info)
ss=np.concatenate(samples);finite=ss[np.isfinite(ss)&(ss>0)];lo,hi=253167.0947190341,250522132.64670932
threshold=float(np.quantile(finite,.9));edges=np.geomspace(lo,hi,61);counts=np.histogram(np.clip(finite,lo,hi),edges)[0]
meta={'schema':'native74-independent-field-r5','nominal_native_height_mm':size,'source_solution':f'{size}mm-solution.npz','source_solution_sha256':sha(sol/f'{size}mm-solution.npz'),'display_surface_triangles':geo['triangles'],'source_tetrahedra':len(tets),'source_nodes':len(pts),'source_to_print_scale':scale,'projection':'Nearest independently solved element centroid in the same recalibrated scanner frame; rejected farther than0.75 source mm. Surface projection is not an additional solve.','distance_cutoff_print_mm':.75*scale,'mapped_vertices':mapped,'unmapped_vertices':NV-mapped,'units':'Pa','color_scale':{'min_pa':lo,'max_pa':hi,'transform':'log','palette':'Matplotlib Turbo256, common to both sizes','grey':'no supported volume-field projection'},'threshold_pa':threshold,'histogram':{'edges_pa':edges.tolist(),'counts':counts.tolist(),'sampling':'Deterministic every32nd native vertex; display diagnostic, not volume weighting'},'chunks':chunks}
(out/f'{size}mm-field.json').write_text(json.dumps(meta,indent=2)+'\n');print('FIELD COMPLETE',size,mapped,flush=True)
