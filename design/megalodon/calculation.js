// N, mm, MPa. Linear 3D Timoshenko beam screening, not solid contact FEA.
export const defaults={mass:300,loadFactor:3,E:2750,nu:.38,eta:.5,diameter:6.4,eccX:0,eccY:0,density:1.18,Kt:2};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a));
export function section(d){return {A:Math.PI*d*d/4,I:Math.PI*d**4/64,J:Math.PI*d**4/32,c:d/2,kappa:.9}}
export function localK(L,d,E,G){
 const {A,I,J,kappa}=section(d),K=Array.from({length:12},()=>new Float64Array(12));
 const put=(ids,vals,scale=1)=>ids.forEach((a,i)=>ids.forEach((b,j)=>K[a][b]+=vals[i][j]*scale));
 put([0,6],[[1,-1],[-1,1]],E*A/L);put([3,9],[[1,-1],[-1,1]],G*J/L);
 const ph=12*E*I/(kappa*G*A*L*L),c=E*I/(L**3*(1+ph)),A4=(4+ph)*L*L,A2=(2-ph)*L*L;
 put([1,5,7,11],[[12,6*L,-12,6*L],[6*L,A4,-6*L,A2],[-12,-6*L,12,-6*L],[6*L,A2,-6*L,A4]],c);
 put([2,4,8,10],[[12,-6*L,-12,-6*L],[-6*L,A4,6*L,A2],[-12,6*L,12,6*L],[-6*L,A2,6*L,A4]],c);return K;
}
export function cholesky(A,b){
 const n=b.length,L=Array.from({length:n},()=>new Float64Array(n));
 for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let s=A[i][j];for(let k=0;k<j;k++)s-=L[i][k]*L[j][k];if(i===j){if(!(s>1e-12))throw Error('Constraint matrix is not positive definite');L[i][j]=Math.sqrt(s)}else L[i][j]=s/L[j][j]}
 const y=new Float64Array(n),x=new Float64Array(n);for(let i=0;i<n;i++){let s=b[i];for(let j=0;j<i;j++)s-=L[i][j]*y[j];y[i]=s/L[i][i]}for(let i=n-1;i>=0;i--){let s=y[i];for(let j=i+1;j<n;j++)s-=L[j][i]*x[j];x[i]=s/L[i][i]}return x;
}
export function calculate(model,input={}){
 const p={...defaults,...input},E=p.E*p.eta,G0=p.E/(2*(1+p.nu)),G=G0*p.eta,keys=Object.keys(model.nodes),index=Object.fromEntries(keys.map((n,i)=>[n,i])),n=6*keys.length;
 const K=Array.from({length:n},()=>new Float64Array(n)),elements=[];let deltaV=0,deltaMoment=[0,0,0];
 for(const [a,b] of model.edges){
  const aa=model.nodes[a],bb=model.nodes[b],ex=unit(sub(bb,aa)),ey=unit(cross(Math.abs(ex[2])<.95?[0,0,1]:[1,0,0],ex)),ez=cross(ex,ey),R=[ex,ey,ez],L=norm(sub(bb,aa)),k=localK(L,p.diameter,E,G),ids=[...Array.from({length:6},(_,j)=>6*index[a]+j),...Array.from({length:6},(_,j)=>6*index[b]+j)];
  const T=Array.from({length:12},()=>new Float64Array(12));for(let block=0;block<4;block++)for(let i=0;i<3;i++)for(let j=0;j<3;j++)T[3*block+i][3*block+j]=R[i][j];
  const kt=Array.from({length:12},()=>new Float64Array(12));for(let i=0;i<12;i++)for(let j=0;j<12;j++)for(let l=0;l<12;l++)kt[i][j]+=k[i][l]*T[l][j];
  for(let i=0;i<12;i++)for(let j=0;j<12;j++){let v=0;for(let l=0;l<12;l++)v+=T[l][i]*kt[l][j];K[ids[i]][ids[j]]+=v}
  elements.push({a,b,L,k,T,ids});const dv=Math.PI/4*(p.diameter**2-6.4**2)*L;deltaV+=dv;deltaMoment=add(deltaMoment,mul(mul(add(aa,bb),.5),dv));
 }
 const v0=model.resin_volume_ml*1000,V=v0+deltaV,resinCG=mul(add(mul(model.resin_center_of_mass_mm,v0),deltaMoment),1/V),mr=V/1000*p.density/1000,mh=model.hardware_mass_g/1000,mt=p.mass/1000,ct=add(model.tooth_center_of_mass_mm,[p.eccX,p.eccY,0]),ch=model.hardware_center_of_mass_mm,P=model.nodes.P;
 const wt=mt*9.81*p.loadFactor,wr=mr*9.81,wh=mh*9.81,F=new Float64Array(n),moment=add(add(cross(sub(ct,P),[0,0,-wt]),cross(sub(resinCG,P),[0,0,-wr])),cross(sub(ch,P),[0,0,-wh]));F[6*index.P+2]=-(wt+wr+wh);for(let j=0;j<3;j++)F[6*index.P+3+j]=moment[j];
 const fixed=new Set(model.feet.flatMap(x=>[0,1,2].map(j=>6*index[x]+j))),free=Array.from({length:n},(_,i)=>i).filter(i=>!fixed.has(i)),U=new Float64Array(n),uf=cholesky(free.map(i=>free.map(j=>K[i][j])),free.map(i=>F[i]));free.forEach((i,j)=>U[i]=uf[j]);
 const reaction=K.map((row,i)=>row.reduce((s,k,j)=>s+k*U[j],0)-F[i]),sec=section(p.diameter);let maxStress=0,maxShear=0;
 const members=elements.map(e=>{let ul=e.T.map(row=>row.reduce((s,v,j)=>s+v*U[e.ids[j]],0)),q=e.k.map(row=>row.reduce((s,v,j)=>s+v*ul[j],0)),stress=0,shear=0,bending=0;
  for(let j of [0,6]){let bend=(Math.abs(q[j+4])+Math.abs(q[j+5]))*sec.c/sec.I,sig=Math.abs(q[j])/sec.A+bend,tau=1.5*Math.hypot(q[j+1],q[j+2])/sec.A+Math.abs(q[j+3])*sec.c/sec.J;stress=Math.max(stress,p.Kt*Math.sqrt(sig*sig+3*tau*tau));shear=Math.max(shear,tau);bending=Math.max(bending,bend)}
  maxStress=Math.max(maxStress,stress);maxShear=Math.max(maxShear,shear);return {a:e.a,b:e.b,stress,shear,bending,forces:q,L:e.L};});
 const cg=mul(add(add(mul(ct,mt),mul(resinCG,mr)),mul(ch,mh)),1/(mt+mr+mh)),margin=(26-Math.abs(cg[0])-Math.abs(cg[1]))/Math.SQRT2,footReactions=model.feet.map(n=>({name:n,Fz:reaction[6*index[n]+2],Fx:reaction[6*index[n]],Fy:reaction[6*index[n]+1]}));
 const armL=Math.max(...model.rear_arm_tip_mm.map(q=>norm(sub(q,model.rear_spine_mm)))),armD=model.rear_arm_diameter_mm,armSec=section(armD),armF=(wt+wr+wh)/2,armShear=armF*armL/(.9*G*armSec.A),armBending=armF*armL**3/(3*E*armSec.I);
 const nodal=Object.fromEntries(keys.map((k,i)=>[k,Array.from(U.slice(6*i,6*i+6))])),up=nodal.P.slice(0,3),residual=Math.hypot(...free.map(i=>reaction[i]))/Math.max(1,Math.hypot(...F));
 return {parameters:p,Eeffective:E,Greference:G0,Geffective:G,volumeML:V/1000,resinMassG:mr*1000,resinCG,toothForce:wt,totalForce:wt+wr+wh,Pdisplacement:norm(up),Pvector:up,members,maxStress,maxShear,nodal,footReactions,contactValid:footReactions.every(r=>r.Fz>=-1e-7),centerOfMass:cg,supportMargin:margin,tiltAngle:Math.atan2(margin,cg[2])*180/Math.PI,staticallyInside:margin>0,armLength:armL,armShear,armBending,armTotal:armShear+armBending,armStress:p.Kt*armF*armL*armSec.c/armSec.I,residual};
}
