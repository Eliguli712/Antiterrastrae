"""Exact streaming 6-connected background CCL and six-neighbour material interior.
No morphological edits; source mask is read-only. Synthetic exhaustive check first.
"""
from pathlib import Path
import argparse,json,sys,time
from array import array
import numpy as np
from scipy import ndimage as ndi

def count(mask,progress=False):
 Z,H,W=mask.shape;parent=array('I',[0]);mass=array('Q',[0]);outside=bytearray([0]);prev=None;material=interior=0
 def find(x):
  while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
  return x
 def union(a,b):
  a=find(a);b=find(b)
  if a==b:return
  if mass[a]<mass[b]:a,b=b,a
  parent[b]=a;mass[a]+=mass[b];mass[b]=0;outside[a]|=outside[b]
 for z in range(Z):
  a=np.asarray(mask[z],dtype=bool);material+=int(a.sum())
  if 0<z<Z-1:
   inside=a[1:-1,1:-1]&a[:-2,1:-1]&a[2:,1:-1]&a[1:-1,:-2]&a[1:-1,2:]&mask[z-1,1:-1,1:-1].astype(bool)&mask[z+1,1:-1,1:-1].astype(bool);interior+=int(inside.sum())
  labels,n=ndi.label(~a);counts=np.bincount(labels.ravel(),minlength=n+1);start=len(parent);ids=np.arange(start,start+n,dtype='u4');parent.extend(ids.tolist());mass.extend(counts[1:].tolist());outside.extend(bytes(n));mapping=np.r_[np.uint32(0),ids]
  edge=np.unique(labels)if z in [0,Z-1]else np.unique(np.r_[labels[0],labels[-1],labels[:,0],labels[:,-1]])
  for k in edge:
   if k:outside[int(mapping[k])]=1
  curr=mapping[labels]
  if prev is not None:
   common=(prev>0)&(curr>0);pairs=np.unique((prev[common].astype('u8')<<32)|curr[common].astype('u8'))
   for key in pairs:union(int(key>>np.uint64(32)),int(key&np.uint64(0xffffffff)))
  prev=curr
  if progress and (z%300==0 or z==Z-1):print('Counted native plane',z+1,'/',Z,flush=True)
 roots=[i for i in range(1,len(parent))if parent[i]==i and not outside[i]];closed=sum(mass[i]for i in roots)
 return {'grid_voxels':int(np.prod(mask.shape)),'selected_material_voxels':material,'strict_interior_material_voxels_6_neighbours':interior,'boundary_material_voxels_6_neighbours':material-interior,'closed_internal_background_voxels_6_connectivity':int(closed),'closed_background_components_6_connectivity':len(roots),'exterior_connected_background_voxels_6_connectivity':int(np.prod(mask.shape))-material-int(closed)}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--run-dir',required=True);args=ap.parse_args();run=Path(args.run_dir);run.mkdir(exist_ok=True,parents=True);root=Path(__file__).resolve().parents[3]
 rng=np.random.default_rng(15)
 for i in range(12):
  x=(rng.random((8,9,10))>.48).astype('u1');r=count(x);filled=ndi.binary_fill_holes(x);labels,n=ndi.label(filled&~x.astype(bool));assert r['closed_internal_background_voxels_6_connectivity']==int(np.sum(filled)-np.sum(x));assert r['closed_background_components_6_connectivity']==n;assert r['strict_interior_material_voxels_6_neighbours']==int(ndi.binary_erosion(x).sum())
 mask=np.memmap(root/'output/ct_web_2026-11-19/cache/selected_native_mask.u8',dtype='u1',mode='r',shape=(2886,1903,746));result=count(mask,True);assert result['selected_material_voxels']==967429317
 result.update(status='completed',native_sampling_mm=.018,native_sampling_um=18,source_surface_triangles=74293846,source_boundary_vertices=37951699,internal_definition='Material interior: selected voxel with all six face-neighbours selected. Closed background: 6-connected background component touching none of the six crop boundaries. This digital connectivity count is not the earlier mesh-shell component count.',native_mask_unchanged=True,synthetic_checks=12)
 (run/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
if __name__=='__main__':main()
