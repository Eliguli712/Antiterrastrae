import {mid,projection} from './models.js?v=20261120b';
import {t,lang,fmt,esc,year,download} from './i18n.js?v=20261120b';
import {fittedProjection} from './temporal-fit.js?v=20261125a';
import {domains,timeModels} from './time-plot.js?v=20261127b';

const $ = selector => document.querySelector(selector);
const colors = Object.fromEntries(timeModels.map(({id,color}) => [id,color]));
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
const coord = n => n.toFixed(2);
const segment = (x1,y1,x2,y2,cls) =>
  `<line x1="${coord(x1)}" y1="${coord(y1)}" x2="${coord(x2)}" y2="${coord(y2)}" class="${cls}"/>`;
const label = (x,y,value,cls='',anchor='start') =>
  `<text x="${coord(x)}" y="${coord(y)}" class="${cls}" text-anchor="${anchor}">${esc(value)}</text>`;

function extent(values,minSpan) {
  const min = Math.min(...values), max = Math.max(...values);
  const pad = Math.max(minSpan/2,(max-min)*.09);
  return [min-pad,max+pad];
}

// Use regular ticks in the actual units rather than distributing ordinal ranks.
function ticks(min,max,count) {
  const raw = (max-min)/(count-1);
  if (!(raw > 0)) return [min];
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1,2,2.5,5,10].map(n=>n*magnitude).find(n=>n>=raw);
  const first = Math.ceil(min/step)*step;
  const result = [];
  for (let i=0;i<=count && first+i*step<=max+step*1e-8;i++) {
    result.push(Number((first+i*step).toPrecision(12)));
  }
  return result.length>=2 ? result : [min,max];
}

// Tick labels use round civil years on both sides of the BCE/CE boundary.
// Their positions and all fitting still use astronomical years (0 = 1 BCE).
function historyTicks(min,max,count) {
  const civil = h => h<=0 ? h-1 : h;
  const values=ticks(civil(min),civil(max),count)
    .filter(n=>n!==0)
    .map(n=>n<0?n+1:n)
    .filter(n=>n>=min && n<=max);
  return values.length>=2 ? values : [min,max];
}

const axis = (min,max,left,right) => value => left+(value-min)/(max-min)*(right-left);
const signedYears = value => `${value>0?'+':value<0?'−':''}${fmt(Math.abs(value),1)} ${t('yr','J.')}`;
const historyCoordinate = n => year(n);

