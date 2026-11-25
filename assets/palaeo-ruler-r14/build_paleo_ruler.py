"""A true-millimetre black/white palaeontological CAD scale, using OpenCASCADE.

50 mm between the engraved-style 0 and 5 cm marks; 1 mm minor ticks,
5 mm subdivisions and alternating 10 mm blocks. The board is 10 x 58 x 1.2 mm.
The black vector marking is represented as a separate 0.02 mm ink-film solid.
"""
from pathlib import Path
import hashlib,json,zipfile,shutil,xml.etree.ElementTree as ET
import gmsh,numpy as np
from matplotlib.textpath import TextPath
from matplotlib.font_manager import FontProperties
from matplotlib.path import Path as MPath
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection

O=Path(__file__).resolve().parents[1];P=O/'cad-paleo-ruler';P.mkdir(exist_ok=True)
gmsh.initialize();gmsh.option.setNumber('General.Terminal',0);gmsh.model.add('Palaeontological_50mm_scale')
occ=gmsh.model.occ;body=occ.addBox(-5,-.6,-4,10,1.2,58)
ink=[];front_polygons=[]
def polygon(points,y,direction):
 tags=[occ.addPoint(float(x),y,float(z)) for x,z in points]
 edges=[occ.addLine(tags[i],tags[(i+1)%len(tags)]) for i in range(len(tags))]
 return occ.addWire(edges,checkClosed=True)
def rect(x,z,w,h):
 # Opposite-face markings mirror about X, so both outward views read correctly.
 front_polygons.append(np.array([[x,z],[x+w,z],[x+w,z+h],[x,z+h]]))
 ink.append(occ.addBox(x,-.62,z,w,.02,h))
 ink.append(occ.addBox(-x-w,.6,z,w,.02,h))
def text(label,x,z,height):
 glyph=TextPath((0,0),label,size=1,prop=FontProperties(family='DejaVu Sans',weight='normal'))
 polys=[np.asarray(p) for p in glyph.to_polygons()]
 polys=[p[:-1] if np.allclose(p[0],p[-1]) else p for p in polys]
 bounds=glyph.get_extents();scale=height/bounds.height
 polys=[(p-np.array([bounds.x0,bounds.y0]))*scale+np.array([x,z]) for p in polys]
 # TextPath contours are nested: identify each outer contour and its counters.
 area=lambda p:abs(np.sum(p[:,0]*np.roll(p[:,1],-1)-p[:,1]*np.roll(p[:,0],-1)))
 depth=[sum(MPath(q).contains_point(p.mean(axis=0)) and area(q)>area(p) for q in polys) for p in polys]
 for i,p in enumerate(polys):
  if depth[i]%2:continue
  holes=[q for j,q in enumerate(polys) if depth[j]==depth[i]+1 and MPath(p).contains_point(q.mean(axis=0))]
  for side in [-1,1]:
   shape=lambda a:a if side==-1 else a*np.array([-1,1])
   wires=[polygon(shape(a),side*.6,side) for a in [p,*holes]]
   surface=occ.addPlaneSurface(wires)
   out=occ.extrude([(2,surface)],0,side*.02,0)
   ink.extend(tag for dim,tag in out if dim==3)

for cm in range(5):
 if cm%2==0:rect(-4.5,cm*10,2.4,10)
for half in range(10):
 if half%2==1:rect(-2.1,half*5,1.2,5)
for mm in range(51):
 length=3.2 if mm%10==0 else 2.4 if mm%5==0 else 1.45
 rect(-.9,mm-.06,length,.12)
