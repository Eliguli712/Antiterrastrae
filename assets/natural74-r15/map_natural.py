from pathlib import Path
import hashlib,json,time
import numpy as np
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parents[1];C=ROOT/'output/tooth_continuous_surfaces/cache';NV=37951699
sv=np.load(C/'web_original_ct_vertices.npy',mmap_mode='r');srgb=np.load(C/'natural_area_weighted_vertex_rgb.npy',mmap_mode='r');napp=np.load(C/'natural_face_appearance.npy',mmap_mode='r');sapp=np.load(C/'stress_face_appearance.npy',mmap_mode='r')
assert len(sv)==len(srgb)==16272624
for i in range(0,len(napp),1000000):assert np.array_equal(napp[i:i+1000000,0],sapp[i:i+1000000,0])
srough=np.memmap(ROOT/'output/paper_native74_5cm_10cm_2026-11-22/cache/paper_source_roughness.f32',dtype='<f4',mode='r',shape=(len(sv),));v=np.memmap(ROOT/'output/current_native74_stress_2026-11-20/cache/vertices.f64',dtype='<f8',mode='r',shape=(NV,3))
source=ROOT/'full_3D/Megalodon_FullCT_NaturalColors_PBR.3mf'
with source.open('rb')as f:source_hash=hashlib.file_digest(f,'sha256').hexdigest()
assert source_hash=='94cea43e98f914aef09c56504ff9c16c1b490f24124a6815c2e90a84288abeb7'
print('Building exact archived-colour nearest-vertex tree',flush=True);tree=cKDTree(sv);median=np.median(srgb[::100],axis=0).astype('u1');roughmedian=float(np.median(srough[::100]))
rgb=np.memmap(O/'cache/natural74-rgb.u8',dtype='u1',mode='w+',shape=(NV,3));rough=np.memmap(O/'cache/natural74-rough.u8',dtype='u1',mode='w+',shape=(NV,));unsupported=0;distance_sum=0.;distance_max=0.
for first in range(0,NV,500000):
 q=np.array(v[first:first+500000]);q[:,2]*=16/18;d,idx=tree.query(q,workers=4,distance_upper_bound=.60);good=idx<len(sv);colors=np.tile(median,(len(q),1));rr=np.full(len(q),roughmedian,dtype='f4');colors[good]=srgb[idx[good]];rr[good]=srough[idx[good]];rgb[first:first+len(q)]=colors;rough[first:first+len(q)]=np.clip(np.rint((rr-.22)/.05),0,8).astype('u1');unsupported+=int((~good).sum());distance_sum+=float(d[good].sum());distance_max=max(distance_max,float(d[good].max(initial=0)))
 if first%4000000==0:print('Mapped natural original RGB',first+len(q),'/',NV,flush=True)
rgb.flush();rough.flush()
record={'status':'passed','source_original_3mf':source.name,'source_original_3mf_sha256':source_hash,'source_original_vertices':len(sv),'source_original_triangles':32687264,'target_native_vertices':NV,'target_native_triangles':74293846,'source_geometry_changed':False,'source_Z_registration':'Native source z multiplied by16/18 only for lookup into archived 16um-through-slice colour coordinate frame. Native geometry and target coordinates unchanged.','colour_registration':'Nearest original archived colour vertex, using all 16,272,624 source vertices, within0.60mm.','supported_vertices':NV-unsupported,'unsupported_vertices':unsupported,'unsupported_appearance':'Median of original natural-colour palette, not a measured internal/reverse-face photograph.','mean_supported_lookup_distance_mm':distance_sum/(NV-unsupported),'maximum_supported_lookup_distance_mm':distance_max,'roughness':'Original source natural/stress regional gloss indices verified equal on every archive face; area-weighted source roughness assigned from the same nearest original colour vertex, 0.05 bins.','new_FEM':False,'numerical_stress_field':False,'scope':'Photo-reference appearance projection only. Original unseen-face colour continuation and illustrative gloss are retained as appearance hypotheses, not measured optical constants.'}
for name in ['natural74-rgb.u8','natural74-rough.u8']:
 with (O/'cache'/name).open('rb')as f:record[name+'_sha256']=hashlib.file_digest(f,'sha256').hexdigest()
(O/'review/appearance-registration.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True)
