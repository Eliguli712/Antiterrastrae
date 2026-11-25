"""Display-only masked CT filtering, mixture PPCA and exact native mask slabs.

Original 18-um arrays, native mesh and all FEM values remain immutable. The
3-D artistic intensity texture uses an explicitly labelled 144-um display grid.
Every binary voxel is separately retained in lossless, native-18-um bit slabs.
"""
from pathlib import Path
import argparse,gzip,hashlib,json,struct,time
import numpy as np
from scipy import ndimage
from scipy.special import logsumexp
from scipy.cluster.vq import kmeans2
from scipy.spatial import cKDTree
import scipy

ROOT=Path(__file__).resolve().parents[3]
O=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--run-dir',type=Path,required=True);args=parser.parse_args()
RUN=args.run_dir.resolve();RUN.mkdir(parents=True,exist_ok=True);D=RUN/'data';D.mkdir(exist_ok=True)
SHAPE=(2886,1903,746);STRIDE=8;SPACING=.018;ORIGIN=np.array([7.056,1.368,1.368]);SEED=20261125
WLO,WHI=-3292.,26623.;CAP=12/255
MASK=ROOT/'output/ct_web_2026-11-19/cache/selected_native_mask.u8'
RAW=ROOT/'output/ct_web_2026-11-19/cache/native_specimen_crop.i16'
mask=np.memmap(MASK,dtype='u1',mode='r',shape=SHAPE);raw=np.memmap(RAW,dtype='<i2',mode='r',shape=SHAPE)
def log(*x):print(time.strftime('%H:%M:%S'),*x,flush=True)
def save(path,obj):path.write_text(json.dumps(obj,indent=2,allow_nan=False)+'\n')
def digest(b):return hashlib.sha256(b).hexdigest()
def packed(name,header,arrays):
 segments={};cursor=0;parts=[]
 for key,array in arrays:
  a=np.ascontiguousarray(array);pad=(-cursor)%4
  if pad:parts.append(bytes(pad));cursor+=pad
  b=a.tobytes();segments[key]={'offset':cursor,'bytes':len(b),'dtype':{'u1':'uint8','f4':'float32','u4':'uint32','i1':'int8'}[a.dtype.str[1:]]};parts.append(b);cursor+=len(b)
 h={**header,'segments':segments};j=json.dumps(h,separators=(',',':')).encode();b=struct.pack('<I',len(j))+j+bytes((-len(j))%4)+b''.join(parts)
 z=gzip.compress(b,compresslevel=5,mtime=0);(D/name).write_bytes(z)
 return {'url':name,'bytes':len(z),'sha256':digest(z),'decoded_bytes':len(b),'decoded_sha256':digest(b)}

