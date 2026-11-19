#!/usr/bin/env python3
"""Lossless full-topology manufacturing exports and explicit per-size properties.

Run after the independent FEM solves and full native-vertex field projection.
The accompanying C++ helper streams large text and verifies every output face.
All dimensions/properties are integrated from each transformed full native mesh.
"""
import argparse, hashlib, json, math, os, shutil, struct, subprocess, time
import urllib.request, zipfile
from pathlib import Path
import numpy as np
from matplotlib import colormaps

NV,NF=37951699,74293846
SHA='69928fc1d776a0cb2cd3da389802e0b08d226395005bbf4a2094180e90622b73'
VERTEX_XML_SHA='eb8373f2ddf70e7ff98bc3a190f4db92e15b19e32313a529943d7c557886d4d5'
URL='https://github.com/Eliguli712/Antiterrastrae/releases/download/megalodon-ct-18um/Megalodon_FullCT_Native_Internal_74M_18um.3mf'
ROOT_HEIGHT=86.73910524340096
LO,HI=253167.0947190341,250522132.64670932

def log(*a):print(time.strftime('%H:%M:%S'),*a,flush=True)
def jsave(p,j):p.write_text(json.dumps(j,indent=2,ensure_ascii=False,allow_nan=False)+'\n')
def sha(p):
    with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
def run_stream(argv,target):
    p=subprocess.Popen([str(x)for x in argv],stdout=subprocess.PIPE,bufsize=1<<20)
    try:
        while b:=p.stdout.read(8<<20):target.write(b)
    finally:p.stdout.close()
    code=p.wait()
    if code:raise RuntimeError(f'Export helper failed ({code}): {argv[1]}')
def feed_stream(argv,source,also=None):
    p=subprocess.Popen([str(x)for x in argv],stdin=subprocess.PIPE,stdout=subprocess.PIPE,bufsize=1<<20)
    try:
        while b:=source.read(8<<20):
            p.stdin.write(b)
            if also:also(b)
    finally:p.stdin.close()
    out=p.stdout.read();p.stdout.close();code=p.wait()
    if code:raise RuntimeError(f'Export validator failed ({code}): {argv[1]}')
    return out
def xml_blocks(f):
    carry=b''
    while b:=f.read(8<<20):
        carry+=b;cut=carry.rfind(b'>')+1
        if cut:yield carry[:cut];carry=carry[cut:]
    if carry:yield carry
def literal_vertices(source,target):
    count=0;h=hashlib.sha256();inside=False
    with zipfile.ZipFile(source)as z,z.open('3D/3dmodel.model')as f:
        for b in xml_blocks(f):
            if not inside:
                if b'<vertices>'not in b:continue
                b=b.split(b'<vertices>',1)[1];inside=True
            done=b'</vertices>'in b
            body=b.split(b'</vertices>',1)[0]if done else b
            target.write(body);h.update(body);count+=body.count(b'<vertex ')
            if done:break
    assert count==NV,(count,NV)
    assert h.hexdigest()==VERTEX_XML_SHA,h.hexdigest()
    return {'vertices':count,'literal_vertex_xml_sha256':h.hexdigest()}

def prepare(cache,helper):
    cache.mkdir(parents=True,exist_ok=True);native=cache/'native74.3mf'
    if not native.exists():
        log('Downloading original native CT source')
        with urllib.request.urlopen(URL,timeout=180)as r,native.with_suffix('.part').open('wb')as f:shutil.copyfileobj(r,f,8<<20)
        native.with_suffix('.part').replace(native)
    assert sha(native)==SHA,'Original native source SHA-256 mismatch'
    wanted=[('vertices.f64',NV*24),('vertices.f32',NV*12),('triangles.u32',NF*12)]
    if any(not(cache/n).exists()or(cache/n).stat().st_size!=size for n,size in wanted):
        for name,size in wanted:
            path=cache/name
            if path.exists()and path.stat().st_size!=size:path.unlink()
        log('Reading exact native vertex coordinates without surface reduction')
        with zipfile.ZipFile(native)as z,z.open('3D/3dmodel.model')as f:feed_stream([helper,'parse',cache],f)
    for name,size in wanted:assert(cache/name).stat().st_size==size
    return native

