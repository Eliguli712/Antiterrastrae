export const mid=e=>(e.older+e.younger)/2;
export const fixed=(a,b=0)=>b+100*(66-a);
export const epoch=a=>a>=56?'古新世':a>=33.9?'始新世':a>=23.03?'渐新世':'中新世';
export const stage=a=>a>=56?0:a>=41.03?1:a>=33.9?2:a>=23.03?3:4;
export const yearLabel=y=>{const n=Math.round(y);return n<=0?`前${1-n}年`:`${n}年`};
export function linear(k,x){if(x<=k[0].x)return k[0].y;if(x>=k.at(-1).x)return k.at(-1).y;let i=0;while(k[i+1].x<x)i++;const a=k[i],b=k[i+1];return a.y+(x-a.x)*(b.y-a.y)/(b.x-a.x)}
export function pchip(k,x){
 const n=k.length;if(n<3)return linear(k,x);const h=[],d=[],m=[];
 for(let i=0;i<n-1;i++){h[i]=k[i+1].x-k[i].x;d[i]=(k[i+1].y-k[i].y)/h[i]}
 const end=(a,b,u,v)=>{let s=((2*a+b)*u-a*v)/(a+b);if(Math.sign(s)!==Math.sign(u))s=0;else if(Math.sign(u)!==Math.sign(v)&&Math.abs(s)>3*Math.abs(u))s=3*u;return s};
 m[0]=end(h[0],h[1],d[0],d[1]);m[n-1]=end(h[n-2],h[n-3],d[n-2],d[n-3]);
 for(let i=1;i<n-1;i++){if(d[i-1]*d[i]<=0)m[i]=0;else{const a=2*h[i]+h[i-1],b=h[i]+2*h[i-1];m[i]=(a+b)/(a/d[i-1]+b/d[i])}}
 if(x<=k[0].x)return k[0].y;if(x>=k.at(-1).x)return k.at(-1).y;let i=0;while(k[i+1].x<x)i++;
 const t=(x-k[i].x)/h[i],t2=t*t,t3=t2*t;return(2*t3-3*t2+1)*k[i].y+(t3-2*t2+t)*h[i]*m[i]+(-2*t3+3*t2)*k[i+1].y+(t3-t2)*h[i]*m[i+1];
}
export function knotsFor(ps){const ids=[0,...[56,41.03,33.9,23.03,15.98].map(a=>ps.reduce((j,p,i)=>Math.abs(mid(p.geo)-a)<Math.abs(mid(ps[j].geo)-a)?i:j,0)),ps.length-1].sort((a,b)=>a-b);const k=[];for(const i of new Set(ids)){const p=ps[i],q={x:66-mid(p.geo),y:p.history.year,id:p.id};if(!k.length||q.x>k.at(-1).x)k.push(q)}return k}
export function rankKnots(ps){const g=new Map();for(const p of ps){const x=66-mid(p.geo);if(!g.has(x))g.set(x,[]);g.get(x).push(p.history.year)}return [...g].map(([x,ys])=>({x,y:ys.reduce((a,b)=>a+b,0)/ys.length}))}
export function projection(ps,m,a,b){if(m==='fixed')return fixed(a,b);const k=m==='rank'?rankKnots(ps):knotsFor(ps);return m==='pchip'?pchip(k,66-a):linear(k,66-a)}
export function topology(ps,targets={}){const lookup=new Map(ps.map((p,i)=>[p.history.id,i])),ix=ps.map(p=>lookup.get(targets[p.id]||p.history.id));let inversions=0,strict=0,violations=0;for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){if(ix[i]>ix[j])inversions++;if(ps[i].geo.younger>ps[j].geo.older){strict++;if(ix[i]>ix[j])violations++}}return{inversions,strict,violations,uniqueTargets:new Set(ix).size}}