export function renderHorizontalTopology(s) {
  const pairs = s.pairs.slice(s.window,s.window+16);
  const pair = pairs.find(p=>p.id===s.topologyPair) ?? pairs[0];
  s.topologyPair = pair.id;
  const byHistory = new Map(s.pairs.map(p=>[p.history.id,p]));
  const theme = p => s.mode==='theme' ? byHistory.get(s.data.themeTargets[p.id]) : undefined;
  const themed = pairs.map(theme).filter(Boolean);
  const W=1060,L=70,R=990,geoY=94,histY=281;
  let oldest = Math.max(...pairs.map(p=>p.geo.older));
  let youngest = Math.min(...pairs.map(p=>p.geo.younger));
  if (oldest-youngest<.3) {
    oldest = Math.min(66,oldest+.15);
    youngest = Math.max(5.333,youngest-.15);
  }
  const [first,last] = extent(pairs.concat(themed).map(p=>p.history.year),20);
  const gx = axis(oldest,youngest,L,R);
  const hx = axis(first,last,L,R);
  const gap = (xa,ya,xb,yb,cls) => {
    const middle = (ya+yb)/2;
    return `<path d="M${coord(xa)},${ya} C${coord(xa)},${middle} ${coord(xb)},${middle} ${coord(xb)},${yb}" class="${cls}"/>`;
  };
  let rulers = label(L,24,t('Geological age (Ma) · older → younger','Geologisches Alter (Ma) · älter → jünger'),'chron-axis-title')
    + label(R,24,t('Source age intervals','Altersintervalle der Quellen'),'chron-axis-note','end')
    + label(L,348,t('Historical dates · BCE → CE','Historische Daten · v. Chr. → n. Chr.'),'chron-axis-title')
    + label(R,348,t('Independent scales','Eigenständige Skalen'),'chron-axis-note','end')
    + segment(L,geoY,R,geoY,'chron-ruler')
    + segment(L,histY,R,histY,'chron-ruler');
  for (const n of ticks(youngest,oldest,7)) {
    rulers += segment(gx(n),geoY-7,gx(n),geoY+7,'chron-ruler')
      + label(gx(n),65,fmt(n,3),'chron-tick','middle');
  }
  for (const n of historyTicks(first,last,7)) {
    rulers += segment(hx(n),histY-7,hx(n),histY+7,'chron-ruler')
      + label(hx(n),314,year(n),'chron-tick','middle');
  }
  let edges='',points='',focused='';
  for (const p of pairs) {
    const age=mid(p.geo), x=gx(age), y=hx(p.history.year);
    const selected=p===pair, q=theme(p);
    const mainPath=gap(x,geoY,y,histY,`chron-connector${selected?' is-selected':''}`);
    const themePath=q && q!==p
      ? gap(x,geoY,hx(q.history.year),histY,`chron-connector chron-thematic${selected?' is-selected':''}`)
        + `<path d="M${coord(hx(q.history.year))},${histY-4} l4,4 -4,4 -4,-4 z" class="chron-theme-point"><title>${esc(q.history.id+' · '+q.history.title)}</title></path>`
      : '';
    const info=`${p.id} · ${p.geo.title} (${fmt(age,3)} Ma) / ${p.history.title} (${p.history.displayDate})`;
    const point=`<g class="chron-pair-node${selected?' is-selected':''}" data-topology-pair="${esc(p.id)}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="${esc(info)}"><title>${esc(info)}</title>
      ${segment(gx(p.geo.older),geoY,gx(p.geo.younger),geoY,'chron-geology-interval')}
      <circle cx="${coord(x)}" cy="${geoY}" r="12" class="chron-hit"/>
      <circle cx="${coord(y)}" cy="${histY}" r="12" class="chron-hit"/>
      <circle cx="${coord(x)}" cy="${geoY}" r="${selected?5.8:4}" class="chron-geo-dot"/>
      <circle cx="${coord(y)}" cy="${histY}" r="${selected?5.8:4}" class="chron-history-dot"/></g>`;
    if (selected) focused=mainPath+themePath+point;
    else { edges+=mainPath+themePath; points+=point; }
  }
  const svg = $('#horizontal-topology-chart');
  svg.setAttribute('viewBox',`0 0 ${W} 368`);
  svg.innerHTML=rulers+edges+points+focused;
  const select=$('#topology-pair-select');
  if(select.dataset.window!==String(s.window)){
    select.innerHTML=pairs.map(p=>`<option value="${esc(p.id)}">${esc(p.id+' · '+p.geo.title)}</option>`).join('');
    select.dataset.window=s.window;
  }
  select.value=pair.id;
  const cross=theme(pair);
  $('#topology-pair-summary').innerHTML=`
    <div><small>${t('Geological age window','Geologisches Altersfenster')}</small><strong>${esc(pair.geo.title)}</strong>
    <span>${fmt(pair.geo.older,3)}–${fmt(pair.geo.younger,3)} Ma · ${t('midpoint','Mittelpunkt')} ${fmt(mid(pair.geo),3)} Ma</span></div>
    <div><small>${t('Paired historical date','Zugeordnetes historisches Datum')}</small><strong>${esc(pair.history.title)}</strong>
    <span>${esc(pair.history.displayDate||year(pair.history.year))}</span></div>
    ${cross? `<p class="chron-theme-note">${t('Creative link','Gestalterischer Querverweis')} · ${esc(cross.history.id+' · '+cross.history.title+' · '+cross.history.displayDate)}</p>`:''}`;
  $('#topology-open-record').dataset.goto=pair.id;
}

const fitsAt = (s,age) => ({
  linear:fittedProjection(s.fits,'linear',age),
  log:fittedProjection(s.fits,'log',age)
});
const series = [
  {id:'reference',short:()=>t('Pink','Rosa'),title: simulated=>simulated
    ? t('Pink trace · interpolated','Rosa Linie · interpoliert')
    : t('Pink reference · paired date','Rosa Referenz · zugeordnetes Datum')},
  {id:'linear',short:()=>t('Linear','Linear'),title:()=>t('Linear fit','Lineare Anpassung')},
  {id:'log',short:()=>t('Log','Log'),title:()=>t('Optimized logarithmic fit','Optimierte logarithmische Anpassung')}
];

