#!/usr/bin/env python3
"""Traceable native-mask-isolated CT playback; no synthetic anatomy or new FEA."""
from pathlib import Path
import csv, hashlib, json, subprocess, time, zlib
import numpy as np
import pydicom
from scipy import ndimage as ndi
from scipy.stats import pearsonr, spearmanr
from PIL import Image, ImageDraw, ImageFont

R=Path(__file__).resolve().parents[1];P=R.parents[1]
C=R/'cache';M=R/'media';A=R/'data'
for d in [C,M,A]:d.mkdir(parents=True,exist_ok=True)
SHAPE=(2886,1903,746);H=.018;ORIGIN=np.array([11.232,1.566,18.186])
FRAMES=3050;FPS=25;LO=-3292;HI=26623
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
fonts={k:ImageFont.truetype(FONT,k) for k in [17,20,23,28]}
started=time.monotonic()

def digest(p):
    return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()

maskfile=P/'full_3D/Megalodon_FullCT_SpecimenMask_18um.mha'
maskpath=C/'selected_native_mask.u8'
if not maskpath.exists():
    with maskfile.open('rb') as f,maskpath.open('wb') as out:
        while f.readline().strip()!=b'ElementDataFile = LOCAL':pass
        dec=zlib.decompressobj()
        while chunk:=f.read(1<<20):out.write(dec.decompress(chunk))
        out.write(dec.flush())
assert maskpath.stat().st_size==np.prod(SHAPE)
mask=np.memmap(maskpath,mode='r',dtype=np.uint8,shape=SHAPE)
rawpath=C/'native_specimen_crop.i16';ready=C/'native_crop_ready.json'
if not ready.exists():
    raw=np.memmap(rawpath,mode='w+',dtype=np.int16,shape=SHAPE)
    paths=sorted((P/'DICOM_16um/exports/_unzipped_dicom_tmp').glob('*.DCM;1'))
    assert len(paths)==3050
    records=list(csv.DictReader((P/'output/ct_fea_2026-11-08/data/dicom_source_hashes.csv').open()))
    count=[np.zeros(n,np.int64) for n in SHAPE];total=[np.zeros(n,np.int64) for n in SHAPE]
    for z in range(SHAPE[0]):
        k=z+76;b=paths[k].read_bytes()
        assert hashlib.sha256(b).hexdigest()==records[k]['sha256']
        import io
        plane=pydicom.dcmread(io.BytesIO(b),force=True).pixel_array[76:1979,392:1138]
        assert plane.dtype==np.int16
        raw[z]=plane
        mm=mask[z].astype(bool);v=np.where(mm,plane,0)
        count[0][z]=mm.sum();count[1]+=mm.sum(1,dtype=np.int64);count[2]+=mm.sum(0,dtype=np.int64)
        total[0][z]=v.sum(dtype=np.int64);total[1]+=v.sum(1,dtype=np.int64);total[2]+=v.sum(0,dtype=np.int64)
        if z%300==0:print('Verified native crop',z,'/',SHAPE[0],round(time.monotonic()-started,1),'s',flush=True)
    raw.flush();del raw
    assert int(count[0].sum())==967429317
    np.savez_compressed(A/'selected_component_profiles.npz',**{f'{key}_{j}':v for key,values in [('count',count),('sum_raw',total)] for j,v in enumerate(values)})
    ready.write_text(json.dumps(dict(source_files_checked=2886,original_count=3050,crop_zyx=SHAPE,selected_voxels=967429317,mask_sha256=digest(maskfile))))