def geometry_metadata(cache,solutions,site_source):
    if site_source:
        for rel in ['dist/assets/native74-r5/geometry.json','assets/native74-r5/geometry.json','design/megalodon/assets/native74-r5/geometry.json','geometry.json']:
            p=site_source/rel
            if p.exists():return json.loads(p.read_text())
    orient=cache/'orientation.npz'
    if orient.exists():
        d=np.load(orient);B=d['basis'];C=d['center_mm'];low=d['low'];high=d['high']
    else:
        s=json.loads((solutions/'50mm-summary.json').read_text());d=np.load(solutions/'50mm-solution.npz');B=d['basis'];scale=s['linear_length_factor_from_calibrated_proxy'];C=d['center_m']*1000/scale
        v=np.memmap(cache/'vertices.f32',dtype='<f4',mode='r',shape=(NV,3));low=np.full(3,np.inf);high=np.full(3,-np.inf)
        for i in range(0,NV,400000):
            q=(v[i:i+400000].astype('f8')-C)@B;low=np.minimum(low,q.min(0));high=np.maximum(high,q.max(0))
        np.savez(cache/'orientation.npz',basis=B,center_mm=C,low=low,high=high)
    scale=100/(high[1]-low[1]);R=np.array([-B[:,0],-B[:,2],-B[:,1]])*scale
    T=np.array([(low[0]+high[0])*scale/2,(low[2]+high[2])*scale/2,high[1]*scale+ROOT_HEIGHT])-R@C
    return {'display_affine_R':R.tolist(),'display_affine_T':T.tolist(),'native_longitudinal_height_mm':float(high[1]-low[1]),'source_sha256':SHA}

