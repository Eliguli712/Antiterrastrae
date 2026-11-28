import {mid,knotsFor,rankKnots,projection} from './models.js?v=20261120b';
import {t,fmt,esc,year} from './i18n.js?v=20261120b';
import {fittedProjection,inferredAge,residualMetrics} from './temporal-fit.js?v=20261125a';

export const timeModels = [
  {id:'reference',name:t('Paired dates','Gepaarte Datierungen'),desc:t('Pink reference from the catalogue','Rosafarbene Referenz aus dem Katalog'),color:'#b93f73',show:true},
  {id:'linear',name:t('Linear fit','Lineare Anpassung'),desc:t('Least squares in historical years','Kleinste Quadrate in historischen Jahren'),color:'#1a6383',show:true,dash:'8 5'},
  {id:'log',name:t('Optimized logarithmic fit','Optimierte logarithmische Anpassung'),desc:t('Positive timescale fitted to the same dates','Positive Zeitskala an dieselben Daten angepasst'),color:'#673a8c',show:true},
  {id:'fixed',name:t('Fixed 1∶10,000','Fest 1∶10.000'),desc:t('Original ratio and adjustable anchor','Ursprünglicher Maßstab und verstellbarer Anker'),color:'#658252',show:true,dash:'3 6'},
  {id:'piecewise',name:t('Piecewise linear','Stückweise linear'),desc:t('Shared phase anchors','Gemeinsame Phasenanker'),color:'#788850',dash:'8 4'},
  {id:'pchip',name:'PCHIP',desc:t('Monotone cubic interpolation','Monotone kubische Interpolation'),color:'#927c4a'},
  {id:'rank',name:t('Rank interpolation','Ranginterpolation'),desc:t('Equal ages averaged for the line','Gleiche Alter für die Linie gemittelt'),color:'#627f82',dash:'2 4'}
];