# Pool all acquired-grid voxels with integer weighted sums, never a stride sample.
nz,ny,nx=[(s+7)//8 for s in SHAPE];density=np.zeros((nz,ny,nx),'f4');fraction=np.zeros_like(density)
total=0;slabs=[];slab_arrays=[];slab_start=0
for zi,start in enumerate(range(0,SHAPE[0],8)):
 stop=min(start+8,SHAPE[0]);m=np.asarray(mask[start:stop]);total+=int(m.sum(dtype='u8'));r=np.asarray(raw[start:stop])
 mp=np.pad(m,((0,8-len(m)),(0,ny*8-SHAPE[1]),(0,nx*8-SHAPE[2])))
 rp=np.pad(np.multiply(r,m,dtype='i4'),((0,8-len(m)),(0,ny*8-SHAPE[1]),(0,nx*8-SHAPE[2])))
 counts=mp.reshape(8,ny,8,nx,8).sum((0,2,4),dtype='u4');sums=rp.reshape(8,ny,8,nx,8).sum((0,2,4),dtype='i8')
 density[zi]=np.divide(sums,counts,out=np.zeros_like(sums,dtype='f8'),where=counts>0);fraction[zi]=counts/512
 slab_arrays.append(np.packbits(m,axis=-1,bitorder='little'))
 if len(slab_arrays)==8 or stop==SHAPE[0]:
  bits=np.concatenate(slab_arrays);rec=packed(f'native-mask-{len(slabs):02}.bin.gz',{'schema':'native-mask-bits-v1','first_z':slab_start,'planes':len(bits),'native_shape_zyx':list(SHAPE),'packed_width':int(bits.shape[-1]),'bitorder':'little'},[('packedMask',bits)])
  rec.update({'first_z':slab_start,'planes':len(bits)});slabs.append(rec);slab_arrays=[];slab_start=stop
 if zi%32==0:log('Integrated native CT slab',stop,'/',SHAPE[0])
assert total==967429317,total
save(D/'native-mask.json',{'schema':'exact-native-mask-v1','native_shape_zyx':list(SHAPE),'native_spacing_mm':SPACING,'scanner_origin_xyz_mm':ORIGIN.tolist(),'material_voxels':total,'selected_material_domain_changed':False,'slabs':slabs})
log('Exact native mask retained; creating 144-um artistic intensity derivatives')
gray=np.clip((density-WLO)/(WHI-WLO),0,1).astype('f4');gray[fraction==0]=0
med=ndimage.median_filter(gray,size=3,mode='nearest')
weight=ndimage.gaussian_filter(fraction,sigma=.65,mode='nearest')
gauss=ndimage.gaussian_filter(gray*fraction,sigma=.65,mode='nearest')/np.maximum(weight,1e-8)
proposal=np.where(fraction>.98,.7*med+.3*gauss,gauss)
basic=gray+np.clip(proposal-gray,-CAP,CAP);basic[fraction==0]=0
assert np.max(abs(basic-gray))<=CAP+1e-6

offsets=np.array([(z,y,x)for z in [-1,0,1]for y in [-1,0,1]for x in [-1,0,1]],dtype='i8')
padded=np.pad(gray,1,mode='edge')
def patches(centres):
 q=centres[:,None,:]+offsets[None]+1
 return padded[q[:,:,0],q[:,:,1],q[:,:,2]].astype('f8')
rng=np.random.default_rng(SEED);valid=np.flatnonzero(fraction.ravel()>.1)
sample=rng.choice(valid,size=min(48000,len(valid)),replace=False);centres=np.array(np.unravel_index(sample,gray.shape)).T
spatial=((centres[:,0]//4)*73856093)^((centres[:,1]//4)*19349663)^((centres[:,2]//4)*83492791)
hold=spatial%5==0;X=patches(centres);train=X[~hold];test=X[hold];K=4;Q=4;dim=27
assert len(test)>2000
def posterior(x,mu,C,pi):
 ll=[]
 for k in range(len(pi)):
  d=x-mu[k];sign,ld=np.linalg.slogdet(C[k]);assert sign>0
  inv=np.linalg.inv(C[k]);ll.append(np.log(pi[k])-.5*(dim*np.log(2*np.pi)+ld+np.einsum('ni,ni->n',d@inv,d)))
 a=np.array(ll).T;l=logsumexp(a,axis=1);return np.exp(a-l[:,None]),l
means,_=kmeans2(train,K,iter=12,minit='++',rng=np.random.default_rng(SEED));cov=np.repeat(np.cov(train,rowvar=False)[None],K,axis=0)+np.eye(dim)[None]*1e-5;weights=np.full(K,1/K);trace=[];noise=np.zeros(K)
for iteration in range(30):
 responsibility,ll=posterior(train,means,cov,weights);trace.append(float(ll.sum()));n=responsibility.sum(0);weights=n/n.sum();means=responsibility.T@train/n[:,None]
 for k in range(K):
  d=train-means[k];S=(d.T*responsibility[:,k])@d/n[k];e,U=np.linalg.eigh(S);sigma=max(float(e[:-Q].mean()),1e-8)
  W=U[:,-Q:]*np.sqrt(np.maximum(e[-Q:]-sigma,0));cov[k]=W@W.T+np.eye(dim)*sigma;noise[k]=sigma
 log('Patch-intensity MPPCA EM',iteration+1,'log likelihood',round(trace[-1],2))
 if iteration>5 and trace[-1]-trace[-2]<max(1,abs(trace[-2]))*2e-6:break
assert np.min(np.diff(trace))>-max(1,abs(trace[0]))*1e-6
_,heldout=posterior(test,means,cov,weights)
gain=[]
for k in range(K):gain.append(((cov[k]-np.eye(dim)*noise[k])@np.linalg.inv(cov[k]))[:,13])
gain=np.array(gain)
# Orthogonal known-Gaussian check of the posterior centre estimator.
U,_=np.linalg.qr(rng.normal(size=(27,4)));W=U*np.array([.4,.3,.2,.1]);sigma=.025
latent=rng.normal(size=(12000,4))@W.T;observed=latent+rng.normal(scale=sigma,size=latent.shape);C=W@W.T+sigma**2*np.eye(27);A=(W@W.T)@np.linalg.inv(C)
estimated=observed@A.T;raw_mse=float(np.mean((observed[:,13]-latent[:,13])**2));posterior_mse=float(np.mean((estimated[:,13]-latent[:,13])**2));assert posterior_mse<raw_mse*.6
filtered=gray.copy();retained_sum=0.;retained_min=1.;visited=0
for first in range(0,len(valid),8192):
 ids=valid[first:first+8192];xyz=np.array(np.unravel_index(ids,gray.shape)).T;xx=patches(xyz);r,_=posterior(xx,means,cov,weights)
 top=np.argpartition(r,-2,axis=1)[:,-2:];sparse=np.zeros_like(r);np.put_along_axis(sparse,top,np.take_along_axis(r,top,axis=1),axis=1);mass=sparse.sum(1);sparse/=mass[:,None]
 prediction=np.zeros(len(ids))
 for k in range(K):prediction+=(means[k,13]+(xx-means[k])@gain[k])*sparse[:,k]
 original=gray.ravel()[ids];filtered.ravel()[ids]=original+np.clip(prediction-original,-CAP,CAP)
 retained_sum+=float(mass.sum());retained_min=min(retained_min,float(mass.min()));visited+=len(ids)
 if first%262144==0:log('Masked MPPCA display reconstruction',first,'/',len(valid))
filtered[fraction==0]=0;assert np.isfinite(filtered).all() and np.max(abs(filtered-gray))<=CAP+1e-6
assert np.count_nonzero(filtered[fraction==0])==0
np.savez_compressed(D/'MPPCA_intensity_patch_model.npz',mixture_means=means,mixture_covariances=cov,mixture_weights=weights,isotropic_residual_variances=noise,posterior_centre_gain=gain,training_log_likelihood=np.array(trace),sample_centres_zyx=centres,spatial_holdout=hold)
rgba=np.stack([gray,basic,filtered,fraction],axis=-1);rgba=np.rint(np.clip(rgba,0,1)*255).astype('u1')
volrec=packed('masked-ct-display.bin.gz',{'schema':'masked-ct-art-display-v1','shape_zyx':list(gray.shape),'channels':['raw_masked_intensity','basic_filter','conditional_MPPCA','material_fraction'],'display_spacing_mm':SPACING*8,'source_edge_origin_xyz_mm':(ORIGIN-SPACING/2).tolist()},[('rgba',rgba)])
volume={'schema':'masked-ct-art-display-v1','shape_xyz':[nx,ny,nz],'source_edge_origin_xyz_mm':(ORIGIN-SPACING/2).tolist(),'display_spacing_mm':SPACING*8,'native_sampling_mm':SPACING,'source_voxels_integrated':int(np.prod(SHAPE)),'selected_material_voxels':total,'file':volrec,'source_gray_window':[WLO,WHI],'display_only':True,'native_geometry_changed':False,'native_mask_changed':False}
save(D/'display-volume.json',volume)
inside=fraction>.98
def metric(a):
 delta=a[inside]-gray[inside];high=a-ndimage.gaussian_filter(a,.65)
 return {'difference_from_raw_RMS_gray_levels':float(np.sqrt(np.mean(delta**2))*255),'absolute_difference_Q95_gray_levels':float(np.quantile(abs(delta),.95)*255),'display_high_frequency_RMS_gray_levels':float(np.sqrt(np.mean(high[inside]**2))*255),'maximum_change_gray_levels':float(np.max(abs(a-gray))*255)}
record={'status':'completed','native_material_voxels':total,'all_native_mask_voxels_retained':True,'display_shape_zyx':list(gray.shape),'native_spacing_um':18,'artistic_display_spacing_um':144,'native_mask_slabs':len(slabs),'filters':{'basic':'mask-aware median 3x3x3 and normalized Gaussian sigma 0.65 display voxel; no mask edit','MPPCA':{'observed_dimensions':27,'latent_dimensions':Q,'mixtures':K,'responsibility_sparsity':'top two components at inference','training_patches':len(train),'heldout_spatial_patches':len(test),'seed':SEED,'EM_log_likelihood':trace,'heldout_mean_log_likelihood':float(heldout.mean()),'posterior_mass_retained_mean':retained_sum/visited,'posterior_mass_retained_minimum':retained_min,'reconstructed_display_cells':visited}},'metrics':{'raw':metric(gray),'basic':metric(basic),'MPPCA':metric(filtered)},'checks':{'finite_output':True,'unchanged_native_mask':True,'bounded_change_gray_levels':12,'known_Gaussian_centre_estimator':{'raw_MSE':raw_mse,'posterior_MSE':posterior_mse}},'non_claims':['No new acquired resolution or 1um accuracy','No anatomical identification of voids','No full native-volume FEM','MPPCA isotropic residual is not scanner-calibrated noise','Display residual is not a measured error against anatomical ground truth']}
save(RUN/'result.json',record)
log('NATIVE MASK AND DISPLAY FILTERS COMPLETE')