for cm in range(6):text(str(cm),2.65,cm*10-.85,1.7)
text('cm',1.5,-3.1,1.25);text('5 cm',-2.0,51.6,1.2)
occ.synchronize()
gmsh.model.addPhysicalGroup(3,[body],name='Warm_white_scale_board')
gmsh.model.addPhysicalGroup(3,ink,name='Black_vector_markings_20um_film')
gmsh.write(str(P/'Palaeontological_Ruler_50mm.step'));gmsh.write(str(P/'Palaeontological_Ruler_50mm.brep'))
gmsh.option.setNumber('Mesh.MeshSizeMin',.06);gmsh.option.setNumber('Mesh.MeshSizeMax',.8);gmsh.option.setNumber('Mesh.ElementOrder',1);gmsh.option.setNumber('Mesh.RecombineAll',0)
gmsh.model.mesh.generate(2)
ntags,coords,_=gmsh.model.mesh.getNodes();coords=np.asarray(coords).reshape(-1,3);node_index={int(tag):i for i,tag in enumerate(ntags)}
def mesh(volumes):
 surfaces=set(t for d,t in gmsh.model.getBoundary([(3,t) for t in volumes],combined=False,oriented=False,recursive=False) if d==2)
 triangles=[]
 for tag in sorted(surfaces):
  types,_,nodes=gmsh.model.mesh.getElements(2,tag)
  for typ,ns in zip(types,nodes):
   assert typ==2,gmsh.model.mesh.getElementProperties(typ)
   triangles.append(np.array([node_index[int(n)] for n in ns],dtype='u4').reshape(-1,3))
 triangles=np.concatenate(triangles);used,indices=np.unique(triangles,return_inverse=True)
 return {'positions':np.round(coords[used],7).ravel().tolist(),'indices':indices.astype('u4').ravel().tolist(),'triangles':len(triangles)}
