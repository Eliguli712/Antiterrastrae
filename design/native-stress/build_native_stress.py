#!/usr/bin/env python3
"""Reproducible native CT geometry + archived numerical von Mises art edition.

No source-geometry decimation, smoothing, cavity filling or RGB-to-scalar inference.
The separately named 'uncompressed' original solver export is NOT independently
verified. The archived field already projected to the legacy surface is used.
"""
import argparse, concurrent.futures as cf, gzip, hashlib, json, math, os
from pathlib import Path
import re, shutil, struct, sys, time, urllib.request, zipfile, zlib
import numpy as np
from scipy.spatial import cKDTree

REPO = 'https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/main/'
ARCHIVE = REPO + 'fea_research/high_res_meg_teeth/'
RELEASE = 'https://github.com/Eliguli712/Antiterrastrae/releases/download/megalodon-ct-18um/'
NATIVE = 'Megalodon_FullCT_Native_Internal_74M_18um.3mf'
MASK = 'Megalodon_FullCT_SpecimenMask_18um.mha'
NV, NF = 37951699, 74293846
NATIVE_SHA = '69928fc1d776a0cb2cd3da389802e0b08d226395005bbf4a2094180e90622b73'
MASK_SHA = '8a68259cc4c079eaef5ec604e60bea2de6bf8bf4ebb7d9499347651676e19bce'
ROOT_Z = 87.83910524340096
R0 = np.array([[-.4009504434931399,1.8854012039549133,.11323245596229993],
 [1.8823396991419183,.38929618833204865,.18321103099891783],
 [.15606583864575468,.14842952863476314,-1.9188362817427382]])
