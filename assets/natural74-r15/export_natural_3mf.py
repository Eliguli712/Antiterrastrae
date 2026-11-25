from pathlib import Path
import argparse,hashlib,json,subprocess,zipfile
import numpy as np
ROOT=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parents[1];NV,NF=37951699,74293846
p=argparse.ArgumentParser();p.add_argument('--size',type=int,choices=[50,100],default=50);args=p.parse_args();size=args.size
source=ROOT/'full_3D/Megalodon_FullCT_Native_Internal_74M_18um.3mf';props=json.loads((ROOT/f'output/current_native74_stress_2026-11-20/inputs/{size}mm-properties.json').read_text());expected_vertices='eb8373f2ddf70e7ff98bc3a190f4db92e15b19e32313a529943d7c557886d4d5'
def sha(p):
 with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
assert sha(source)==props['source_geometry_sha256']
palettepath=O/'cache/palette.npz';ci=O/'cache/natural-colour-index.u32'
if not (palettepath.exists() and ci.exists()):
 rgb=np.memmap(O/'cache/natural74-rgb.u8',dtype='u1',mode='r',shape=(NV,3));rough=np.memmap(O/'cache/natural74-rough.u8',dtype='u1',mode='r',shape=(NV,));packed=np.empty(NV,dtype='u4')
 for first in range(0,NV,1000000):
  c=rgb[first:first+1000000].astype('u4');r=rough[first:first+len(c)].astype('u4');packed[first:first+len(c)]=(((c[:,0]<<16)|(c[:,1]<<8)|c[:,2])<<4)|r
 unique,index=np.unique(packed,return_inverse=True);np.asarray(index,dtype='<u4').tofile(ci);palette=np.column_stack([(unique>>20)&255,(unique>>12)&255,(unique>>4)&255]).astype('u1');roughness=.22+(unique&15)*.05;np.savez(palettepath,palette=palette,roughness=roughness);del packed,unique,index
x=np.load(palettepath);palette=x['palette'];roughness=x['roughness'];metadata=json.loads((O/'review/appearance-registration.json').read_text());metadata.update(nominal_height_mm=size,source_vertices=NV,source_triangles=NF,source_geometry_sha256=props['source_geometry_sha256'],source_original_vertex_xml_sha256=expected_vertices,print_transform=props['print_transform'],all_source_triangle_indices_and_order_preserved=True,surface_reduction=False,material_palette_entries=len(palette))
M='http://schemas.microsoft.com/3dmanufacturing/material/2015/02';core='http://schemas.microsoft.com/3dmanufacturing/core/2015/02';display=['<m:pbspeculardisplayproperties id="3">']+[f'<m:pbspecular name="Natural_{i}" specularcolor="#383838" glossiness="{1-float(r):.6f}"/>'for i,r in enumerate(roughness)]+['</m:pbspeculardisplayproperties><m:colorgroup id="2" displaypropertiesid="3">']+[f'<m:color color="#{int(r):02X}{int(g):02X}{int(b):02X}FF"/>'for r,g,b in palette]+['</m:colorgroup>']
R=np.asarray(props['print_transform']['R']);T=np.asarray(props['print_transform']['T']);transform=' '.join(format(float(x),'.17g')for x in np.r_[R.T.ravel(),T]);head=(f'<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="{core}" xmlns:m="{M}" requiredextensions="m"><metadata name="Title">Astraeus Krystallisia - {size} mm native74 - original natural photograph-reference appearance</metadata><resources>'+''.join(display)+'<object id="1" type="model"><mesh><vertices>').encode();end=('</triangles></mesh></object></resources><build><item objectid="1" transform="'+transform+'"/></build></model>').encode();target=O/'models'/f'Megalodon_{size}mm_Native74_Natural_Photo_Reference.3mf';ct=b'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="json" ContentType="application/json"/></Types>';rels=b'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';mh=hashlib.sha256();vh=hashlib.sha256();vertices=0
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True)as z:
 z.writestr('[Content_Types].xml',ct);z.writestr('_rels/.rels',rels);z.writestr('Metadata/provenance.json',json.dumps(metadata,indent=2))
 with z.open('3D/3dmodel.model','w',force_zip64=True)as out:
  def write(b):out.write(b);mh.update(b)
  write(head)
  with zipfile.ZipFile(source)as original,original.open('3D/3dmodel.model')as stream:
   carry=b'';inside=False
   while block:=stream.read(8<<20):
    carry+=block;cut=carry.rfind(b'>')+1
    if not cut:continue
    block,carry=carry[:cut],carry[cut:]
    if not inside:
     if b'<vertices>'not in block:continue
     block=block.split(b'<vertices>',1)[1];inside=True
    done=b'</vertices>'in block;body=block.split(b'</vertices>',1)[0]if done else block;write(body);vh.update(body);vertices+=body.count(b'<vertex ')
    if done:break
  assert vertices==NV and vh.hexdigest()==expected_vertices;write(b'</vertices><triangles>');print('Preserved exact vertex XML',size,vertices,flush=True)
  with (O/f'review/{size}mm-export-faces.log').open('w')as err:
   proc=subprocess.Popen([str(ROOT/'output/paper_native74_5cm_10cm_2026-11-22/cache/export_native74_colours'),str(ROOT/'output/current_native74_stress_2026-11-20/cache/triangles.u32'),str(ci),str(len(palette))],stdout=subprocess.PIPE,stderr=err)
   while block:=proc.stdout.read(8<<20):write(block)
   assert proc.wait()==0
  write(end)
with zipfile.ZipFile(target)as z:
 with z.open('3D/3dmodel.model')as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==mh.hexdigest()
 for name in z.namelist():
  if name=='3D/3dmodel.model':continue
  with z.open(name)as stream:
   while stream.read(8<<20):pass
record={'status':'passed','file':str(target),'bytes':target.stat().st_size,'sha256':sha(target),'size_mm':size,'source_vertices':NV,'source_triangles':NF,'original_vertex_xml_preserved':True,'all_ordered_source_faces_and_each_corner_colour_index_checked_during_export':True,'model_stream_hash_readback_and_zip_CRC_match':True,'palette_entries':len(palette),'source_geometry_sha256':props['source_geometry_sha256'],'source_natural_32M_sha256':metadata['source_original_3mf_sha256'],'embedded_numerical_stress':False,'kind':'Original photograph-reference appearance projected onto unchanged native74 geometry'};(O/f'review/{size}mm-3mf-export-audit.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True)