def properties(cache,solutions,geo,size,palette):
    R=np.asarray(geo['display_affine_R'])*(size/100)
    T=(np.asarray(geo['display_affine_T'])-[0,0,ROOT_HEIGHT])*(size/100)
    assert np.linalg.det(R)>0
    v=np.memmap(cache/'vertices.f64',dtype='<f8',mode='r',shape=(NV,3));f=np.memmap(cache/'triangles.u32',dtype='<u4',mode='r',shape=(NF,3))
    low=np.full(3,np.inf);high=np.full(3,-np.inf);volume=area=0.;cent=np.zeros(3);cerror=0.;zero=0
    for i in range(0,NV,400000):
        q=v[i:i+400000]@R.T+T;low=np.minimum(low,q.min(0));high=np.maximum(high,q.max(0))
    # Integrate the fully transformed triangles independently for each nominal size.
    for i in range(0,NF,240000):
        p=v[f[i:i+240000]]@R.T+T
        cross=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);a=np.linalg.norm(cross,axis=1)/2;area+=float(a.sum(dtype='f8'));zero+=int((a==0).sum())
        vol=np.einsum('ij,ij->i',p[:,0],np.cross(p[:,1],p[:,2]))/6
        volume+=float(vol.sum(dtype='f8'));cent+=(vol[:,None]*p.sum(1)/4).sum(0,dtype='f8')
    assert volume>0
    s=json.loads((solutions/f'{size}mm-summary.json').read_text())
    field=cache/f'{size}mm-values.f32';values=np.memmap(field,dtype='<f4',mode='r',shape=(NV,));ci=np.memmap(cache/f'{size}mm-colour-index.u16',dtype='<u2',mode='w+',shape=(NV,));mapped=0;vmin=np.inf;vmax=-np.inf
    for i in range(0,NV,500000):
        val=np.asarray(values[i:i+500000]);valid=np.isfinite(val)&(val>0);out=np.full(len(val),256,dtype='<u2');u=(np.log(np.maximum(val[valid],LO))-math.log(LO))/(math.log(HI)-math.log(LO));out[valid]=np.rint(np.clip(u,0,1)*255).astype('<u2');ci[i:i+len(val)]=out;mapped+=int(valid.sum())
        if valid.any():vmin=min(vmin,float(val[valid].min()));vmax=max(vmax,float(val[valid].max()))
    ci.flush()
    return {'schema':'native74-complete-export-properties-v1','species':'Otodus megalodon','nominal_height_mm':size,'units':'mm','vertices':NV,'triangles':NF,'face_reduction':False,'all_source_triangle_indices_and_order_preserved':True,'source_geometry_url':URL,'source_geometry_sha256':SHA,'source_vertex_xml_sha256':VERTEX_XML_SHA,'vertex_coordinates':'Exact original Float64 decimal coordinates; OBJ uses12significant decimal digits; binary STL usesFloat32 as required by its format;3MF preserves original vertex XML literally.','print_transform':{'R':R.tolist(),'T':T.tolist(),'determinant':float(np.linalg.det(R)),'application':'column-vector world_mm=R*original_scanner_mm+T; positive determinant preserves winding'},'actual_bounds_mm':[low.tolist(),high.tolist()],'actual_dimensions_mm':(high-low).tolist(),'height_tolerance_from_nominal_mm':float(high[2]-low[2]-size),'native_signed_material_volume_mm3':volume,'native_signed_volume_mm3':volume,'native_surface_area_mm2':area,'solid_pla_mass_g':volume*1.24/1000,'native_material_centroid_mm':(cent/volume).tolist(),'zero_area_triangles':zero,'integration':'Direct Float64 integration of every transformed native triangle, including inward-oriented void boundaries; independently performed for each size.','mass_example':{'density_g_cm3':1.24,'material':'Explicit nominal PLA density assumption; not a measured material property','fully_solid_native_material_mass_g':volume*1.24/1000,'infill_or_supports_included':False},'stress':{'source_independent_solution':f'{size}mm-solution.npz','source_independent_solution_sha256':sha(solutions/f'{size}mm-solution.npz'),'native_vertex_field_sha256':sha(field),'dtype':'Float32 Pa; NaN means unsupported projection','stress_rescaling_used':False,'mapped_vertices':mapped,'unmapped_vertices':NV-mapped,'finite_min_Pa':vmin,'finite_max_Pa':vmax,'shared_color_min_Pa':LO,'shared_color_max_Pa':HI,'color_transform':'logarithmic; values outside display range clipped for colour only','palette':'Matplotlib Turbo256; index256 is unsupported gray','color_palette_rgb':palette.tolist(),'OBJ_materials':'Each original triangle uses a material selected from its mean finite vertex scalar; any unsupported corner makes the face gray.','3MF_materials':'Original face connectivity and per-corner palette indices; unsupported corners gray.','projection_scope':'Scalar field transferred from independent closed-solid volume solve to full native CT surface; not an additional volume solve.'},'FEM':s,'download_format_notes':{'OBJ':'ExtractZIP, keep tooth.obj and tooth.mtl in the same directory; import with unitsmillimetre. stress_vertex_values_Pa.f32 is losslessly compressed withinZIP.','STL':'ExtractZIP; binarySTL contains the complete triangle surface, with unitsmm in itsheader andpropertiesJSON. STL has no standard colour or unit field.','3MF':'Open directly in a3MF-capable application. Modelunit ismillimeter; per-corner colour and native internal void boundary topology are retained. Numerical field is included as custom metadata. Appearance depends on material-extension support.'}}

CTYPES=b'''<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="json" ContentType="application/json"/><Default Extension="f32" ContentType="application/octet-stream"/></Types>'''
RELS=b'''<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'''
def copy_field(z,member,cache,size):
    with z.open(member,'w',force_zip64=True)as w,(cache/f'{size}mm-values.f32').open('rb')as f:shutil.copyfileobj(f,w,8<<20)
