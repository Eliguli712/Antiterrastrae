// Pure, auditable feature transforms. Missing values stay null throughout.
export const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function minmax(v,lo,hi){return !finite(v)||!finite(lo)||!finite(hi)?null:lo===hi?.5:(v-lo)/(hi-lo)}
export function standardize(value,values,method='reference'){
 if(!finite(value))return null;
 const v=values.filter(finite);if(!v.length)return null;
 if(method==='reference')return value;
 if(method==='minmax')return minmax(value,Math.min(...v),Math.max(...v));
 if(method==='rank'){if(v.length===1)return .5;const below=v.filter(n=>n<value).length,equal=v.filter(n=>n===value).length;return(below+(equal-1)/2)/(v.length-1)}
 throw Error('Unknown normalisation');
}
export function makeRows(data,curation){
 const functions=[...new Set(data.pairs.flatMap(p=>[p.geo.function,p.history.function]))],map=new Map(curation.nodes.map(n=>[n.eventId,n])),hy=data.pairs.map(p=>p.history.year),lo=Math.min(...hy),hi=Math.max(...hy),ns=data.pairs.flatMap(p=>[p.geo.sources.length,p.history.sources.length]),nmax=Math.max(...ns);
 const rows=[];
 data.pairs.forEach((p,i)=>{for(const side of['geo','history']){const e=p[side],node=side==='geo'?map.get(e.id):null,values={time:side==='geo'?minmax(66-(e.older+e.younger)/2,0,66-5.333):minmax(e.year,lo,hi),order:i/(data.pairs.length-1),sources:minmax(e.sources.length,0,nmax)};
 for(let j=0;j<functions.length;j++)values['fn'+j]=e.function===functions[j]?1:0;
 for(const f of curation.features)values[f.id]=node?.values[f.id]??null;
 rows.push({key:e.id,pairId:p.id,side,event:e,index:i,values,node,sourceMax:nmax,timeBounds:side==='geo'?[5.333,66]:[lo,hi]});
 }});return{rows,functions};
}
export function validScenario(x,features,parents){
 if(!x||typeof x!=='object'||!/^S\d{3,}$/.test(x.id)||typeof x.name!=='string'||!x.name.trim()||x.name.length>300||!finite(x.ageMa)||!parents.has(x.parentId)||typeof x.rationale!=='string'||!x.rationale.trim())return false;
 if(!x.values||typeof x.values!=='object')return false;
 return Object.entries(x.values).every(([k,v])=>features.has(k)&&(v===null||(finite(v)&&v>=0&&v<=1)));
}
export function validateWorkspace(x,eventIds,featureIds){
 if(!x||x.schema!=='cenozoic-workspace/1'||!Array.isArray(x.scenarios)||!Array.isArray(x.annotations)||x.scenarios.length>10000||x.annotations.length>100000)return false;
 const parents=new Set(eventIds),ids=new Set();
 // Topological import order makes cycles and missing parents impossible.
 for(const s of x.scenarios){if(ids.has(s.id)||!validScenario(s,featureIds,parents))return false;ids.add(s.id);parents.add(s.id)}
 return x.annotations.every(a=>eventIds.has(a.eventId)&&featureIds.has(a.featureId)&&(a.value===null||(finite(a.value)&&a.value>=0&&a.value<=1))&&typeof a.rationale==='string'&&a.rationale.trim().length>0);
}
export function extrapolate(rows,featureIds,ageMa,method='linear'){
 const out={};
 for(const id of featureIds){const samples=rows.filter(r=>finite(r.values[id])&&r.side==='geo').map(r=>({a:(r.event.older+r.event.younger)/2,v:r.values[id]})).sort((a,b)=>b.a-a.a),last=samples.at(-1);if(!last){out[id]=null;continue}const prev=[...samples].reverse().find(p=>p.a>last.a),dt=last.a-ageMa;
 if(!prev){out[id]=last.v;continue}const da=prev.a-last.a;
 if(method==='logistic'){const logit=v=>Math.log(Math.max(.02,Math.min(.98,v))/(1-Math.max(.02,Math.min(.98,v)))),slope=(logit(last.v)-logit(prev.v))/da;out[id]=1/(1+Math.exp(-Math.max(-700,Math.min(700,logit(last.v)+slope*dt))))}
 else out[id]=Math.max(0,Math.min(1,last.v+(last.v-prev.v)/da*dt));
 }return out;
}