export const domains={all:[66,5.333],'古新世':[66,56],'始新世':[56,33.9],'渐新世':[33.9,23.03],'中新世':[23.03,5.333]};
const baselineLabels={
  fixed:t('Fixed ratio','Fester Maßstab'),
  linear:t('Linear fit','Lineare Anpassung'),
  log:t('Logarithmic fit','Logarithmische Anpassung')
};
const $ = selector => document.querySelector(selector);
const line = (x1,y1,x2,y2,attrs='class="svg-grid"') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`;
const label = (x,y,value,attrs='') => `<text x="${x}" y="${y}" class="svg-label" ${attrs}>${esc(value)}</text>`;
const path = (data,point) => data.map((record,i) => `${i?'L':'M'}${point(record).map(value=>value.toFixed(2)).join(',')}`).join(' ');
const sign = (n,digits=2) => n===null ? '—' : `${n>0?'+':''}${fmt(n,digits)}`;
const scale = (value,min,max) => (value-min)/(max-min);
const range = (start,end,count) => Array.from({length:count},(_,i) => start+(end-start)*i/(count-1));

function modelValue(s,id,age) {
  return id==='linear'||id==='log' ? fittedProjection(s.fits,id,age) : projection(s.pairs,id,age,s.offset);
}

function rowsFor(s,visible,older,younger) {
  return visible.map(pair=>{
    const age=mid(pair.geo);
    const history=pair.history.year;
    const predicted=modelValue(s,s.baseline,age);
    const modelAge=inferredAge(s.fits,s.baseline,history,s.offset,older,younger);
    return {pair,age,history,predicted,modelAge,yearOffset:history-predicted,ageOffset:modelAge===null?null:age-modelAge};
  });
}

function recordPoint(row,x,y,radius=3,comparison=null) {
  const {pair,age,history}=row;
  const coordinates=`${fmt(age,3)} Ma · ${year(history)}`;
  const attrs=comparison
    ? `data-fit-point="${esc(pair.id)}" aria-pressed="${pair.id===comparison.selected}"`
    : `data-goto="${esc(pair.id)}"`;
  const action=comparison ? t('Compare fits for ','Anpassungen vergleichen für ') : '';
  return `<circle ${attrs} class="chart-point temporal-reference-point" tabindex="0" role="button" aria-label="${esc(action+pair.geo.title+' · '+coordinates)}" cx="${x}" cy="${y}" r="${radius}"><title>${esc(pair.id+' · '+pair.geo.title+' / '+pair.history.title+' · '+coordinates)}</title></circle>`;
}

function mappingChart(s,visible,older,younger) {
  const W=900,H=490,L=95,R=38,T=44,B=73;
  const historicX=s.xAxis==='history';
  const curveModels=timeModels.filter(model=>model.id!=='reference'&&s.enabled.has(model.id));
  const sampleAges=range(older,younger,161);
  const curves=curveModels.map(model=>({model,points:sampleAges.map(age=>({age,history:modelValue(s,model.id,age)}))}));
  const years=[...visible.map(row=>row.history),...curves.flatMap(c=>c.points.map(point=>point.history))];
  if (!years.length) years.push(...s.pairs.map(pair=>pair.history.year));
  const pad=Math.max(6,(Math.max(...years)-Math.min(...years))*.06);
  const lo=Math.min(...years)-pad,hi=Math.max(...years)+pad;
  const aTicks=s.domain==='all'?[66,56,41.03,33.9,23.03,15.98,5.333]:range(older,younger,6);
  const hTicks=range(lo,hi,6);
  const pixels=(age,history)=>{
    const geologic=(older-age)/(older-younger),historic=scale(history,lo,hi);
    return [L+(historicX?historic:geologic)*(W-L-R),H-B-(historicX?geologic:historic)*(H-T-B)];
  };
  const horizontal=t('Geological age (Ma) · older → younger','Geologisches Alter (Ma) · älter → jünger');
  const historical=t('Historical year · BCE → CE','Historisches Jahr · v. Chr. → n. Chr.');
  const verticalAge=t('Geological age (Ma)','Geologisches Alter (Ma)');
  let markup='';
  for(const a of aTicks){
    const [x,y]=pixels(a,lo);
    markup+=historicX
      ?line(L,y,W-R,y)+label(L-9,y+4,fmt(a,2),'text-anchor="end"')
      :line(x,T,x,H-B)+label(x,H-B+24,fmt(a,2),'text-anchor="middle"');
  }
  for(const h of hTicks){
    const [x,y]=pixels(older,h);
    markup+=historicX
      ?line(x,T,x,H-B)+label(x,H-B+24,year(h),'text-anchor="middle"')
      :line(L,y,W-R,y)+label(L-9,y+4,year(h),'text-anchor="end"');
  }
  markup+=label(L,T-19,historicX?verticalAge:historical)
    +label(W-R,H-12,historicX?historical:horizontal,'text-anchor="end"');

  for(const row of visible){
    const {pair,age,history,predicted,modelAge}=row;
    markup+=line(...pixels(Math.min(older,pair.geo.older),history),
      ...pixels(Math.max(younger,pair.geo.younger),history),'class="temporal-age-range"');
    if(s.showOffsets){
      const other=historicX
        ?(predicted>=lo&&predicted<=hi ? pixels(age,predicted) : null)
        :(modelAge===null ? null : pixels(modelAge,history));
      if(other)markup+=line(...pixels(age,history),...other,'class="temporal-horizontal-gap"');
    }
  }
  if(s.enabled.has('reference')){
    const trace=rankKnots(s.pairs)
      .map(({x,y})=>({age:66-x,history:y}))
      .filter(({age})=>age<=older&&age>=younger);
    if(trace.length>1)markup+=`<path d="${path(trace,p=>pixels(p.age,p.history))}" fill="none" stroke="#b93f73" stroke-width="1.6" opacity=".8"/>`;
  }
  for(const {model,points} of curves){
    markup+=`<path d="${path(points,p=>pixels(p.age,p.history))}" fill="none" stroke="${model.color}" stroke-width="${model.id==='log'?2.9:2.2}" ${model.dash?`stroke-dasharray="${model.dash}"`:''}/>`;
  }
  if(s.enabled.has('piecewise')||s.enabled.has('pchip')){
    for(const k of knotsFor(s.pairs)){
      const age=66-k.x;
      if(age<=older&&age>=younger){
        const [x,y]=pixels(age,k.y);
        markup+=`<rect x="${x-2.5}" y="${y-2.5}" width="5" height="5" fill="#927c4a"/>`;
      }
    }
  }
  const comparison={selected:s.fitInput==='pair'?s.fitPair:null};
  for(const row of visible)markup+=recordPoint(row,...pixels(row.age,row.history),s.enabled.has('reference')?3:2,comparison);
  const chart=$('#model-chart');
  chart.innerHTML=markup;
  chart.setAttribute('aria-label',historicX
    ?t('Historical year on the horizontal axis, geological age on the vertical axis','Historisches Jahr auf der x-Achse, geologisches Alter auf der y-Achse')
    :t('Geological age on the horizontal axis, historical year on the vertical axis','Geologisches Alter auf der x-Achse, historisches Jahr auf der y-Achse'));
}

function comparisonInfo(s,visible) {
  const heading=t('Root-mean-square error in historical years within the selected window.','Wurzel des mittleren quadratischen Fehlers in historischen Jahren im gewählten Fenster.');
  $('#fit-scope').textContent=t(`${heading} Both curves are fitted to all ${s.fits.count} catalogue pairs.`,`${heading} Beide Kurven werden an alle ${s.fits.count} Katalogpaare angepasst.`);
  const cards=['linear','log'].map(id=>{
    const metric=residualMetrics(visible.map(({age,history})=>history-modelValue(s,id,age)));
    const name=baselineLabels[id];
    return `<div><b>${metric.rmse===null?'—':fmt(metric.rmse,1)} ${t('yr','J.')}</b><span>${name} · RMSE</span><small>${t('MAE','MAE')}: ${metric.mae===null?'—':fmt(metric.mae,1)} ${t('yr','J.')}</small></div>`;
  });
  const base=residualMetrics(visible.map(({age,history})=>history-modelValue(s,'fixed',age)));
  cards.push(`<div><b>${base.rmse===null?'—':fmt(base.rmse,1)} ${t('yr','J.')}</b><span>${baselineLabels.fixed} · RMSE</span><small>${t('Baseline for comparison','Vergleichsbasis')}</small></div>`);
  $('#model-stats').innerHTML=cards.join('');
  const {linear,log}=s.fits;
  $('#fit-math').innerHTML=`<p><strong>${t('Fitting the paired dates','Anpassung der gepaarten Daten')}</strong></p>
    <p>${t('Let x = 66 − age in Ma. For each model, the historical year h is fitted on the original year scale, including BCE dates. Each pair receives equal weight.','Sei x = 66 − Alter in Ma. In beiden Modellen wird das historische Jahr h auf der ursprünglichen Jahresskala angepasst, einschließlich der Daten vor Christus. Jedes Paar hat dasselbe Gewicht.')}</p>
    <ul><li><code>h = ${fmt(linear.intercept,2)} + ${fmt(linear.slope,2)} x</code></li>
    <li><code>h = ${fmt(log.intercept,2)} + ${fmt(log.slope,2)} ln(1 + x / ${fmt(log.tau,4)})</code></li></ul>
    <p>${t('The log timescale τ is optimized over positive values to minimize the squared historical-year error. The lines describe the curatorial pairing.','Die positive logarithmische Zeitskala τ minimiert den quadratischen Fehler in historischen Jahren. Die Linien beschreiben die kuratorische Zuordnung.')}</p>`;
}

function residualChart(s,rows,older,younger) {
  const historic=s.xAxis==='history';
  const key=historic?'ageOffset':'yearOffset';
  const values=rows.filter(r=>r[key]!==null);
  const bound=Math.max(historic ? 0.1 : 10,...values.map(r=>Math.abs(r[key])))*1.12;
  const years=rows.map(r=>r.history);
  const lo=years.length?Math.min(...years):-6000,hi=years.length?Math.max(...years):1600;
  const x=record=>72+1004*(historic?(hi===lo ? 0.5 : scale(record.history,lo,hi)):(older-record.age)/(older-younger));
  const y=value=>105-76*value/bound;
  let markup='';
  for(const offset of [-bound,0,bound]){
    markup+=line(72,y(offset),1076,y(offset))+label(63,y(offset)+4,sign(offset,historic?2:0),'text-anchor="end"');
  }
  for(const row of values){
    markup+=line(x(row),y(0),x(row),y(row[key]),'class="temporal-residual-line"')
      +recordPoint(row,x(row),y(row[key]),2.7);
  }
  for(const fraction of range(0,1,6)){
    const record={history:lo+(hi-lo)*fraction,age:older-(older-younger)*fraction};
    markup+=label(x(record),205,historic?year(record.history):fmt(record.age,2),'text-anchor="middle"');
  }
  const unit=historic?'Ma':t('years','Jahre');
  const description=historic?t('Age midpoint − inferred age','Altersmittelpunkt − abgeleitetes Alter')
    :t('Historical year − fitted year','Historisches Jahr − modelliertes Jahr');
  $('#residual-description').textContent=`${baselineLabels[s.baseline]} · ${description} (${unit})`;
  $('#residual-chart').innerHTML=markup;
  $('#residual-chart').setAttribute('aria-label',description);
  $('#residual-scope').textContent=historic?t(`${values.length} of ${rows.length} dates can be inverted inside the displayed age window. Positive values indicate an older midpoint.`,`${values.length} von ${rows.length} Daten lassen sich im angezeigten Altersfenster invertieren. Positive Werte zeigen einen älteren Mittelpunkt.`)
    :t(`${values.length} displayed pairs. Positive values indicate a later historical date.`,`${values.length} angezeigte Paare. Positive Werte zeigen ein späteres historisches Datum.`);
}

function compareRows(rows) {
  $('#fit-comparison-rows').innerHTML=rows.map(r=>`<tr>
    <td><button type="button" class="text-link" data-goto="${esc(r.pair.id)}">${esc(r.pair.id)}</button> ${esc(r.pair.geo.title)}</td>
    <td>${fmt(r.age,3)}</td><td>${year(r.history)}</td>
    <td>${year(r.predicted)}</td><td>${sign(r.yearOffset,1)}</td>
    <td>${r.modelAge===null?'—':fmt(r.modelAge,3)}</td><td>${sign(r.ageOffset,3)}</td>
  </tr>`).join('');
}

export function renderTimePlots(s) {
  const [older,younger]=domains[s.domain];
  const visible=s.pairs.filter(pair=>mid(pair.geo)<=older&&mid(pair.geo)>=younger);
  const rows=rowsFor(s,visible,older,younger);
  mappingChart(s,rows,older,younger);
  comparisonInfo(s,rows);
  residualChart(s,rows,older,younger);
  compareRows(rows);
  $('#chart-range').textContent=`${fmt(older,3)}–${fmt(younger,3)} Ma · ${rows.length} ${t('pairs','Paare')}`;
  $('#offset-label').textContent=year(s.offset);
}