def model3mf(path,cache,helper,native,props,palette):
    size=props['nominal_height_mm'];R=np.asarray(props['print_transform']['R']);T=np.asarray(props['print_transform']['T']);transform=' '.join(format(float(x),'.17g')for x in np.r_[R.T.ravel(),T])
    colors=''.join('<m:color color="#%02X%02X%02XFF"/>'%tuple(c)for c in palette)
    head=('<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02" requiredextensions="m"><metadata name="Title">Otodus megalodon - complete native74 - '+str(size)+'mm - independent FEM colours</metadata><metadata name="Description">All74293846 original source triangles.1MPa pressure; bilateral fixed root caps; see Metadata/properties.json for full numerical scope.</metadata><resources><m:colorgroup id="2">'+colors+'</m:colorgroup><object id="1" type="model"><mesh><vertices>').encode()
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True)as z:
        z.writestr('[Content_Types].xml',CTYPES);z.writestr('_rels/.rels',RELS);z.writestr('Metadata/properties.json',json.dumps(props,ensure_ascii=False,indent=2))
        with zipfile.ZipFile(native)as source:z.writestr('Metadata/reconstruction_report.json',source.read('Metadata/reconstruction_report.json'))
        copy_field(z,'Metadata/stress_vertex_values_Pa.f32',cache,size)
        with z.open('3D/3dmodel.model','w',force_zip64=True)as w:
            w.write(head);literal_vertices(native,w);w.write(b'</vertices><triangles>');run_stream([helper,'faces3mf',cache,size],w);w.write(('</triangles></mesh></object></resources><build><item objectid="1" transform="'+transform+'"/></build></model>').encode())
def transargs(props):return [format(float(x),'.17g')for x in np.r_[np.asarray(props['print_transform']['R']).ravel(),props['print_transform']['T']]]
def readme(props):
    s=props['nominal_height_mm'];return f'''Otodus megalodon - native CT {s} mm full-resolution export

All {NV:,} original source vertices and {NF:,} faces are retained (STL duplicates vertices per face by design). No surface simplification, hole filling or stress rescaling was performed.
Dimensions are millimetres. The positive-determinant print transform places the lowest point at Z=0 and nominal tooth height at {s} mm. Exact measured bounds and directly integrated volume/area are in properties.json.

Stress colours use the independent {s} mm FEM solve: homogeneous small-strain solid proxy, lambda29 GPa, mu28.5 GPa,1 MPa crown pressure, bilateral fixed root caps. The closed-solid FEM proxy differs from the complete native CT void geometry. The native mesh is a stress projection display, not a74M-element volume solve. Both size fields were separately assembled and solved. The frozen macroscopic apex ROI passed the stated convergence criteria; individual unresolved serration tips and global peak stress are not certified.

The common colour map is Turbo256 with logarithmic limits {LO}..{HI} Pa. Colour clipping changes only appearance. Gray marks unsupported field projection. Raw native-vertex Float32 Pa values, including NaNs, are supplied in the OBJ and3MF archives. See properties.json for field and solutionSHA-256 hashes and complete convergence history.

OBJ: extract the ZIP and retain tooth.obj beside tooth.mtl; select millimetres on import. Its materials encode face-mean stress. STL: extract tooth.stl; explicitly select millimetres; standard binarySTL carries no colour.3MF: open directly; millimetre units and per-corner material indices are embedded. Per-corner colour requires support for the3MF materials extension.
'''
def objzip(path,cache,helper,props,palette):
    size=props['nominal_height_mm'];mtl='\n'.join(f'newmtl stress_{i}\nKa 0 0 0\nKd {r/255:.9f} {g/255:.9f} {b/255:.9f}\nKs 0 0 0\nd 1\nillum 1\n'for i,(r,g,b)in enumerate(palette))
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True)as z:
        z.writestr('tooth.mtl',mtl);z.writestr('properties.json',json.dumps(props,ensure_ascii=False,indent=2));z.writestr('README.txt',readme(props));copy_field(z,'stress_vertex_values_Pa.f32',cache,size)
        with z.open('tooth.obj','w',force_zip64=True)as w:run_stream([helper,'obj',cache,size,*transargs(props)],w)
