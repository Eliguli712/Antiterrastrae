export const lang=new URLSearchParams(location.search).get('lang')==='de'?'de':'en';
export const t=(en,de)=>lang==='de'?de:en;
export const label=o=>typeof o==='object'&&o!==null?(o[lang]??o.en):o;
export const fmt=(n,d=1)=>Number(n).toLocaleString(lang==='de'?'de-DE':'en-GB',{maximumFractionDigits:d});
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const epochLabel=k=>({'古新世':t('Paleocene','Paläozän'),'始新世':t('Eocene','Eozän'),'渐新世':t('Oligocene','Oligozän'),'中新世':t('Miocene','Miozän')}[k]||k);
export const habitatLabel=k=>({'海洋':t('Marine','Marin'),'陆地':t('Terrestrial','Terrestrisch'),'全球':t('Global','Global')}[k]||k);
export const functionLabels={'复苏':t('Recovery','Erholung'),'创新':t('Innovation','Innovation'),'扩张':t('Expansion','Expansion'),'分化':t('Diversification','Diversifizierung'),'转型':t('Transformation','Transformation'),'危机':t('Crisis','Krise'),'网络':t('Network','Vernetzung'),'重组':t('Reorganisation','Neuordnung'),'共存':t('Coexistence','Koexistenz'),'继承':t('Inheritance','Fortführung')};
export const year=y=>{const n=Math.round(y);return n<=0?`${fmt(1-n,0)} ${t('BCE','v. Chr.')}`:`${fmt(n,0)} ${t('CE','n. Chr.')}`};
export function download(name,body,type='application/json;charset=utf-8'){const u=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}