function renderFitStrip(view) {
  const chart=$('#horizontal-fit-chart');
  const width=Math.max(282,Math.floor(chart.getBoundingClientRect().width));
  const small=width<480;
  const left=small?58:95, right=width-(small?35:49);
  const [lo,hi]=extent(series.map(({id})=>view[id]),8);
  const x=axis(lo,hi,left,right);
  const anchor=x(view.reference);
  chart.setAttribute('viewBox',`0 0 ${width} 174`);
  let lines=segment(left,132,right,132,'chron-fit-axis');
  for (const v of historyTicks(lo,hi,small?4:7)){
    lines+=segment(x(v),19,x(v),137,'chron-fit-grid')
      +label(x(v),152,historyCoordinate(v),'chron-fit-tick','middle');
  }
  lines+=label(right,172,t('Historical year','Historisches Jahr'),'chron-fit-axis-label','end');
  for (const i of [0,1,2]) {
    const y=28+i*42,{id,short}=series[i],loc=x(view[id]);
    lines+=segment(left,y,right,y,'chron-fit-lane')
      +label(7,y+4,short(),'chron-fit-lane-label');
    if(id!=='reference') {
      lines+=`<line x1="${coord(anchor)}" y1="${y}" x2="${coord(loc)}" y2="${y}" stroke="${colors[id]}" class="chron-fit-span"/>`;
    }
  }
  lines+=segment(anchor,14,anchor,126,'chron-fit-reference');
  for(const [i,{id,title}] of series.entries()){
    const y=28+i*42, loc=x(view[id]), name=title(view.simulated);
    lines+=`<circle cx="${coord(loc)}" cy="${y}" r="5.3" fill="${colors[id]}" class="chron-fit-dot">
      <title>${esc(name+' · '+historyCoordinate(view[id])+(id==='reference'?'':' · Δ '+signedYears(view.reference-view[id])))}</title></circle>`;
  }
  chart.innerHTML=lines;
  chart.setAttribute('aria-label',series.map(({id,title})=>title(view.simulated)+': '+historyCoordinate(view[id])).join('; '));
}

function displayedPairs(s) {
  const [older,younger]=domains[s.domain];
  return s.pairs.filter(p=>mid(p.geo)<=older && mid(p.geo)>=younger);
}