def stlzip(path,cache,helper,props):
    size=props['nominal_height_mm']
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True)as z:
        z.writestr('properties.json',json.dumps(props,ensure_ascii=False,indent=2));z.writestr('README.txt',readme(props))
        with z.open('tooth.stl','w',force_zip64=True)as w:run_stream([helper,'stl',cache,size,*transargs(props)],w)

def verify_others(z,skip,props):
    crcs=[]
    for name in z.namelist():
        if name in skip:continue
        h=hashlib.sha256()
        with z.open(name)as r:
            while b:=r.read(8<<20):h.update(b)
        if name.endswith('stress_vertex_values_Pa.f32'):assert h.hexdigest()==props['stress']['native_vertex_field_sha256']
        crcs.append(name)
    return crcs
def verify3mf(path,cache,helper,props):
    p=subprocess.Popen([str(helper),'verify3mf',str(cache),str(props['nominal_height_mm'])],stdin=subprocess.PIPE,stdout=subprocess.PIPE,bufsize=1<<20)
    nv=0;h=hashlib.sha256();state='header';hasunits=False;hastransform=False
    with zipfile.ZipFile(path)as z:
        with z.open('3D/3dmodel.model')as r:
            for b in xml_blocks(r):
                p.stdin.write(b)
                if state=='header':
                    hasunits|=b'unit="millimeter"'in b
                    if b'<vertices>'not in b:continue
                    b=b.split(b'<vertices>',1)[1];state='vertices'
                if state=='vertices':
                    done=b'</vertices>'in b;body=b.split(b'</vertices>',1)[0]if done else b;h.update(body);nv+=body.count(b'<vertex ')
                    if done:state='triangles'
                if state=='triangles':hastransform|=b'<item objectid="1" transform="'in b
        others=verify_others(z,{'3D/3dmodel.model'},props)
    p.stdin.close();p.stdout.read();p.stdout.close();code=p.wait();assert code==0,code
    assert nv==NV and h.hexdigest()==VERTEX_XML_SHA and hasunits and hastransform
    return {'all_zip_members_crc_passed':True,'all_source_vertex_xml_literal_identical':True,'source_vertex_xml_sha256':h.hexdigest(),'all_source_triangle_indices_and_order_identical':True,'all_per_corner_color_indices_verified':True,'vertices_checked':nv,'triangles_checked':NF,'millimetre_model_unit_verified':True,'print_transform_present':True}
def verifyobj(path,cache,helper,props):
    with zipfile.ZipFile(path)as z:
        with z.open('tooth.obj')as r:raw=feed_stream([helper,'verifyobj',cache,props['nominal_height_mm'],*transargs(props)],r)
        verify_others(z,{'tooth.obj'},props)
    info=json.loads(raw);return {**info,'all_zip_members_crc_passed':True,'all_source_triangle_indices_and_order_identical':True}
def verifystl(path,cache,helper,props):
    v=np.memmap(cache/'vertices.f64',dtype='<f8',mode='r',shape=(NV,3));f=np.memmap(cache/'triangles.u32',dtype='<u4',mode='r',shape=(NF,3));R=np.asarray(props['print_transform']['R']);T=np.asarray(props['print_transform']['T']);dtype=np.dtype([('normal','<f4',3),('vertices','<f4',(3,3)),('attribute','<u2')]);low=np.full(3,np.inf);high=np.full(3,-np.inf);maxerror=0.;count=0
    with zipfile.ZipFile(path)as z:
        assert z.getinfo('tooth.stl').file_size==84+NF*50
        with z.open('tooth.stl')as r:
            header=r.read(84);assert b'units=mm'in header[:80];assert struct.unpack('<I',header[80:])[0]==NF
            for i in range(0,NF,200000):
                n=min(200000,NF-i);b=r.read(n*50);assert len(b)==n*50;a=np.frombuffer(b,dtype=dtype);q=a['vertices'];expected=v[f[i:i+n]]@R.T+T;maxerror=max(maxerror,float(np.max(abs(q-expected))));low=np.minimum(low,q.min((0,1)));high=np.maximum(high,q.max((0,1)));assert not a['attribute'].any();assert np.isfinite(q).all();count+=n
            assert not r.read(1)
        verify_others(z,{'tooth.stl'},props)
    assert count==NF and maxerror<2e-5,(count,maxerror)
    return {'all_zip_members_crc_passed':True,'triangles_checked':count,'all_source_triangle_corner_coordinates_and_order_verified':True,'coordinate_max_absolute_error_mm':maxerror,'bounds_mm':[low.tolist(),high.tolist()],'header_unit_mm_verified':True,'binary_stl_record_bytes':50}

