#!/usr/bin/env python3
"""Independent small-strain per-size FEM and fixed-ROI tip convergence.

The exact archived L0 polyhedral solid is recalibrated to 18 um in Z.
It is a closed-solid computational proxy, not the 74M CT void geometry.
Each size and refinement assembles K and F and solves again. No saved
displacement or stress field is used as a numerical answer.
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('OMP_NUM_THREADS', '2')
import sys, json, hashlib, time, gc, argparse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'fem-deps'))
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
from scipy.sparse.linalg import cg
from scipy.spatial import cKDTree
from skfem import MeshTet
import pyamg

ROOT = Path(__file__).resolve().parents[1]
IN = ROOT / 'fem-inputs'
OUT = Path(__file__).resolve().parent
LAM, MU, PRESSURE = 29000., 28500., 1.  # N, mm, MPa
NATIVE_TRIANGLES = 74293846

def savejson(path, obj):
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False, allow_nan=False) + '\n')

def sha(path):
    return hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()

def qweighted(values, weights, q):
    ix = np.argsort(values)
    cdf = np.cumsum(weights[ix])
    j = np.searchsorted(cdf, q * cdf[-1], side='left')
    return float(values[ix[min(j, len(ix)-1)]])

def tetgeometry(p, t):
    v = p[t]
    edges = np.transpose(v[:,1:]-v[:,:1], (0,2,1))
    det = np.linalg.det(edges)
    vol = abs(det)/6.
    inv = np.linalg.inv(edges)
    grads = np.empty((len(t),4,3))
    grads[:,1:] = inv
    grads[:,0] = -inv.sum(1)
    return vol, grads

def boundary(mesh):
    ix = mesh.boundary_facets()
    f = mesh.facets[:,ix].T.copy()
    cell = mesh.f2t[0,ix]
    p = mesh.p.T
    v = p[f]
    cross = np.cross(v[:,1]-v[:,0], v[:,2]-v[:,0])
    inward = np.einsum('ni,ni->n',cross,p[mesh.t[:,cell].T].mean(1)-v.mean(1)) > 0
    f[inward] = f[inward][:,[0,2,1]]
    return f

class Locator:
    """Containment-checked lookup in the unchanged L0 tetrahedral domain."""
    def __init__(self,p,t):
        self.p,self.t=p,t
        self.origin=p[t[:,0]]
        self.inv=np.linalg.inv(np.transpose(p[t[:,1:]]-self.origin[:,None],(0,2,1)))
        self.tree=cKDTree(p[t].mean(1))
    def __call__(self,points):
        ids=np.full(len(points),-1,np.int32)
        for k in [16,64,256,1024]:
            todo=np.flatnonzero(ids<0)
            if not len(todo):break
            for start in range(0,len(todo),10000):
                take=todo[start:start+10000]
                cand=self.tree.query(points[take],k=min(k,len(self.t)),workers=2)[1]
                xyz=points[take,None]-self.origin[cand]
                b=np.einsum('nkij,nkj->nki',self.inv[cand],xyz)
                ok=(b.min(2)>=-2e-9)&(b.sum(2)<=1+2e-9)
                hit=ok.any(1)
                ids[take[hit]]=cand[hit,ok[hit].argmax(1)]
        if (ids<0).any():raise ValueError(f'{(ids<0).sum()} points outside L0 containment')
        return ids

class SurfaceLocator:
    def __init__(self,p,faces):
        v=p[faces]
        self.o=v[:,0]
        a=v[:,1]-v[:,0];b=v[:,2]-v[:,0]
        self.ab=np.stack([a,b],axis=2)
        self.pinv=np.linalg.pinv(self.ab)
        self.tree=cKDTree(v.mean(1))
    def __call__(self,points):
        ids=np.full(len(points),-1,np.int32)
        for k in [16,64,256]:
            todo=np.flatnonzero(ids<0)
            if not len(todo):break
            for start in range(0,len(todo),12000):
                take=todo[start:start+12000]
                cand=self.tree.query(points[take],k=k,workers=2)[1]
                delta=points[take,None]-self.o[cand]
                uv=np.einsum('nkij,nkj->nki',self.pinv[cand],delta)
                err=np.linalg.norm(delta-np.einsum('nkij,nkj->nki',self.ab[cand],uv),axis=2)
                ok=(err<2e-7)&(uv.min(2)>=-2e-7)&(uv.sum(2)<=1+2e-7)
                hit=ok.any(1)
                ids[take[hit]]=cand[hit,ok[hit].argmax(1)]
        if (ids<0).any():raise ValueError(f'{(ids<0).sum()} exterior points missing L0 planar containment')
        return ids

def inputs():
    b=np.load(IN/'solution.npz');q=np.load(IN/'qf_solution.npz')
    p=b['points_m']*np.array([1000,1000,1125])
    t=b['tets'].astype(np.int32)
    basis=q['basis'];center=q['center_m']*1000
    assert np.max(abs(p-q['points_m'][:len(p)]*1000))<1e-10
    mesh=MeshTet(p.T,t.T,sort_t=False)
    faces=boundary(mesh)
    surf=SurfaceLocator(p,faces)
    fine_load=q['boundary_faces'][q['loaded_face_indices']]
    loadparents=np.unique(surf(q['points_m'][fine_load].mean(1)*1000))
    loadmask=np.zeros(len(faces),bool);loadmask[loadparents]=True
    reg=np.load(IN/'qf_region_masks.npz')
    regions={k:np.unique(q['parent_L0'][reg[k]]).astype(np.int32)for k in reg.files}
    principal=(p-center)@basis
    longmin=principal[:,1].min();longspan=np.ptp(principal[:,1])
    s=(principal[:,1]-longmin)/longspan
    caps={side:float(s[principal[:,0]*side>=0].max())for side in [-1,1]}
    pf=q['points_m']*1000;xx=(pf-center)@basis;ss=(xx[:,1]-longmin)/longspan
    fix=np.zeros(len(pf),bool)
    for side,end in caps.items():fix|=(xx[:,0]*side>=0)&(ss>=.8)&(ss>=end-.04)
    assert np.array_equal(np.flatnonzero(fix),q['fixed_node_indices'])
    area=np.linalg.norm(np.cross(p[faces[loadmask,1]]-p[faces[loadmask,0]],p[faces[loadmask,2]]-p[faces[loadmask,0]]),axis=1).sum()/2
    assert abs(area-483.286722)<1e-5,area
    return p,t,mesh,faces,surf,loadmask,regions,basis,center,longmin,longspan,caps

def rigid_candidates(p):
    p=(p-p.mean(0))/max(np.ptp(p,axis=0))
    B=np.zeros((3*len(p),6))
    for i in range(3):B[i::3,i]=1
    B[1::3,3]=-p[:,2];B[2::3,3]=p[:,1]
    B[0::3,4]=p[:,2];B[2::3,4]=-p[:,0]
    B[0::3,5]=-p[:,1];B[1::3,5]=p[:,0]
    return B

def solve(p,t,faces,loaded,fixed,previous=None):
    started=time.time()
    vols,grad=tetgeometry(p,t)
    assert (vols>0).all()
    # K_ai,bj = V [lambda ga_i gb_j + mu delta_ij ga.gb + mu ga_j gb_i]
    n=len(p);nd=3*n
    K=csr_matrix((nd,nd))
    for first in range(0,len(t),24000):
        tt=t[first:first+24000];gg=grad[first:first+24000];vv=vols[first:first+24000]
        dofs=(3*tt[:,:,None]+np.arange(3)[None,None,:]).reshape(len(tt),12)
        I=np.repeat(dofs,12,axis=1).ravel().astype(np.int32)
        J=np.tile(dofs,(1,12)).ravel().astype(np.int32)
        data=np.empty((len(tt),12,12))
        for a in range(4):
            for b in range(4):
                g1,g2=gg[:,a],gg[:,b]
                dot=(g1*g2).sum(1)
                block=LAM*g1[:,:,None]*g2[:,None,:]+MU*g2[:,:,None]*g1[:,None,:]
                block+=MU*dot[:,None,None]*np.eye(3)[None]
                data[:,3*a:3*a+3,3*b:3*b+3]=vv[:,None,None]*block
        K+=coo_matrix((data.ravel(),(I,J)),shape=(nd,nd)).tocsr()
        del I,J,data
    gc.collect()
    F=np.zeros((n,3))
    fv=p[faces[loaded]]
    av=np.cross(fv[:,1]-fv[:,0],fv[:,2]-fv[:,0])/2
    for a in range(3):np.add.at(F,faces[loaded,a],-PRESSURE*av/3)
    flat=F.ravel();D=(3*fixed[:,None]+np.arange(3)).ravel()
    free=np.ones(nd,bool);free[D]=False;fi=np.flatnonzero(free)
    A=K[fi][:,fi].tocsr();rhs=flat[fi]
    B=rigid_candidates(p)[fi]
    ml=pyamg.smoothed_aggregation_solver(A,B=B,symmetry='symmetric',strength='symmetric',aggregate='standard',max_coarse=150)
    hist=[]
    def callback(x):hist.append(1)
    ufree,info=cg(A,rhs,M=ml.aspreconditioner(),rtol=1e-10,atol=1e-11,maxiter=1200,callback=callback)
    assert info==0,f'CG exit {info}'
    u=np.zeros(nd);u[fi]=ufree
    residual=K@u-flat
    free_rel=float(np.linalg.norm(residual[fi])/np.linalg.norm(rhs))
    reaction=residual.reshape(-1,3)[fixed].sum(0)
    force=F.sum(0)
    eq=float(np.linalg.norm(reaction+force)/np.linalg.norm(force))
    uu=u.reshape(-1,3)
    gradu=np.einsum('eai,eaj->eij',uu[t],grad)
    strain=(gradu+gradu.transpose(0,2,1))/2
    sigma=2*MU*strain+LAM*np.trace(strain,axis1=1,axis2=2)[:,None,None]*np.eye(3)[None]
    dev=sigma-np.trace(sigma,axis1=1,axis2=2)[:,None,None]*np.eye(3)[None]/3
    vm=np.sqrt(1.5*np.einsum('eij,eij->e',dev,dev))
    local_energy=.5*vols*np.einsum('eij,eij->e',sigma,strain)
    energy=.5*u@(K@u)
    work=u@flat
    # Affine patch test on interior nodes and rigid-motion null space.
    affine=np.array([[.02,.003,-.001],[.004,-.01,.002],[.001,-.002,.006]])
    ua=(p@affine.T).ravel();ra=K@ua
    bnodes=np.unique(faces);interior=np.setdiff1d(np.arange(n),bnodes)
    patch=float(np.linalg.norm(ra.reshape(-1,3)[interior])/np.linalg.norm(ra))
    BB=rigid_candidates(p)
    rigid=float(np.linalg.norm(K@BB)/(np.linalg.norm(K.data)*np.linalg.norm(BB)))
    edgelength=np.max(np.stack([np.linalg.norm(p[t[:,a]]-p[t[:,b]],axis=1)for a in range(4)for b in range(a+1,4)]),axis=0)
    surfacearea=np.linalg.norm(np.cross(p[faces[:,1]]-p[faces[:,0]],p[faces[:,2]]-p[faces[:,0]]),axis=1).sum()/2
    metrics={'nodes':n,'tetrahedra':len(t),'free_dofs':len(fi),'solver':'CG / smoothed-aggregation AMG with six rigid-motion candidates','cg_iterations':len(hist),'relative_free_residual':free_rel,'force_balance_relative_error':eq,'applied_force_N':force.tolist(),'reaction_force_N':reaction.tolist(),'loaded_area_mm2':float(np.linalg.norm(av,axis=1).sum()),'pressure_MPa':PRESSURE,'max_displacement_mm':float(np.linalg.norm(uu,axis=1).max()),'strain_energy_N_mm':float(energy),'external_work_N_mm':float(work),'energy_identity_relative_error':float(abs(2*energy-work)/abs(work)),'affine_patch_relative_residual':patch,'rigid_motion_relative_residual':rigid,'proxy_volume_mm3':float(vols.sum()),'proxy_surface_area_mm2':float(surfacearea),'fixed_nodes':len(fixed),'loaded_faces':len(loaded),'max_element_edge_mm':float(edgelength.max()),'minimum_element_volume_mm3':float(vols.min()),'max_vm_MPa':float(vm.max()),'solve_wall_seconds':time.time()-started}
    assert free_rel<2e-9 and eq<2e-8 and patch<1e-8 and rigid<1e-12,metrics
    del K,A,ml,BB,B;gc.collect()
    return uu,vm,vols,local_energy,edgelength,metrics

def main():
    global IN,OUT
    ap=argparse.ArgumentParser();ap.add_argument('--size',type=int,choices=[50,100],required=True);ap.add_argument('--max-level',type=int,default=8)
    ap.add_argument('--inputs',type=Path,default=IN);ap.add_argument('--output',type=Path,default=OUT)
    ap.add_argument('--native-height-mm',type=float,default=51.63315333301228)
    args=ap.parse_args();IN=args.inputs.resolve();OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
    p0,t0,mesh,faces0,surf,patch0,regions,basis,center,longmin,longspan,caps=inputs()
    locator=Locator(p0,t0)
    native_longspan=args.native_height_mm
    factor=args.size/native_longspan
    history=[];streak=0
    print('START',args.size,'factor',factor,'proxy initial',len(t0),flush=True)
    for level in range(args.max_level+1):
        p=mesh.p.T.copy();t=mesh.t.T.copy()
        cent=p[t].mean(1);parents=locator(cent)
        tip=np.isin(parents,regions['Rtip'])
        faces=boundary(mesh);bfparents=surf(p[faces].mean(1));loaded=np.flatnonzero(patch0[bfparents])
        principal=(p-center)@basis;s=(principal[:,1]-longmin)/longspan
        fixed=np.zeros(len(p),bool)
        for side,end in caps.items():fixed|=(principal[:,0]*side>=0)&(s>=.8-1e-12)&(s>=end-.04-1e-12)
        fixed=np.flatnonzero(fixed)
        pp=p*factor
        print('ASSEMBLE',args.size,'level',level,'nodes',len(p),'tets',len(t),'tip',tip.sum(),flush=True)
        uu,vm,vol,energy,edge,metrics=solve(pp,t,faces,loaded,fixed)
        rois={}
        for name,parentset in regions.items():
            mask=np.isin(parents,parentset)
            rois[name]={'elements':int(mask.sum()),'volume_mm3':float(vol[mask].sum()),'Q90_MPa':qweighted(vm[mask],vol[mask],.9),'Q95_MPa':qweighted(vm[mask],vol[mask],.95),'Q99_MPa':qweighted(vm[mask],vol[mask],.99),'strain_energy_N_mm':float(energy[mask].sum())}
        metrics['level']=level;metrics['regions']=rois
        metrics['tip_max_edge_mm']=float(edge[tip].max())
        metrics['tip_median_edge_mm']=float(np.median(edge[tip]))
        expected=152.95249887179625*factor**3
        assert abs(rois['Rtip']['volume_mm3']/expected-1)<1e-9
        if history:
            prev=history[-1]['regions']['Rtip'];now=rois['Rtip']
            delta={k:100*abs(now[k]-prev[k])/abs(prev[k])for k in ['Q95_MPa','Q99_MPa','strain_energy_N_mm']}
            metrics['tip_last_step_change_percent']=delta
            passed=all(v<2 for v in delta.values())
            streak=streak+1 if passed else 0
        history.append(metrics)
        print('SOLVED',args.size,'level',level,'tip',rois['Rtip'],'changes',metrics.get('tip_last_step_change_percent'),'seconds',metrics['solve_wall_seconds'],flush=True)
        savejson(OUT/f'{args.size}mm-history.json',history)
        # Save latest true solution after every completed level for restartability.
        np.savez_compressed(OUT/f'{args.size}mm-solution.npz',points_m=pp/1000,tets=t.astype(np.int32),displacement_m=uu/1000,element_von_mises_Pa=vm*1e6,volumes_m3=vol/1e9,boundary_faces=faces.astype(np.int32),loaded_face_indices=loaded,fixed_node_indices=fixed,parent_L0=parents,tip_element_indices=np.flatnonzero(tip),basis=basis,center_m=center*factor/1000)
        if level>=3 and streak>=2:break
        if level==args.max_level:break
        # Refine frozen apical ROI and a surrounding buffer, preserving the whole domain.
        sc=(cent-center)@basis;ss=(sc[:,1]-longmin)/longspan
        # Both sizes use an absolute-mm edge target and are independently assembled.
        radius=.23 if args.size==50 else .255
        mark=(ss<radius)
        # Conforming longest-edge bisection (all nodes remain on the fixed proxy).
        mesh=mesh.refined(np.flatnonzero(mark).astype(np.int32))
        gc.collect()
    final=history[-1]
    finalp=mesh.p.T*factor;pr=(finalp-center*factor)@basis
    density=1.24  # explicit PLA nominal, only an illustrative physical mass
    summary={'schema':'independent-size-fem-v1','size_mm':args.size,'independent_matrix_assembly_and_solve':True,'stress_rescaling_used':False,'source_inputs':{n:sha(IN/n)for n in ['solution.npz','qf_solution.npz','qf_region_masks.npz']},'coordinate_calibration':'Original archived L0 points: X,Y retained; Z multiplied by 18/16 before size-specific domain construction.','size_definition':'Exact principal-longitudinal extent of the native74M CT surface; the separate solid proxy has a slightly different bound.','native_source_principal_height_mm':native_longspan,'linear_length_factor_from_calibrated_proxy':factor,'source_scanner_mm_to_solution_m':{'scale':factor/1000,'translation_m':[0,0,0],'input_frame':'Corrected18um scanner XYZ in mm; native CT coordinates already in this frame.'},'native_principal_longitudinal_extent_mm':args.size,'principal_longitudinal_extent_mm':float(np.ptp(pr[:,1])),'axis_aligned_bounds_mm':[finalp.min(0).tolist(),finalp.max(0).tolist()],'principal_extent_mm':np.ptp(pr,axis=0).tolist(),'constitutive':{'model':'Homogeneous isotropic small-strain linear elasticity','lambda_MPa':LAM,'mu_MPa':MU,'E_MPa':MU*(3*LAM+2*MU)/(LAM+MU),'nu':LAM/(2*(LAM+MU)),'property_status':'Assumed fossil-domain constants retained from existing pressure experiment; not measured specimen properties.'},'loads':{'pressure_MPa':PRESSURE,'patch':'Frozen original L0 crown-face patch inherited by checked planar/barycentric containment','support':'All three displacement components zero in bilateral geometric root-cap volumes','body_force':'omitted'},'tip_roi':{'definition':'Frozen union of 730 original calibrated L0 tetrahedra, inherited by containment-checked child centroid assignment.','reference_volume_mm3':152.95249887179625,'convergence_criterion':'Q95, Q99 and integrated strain energy each change by <2% on two consecutive local refinement steps; at least four solved meshes.','criterion_met':streak>=2,'consecutive_passes':streak,'scope':'Local h-convergence on unchanged polyhedral closed-solid proxy. No original CT serration reconstruction, contact convergence or pore-resolution claim.'},'display_geometry':{'native_surface_triangles':NATIVE_TRIANGLES,'relationship':'Separate unreduced CT surface for visualization and manufacturing. Stress may be projected onto it; it is not this tetrahedral solve domain.'},'mass_example':{'material':'PLA nominal density assumption only','density_g_cm3':density,'proxy_solid_volume_mm3':final['proxy_volume_mm3'],'proxy_mass_g':final['proxy_volume_mm3']/1000*density,'usage':'Calculated directly by integration on this size-specific FEM proxy. Native CT mesh volume and print infill mass must be computed separately.'},'final':final,'history':history,'limitations':['No measured fossil strength or material heterogeneity','Native CT internal voids are omitted by the fixed closed-solid mechanical proxy','Adaptive refinement preserves the archived coarse polyhedral surface; it cannot restore unrepresented serration anatomy','The 74M surface triangle count is not the FEM tetrahedron count','Reported h-convergence is conditional on the stated proxy, pressure patch, support and material model']}
    savejson(OUT/f'{args.size}mm-summary.json',summary)
    print('DONE',args.size,'converged',streak>=2,'levels',len(history),flush=True)

if __name__=='__main__':main()
