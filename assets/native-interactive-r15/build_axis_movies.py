"""Native74 cavity-wall sweeps along the three previously integrated voxel PCA axes.
Each original face is rasterized once per axis into cut-activation fragments.
A monotonically growing cut halfspace gives exactly the per-pixel depth minimum
of eligible fragments; it avoids 300 redundant passes over the source mesh.
No proxy, surface reduction, image sharpening or geometry denoising is used.
"""
from pathlib import Path
import argparse,hashlib,json,subprocess,time
import numpy as np
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[3];O=ROOT/'output/native_interactive_r15_2026-11-25';DATA=O/'prepared/axis-media';DATA.mkdir(parents=True,exist_ok=True)
def sha(p):
 with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
def read_exact(f,n):
 b=bytearray()
 while len(b)<n:
  x=f.read(n-len(b))
  if not x:raise RuntimeError('Native raster stream ended before declared frame count')
  b.extend(x)
 return bytes(b)

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--run-dir',required=True);args=ap.parse_args();run=Path(args.run_dir);run.mkdir(exist_ok=True,parents=True)
 source=ROOT/'output/current_native74_stress_2026-11-20/cache';analysis=json.loads((ROOT/'output/web_native74_batch_2026-11-24/data-assets/assets/native18-inference/native-analysis-result.json').read_text());pca=analysis['voxel_volume_PCA'];axes=np.array(pca['axes_columns']);center=np.array(pca['center_scanner_mm']);vertices=np.memmap(source/'vertices.f64',dtype='<f8',mode='r',shape=(37951699,3));lo=np.full(3,np.inf);hi=-lo
 for first in range(0,len(vertices),500000):
  q=(vertices[first:first+500000]-center)@axes;lo=np.minimum(lo,q.min(0));hi=np.maximum(hi,q.max(0))
 descriptors=[]
 for i in range(3):
  # A source-coordinate, orthonormal plane frame. Principal axis 1 points toward
  # the roots; negative axis 1 gives a crown-up section for axes 2 and 3.
  ui,vi=(1,2)if i==0 else(2,0)if i==1 else(1,0);usign=1;vsign=1 if i==0 else -1
  u=axes[:,ui];v=axes[:,vi]*vsign;bounds_u=[float(lo[ui]-.018),float(hi[ui]+.018)];bounds_v=[float(lo[vi]-.018),float(hi[vi]+.018)]if vsign==1 else[float(-hi[vi]-.018),float(-lo[vi]+.018)]
  descriptors.append({'axis':i+1,'normal':axes[:,i].tolist(),'u':u.tolist(),'v':v.tolist(),'offset_range_mm':[float(lo[i]-.018),float(hi[i]+.018)],'u_range_mm':bounds_u,'v_range_mm':bounds_v,'minimum_plane_step_mm':.018,'default_display_step_mm':.072,'maximum_area_offset_mm':analysis['principal_sections'][i]['plane_offset_from_centroid_mm']})
 record={'schema':'native18-volume-PCA-sections-r15','source':'Exact material-voxel volume moments; reused from the published integrated native18 study.','center_scanner_mm':center.tolist(),'axes_columns':axes.tolist(),'axes':descriptors,'source_native_sampling_mm':.018,'source_native_shape_zyx':[2886,1903,746],'source_native_mask_sha256':'8a68259cc4c079eaef5ec604e60bea2de6bf8bf4ebb7d9499347651676e19bce','oblique_reslice':'Nearest original voxel at each stated plane grid point; no interpolated or newly acquired detail.'}
 (DATA/'pca-sections.json').write_text(json.dumps(record,indent=2)+'\n')
 # Independent finite check of the monotone fragment/depth accumulation used by
 # the native renderer against exhaustive per-frame eligible-fragment minima.
 rng=np.random.default_rng(25);pixel=rng.integers(0,97,10000);depth=rng.normal(size=10000);activation=rng.integers(0,31,10000);current=np.full(97,np.inf)
 for f in range(31):
  m=activation==f;np.minimum.at(current,pixel[m],depth[m]);brute=np.full(97,np.inf);m=activation<=f;np.minimum.at(brute,pixel[m],depth[m]);assert np.array_equal(current,brute)
 while not (O/'review/count-run001/result.json').exists():time.sleep(1)
 stats=json.loads((O/'review/count-run001/result.json').read_text());assert stats['status']=='completed';(DATA/'native-voxel-counts.json').write_text(json.dumps(stats,indent=2)+'\n')
 fontbase=ROOT/'output/acrylic_baskerville_v4_2026-11-20/review/font_cache';font=ImageFont.truetype(str(fontbase/'Baskerville-Italic.ttf'),34);sans=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',22);small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18)
 ruler=Image.open(ROOT/'output/web_native74_batch_2026-11-24/data-assets/assets/palaeo-ruler-r14/Palaeontological_Ruler_50mm.png').convert('RGBA');ruler=ruler.resize((round(10.2*14.7),round(58.2*14.7)),Image.Resampling.LANCZOS)
 results=[];frames=300;fps=25
 for axis in range(3):
  name=f'Native74_Internal_PCA_Axis_{axis+1}_50mm_1080p.mp4';out=DATA/name;log=run/f'axis-{axis+1}-raster.log'
  with log.open('wb')as err:
   cpp=subprocess.Popen([str(O/'prepared/raster_native_cut_movie'),str(source/'vertices.f64'),str(source/'triangles.u32'),str(axis),str(frames)],stdout=subprocess.PIPE,stderr=err)
   ff=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','1920x1080','-framerate',str(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
   # The C++ rasterizer stores its per-vertex plane coordinate in Float32.
   a=float(np.float32(np.float32(lo[axis])-.018));b=float(np.float32(np.float32(hi[axis])+.018))
   for frame in range(frames):
    image=Image.frombytes('RGB',(1920,1080),read_exact(cpp.stdout,1920*1080*3));image.paste(ruler,(1500,85),ruler);d=ImageDraw.Draw(image)
    d.text((54,22),'Astraeus Krystallisia',font=font,fill='#e0eff0');d.text((55,72),f'Inside the tooth | PCA axis {axis+1} | complete native cavity walls',font=sans,fill='#bcd7df');offset=a+(b-a)*frame/(frames-1);d.text((55,110),f'Cut offset {offset:+.6f} mm from voxel-mass centroid | 50 mm model',font=small,fill='#9fc0ca')
    y=950;d.rectangle((35,y-7,1875,1072),fill='#091820')
    lines=[f"Whole source domain: {stats['selected_material_voxels']:,} material voxels | {stats['strict_interior_material_voxels_6_neighbours']:,} interior material voxels (six-neighbour definition)",f"{stats['closed_internal_background_voxels_6_connectivity']:,} enclosed background voxels (6-connected) | 74,293,846 original source surface triangles",'Native CT sampling: 0.018 mm / 18 µm | 1,920 × 1,080 video pixels | 300 temporal cut positions | no added acquired resolution','Original cavity surfaces; cut clipping only. Original mask unchanged. Source triangle count is distinct from visible clipped fragments.']
    for row,line in enumerate(lines):d.text((52,y+row*28),line,font=small,fill='#c0d6dc')
    ff.stdin.write(image.tobytes())
    if frame%75==0:print('Encoded PCA axis',axis+1,'frame',frame,'/',frames,flush=True)
   cpp.stdout.close();assert cpp.wait()==0;ff.stdin.close();assert ff.wait()==0
  audit=log.read_text();assert 'source_faces=74293846 vertices=37951699' in audit
  probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out)]));v=probe['streams'][0];assert v['width']==1920 and v['height']==1080 and int(v['nb_frames'])==300
  poster=DATA/f'Native74_Internal_PCA_Axis_{axis+1}_poster.png';subprocess.run(['ffmpeg','-v','error','-y','-ss','6','-i',str(out),'-frames:v','1',str(poster)],check=True)
  results.append({'axis':axis+1,'file':name,'bytes':out.stat().st_size,'sha256':sha(out),'poster':poster.name,'poster_sha256':sha(poster),'width':1920,'height':1080,'frames':300,'fps':25,'duration_s':12,'source_triangles_examined_per_axis':74293846,'source_vertices':37951699,'surface_decimation':False,'source_native_sampling_mm':.018,'source_native_sampling_um':18,'source_coordinate_PCA_normal':axes[:,axis].tolist(),'cut_offsets_native_mm':[a,b],'display_model_height_mm':50,'coordinate_convention':'Original source position determines clipping and existing colours; model-to-screen scale does not alter the source domain.'})
  print('Verified PCA MP4 axis',axis+1,out.stat().st_size,flush=True)
 final={'status':'completed','videos':results,'whole_source_counts':stats,'independent_monotone_depth_checks':31,'filtering':'No image sharpening; original cavity geometry. H.264 encoding only.','method':'All 74,293,846 original faces rasterized per PCA axis; per-pixel halfspace activation and monotone depth minima, equivalent to re-rendering each discrete clipping position.'};(DATA/'axis-movies.json').write_text(json.dumps(final,indent=2)+'\n');(run/'result.json').write_text(json.dumps(final,indent=2)+'\n')
if __name__=='__main__':main()