def main():
    p=argparse.ArgumentParser();p.add_argument('--cache',required=True,type=Path);p.add_argument('--solutions',required=True,type=Path);p.add_argument('--output',required=True,type=Path);p.add_argument('--size',choices=['50','100','all'],default='all');p.add_argument('--site-source',type=Path);p.add_argument('--properties-only',action='store_true');a=p.parse_args();cache=a.cache.resolve();solutions=a.solutions.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True);cache.mkdir(parents=True,exist_ok=True)
    helper=cache/'export_stream';src=Path(__file__).with_name('export_stream.cpp');subprocess.run(['g++','-O3','-std=c++17',str(src),'-o',str(helper)],check=True)
    native=prepare(cache,helper);geo=geometry_metadata(cache,solutions,a.site_source.resolve()if a.site_source else None)
    palette=np.vstack([np.rint(colormaps['turbo'](np.linspace(0,1,256))[:,:3]*255).astype('u1'),np.array([154,163,173],dtype='u1')])
    sizes=[50,100]if a.size=='all'else[int(a.size)];props={}
    for size in sizes:
        log('Integrating full native mesh and reading independent stress',size)
        props[size]=properties(cache,solutions,geo,size,palette);jsave(out/f'{size}mm-properties.json',props[size]);log('PROPERTIES READY',size,props[size]['native_signed_material_volume_mm3'],props[size]['native_surface_area_mm2'])
    if a.properties_only:return
    manifest={'schema':'native74-complete-exports-v1','source_sha256':SHA,'source_vertices':NV,'source_triangles':NF,'surface_reduction':False,'files':[],'properties_files':[f'{s}mm-properties.json'for s in sizes]}
    # Existing completed manifests support resuming without rewriting validated archives.
    old=out/'export-manifest.json';prior=json.loads(old.read_text())if old.exists()else{'files':[]}
    for size in sizes:
        prop=props[size]
        for fmt,suffix,writer,validator in [('OBJ','OBJ.zip',objzip,verifyobj),('STL','STL.zip',stlzip,verifystl),('3MF','Stress.3mf',model3mf,verify3mf)]:
            path=out/f'Megalodon_Native74_{size}mm_{suffix}';prev=next((x for x in prior['files']if x['filename']==path.name),None)
            if prev and path.exists()and sha(path)==prev['sha256']:
                manifest['files'].append(prev);jsave(old,manifest);continue
            log('Writing complete export',path.name)
            partial=path.with_name(path.name+'.part')
            if fmt=='OBJ':writer(partial,cache,helper,prop,palette)
            elif fmt=='STL':writer(partial,cache,helper,prop)
            else:writer(partial,cache,helper,native,prop,palette)
            log('Reading back every triangle and ZIP member',path.name)
            validation=validator(partial,cache,helper,prop);partial.replace(path)
            item={'filename':path.name,'size_mm':size,'format':fmt,'bytes':path.stat().st_size,'sha256':sha(path),'triangles':NF,'vertices':NV if fmt!='STL'else NF*3,'vertices_note':'Original shared vertices'if fmt!='STL'else'BinarySTL duplicates three corners per face by format','units':'mm','properties':f'{size}mm-properties.json','validation':validation}
            manifest['files'].append(item);jsave(old,manifest);log('EXPORT VERIFIED',path.name,item['bytes'])
    jsave(old,manifest);log('ALL EXPORTS VERIFIED',len(manifest['files']))
if __name__=='__main__':main()
