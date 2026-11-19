export const TOOTH_LO=253167.0947190341,TOOTH_HI=250522132.6467093,DEFAULT_THRESHOLD=33072067.260742188;
export function fieldColour(v,palette,{mode='log',min=TOOTH_LO,max=TOOTH_HI,threshold=DEFAULT_THRESHOLD}={}){
 if(!Number.isFinite(v)||v<0)return[148,159,169];
 const q=mode==='linear'?Math.max(0,Math.min(1,(v-min)/(max-min))):Math.max(0,Math.min(1,(Math.log(Math.max(v,min))-Math.log(min))/(Math.log(max)-Math.log(min))));
 if(mode==='linear'){const x=q*255,i=Math.min(254,Math.floor(x)),f=x-i;return palette[i].map((v,k)=>v+(palette[i+1][k]-v)*f);}
 if(mode!=='wash')return palette[Math.round(q*255)];
 const mix=(a,b,q)=>a.map((x,i)=>x+(b[i]-x)*Math.max(0,Math.min(1,q)));
 if(v<threshold)return mix([28,49,78],[51,116,144],(v-min)/Math.max(1e-30,threshold-min));const t=Math.max(0,Math.min(1,(v-threshold)/(max-threshold)));return t<.45?mix([108,231,211],[191,235,195],t/.45):mix([191,235,195],[246,220,155],(t-.45)/.55);
}
export function gradient(palette,settings){return 'linear-gradient(90deg,'+Array.from({length:128},(_,i)=>{const q=i/127,v=settings.mode==='linear'?settings.min+q*(settings.max-settings.min):Math.exp(Math.log(settings.min)+q*Math.log(settings.max/settings.min));return 'rgb('+fieldColour(v,palette,settings).map(Math.round).join(',')+') '+q*100+'%';}).join(',')+')';}