export function renderHorizontalFit(s,{keepAgeInput=false}={}) {
  const pairs=displayedPairs(s);
  const pair=pairs.find(p=>p.id===s.fitPair) ?? pairs[Math.floor(pairs.length/2)];
  const simulated=s.fitInput==='age';
  $('#fit-empty').hidden=Boolean(pair);
  $('#fit-content').hidden=!pair;
  if(!pair)return;
  s.fitPair=pair.id;
  const select=$('#fit-record');
  if(select.dataset.domain!==s.domain){
    select.innerHTML=pairs.map(p=>`<option value="${esc(p.id)}">${esc(p.id+' · '+p.geo.title)}</option>`).join('');
    select.dataset.domain=s.domain;
  }
  select.value=pair.id;
  $('#fit-record-controls').hidden=simulated;
  $('#fit-probe-controls').hidden=!simulated;
  for (const button of document.querySelectorAll('[data-fit-input]')){
    const active=s.fitInput===button.dataset.fitInput;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  const [old,young]=domains[s.domain];
  const min=Math.max(young,66-s.fits.maxX),max=Math.min(old,66-s.fits.minX);
  const age=simulated ? clamp(s.probeAge??mid(pair.geo),min,max) : mid(pair.geo);
  if(simulated){
    s.probeAge=age;
    for(const id of ['fit-probe-range','fit-probe-age']){
      const field=$('#'+id);
      field.min=Number(min.toFixed(6));
      field.max=Number(max.toFixed(6));
      if(id!=='fit-probe-age' || !keepAgeInput)field.value=Number(age.toFixed(6));
    }
  }
  const reference=simulated?projection(s.pairs,'rank',age):pair.history.year;
  const view={age,reference,simulated,...fitsAt(s,age)};
  s.fitView=view;
  $('#fit-target').textContent=simulated
    ? `${fmt(age,3)} Ma · ${t('Simulated input; pink value follows the catalogue interpolation.','Simulierte Eingabe; der rosa Wert folgt der Kataloginterpolation.')}`
    : `${pair.id} · ${fmt(age,3)} Ma · ${pair.history.title} · ${pair.history.displayDate}`;
  const open=$('#fit-open-record');
  open.hidden=simulated;
  open.dataset.goto=pair.id;
  $('#fit-marker-values').innerHTML=series.map(({id,title})=>{
    const value=id==='reference'&&!simulated ? (pair.history.displayDate||year(reference)) : '≈ '+year(view[id]);
    return `<div><span><i style="--series:${colors[id]}"></i>${title(simulated)}</span>
      <strong>${esc(value)}</strong>${id==='reference'
        ? `<small>${t('Horizontal coordinate:','Horizontale Koordinate:')} ${esc(historyCoordinate(reference))}</small>`
        : `<small>Δ ${signedYears(reference-view[id])}</small>`}</div>`;
  }).join('');
  for (const p of document.querySelectorAll('[data-fit-point]')) {
    p.setAttribute('aria-pressed',String(!simulated && p.dataset.fitPoint===pair.id));
  }
  renderFitStrip(view);
}

function fitCSV(s) {
  const columns=['kind','pair_id','science_id','history_id','older_ma','younger_ma','input_age_ma',
    'narrative_years_from_66_ma','pink_reference_astronomical_year','linear_astronomical_year',
    'log_astronomical_year','reference_minus_linear_yr','reference_minus_log_yr','catalogue_fit_count','log_tau_ma'];
  const row=(kind,p,age,ref)=> {
    const fit=fitsAt(s,age);
    const num=n=>Number(n.toFixed(8));
    return [kind,p?.id,p?.geo.id,p?.history.id,p?.geo.older,p?.geo.younger,num(age),num(100*(66-age)),
      num(ref),num(fit.linear),num(fit.log),num(ref-fit.linear),num(ref-fit.log),s.fits.count,num(s.fits.log.tau)];
  };
  const records=displayedPairs(s).map(p=>row('catalogue_pair',p,mid(p.geo),p.history.year));
  if (s.fitView?.simulated) records.push(row('simulated_age',null,s.fitView.age,s.fitView.reference));
  const raw=[columns,...records].map(cells=>cells.map(x=>x??'').join(',')).join('\r\n');
  download(`Cenozoic_horizontal_fits_${lang}.csv`,'\uFEFF'+raw,'text/csv;charset=utf-8');
}

export function bindHorizontalComparison(s,{graph,models}) {
  const selectFit=id=>{
    if (!displayedPairs(s).some(p=>p.id===id)) {
      s.domain='all';
      $('#model-domain').value='all';
      s.fitPair=id;
      s.fitInput='pair';
      models();
    } else {
      s.fitPair=id;
      s.fitInput='pair';
      renderHorizontalFit(s);
    }
  };
  const selectTopology=(id,origin)=>{
    s.topologyPair=id;
    renderHorizontalTopology(s);
    if(origin?.matches('[data-topology-pair]')) {
      $('#horizontal-topology-chart').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
    }
  };
  const showFit=id=>{
    selectFit(id);
    $('#horizontal-fit').scrollIntoView({block:'start'});
    $('#fit-record').focus({preventScroll:true});
  };
  const activate = e=>{
    if(e.type==='keydown' && !['Enter',' '].includes(e.key))return;
    const target=e.target.closest('[data-topology-pair],[data-fit-point]');
    if(!target)return;
    if(e.type==='keydown')e.preventDefault();
    if(target.dataset.topologyPair)selectTopology(target.dataset.topologyPair,target);
    else showFit(target.dataset.fitPoint);
  };
  document.addEventListener('click',activate);
  document.addEventListener('keydown',activate);
  for(const button of document.querySelectorAll('[data-topology-axis]')){
    button.addEventListener('click',()=>{s.topologyAxis=button.dataset.topologyAxis;graph();});
  }
  $('#topology-pair-select').addEventListener('change',e=>selectTopology(e.target.value));
  $('#compare-topology-fit').addEventListener('click',()=>showFit(s.topologyPair));
  $('#fit-record').addEventListener('change',e=>selectFit(e.target.value));
  for(const button of document.querySelectorAll('[data-fit-input]')){
    button.addEventListener('click',()=>{s.fitInput=button.dataset.fitInput;renderHorizontalFit(s);});
  }
  $('#fit-probe-range').addEventListener('input',e=>{
    s.probeAge=e.target.valueAsNumber;
    renderHorizontalFit(s);
  });
  const ageField=$('#fit-probe-age');
  const applyAge=keepAgeInput=>{
    const age=ageField.valueAsNumber;
    if(keepAgeInput && (!Number.isFinite(age)||age<Number(ageField.min)||age>Number(ageField.max)))return;
    if(Number.isFinite(age))s.probeAge=age;
    renderHorizontalFit(s,{keepAgeInput});
  };
  ageField.addEventListener('input',()=>applyAge(true));
  ageField.addEventListener('change',()=>applyAge(false));
  ageField.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();applyAge(false);}
  });
  $('#fit-export').addEventListener('click',()=>fitCSV(s));
  new ResizeObserver(()=>{if(s.fitView && !$('#fit-content').hidden)renderFitStrip(s.fitView);})
    .observe($('#horizontal-fit-chart'));
}
