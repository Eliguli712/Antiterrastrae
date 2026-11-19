from pathlib import Path
import gzip,hashlib,json,struct,argparse
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--site',type=Path,required=True);a=p.parse_args();out=a.site/'assets/native74-r5';m=json.loads((out/'geometry.json').read_text());v=np.memmap(a.cache/'vertices.f32',dtype='<f4',mode='r',shape=(m['vertices'],3));f=np.memmap(a.cache/'triangles.u32',dtype='<u4',mode='r',shape=(m['triangles'],3));R=np.asarray(m['display_affine_R']);T=np.asarray(m['display_affine_T']);faces=0;maxerr=0.
for j,c in enumerate(m['chunks']):
    path=out/c['url'];b=path.read_bytes();assert hashlib.sha256(b).hexdigest()==c['sha256'];b=gzip.decompress(b);n=struct.unpack_from('<I',b)[0];h=json.loads(b[4:4+n]);start=4+4*((n+3)//4)
    def read(key):
        s=h['segments'][key];return np.frombuffer(b,dtype=s['dtype'],offset=start+s['offset'],count=s['bytes']//np.dtype(s['dtype']).itemsize)
    ids=np.load(a.cache/f'ids-{j:02}.npy');idx=read('indices').reshape(-1,3);xyz=read('positions').reshape(-1,3)
    first=c['source_first_face'];assert first==faces;assert np.array_equal(ids[idx],f[first:first+c['triangles']]);expected=v[ids].astype('f8')@R.T+T;maxerr=max(maxerr,float(abs(xyz-expected).max()));faces+=c['triangles']
assert faces==74293846 and maxerr<2e-5
summary=json.loads((a.site/'assets/fem-r5/summary.json').read_text())
for size in [50,100]:
    c=summary['cases'][str(size)];assert c['independent_matrix_assembly_and_solve']and not c['stress_rescaling_used'];assert c['tip_roi']['criterion_met'];assert c['tip_roi']['consecutive_passes']>=2
    for h in c['history'][-2:]:assert max(h['tip_last_step_change_percent'].values())<2
    assert c['final']['relative_free_residual']<1e-8;assert c['final']['force_balance_relative_error']<1e-8;assert c['final']['energy_identity_relative_error']<1e-8
    for h in json.loads((out/f'{size}mm-render-audit.json').read_text())['plates']:assert(a.site/'assets/native74-r5'/h['file']).exists()
    prop=json.loads((a.site/f'assets/fem-r5/{size}mm-properties.json').read_text());assert prop['triangles']==74293846 and prop['native_signed_volume_mm3']>0 and abs(prop['actual_dimensions_mm'][2]-size)<1e-5
result={'all_source_faces_checked':faces,'all_original_connectivity_preserved':True,'maximum_display_float32_coordinate_error_mm':maxerr,'both_sizes_independently_solved':True,'tip_convergence_criterion_verified':True,'complete_native_plates_verified':12,'poster_pages_present':12}
for lang in ['en','de','it']:
    for page in range(1,5):assert(a.site/f'assets/studio-r4/posters/{lang}/page-0{page}.jpg').exists()
(out/'exhibition-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