T0 = np.array([-34.88000208985485,-24.75224976729674,94.78638155695049])
OFFSET = np.array([7.056,1.368,1.368])
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def sha(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for b in iter(lambda:f.read(8<<20),b''): h.update(b)
 return h.hexdigest()
def jsave(path,obj):
 Path(path).write_text(json.dumps(obj,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
def get(url,path,expected=None):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 if path.exists() and (not expected or sha(path)==expected): return path
 for attempt in range(5):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Vrontiki-native-stress/3'}),timeout=120) as r,open(str(path)+'.part','wb') as f: shutil.copyfileobj(r,f,4<<20)
   os.replace(str(path)+'.part',path)
   if expected and sha(path)!=expected: raise ValueError('SHA-256 mismatch: '+str(path))
   return path
  except Exception:
   if attempt==4: raise
   time.sleep(2+attempt)
def complete_blocks(stream):
 carry=b''
 while True:
  b=stream.read(4<<20)
  if not b:
   if carry: yield carry
   return
  carry+=b;cut=carry.rfind(b'>')+1
  if cut: yield carry[:cut];carry=carry[cut:]
def read_geometry(cache):
 vp,fp=cache/'native-vertices.npy',cache/'native-triangles.npy'
 literal=cache/'native-vertex-body.xml'
 if vp.exists() and fp.exists() and (cache/'geometry-parsed.json').exists():
  return np.load(vp,mmap_mode='r'),np.load(fp,mmap_mode='r'),json.loads((cache/'geometry-parsed.json').read_text())
 v=np.lib.format.open_memmap(vp,mode='w+',dtype='<f8',shape=(NV,3))
 f=np.lib.format.open_memmap(fp,mode='w+',dtype='<u4',shape=(NF,3))
 vr=re.compile(rb'<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"\s*/>')
 fr=re.compile(rb'<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"\s*/>')
 state='header';vi=fi=0;vh=hashlib.sha256()
 with zipfile.ZipFile(cache/NATIVE) as z,z.open('3D/3dmodel.model') as s,open(literal,'wb') as raw:
  for b in complete_blocks(s):
   if state=='header':
    if b'<vertices>' not in b: continue
    b=b.split(b'<vertices>',1)[1];state='vertices'
   if state=='vertices':
    done=b'</vertices>' in b
    body=b.split(b'</vertices>',1)[0] if done else b
    raw.write(body);vh.update(body)
    rows=vr.findall(body)
    if rows:
     a=np.asarray(rows,dtype=np.float64);v[vi:vi+len(a)]=a;vi+=len(a)
    if not done: continue
    b=b.split(b'</vertices>',1)[1];state='triangles'
   if state=='triangles':
    rows=fr.findall(b)
    if rows:
     a=np.asarray(rows,dtype=np.uint32);f[fi:fi+len(a)]=a;fi+=len(a)
 assert vi==NV and fi==NF,(vi,fi)
 v.flush();f.flush()
 meta={'vertices':vi,'triangles':fi,'vertex_xml_sha256':vh.hexdigest(),'triangle_indices_sha256':sha(fp),'native_bounds_mm':[v.min(axis=0).tolist(),v.max(axis=0).tolist()]}
 jsave(cache/'geometry-parsed.json',meta);log('Native geometry parsed',vi,fi)
 return v,f,meta
def verify_mask(path):
 de=zlib.decompressobj();n=material=0;h=hashlib.sha256();header=b''
 with open(path,'rb') as f:
  while not header.endswith(b'ElementDataFile = LOCAL\n'):
   header+=f.readline()
   if len(header)>100000: raise ValueError('Mask header')
  for b in iter(lambda:f.read(65536),b''):
   a=de.decompress(b);n+=len(a);material+=int(np.count_nonzero(np.frombuffer(a,dtype=np.uint8)));h.update(a)
  a=de.flush();n+=len(a);material+=int(np.count_nonzero(np.frombuffer(a,dtype=np.uint8)));h.update(a)
 assert n==746*1903*2886 and material==967429317,(n,material)
 return {'total_voxels':n,'material_voxels':material,'decompressed_uint8_sha256':h.hexdigest(),'spacing_mm':[.018,.018,.018],'verification':'All original mask voxels decoded and counted; no resampling or void fill.'}
def archived_tree(cache):
 manifest=json.loads(get(ARCHIVE+'data/natural32m-manifest.json',cache/'natural32m-manifest.json').read_text())
 def download(c): return get(ARCHIVE+c['url'],cache/'chunks'/Path(c['url']).name,c['sha256'])
 with cf.ThreadPoolExecutor(max_workers=6) as pool: list(pool.map(download,manifest['chunks']))
 count=sum(c['vertices'] for c in manifest['chunks'])
 points=np.empty((count,3),dtype=np.float64);values=np.empty(count,dtype=np.float32);off=0
 B=np.asarray(manifest['orientation_basis']);center=np.asarray(manifest['world_center_mm']);shift=np.asarray(manifest['oriented_shift_mm'])
 for c in manifest['chunks']:
  b=gzip.decompress((cache/'chunks'/Path(c['url']).name).read_bytes());n=struct.unpack_from('<I',b)[0];h=json.loads(b[4:4+n]);base=4+((n+3)//4)*4
  seg=h.get('segments',h.get('attributes'))
  if not seg: raise ValueError('Chunk segment schema: '+str(h.keys()))
  if isinstance(seg,list): seg={x['name']:x for x in seg}
  def field(name,dtype):
   q=seg[name];return np.frombuffer(b,dtype=dtype,count=q['bytes']//np.dtype(dtype).itemsize,offset=base+q['offset'])
  q=field('positions','<i2').reshape(-1,3).astype(float)/32760*h['scale']
  a=(q+shift)@B.T+center;s=field('values','<f4');assert len(a)==len(s)==c['vertices']
  points[off:off+len(a)]=a;values[off:off+len(a)]=s;off+=len(a)
 log('Archived numerical field decoded',count,'vertices with seams')
 tree=cKDTree(points,leafsize=32,copy_data=False,balanced_tree=True,compact_nodes=True)
 return tree,values,manifest
def project(tree,values,positions):
 q=np.asarray(positions,dtype=np.float64).copy();q[:,2]*=8/9
 d,ix=tree.query(q,k=4,workers=2);w=1/np.maximum(d,1e-10)**2
 s=(values[ix]*w).sum(axis=1)/w.sum(axis=1);s[d[:,0]>.5]=np.nan
 return s,d[:,0]
def palette(values,threshold,lo,hi):
 values=np.asarray(values);u=np.clip((values-lo)/max(threshold-lo,1e-30),0,1)
 out=np.outer(1-u,[28,49,78])+np.outer(u,[51,116,144]);hot=values>=threshold
 q=np.clip((values[hot]-threshold)/max(hi-threshold,1e-30),0,1);c=np.empty((len(q),3))
 p=q<.45;t=q[p]/.45;c[p]=np.outer(1-t,[108,231,211])+np.outer(t,[191,235,195])
 t=(q[~p]-.45)/.55;c[~p]=np.outer(1-t,[191,235,195])+np.outer(t,[246,220,155]);out[hot]=c
 out[~np.isfinite(values)]=[154,163,173]
 return np.rint(out).astype(np.uint8)
def write_coloured(cache,out,v,f,scalar,info,R,t):
 lo,hi,T=info['min_pa'],info['max_pa'],info['threshold_pa']
 samples=np.r_[np.linspace(lo,np.nextafter(T,-np.inf),256),np.linspace(T,hi,256),np.nan]
 rgb=palette(samples,T,lo,hi);color=cache/'native-colour-index.npy';ci=np.lib.format.open_memmap(color,mode='w+',dtype='<u2',shape=(NV,))
 for i in range(0,NV,500000):
  s=np.asarray(scalar[i:i+500000]);ind=np.empty(len(s),dtype=np.uint16);a=s<T;b=s>=T
  ind[a]=np.rint(np.clip((s[a]-lo)/(T-lo),0,1)*255).astype(np.uint16)
  ind[b]=256+np.rint(np.clip((s[b]-T)/(hi-T),0,1)*255).astype(np.uint16);ind[~np.isfinite(s)]=512;ci[i:i+len(s)]=ind
 ci.flush();jsave(out/'colour-palette.json',{'colors_rgb':rgb.tolist(),'threshold_pa':T,'note':'513 display colours; numerical Float64 archive is separate and never inferred from colour.'})
 target=out/'Megalodon_Native74_High_Stress_100mm.3mf'
 head=('<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02" requiredextensions="m"><metadata name="Title">Otodus megalodon - Native high-stress edition</metadata><resources><m:colorgroup id="2">'+''.join('<m:color color="#%02X%02X%02XFF"/>'%tuple(c) for c in rgb)+'</m:colorgroup><object id="1" type="model"><mesh><vertices>').encode()
 transform=' '.join(format(float(x),'.16g') for x in np.r_[R.T.ravel(),t-[0,0,ROOT_Z]])
 with zipfile.ZipFile(cache/NATIVE) as source,zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as z:
  for name in ['[Content_Types].xml','_rels/.rels','Metadata/reconstruction_report.json']:
   z.writestr(name,source.read(name))
  z.writestr('Metadata/native-stress-provenance.json',json.dumps(info,ensure_ascii=False,indent=2))
  z.writestr('Metadata/colour-palette.json',(out/'colour-palette.json').read_bytes())
  with z.open('3D/3dmodel.model','w',force_zip64=True) as s:
   s.write(head)
   with open(cache/'native-vertex-body.xml','rb') as raw: shutil.copyfileobj(raw,s,8<<20)
   s.write(b'</vertices><triangles>')
   for i in range(0,NF,100000):
    rows=f[i:i+100000];cs=ci[rows]
    s.write(''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}" pid="2" p1="{p}" p2="{q}" p3="{r}"/>' for (a,b,c),(p,q,r) in zip(rows,cs)).encode())
    if i%10000000==0: log('Colour 3MF faces',i,'/',NF)
   s.write(('</triangles></mesh></object></resources><build><item objectid="1" transform="'+transform+'"/></build></model>').encode())
 log('Colour master written',target.stat().st_size)
 return target
def audit_master(path,cache,vertices,faces):
 vh=hashlib.sha256();ti=vi=0;state='header'
 fr=re.compile(rb'<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"[^>]*/>')
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  with z.open('3D/3dmodel.model') as s:
   for b in complete_blocks(s):
    if state=='header':
     if b'<vertices>' not in b: continue
     b=b.split(b'<vertices>',1)[1];state='vertices'
    if state=='vertices':
     done=b'</vertices>' in b;body=b.split(b'</vertices>',1)[0] if done else b;vh.update(body);vi+=body.count(b'<vertex ')
     if not done: continue
     b=b.split(b'</vertices>',1)[1];state='triangles'
    if state=='triangles':
     a=np.asarray(fr.findall(b),dtype=np.uint32).reshape(-1,3)
     assert np.array_equal(a,faces[ti:ti+len(a)]);ti+=len(a)
 assert vi==NV and ti==NF and vh.hexdigest()==vertices['vertex_xml_sha256']
 return {'all_vertices_literal_identical':True,'all_triangle_indices_and_order_identical':True,'vertices_checked':vi,'triangles_checked':ti,'zip_crc_passed':True}
def preview_fields(out,tree,values,site):
 info={}
 for name in ['tooth','tooth-soft']:
  path=get(site+'/assets/'+name+'.bin',out/(name+'.bin'));b=path.read_bytes();n,nf=struct.unpack_from('<II',b);a=np.frombuffer(b,dtype='<f4',offset=8,count=n*6).reshape(-1,6);pos=a[:,:3].astype(float)
  native=(pos-T0-[0,0,ROOT_Z])@np.linalg.inv(R0).T+OFFSET
  s,d=project(tree,values,native);s.astype('<f4').tofile(out/(name+'-von-mises.bin'))
  info[name]={'vertices':n,'triangles':nf,'mapped_vertices':int(np.isfinite(s).sum()),'geometry_scope':'R2.1 simplified CT envelope preview only; complete native geometry is in the production 3MF.'}
 for name in ['model.json','baseline-results.json']:
  get(site+'/assets/'+name,out/name)
 return info
def figures_and_pdf(out,info):
 import matplotlib;matplotlib.use('Agg')
 import matplotlib.pyplot as plt
 from mpl_toolkits.mplot3d.art3d import Poly3DCollection
 from reportlab.pdfgen import canvas
 from reportlab.pdfbase import pdfmetrics
 from reportlab.pdfbase.ttfonts import TTFont
 from reportlab.lib.utils import ImageReader
 font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
 pdfmetrics.registerFont(TTFont('DV',font));pdfmetrics.registerFont(TTFont('DVB',bold))
 model=json.loads((out/'model.json').read_text());result=json.loads((out/'baseline-results.json').read_text())
 b=(out/'tooth.bin').read_bytes();nv,nf=struct.unpack_from('<II',b);v=np.frombuffer(b,dtype='<f4',offset=8,count=nv*6).reshape(-1,6)[:,:3];f=np.frombuffer(b,dtype='<u4',offset=8+nv*24).reshape(-1,3);s=np.fromfile(out/'tooth-von-mises.bin',dtype='<f4');rgb=palette(s,info['threshold_pa'],info['min_pa'],info['max_pa'])/255
 plt.rcParams.update({'font.family':'DejaVu Sans','text.color':'#213b50','axes.labelcolor':'#213b50'})
 fig=plt.figure(figsize=(10,7),facecolor='#0e1e2a');ax=fig.add_subplot(111,projection='3d',facecolor='#0e1e2a')
 mesh=Poly3DCollection(v[f],facecolors=rgb[f].mean(axis=1),edgecolors='none',rasterized=True);ax.add_collection3d(mesh)
 for a,b in model['edges']:
  q=np.array([model['nodes'][a],model['nodes'][b]]);ax.plot(q[:,0],q[:,1],q[:,2],color='#b7e7f4',alpha=.28,lw=4)
 for n,p in model['nodes'].items():
  ax.scatter(*p,s=60 if n in model['feet'] else 22,c='#c0ebf2',alpha=.5,edgecolors='none')
 ax.set(xlim=(-48,48),ylim=(-48,48),zlim=(0,200));ax.set_box_aspect((96,96,200));ax.view_init(17,-70);ax.set_axis_off();fig.subplots_adjust(0,0,1,1)
 fig.savefig(out/'High_Stress_Design_Preview.png',dpi=160,facecolor=fig.get_facecolor());plt.close(fig)
 fig,axs=plt.subplots(2,2,figsize=(10,6.5),layout='constrained');feet=np.array([model['nodes'][n] for n in model['feet']]);order=np.argsort(np.arctan2(feet[:,1],feet[:,0]));p=feet[order,:2];p=np.vstack([p,p[0]]);axs[0,0].plot(*p.T,color='#368886');axs[0,0].scatter(*np.asarray(result['centerOfMass'])[:2],color='#b08748');axs[0,0].set(title='Support polygon / centre of mass',xlabel='x [mm]',ylabel='y [mm]',aspect='equal');axs[0,1].bar(['A1','A2','B1','B2'],[r['Fz'] for r in result['footReactions']],color='#579eab');axs[0,1].set(title='Vertical reactions',ylabel='N')
 h=info['histogram'];centers=(np.array(h['edges_pa'][:-1])+np.array(h['edges_pa'][1:]))/2;axs[1,0].bar(centers/1e6,h['counts'],width=(h['edges_pa'][1]-h['edges_pa'][0])/1e6,color=palette(centers,info['threshold_pa'],info['min_pa'],info['max_pa'])/255);axs[1,0].axvline(info['threshold_pa']/1e6,color='#b08748');axs[1,0].set(title='Native vertex field distribution',xlabel='von Mises [MPa]',ylabel='Vertex count')
 e=np.linspace(.25,1,80);axs[1,1].plot(e,result['armBending']*.5/e,label='Bending');axs[1,1].plot(e,result['armShear']*.5/e,label='Shear');axs[1,1].plot(e,result['armTotal']*.5/e,label='Total');axs[1,1].set(title='Rear arm / stiffness factor',xlabel='eta',ylabel='Displacement [mm]');axs[1,1].legend(fontsize=8);fig.savefig(out/'High_Stress_Calculations.png',dpi=180);plt.close(fig)
 texts={
 'en':('Native geometry. Selected by stress.','High-stress edition','Archived numerical field interpolated to the complete native CT surface.','Method and support calculations','The independently named uncompressed solver export has not been verified.','This colour edition preserves the native geometry. The interactive mesh is a reduced preview.','The R2.1 root socket is a fit-test candidate. Physical contact, creep and impact tests remain required.'),
 'de':('Native Geometrie. Nach Spannung gestaltet.','Edition hoher Vergleichsspannung','Archiviertes numerisches Feld, auf die vollstaendige native CT-Oberflaeche interpoliert.','Methode und Berechnung der Halterung','Der separat bezeichnete uncompressed-Solverexport wurde nicht unabhaengig verifiziert.','Diese Farbedition bewahrt die native Geometrie. Die interaktive Darstellung ist reduziert.','Die R2.1-Wurzelaufnahme ist ein Passungskandidat. Kontakt-, Kriech- und Stossversuche stehen aus.'),
 'el':('Αρχική γεωμετρία. Χρωματισμός βάσει τάσεων.','Έκδοση υψηλών ισοδύναμων τάσεων','Αριθμητικό πεδίο αρχείου με παρεμβολή στην πλήρη αρχική επιφάνεια CT.','Μέθοδος και υπολογισμοί στήριξης','Η αρχική εξαγωγή επίλυσης με όνομα uncompressed δεν έχει επαληθευτεί ανεξάρτητα.','Η χρωματική έκδοση διατηρεί την αρχική γεωμετρία. Το διαδραστικό πλέγμα είναι μειωμένο.','Η υποδοχή ρίζας R2.1 απαιτεί δοκιμή εφαρμογής, επαφής, ερπυσμού και κρούσης.')}
 pdf=out/'High_Stress_Design_EN_DE_EL.pdf';c=canvas.Canvas(str(pdf),pagesize=(595.276,841.89));c.setTitle('Otodus megalodon - Native high-stress design - EN / DE / EL');c.setAuthor('Eliguli Han | Vrontiki Synaisthesma')
 def textline(x,y,text,size=10,font='DV',color='#223b50'):
  c.setFillColor(color);c.setFont(font,size);c.drawString(x,y,text)
 def paragraph(text,y,size=9,width=505):
  words=text.split();line=''
  for w in words:
   if pdfmetrics.stringWidth((line+' '+w).strip(),'DV',size)>width:
    textline(45,y,line,size);y-=size*1.55;line=w
   else:line=(line+' '+w).strip()
  if line:textline(45,y,line,size);y-=size*1.55
  return y
 def pagebase(lang,page):
  textline(45,806,'VRONTIKI SYNAISTHESMA / ELIGULI HAN',9,'DVB');textline(45,780,'Otodus megalodon',20,'DVB');textline(45,30,lang.upper()+'  /  NATIVE STRESS R3',8);textline(530,30,str(page),8)
 page=0
 for lang,t in texts.items():
  page+=1;pagebase(lang,page);y=paragraph(t[0],744,15);paragraph(t[1],y-8,10)
  c.drawImage(str(out/'High_Stress_Design_Preview.png'),45,345,width=505,height=354,mask='auto')
  rows=[('Native vertices / faces',f'{NV:,} / {NF:,}'),('CT mask / material voxels',f"{info['mask']['total_voxels']:,} / {info['mask']['material_voxels']:,}"),('Display height','100 mm'),('Mapped / unmapped vertices',f"{info['mapped_vertices']:,} / {info['unmapped_vertices']:,}"),('Colour threshold (q90)',f"{info['threshold_pa']/1e6:.6f} MPa"),('Finite field range',f"{info['min_pa']/1e6:.6f} - {info['max_pa']/1e6:.6f} MPa")]
  y=319
  for k,vv in rows:textline(45,y,k,9);textline(300,y,vv,9);y-=22
  y=paragraph(t[2],165,9);y=paragraph(t[5],y-8,9);paragraph(t[4],y-8,9);c.showPage()
  page+=1;pagebase(lang,page);paragraph(t[3],744,15)
  c.drawImage(str(out/'High_Stress_Calculations.png'),45,355,width=505,height=328,mask='auto')
  y=332
  for line in ['G = E / [2(1 + nu)] ; Geff = eta G',f"E = 2750 MPa ; nu = 0.38 ; eta = 0.50 ; Geff = {result['Geffective']:.3f} MPa",f"300 g x 3 gravity load ; member diameter 6.4 mm ; rear arm 7.6 mm",f"P displacement = {result['Pdisplacement']:.4f} mm ; arm total = {result['armTotal']:.4f} mm",f"Frame screening stress = {result['maxStress']:.3f} MPa ; Kt = 2 assumed",f"Support margin = {result['supportMargin']:.2f} mm ; tilt = {result['tiltAngle']:.2f} deg",'Tooth field: native z x 8/9 -> archived coordinates; 4-neighbour IDW, power 2.', 'Nearest distance > 0.5 mm -> unmapped grey. No inference from RGB.', 'Histogram: unweighted native vertices, including CT void boundaries.']:
   y=paragraph(line,y,9);y-=5
  y=paragraph(t[6],y-8,9);y=paragraph(t[4],y-8,9)
  paragraph('Sources: github.com/Eliguli712/Antiterrastrae/releases/tag/megalodon-ct-18um',y-10,8);c.showPage()
 c.save();log('Six-page EN/DE/EL PDF created')
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--work',default='native-work');ap.add_argument('--output',default='native-output');ap.add_argument('--site',required=True);ap.add_argument('--skip-master',action='store_true');a=ap.parse_args();cache=Path(a.work);out=Path(a.output);cache.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
 with cf.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda q:get(*q),[(RELEASE+NATIVE,cache/NATIVE,NATIVE_SHA),(RELEASE+MASK,cache/MASK,MASK_SHA)]))
 log('Source SHA-256 verified');mask=verify_mask(cache/MASK);log('All CT voxels verified');v,f,geometry=read_geometry(cache);tree,arch,manifest=archived_tree(cache)
 sp=out/'Native74_ArchivedCOMSOL_VonMises_Pa.npy';dp=out/'Native74_Projection_Distance_mm.npy';scalar=np.lib.format.open_memmap(sp,mode='w+',dtype='<f8',shape=(NV,));distance=np.lib.format.open_memmap(dp,mode='w+',dtype='<f4',shape=(NV,))
 for i in range(0,NV,150000):
  s,d=project(tree,arch,v[i:i+150000]);scalar[i:i+len(s)]=s;distance[i:i+len(s)]=d
  if i%3000000==0:log('Native scalar projection',i,'/',NV)
 scalar.flush();distance.flush();finite=np.asarray(scalar)[np.isfinite(scalar)];q=np.quantile(finite,[0,.1,.5,.8,.9,.95,.99,1]);counts,edges=np.histogram(finite,bins=80);del finite
 # Full geometry changes only through this reversible, uniform 100 mm placement.
 mapped0=(v[::500]-OFFSET)@R0.T+T0
 lo=math.inf;hi=-math.inf
 for i in range(0,NV,500000):
  z=(v[i:i+500000]-OFFSET)@R0[2]+T0[2];lo=min(lo,float(z.min()));hi=max(hi,float(z.max()))
 k=100/(hi-lo);R=R0*k;t=(T0-OFFSET@R0.T)*k;t[2]+=ROOT_Z-lo*k
 info={'schema':'native-stress-r3','species':'Otodus megalodon','edition':'High-stress art edition','source_geometry_url':RELEASE+NATIVE,'source_geometry_sha256':NATIVE_SHA,**geometry,'mask':mask,'mapped_vertices':int(np.isfinite(scalar).sum()),'unmapped_vertices':int(np.isnan(scalar).sum()),'min_pa':float(q[0]),'max_pa':float(q[-1]),'threshold_pa':float(q[4]),'quantiles_pa':dict(zip(['min','q10','q50','q80','q90','q95','q99','max'],map(float,q))),'histogram':{'edges_pa':edges.tolist(),'counts':counts.tolist(),'sampling':'Unweighted finite native vertex values, including CT void surfaces; not area or volume quantiles.'},'field_source':'Archived COMSOL numerical float32 values on 66 complete legacy-surface chunks, not paper/RGB colours.','field_original_solver_export_verified':False,'field_original_solver_export_note':'The independently named uncompressed / static_dynamics_high_resolution / strict3BDF solver export was not located and is not independently verified.','registration':'Native x,y unchanged; z_legacy = (8/9) z_native. Legacy 16 micrometre z frame to native 18 micrometre frame.','interpolation':{'neighbours':4,'inverse_distance_power':2,'max_nearest_distance_mm':.5,'distance_frame':'legacy surface coordinates','archive_position_denominator':32760,'source_values_dtype':'float32 Pa','output_values_dtype':'float64 Pa; interpolation adds no source solver precision'},'source_chunks':manifest['chunks'],'display_transform_R':R.tolist(),'display_transform_t':t.tolist(),'production_geometry':'Every native vertex literal and all triangle indices/order retained. No decimation, global smoothing or void fill. Lossless ZIP packaging is used.','mount_scope':'R2.1 reference-fit socket retained; it was derived from a reduced tooling envelope. Full-native contact and physical strength are not validated.','colour_scope':'q90 display selection of existing stress values, not a stronger mount, new load solve or fracture threshold.'}
 info['preview']=preview_fields(out,tree,arch,a.site.rstrip('/'))
 rng=np.random.default_rng(20261117);ix=rng.integers(0,NV,1024);ss,dd=project(tree,arch,v[ix]);err=float(np.nanmax(np.abs(ss-scalar[ix])));assert err==0 and np.array_equal(np.isnan(ss),np.isnan(scalar[ix]));audit={'source_sha256_passed':True,'all_66_chunk_sha256_passed':True,'mask':mask,'random_seed':20261117,'independently_recomputed_vertices':1024,'scalar_max_absolute_error_pa':err}
 jsave(out/'native-stress-provenance.json',info)
 if not a.skip_master:
  master=write_coloured(cache,out,v,f,scalar,info,R,t);audit.update(audit_master(master,cache,geometry,f));log('Full master audit passed')
 jsave(out/'native-stress-audit.json',audit);figures_and_pdf(out,info)
 readme='''OTODUS MEGALODON / NATIVE STRESS R3\n\nEN: Every native vertex and triangle is preserved in the production 3MF. The separate Float64 array contains interpolated archived numerical von Mises values in Pa, in original vertex order. NaN means no supported nearest surface within 0.5 mm. The original independently named uncompressed solver export has not been verified. No stresses are inferred from RGB. q90 selects a colour threshold, not a new structural load case.\n\nDE: Alle nativen Eckpunkte und Dreiecke bleiben erhalten. Das Float64-Feld enthaelt interpolierte archivierte numerische Vergleichsspannungen in Pa, in urspruenglicher Eckpunktreihenfolge. NaN bedeutet keine ausreichend nahe zugeordnete Oberflaeche. Der separat bezeichnete uncompressed-Solverexport ist nicht unabhaengig verifiziert. Farben ersetzen keine numerischen Daten.\n\nEL: Όλες οι αρχικές κορυφές και τα τρίγωνα διατηρούνται. Το πεδίο Float64 περιέχει αριθμητικές ισοδύναμες τάσεις σε Pa με παρεμβολή, στην αρχική σειρά κορυφών. NaN σημαίνει μη υποστηριζόμενη αντιστοίχιση. Η αρχική εξαγωγή uncompressed δεν έχει επαληθευτεί ανεξάρτητα.\n\nThe complete native CT mask is verified voxel by voxel, without resampling or cavity filling. The R2.1 mount remains a fit-test candidate, not a validated load-rated support.\n'''
 (out/'README_EN_DE_EL.txt').write_text(readme)
 with zipfile.ZipFile(out/'Megalodon_Native74_VonMises_Field_and_Authoring.zip','w',zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as z:
  for name in [sp.name,dp.name,'native-stress-provenance.json','native-stress-audit.json','README_EN_DE_EL.txt','colour-palette.json']:
   if (out/name).exists():z.write(out/name,name)
  z.write(__file__,'build_native_stress.py')
 hashes={p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in out.iterdir() if p.suffix in ['.3mf','.zip','.pdf','.png','.json','.bin'] and p.name!='release-manifest.json'};jsave(out/'release-manifest.json',hashes)
 log('COMPLETE',json.dumps({'mapped':info['mapped_vertices'],'threshold_pa':info['threshold_pa'],'artifacts':hashes}))
if __name__=='__main__':main()
