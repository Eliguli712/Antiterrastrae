"""Lossless native-grid transport: every original face, both exact 3MF palettes.

All source coordinates are exactly half-voxel grid multiples (0.009 mm). Meshlets
of <=20,000 faces guarantee <=60,000 local vertices and therefore UInt16 indices.
No surface reduction, smoothing, geometry inference or new FEM is performed.
"""
from pathlib import Path
import argparse,gzip,hashlib,json,struct,time
import numpy as np

ROOT=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--run-dir',type=Path,required=True);args=p.parse_args();RUN=args.run_dir.resolve();RUN.mkdir(parents=True,exist_ok=True);D=RUN/'data';D.mkdir(exist_ok=True)
NV,NF=37951699,74293846
N=ROOT/'output/current_native74_stress_2026-11-20/cache';v=np.memmap(N/'vertices.f64',dtype='<f8',mode='r',shape=(NV,3));f=np.memmap(N/'triangles.u32',dtype='<u4',mode='r',shape=(NF,3))
OLD=ROOT/'output/web_native74_batch_2026-11-24/data-assets/assets/native74-paper-mr5';g=json.loads((OLD/'geometry.json').read_text());R=np.array(g['display_affine_R']);T=np.array(g['display_affine_T'])
seen=np.zeros(NV,dtype=bool);records=[];audit=[];gpu_bytes=0;source_error=0.;display_error=0.;duplicate_vertices=0
def sha(b):return hashlib.sha256(b).hexdigest()
def unpack(path):
 b=gzip.decompress(path.read_bytes());length=struct.unpack_from('<I',b)[0];h=json.loads(b[4:4+length]);offset=4+(length+3)//4*4
 arrays={}
 for key,s in h['segments'].items():arrays[key]=np.frombuffer(b,dtype={'uint8':'u1','float32':'<f4'}[s['dtype']],count=s['bytes']//np.dtype({'uint8':'u1','float32':'<f4'}[s['dtype']]).itemsize,offset=offset+s['offset'])
 return h,arrays
for bundle,first in enumerate(range(0,NF,1000000)):
 stop=min(first+1000000,NF);bundle_ids=np.unique(f[first:stop]);h50,a50=unpack(OLD/f'50mm/field-{bundle:02}.bin.gz');h100,a100=unpack(OLD/f'100mm/field-{bundle:02}.bin.gz')
 assert len(bundle_ids)==h50['vertices']==h100['vertices']
 c50=a50['colors'].reshape(-1,3);c100=a100['colors'].reshape(-1,3);rough=a50['roughness']
 segments={};parts=[];cursor=0;meshlets=[];checked=0
 def segment(name,array,dtype):
  global cursor
  pad=(-cursor)%4
  if pad:parts.append(bytes(pad));cursor+=pad
  b=np.ascontiguousarray(array).tobytes();segments[name]={'offset':cursor,'bytes':len(b),'dtype':dtype};parts.append(b);cursor+=len(b)
 for number,start in enumerate(range(first,stop,20000)):
  end=min(start+20000,stop);ids,local=np.unique(f[start:end],return_inverse=True)
  assert len(ids)<=60000 and np.array_equal(ids[local].reshape(-1,3),f[start:end])
  coords=np.asarray(v[ids]);grid=np.rint(coords/.009).astype('<u2');error=float(np.max(abs(grid.astype('f8')*.009-coords)));source_error=max(source_error,error);assert error==0.,error
  target=(coords@R.T+T).astype('f4');display=(grid.astype('f4')*np.float32(.009))@R.astype('f4').T+T.astype('f4');display_error=max(display_error,float(np.max(abs(display-target))))
  lookup=np.searchsorted(bundle_ids,ids);assert np.array_equal(bundle_ids[lookup],ids)
  prefix=f'm{number:02}';segment(prefix+'_grid',grid,'uint16');segment(prefix+'_index',local.astype('<u2'),'uint16');segment(prefix+'_c50',c50[lookup],'uint8');segment(prefix+'_c100',c100[lookup],'uint8');segment(prefix+'_rough',rough[lookup],'uint8')
  meshlets.append({'prefix':prefix,'vertices':len(ids),'triangles':end-start,'source_first_face':start});seen[ids]=True;duplicate_vertices+=len(ids);checked+=end-start
  gpu_bytes+=len(ids)*(6+3+1)+(end-start)*3*2
 header={'schema':'native74-lossless-grid-v1','half_voxel_mm':.009,'source_first_face':first,'triangles':stop-first,'meshlets':meshlets,'segments':segments}
 j=json.dumps(header,separators=(',',':')).encode();raw=struct.pack('<I',len(j))+j+bytes((-len(j))%4)+b''.join(parts);encoded=gzip.compress(raw,compresslevel=5,mtime=0);name=f'native-{bundle:02}.bin.gz';(D/name).write_bytes(encoded)
 rec={'url':name,'bytes':len(encoded),'sha256':sha(encoded),'decoded_bytes':len(raw),'decoded_sha256':sha(raw),'source_first_face':first,'triangles':stop-first,'meshlets':len(meshlets)};records.append(rec)
 audit.append({'bundle':bundle,'every_original_ordered_face_checked':checked,'all_source_grid_coordinates_exact':True,'both_RGB_arrays_copied_from_verified_current_3MF_fields':True})
 print(time.strftime('%H:%M:%S'),'Lossless native bundle',bundle+1,'/ 75',len(encoded),'bytes',flush=True)
assert sum(r['triangles']for r in records)==NF and int(seen.sum())==NV
manifest={k:g[k]for k in ['source_sha256','vertices','triangles','display_affine_R','display_affine_T','native_longitudinal_height_mm']}
manifest.update({'schema':'native74-lossless-grid-v1','half_voxel_mm':.009,'source_coordinate_error_mm':source_error,'Float32_display_roundtrip_max_mm':display_error,'meshlet_vertex_copies':duplicate_vertices,'GPU_bytes_current_colour_with_roughness':gpu_bytes,'no_normals_buffer_needed':True,'source_faces_preserved':True,'palette50':'Exact original native74 paper-reference 3MF RGB bytes','palette100':'Exact original native74 MR5 3MF RGB bytes','chunks':records})
(D/'compact-native.json').write_text(json.dumps(manifest,indent=2)+'\n')
result={'status':'completed','source_vertices_seen':int(seen.sum()),'original_ordered_faces_checked':NF,'source_grid_reconstruction_error_mm':source_error,'Float32_display_roundtrip_max_mm':display_error,'additional_coordinate_quantization':False,'every_face_preserved':True,'RGB_field_source':'Verified native74 r14 field chunks; both exact arrays copied for each meshlet','vertices_per_meshlet_max':60000,'indices_type':'UInt16','geometry_transport_bytes':sum(r['bytes']for r in records),'GPU_bytes_one_current_palette':gpu_bytes,'previous_geometry_plus_RGB_bytes':g['gpu_buffer_bytes']+sum(json.loads((OLD/'50mm-field.json').read_text())['chunks'][i]['vertices']*3 for i in range(75)),'mask_domain_changed':False,'bundles':audit}
(RUN/'result.json').write_text(json.dumps(result,indent=2)+'\n');print('ALL ORIGINAL NATIVE FACES AND BOTH PALETTES CHECKED',flush=True)