parts=[{'name':'Warm white scale board','colour':'#f2efdf',**mesh([body])},{'name':'Black vector markings','colour':'#161b1b',**mesh(ink)}]
record={'schema':'palaeo-cad-ruler-v1','units':'mm','measured_span_mm':50,'scale_positions_mm':[0,10,20,30,40,50],'tick_pitch_mm':1,'half_block_mm':5,'major_block_mm':10,'board_dimensions_mm':[10,1.2,58],'marking_film_thickness_mm':.02,'total_thickness_mm':1.24,'CAD_kernel':'OpenCASCADE through Gmsh '+gmsh.__version__,'geometry':'B-rep solids; separately meshed original CAD boundaries','nominal_scale':'CAD coordinates. Printing and display require their own dimensional calibration; this is not a calibrated physical instrument.','parts':parts}
(P/'Palaeontological_Ruler_50mm.json').write_text(json.dumps(record,separators=(',',':'))+'\n')
assert abs(gmsh.model.occ.getMass(3,body)-10*58*1.2)<1e-8
audit={k:v for k,v in record.items() if k!='parts'}
audit.update({'body_volume_mm3':gmsh.model.occ.getMass(3,body),'number_of_marking_solids':len(ink),'CAD_surface_triangles':sum(p['triangles'] for p in parts),'end_mark_difference_mm':record['scale_positions_mm'][-1]-record['scale_positions_mm'][0],'source_script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()})
gmsh.finalize()
gmsh.initialize();gmsh.option.setNumber('General.Terminal',0);gmsh.model.add('step_roundtrip')
gmsh.model.occ.importShapes(str(P/'Palaeontological_Ruler_50mm.step'));gmsh.model.occ.synchronize()
roundtrip=gmsh.model.getEntities(3);masses=[gmsh.model.occ.getMass(d,t) for d,t in roundtrip]
assert len(roundtrip)==len(ink)+1 and abs(max(masses)-696)<1e-6
audit['STEP_roundtrip']={'status':'passed','solids':len(roundtrip),'board_volume_mm3':max(masses)}
gmsh.finalize()

# The 3MF carries the CAD surface meshes and white/black materials in millimetres.
NS='http://schemas.microsoft.com/3dmanufacturing/core/2015/02';ET.register_namespace('',NS)
model=ET.Element('{'+NS+'}model',{'unit':'millimeter','xml:lang':'en-US'});resources=ET.SubElement(model,'{'+NS+'}resources');materials=ET.SubElement(resources,'{'+NS+'}basematerials',{'id':'1'})
for p in parts:ET.SubElement(materials,'{'+NS+'}base',{'name':p['name'],'displaycolor':p['colour']+'FF'})
for i,p in enumerate(parts):
 obj=ET.SubElement(resources,'{'+NS+'}object',{'id':str(i+2),'type':'model','pid':'1','pindex':str(i),'name':p['name']});m=ET.SubElement(obj,'{'+NS+'}mesh');vertices=ET.SubElement(m,'{'+NS+'}vertices');triangles=ET.SubElement(m,'{'+NS+'}triangles')
 for x,y,z in np.array(p['positions']).reshape(-1,3):ET.SubElement(vertices,'{'+NS+'}vertex',{'x':str(x),'y':str(y),'z':str(z)})
 for a,b,c in np.array(p['indices']).reshape(-1,3):ET.SubElement(triangles,'{'+NS+'}triangle',{'v1':str(a),'v2':str(b),'v3':str(c)})
build=ET.SubElement(model,'{'+NS+'}build')
for i in range(len(parts)):ET.SubElement(build,'{'+NS+'}item',{'objectid':str(i+2)})
with zipfile.ZipFile(P/'Palaeontological_Ruler_50mm.3mf','w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('3D/3dmodel.model',ET.tostring(model,encoding='utf-8',xml_declaration=True))
 z.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
 z.writestr('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')

# Exact orthographic CAD face rendering, also used beside the static tooth views.
fig=plt.figure(figsize=(2,11.6),facecolor='none');ax=fig.add_axes([0,0,1,1]);ax.set_aspect('equal');ax.set_xlim(-5.1,5.1);ax.set_ylim(-4.1,54.1);ax.axis('off')
for p in parts:
 points=np.array(p['positions']).reshape(-1,3);faces=np.array(p['indices']).reshape(-1,3);tri=points[faces]
 # Front orthographic face, including CAD glyph counters and fine-scale ticks.
 keep=(tri[:,:,1].max(axis=1)-tri[:,:,1].min(axis=1)<1e-7)&(tri[:,:,1].mean(axis=1)<-.59)
 ax.add_collection(PolyCollection(tri[keep][:,:,[0,2]],facecolors=p['colour'],edgecolors='none',antialiased=False))
fig.savefig(P/'Palaeontological_Ruler_50mm.png',dpi=180,transparent=True);fig.savefig(P/'Palaeontological_Ruler_50mm.svg',transparent=True);plt.close(fig)
shutil.copy2(__file__,P/'build_paleo_ruler.py')
(P/'README.txt').write_text('Traditional black/white palaeontological scale. All dimensions are millimetres. The 0-to-5 cm interval is exactly 50 mm in CAD; 1 mm ticks, 5 mm sub-blocks and 10 mm alternating blocks are explicit geometry. Overall warm-white board: 10 x 58 x 1.2 mm; separate black ink-film solids: 0.02 mm on each face. STEP/BREP preserve solids; coloured 3MF and JSON are their tessellations. The ruler is separate from the original tooth surface and is excluded from the 74,293,846-face tooth count. No claim of physical calibration or manufacturing tolerance is made.\n')
audit['files']=[{'name':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(P.iterdir()) if p.is_file() and p.name!='CAD_Ruler_Audit.json' and p.suffix!='.zip']
(P/'CAD_Ruler_Audit.json').write_text(json.dumps(audit,indent=2)+'\n')
with zipfile.ZipFile(P/'Palaeontological_Ruler_50mm_CAD.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(P.iterdir()):
  if p.is_file() and p.suffix!='.zip':z.write(p,p.name)
dest=O/'data-assets/assets/palaeo-ruler-r14';dest.mkdir(parents=True,exist_ok=True)
for p in P.iterdir():
 if p.is_file():shutil.copy2(p,dest/p.name)
print('CAD PALEONTOLOGICAL 50 MM RULER COMPLETE',audit['CAD_surface_triangles'],'surface triangles',flush=True)