raw=np.memmap(rawpath,mode='r',dtype=np.int16,shape=SHAPE)
# Display cache is an explicitly documented 2x stride, never the numerical mask.
lowshape=tuple((n+1)//2 for n in SHAPE)
lrpath=C/'display_36um.i16';lmpath=C/'display_mask_36um.u8'
if not (C/'display_ready.json').exists():
    low=np.memmap(lrpath,mode='w+',dtype=np.int16,shape=lowshape)
    lm=np.memmap(lmpath,mode='w+',dtype=np.uint8,shape=lowshape)
    for j,z in enumerate(range(0,SHAPE[0],2)):
        low[j]=raw[z,::2,::2];lm[j]=mask[z,::2,::2]
    low.flush();lm.flush();del low,lm
    (C/'display_ready.json').write_text(json.dumps(dict(pitch_mm=.036,method='Exact stride-two display samples; unmodified 18 um mask and profiles retained')))
low=np.memmap(lrpath,mode='r',dtype=np.int16,shape=lowshape)
lm=np.memmap(lmpath,mode='r',dtype=np.uint8,shape=lowshape)
print('Native inputs and display cache ready',round(time.monotonic()-started,1),'s',flush=True)

frame=np.load(P/'output/pdf/debunk_myth_full_reconstruction_2026-10-31/numerics/L0/solution.npz')
basis=frame['basis'];center=frame['center_m']*1000+np.array([4.176,.198,16.818])
mins=np.full(3,np.inf);maxs=-mins
for z in range(lowshape[0]):
    yy,xx=np.nonzero(lm[z])
    if not len(xx):continue
    xyz=np.column_stack([xx*H*2,yy*H*2,np.full(len(xx),z*H*2)])+ORIGIN
    q=(xyz-center)@basis
    mins=np.minimum(mins,q.min(0));maxs=np.maximum(maxs,q.max(0))
dh=.072
us=np.arange(mins[0]-.3,maxs[0]+.3,dh)
vs=np.arange(mins[1]-.3,maxs[1]+.3,dh)
uu,vv=np.meshgrid(us,vs)
base=center+uu[:,:,None]*basis[:,0]+vv[:,:,None]*basis[:,1]
eta=np.linspace(mins[2]-.036,maxs[2]+.036,FRAMES)
shape2=uu.shape;sectionpath=C/'broadface_display_3050.u8'
section=np.memmap(sectionpath,mode='w+',dtype=np.uint8,shape=(FRAMES,*shape2))
areas=np.zeros(FRAMES);means=np.full(FRAMES,np.nan)
for i,w in enumerate(eta):
    xyz=base+w*basis[:,2];coords=np.moveaxis((xyz-ORIGIN)/.036,-1,0)[[2,1,0]]
    selected=ndi.map_coordinates(lm,coords,order=0,mode='constant',cval=0,prefilter=False).astype(bool)
    val=ndi.map_coordinates(low,coords,order=1,output=np.float32,mode='constant',cval=LO,prefilter=False)
    g=np.uint8(255*np.clip((val-LO)/(HI-LO),0,1));g[~selected]=255
    # Holes inside a section are dark; only external scanner space is white.
    interior=ndi.binary_fill_holes(selected)
    g[interior&~selected]=0
    section[i]=g
    areas[i]=selected.sum()*dh*dh
    if selected.any():means[i]=float(val[selected].mean())
    if i%500==0:print('Broad-face reslice',i,'/3050',round(time.monotonic()-started,1),'s',flush=True)
section.flush()
imax=int(areas.argmax());use=areas>=.01*areas.max()
cor=dict(Pearson=float(pearsonr(areas[use],means[use]).statistic),Spearman=float(spearmanr(areas[use],means[use]).statistic),planes=int(use.sum()))
with (A/'broadface_frame_coordinates.csv').open('w',newline='') as f:
    w=csv.writer(f);w.writerow(['frame','playback_seconds','thickness_mm','display_selected_area_mm2','mean_selected_raw'])
    w.writerows(zip(np.arange(FRAMES),np.arange(FRAMES)/FPS,eta,areas,means))
profiles=np.load(A/'selected_component_profiles.npz')
counts=[profiles[f'count_{j}'] for j in range(3)]
native_means=[np.divide(profiles[f'sum_raw_{j}'],counts[j],out=np.full(SHAPE[j],np.nan),where=counts[j]>0) for j in range(3)]
correlations=[]
for j in range(3):
    u=counts[j]>=.01*counts[j].max()
    correlations.append(dict(axis='ZYX'[j],Pearson=float(pearsonr(counts[j][u],native_means[j][u]).statistic),Spearman=float(spearmanr(counts[j][u],native_means[j][u]).statistic),planes=int(u.sum())))

def curve(draw,xs,ys,box,color,width=3):
    x,y,w,h=box
    good=np.isfinite(ys);points=[]
    for xx,yy,valid in zip(xs,ys,good):
        if valid:points.append((x+xx*w,y+h*(1-yy)))
        elif points:
            if len(points)>1:draw.line(points,fill=color,width=width)
            points=[]
    if len(points)>1:draw.line(points,fill=color,width=width)

def chart(draw,area,mean,frac,box):
    x,y,w,h=box;an=area/area.max();good=(area>=.01*area.max())&np.isfinite(mean)
    mn=np.full(len(mean),np.nan)
    if good.any():mn[good]=(mean[good]-mean[good].min())/max(np.ptp(mean[good]),1)
    for v in [0,.5,1]:
        yp=y+h*(1-v);draw.line((x,yp,x+w,yp),fill='#d3dde0',width=1)
        draw.text((x-38,yp-9),f'{v:.1f}',font=fonts[17],fill='#243b44')
    curve(draw,np.linspace(0,1,len(area)),an,box,'#176b90')
    curve(draw,np.linspace(0,1,len(area)),mn,box,'#b96a27',2)
    xx=x+frac*w;draw.line((xx,y,xx,y+h),fill='#b82e3e',width=2)
    draw.rectangle((x,y,x+w,y+h),outline='#71848c',width=1)

def paste(img,g,box,labels):
    x,y,w,h=box;panel=Image.fromarray(g);panel.thumbnail((w,h),Image.Resampling.LANCZOS)
    left=x+(w-panel.width)//2;top=y+(h-panel.height)//2
    img.paste(panel,(left,top));d=ImageDraw.Draw(img)
    d.rectangle((left,top,left+panel.width,top+panel.height),outline='#8b9a9e')
    xmin,xmax,ymin,ymax,xlabel,ylabel=labels
    for frac in [0,.5,1]:
        px=left+frac*panel.width;py=top+(1-frac)*panel.height
        d.text((px-18,top+panel.height+7),f'{xmin+frac*(xmax-xmin):.1f}',font=fonts[17],fill='#243b44')
        d.text((left-48,py-8),f'{ymin+frac*(ymax-ymin):.1f}',font=fonts[17],fill='#243b44')
    d.text((left+panel.width//2-65,top+panel.height+30),xlabel,font=fonts[17],fill='#243b44')
    d.text((left,top-25),ylabel,font=fonts[17],fill='#243b44')

def encoder(name):
    p=M/name
    cmd=['/opt/homebrew/bin/ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','25','-i','-','-an','-c:v','libx264','-crf','16','-preset','fast','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',str(p)]
    return subprocess.Popen(cmd,stdin=subprocess.PIPE)

out=encoder('CT_broadface_longitudinal_3050.mp4')
for i in range(FRAMES):
    img=Image.new('RGB',(1920,1080),'white');d=ImageDraw.Draw(img)
    d.text((35,14),'Longitudinal CT | crown upward | sweep through tooth thickness',font=fonts[28],fill='#183b4b')
    d.text((35,54),f'Frame {i+1:04d}/3050 | playback {i/25:.2f} s | thickness coordinate {eta[i]:.3f} mm',font=fonts[23],fill='#183b4b')
    paste(img,section[i],(90,125,710,790),(us[0],us[-1],-vs[-1],-vs[0],'Transverse (mm)','Crownward (mm)'))
    paste(img,section[imax],(970,150,390,610),(us[0],us[-1],-vs[-1],-vs[0],'Transverse (mm)','Largest resliced plane'))
    d.text((1420,180),'Area / maximum area',font=fonts[23],fill='#176b90')
    d.text((1420,215),'Mean raw intensity / display range',font=fonts[20],fill='#b96a27')
    chart(d,areas,means,i/(FRAMES-1),(1440,285,420,250))
    d.text((1420,565),f'Pearson r = {cor["Pearson"]:.3f}',font=fonts[20],fill='#243b44')
    d.text((1420,595),f'Spearman rho = {cor["Spearman"]:.3f}',font=fonts[20],fill='#243b44')
    d.text((1420,630),'Descriptive, serially dependent planes',font=fonts[17],fill='#526972')
    d.text((1420,675),'Through-thickness position (mm)',font=fonts[17],fill='#243b44')
    d.text((1440,705),f'{eta[0]:.2f}                             {eta[-1]:.2f}',font=fonts[17],fill='#243b44')
    d.text((45,1000),'18 um native source | 36 um display cache | 72 um reslice grid | linear raw intensity / nearest binary mask',font=fonts[20],fill='#526972')
    d.text((45,1034),'Scanner background excluded using native specimen mask; internal voids retained. No new anatomy, tissue identification or failure diagnosis.',font=fonts[17],fill='#526972')
    out.stdin.write(np.asarray(img).tobytes())
    if i%600==0:print('Encode broad face',i,flush=True)
    if i==imax:img.save(M/'CT_broadface_poster.jpg',quality=97,subsampling=0)
out.stdin.close();assert out.wait()==0

out=encoder('CT_specimen_three_axes_3050.mp4')
positions=np.column_stack([np.linspace(0,n-1,FRAMES) for n in SHAPE])
with (A/'three_axes_frame_coordinates.csv').open('w',newline='') as f:
    w=csv.writer(f);w.writerow(['frame','playback_seconds','original_Z_index','original_Y_index','original_X_index','LPS_Z_mm','LPS_Y_mm','LPS_X_mm'])
    w.writerows((i,i/FPS,*list(pos+[76,76,392]),*list(ORIGIN[::-1]+pos*H)) for i,pos in enumerate(positions))
for i,pos in enumerate(positions):
    img=Image.new('RGB',(1920,1080),'white');d=ImageDraw.Draw(img)
    d.text((30,12),f'Native specimen / three axes | {i+1:04d}/3050 | playback {i/25:.2f} s | 25 fps',font=fonts[28],fill='#183b4b')
    for j,p in enumerate(pos):
        index=p/2;ii=int(index);jj=min(ii+1,lowshape[j]-1);a=index-ii
        if j==0:plane=(1-a)*low[ii].astype(np.float32)+a*low[jj];sm=lm[int(round(index))];hax,vax=0,1
        elif j==1:plane=(1-a)*low[:,ii,:].astype(np.float32)+a*low[:,jj,:];sm=lm[:,int(round(index)),:];hax,vax=0,2
        else:plane=(1-a)*low[:,:,ii].astype(np.float32)+a*low[:,:,jj];sm=lm[:,:,int(round(index))];hax,vax=1,2
        selected=sm.astype(bool);g=np.uint8(255*np.clip((plane-LO)/(HI-LO),0,1));g[~selected]=255
        g[ndi.binary_fill_holes(selected)&~selected]=0
        bx=j*640
        d.text((bx+55,68),f'{["Axial Z","Coronal Y","Sagittal X"][j]} = {ORIGIN[2-j]+p*H:.3f} LPS mm',font=fonts[23],fill='#183b4b')
        sizes=SHAPE[::-1]
        paste(img,np.flipud(g),(bx+76,130,530,565),(ORIGIN[hax],ORIGIN[hax]+(sizes[hax]-1)*H,ORIGIN[vax],ORIGIN[vax]+(sizes[vax]-1)*H,'XYZ'[hax]+' (LPS mm)','XYZ'[vax]+' (LPS mm)'))
        chart(d,counts[j],native_means[j],i/(FRAMES-1),(bx+60,795,530,150))
        c=correlations[j];d.text((bx+55,736),f'r = {c["Pearson"]:.3f}; rho = {c["Spearman"]:.3f}',font=fonts[20],fill='#243b44')
        d.text((bx+55,968),'Area / max (blue); mean raw / range (ochre)',font=fonts[17],fill='#526972')
    d.text((35,1034),'Unchanged 18 um specimen mask | exact full-native area/intensity profiles | 36 um display samples | playback time is not acquisition or biological time',font=fonts[17],fill='#526972')
    out.stdin.write(np.asarray(img).tobytes())
    if i%600==0:print('Encode three axes',i,flush=True)
    if i==FRAMES//2:img.save(M/'CT_three_axes_poster.jpg',quality=97,subsampling=0)
out.stdin.close();assert out.wait()==0

for stem in ['CT_broadface_longitudinal_3050','CT_specimen_three_axes_3050']:
    cmd=['/opt/homebrew/bin/ffmpeg','-y','-loglevel','error','-threads','2','-i',str(M/(stem+'.mp4')),'-filter_complex','[0:v]fps=25,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=full[p];[b][p]paletteuse=dither=none','-loop','0',str(M/(stem+'.gif'))]
    subprocess.run(cmd,check=True)
record=dict(date='2026-11-19',frames=FRAMES,fps=FPS,duration_seconds=122,source_native_spacing_mm=H,mask_sha256=digest(maskfile),source_frame=center.tolist(),basis_columns=basis.tolist(),broadface_thickness_range_mm=[float(eta[0]),float(eta[-1])],broadface_largest_frame=imax,broadface_correlation=cor,native_axis_correlations=correlations,display='Raw values linear in [-3292,26623]; external background excluded by selected native 3D mask. Enclosed low-density pixels remain dark. This is display isolation, not beam-hardening correction. Oblique grid: 72 um; exact stride-two 36 um display cache.',scope='The natural broad-face sweep is parallel to the registered transverse/crown-root plane, moving through thickness. It need not be an isosceles triangle; specimen shape is not altered. 3050 playback frames are resliced samples, not 3050 independent newly acquired oblique images.',non_claims=['No tissue identification, recovered obscured detail, new acquired resolution, damage diagnosis, FEA or shock solution.'],outputs=[dict(file=f.name,bytes=f.stat().st_size,sha256=digest(f)) for f in M.glob('*')],runtime_seconds=time.monotonic()-started)
(R/'media_manifest.json').write_text(json.dumps(record,indent=2));print('MEDIA COMPLETE',round(time.monotonic()-started,1),'s',flush=True)
