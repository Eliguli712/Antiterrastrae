import {fieldColor,spectrumGradient} from './stress-palette.js';
const $=id=>document.getElementById(id),remote='https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/native-stress-r3-data/assets/';
let metadata,viewer,values,mode='field',threshold=280366.5625;
const extra={
 nativeHistogramSpectrumNote:["Unweighted mapped native vertex count, including CT void boundaries. Colours span the complete finite field range.","Ungewichtete Anzahl zugeordneter nativer Eckpunkte einschließlich CT-Hohlraumgrenzen. Die Farben umfassen den gesamten endlichen Wertebereich.","Μη σταθμισμένο πλήθος αντιστοιχισμένων αρχικών κορυφών, μαζί με τα όρια κοιλοτήτων CT. Τα χρώματα καλύπτουν όλο το πεπερασμένο εύρος τιμών."],
 fieldReady:['Archived numerical field registered. Grey marks unmapped surfaces.','Archiviertes Zahlenfeld registriert. Grau kennzeichnet nicht zugeordnete Flächen.','Το αριθμητικό πεδίο αντιστοιχίστηκε. Το γκρι δηλώνει μη αντιστοιχισμένες επιφάνειες.'],
 fieldWaiting:['Numerical colour could not be loaded. Please refresh.','Die numerische Farbgebung konnte nicht geladen werden. Bitte neu laden.','Δεν ήταν δυνατή η φόρτωση του αριθμητικού χρωματισμού. Ανανεώστε τη σελίδα.'],
 fieldError:['The numerical field could not be loaded. Try reloading the page.','Das numerische Feld konnte nicht geladen werden. Bitte die Seite neu laden.','Δεν ήταν δυνατή η φόρτωση του αριθμητικού πεδίου. Ανανεώστε τη σελίδα.'],
 nativeHistogram:['Native vertices · finite values only','Native Eckpunkte · nur endliche Werte','Αρχικές κορυφές · μόνο πεπερασμένες τιμές'],
 nativeHistogramNote:['Unweighted vertex count, including CT void boundaries. The marker is the selected colour threshold.','Ungewichtete Eckpunktzahl einschließlich CT-Hohlraumgrenzen. Die Markierung zeigt die gewählte Farbschwelle.','Μη σταθμισμένο πλήθος κορυφών, μαζί με τα όρια κοιλοτήτων CT. Ο δείκτης δείχνει το όριο χρωματισμού.'],
 thresholdPrefix:['Highlight ≥','Hervorhebung ≥','Επισήμανση ≥'],
 numericalEdition:['The complete numerical colour edition.','Die vollständige numerische Farbedition.','Η πλήρης αριθμητική χρωματική έκδοση.'],
 masterDownload:['Wash edition · native 3MF ↓','Perlmuttlasur · natives 3MF ↓','Περλέ έκδοση · αρχικό 3MF ↓'],
 masterDownloadNote:['37,951,699 vertices · 74,293,846 faces · uniform 100 mm build transform','37.951.699 Eckpunkte · 74.293.846 Flächen · einheitliche 100-mm-Bautransformation','37.951.699 κορυφές · 74.293.846 έδρες · ομοιόμορφος μετασχηματισμός στα 100 mm'],
 scalarDownload:['Numerical field & authoring files · ZIP ↓','Zahlenfeld und Erstellungsdateien · ZIP ↓','Αριθμητικό πεδίο και αρχεία δημιουργίας · ZIP ↓'],
 scalarDownloadNote:['Float64 Pa in native vertex order · projection distances · reproducible code · full audit','Float64 Pa in nativer Eckpunktreihenfolge · Projektionsabstände · reproduzierbarer Code · Vollprüfung','Float64 Pa στην αρχική σειρά κορυφών · αποστάσεις προβολής · αναπαραγώγιμος κώδικας · έλεγχοι'],
 pdfDownload:['Design & calculation report · PDF ↗','Entwurfs- und Berechnungsbericht · PDF ↗','Έκθεση σχεδιασμού και υπολογισμών · PDF ↗'],
 pdfDownloadNote:['Six pages · English / Deutsch / Ελληνικά · geometry, equations and calculation charts','Sechs Seiten · English / Deutsch / Ελληνικά · Geometrie, Gleichungen und Berechnungsdiagramme','Έξι σελίδες · English / Deutsch / Ελληνικά · γεωμετρία, εξισώσεις και διαγράμματα υπολογισμών']
};
function t(k){return window.designI18n?.t(k)||extra[k]?.[0]||k}
function register(){window.designI18n?.register(extra);for(const el of document.querySelectorAll('[data-i18n]'))if(extra[el.dataset.i18n])el.textContent=t(el.dataset.i18n);for(const el of document.querySelectorAll('[data-i18n-aria]'))if(extra[el.dataset.i18nAria])el.setAttribute('aria-label',t(el.dataset.i18nAria));}
register();
async function get(name,type='json'){
 for(const base of ['https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/5d5316eba77b04e9cea85228a942224c0d087960/assets/',remote]){
  try{const r=await fetch(base+name);if(!r.ok)continue;return type==='json'?await r.json():await r.arrayBuffer()}catch{}
 }
 throw Error('Unavailable numerical asset: '+name);
}
function chart(){
 if(!metadata||!$('fieldDistribution'))return;
 const h=metadata.histogram,counts=h.counts,edges=h.edges_pa,maxCount=Math.max(...counts),lo=metadata.min_pa,hi=metadata.max_pa;
 const x=s=>50+(s-lo)/(hi-lo)*350,y=n=>180-n/maxCount*150;let a='';
 for(let j=0;j<=3;j++){const n=maxCount*j/3;a+=`<line x1="50" y1="${y(n)}" x2="400" y2="${y(n)}" stroke="#2a4050"/><text x="43" y="${y(n)+4}" text-anchor="end">${(n/1e6).toFixed(1)}M</text>`;}
 for(let i=0;i<counts.length;i++){const c=fieldColor((edges[i]+edges[i+1])/2,{mode,threshold,min:lo,max:hi});a+=`<rect x="${x(edges[i])}" y="${y(counts[i])}" width="${Math.max(1,350/counts.length-.3)}" height="${180-y(counts[i])}" fill="rgb(${c.map(Math.round)})"/>`;}
 const xx=x(threshold);if(mode==='high')a+=`<line x1="${xx}" y1="20" x2="${xx}" y2="180" stroke="#e2c18c" stroke-width="1.8" stroke-dasharray="4 3"/>`;
 for(const s of [lo,.1e6,.2e6,.3e6,hi])a+=`<text x="${x(s)}" y="199" text-anchor="middle">${(s/1e6).toFixed(s===lo?4:3)}</text>`;
 a+='<text x="400" y="216" text-anchor="end">σᵥₘ / MPa</text>';
 $('fieldDistribution').innerHTML=`<svg viewBox="0 0 420 225" role="img" aria-label="${t('nativeHistogram')}"><g font-family="system-ui,sans-serif" font-size="10" fill="#99b5c4">${a}</g></svg>`;
 if($('fieldDistributionNote'))$('fieldDistributionNote').textContent=t(mode==='field'?'nativeHistogramSpectrumNote':'nativeHistogramNote');
}
function update(){
 document.body.dataset.palette=mode;register();if(!metadata){$('toothFieldStatus').textContent=t('fieldWaiting');return;}
 const nf=(x,d)=>new Intl.NumberFormat(window.designI18n?.locale?.()||'en-US',{minimumFractionDigits:d,maximumFractionDigits:d}).format(x);$('vmThresholdOut').textContent=`${t('thresholdPrefix')} ${nf(threshold/1e6,6)} MPa`;$('toothLegendMin').textContent=nf(metadata.min_pa/1e6,4)+' MPa';$('toothLegendMax').textContent=nf(metadata.max_pa/1e6,3)+' MPa';const bar=document.querySelector('.tooth-field-legend i'),p=100*(threshold-metadata.min_pa)/(metadata.max_pa-metadata.min_pa);bar.style.background=mode==='field'?spectrumGradient():`linear-gradient(90deg,#1c314e,#337490 ${p}%,#6ce7d3 ${p}%,#bfebc3 ${p+(100-p)*.45}%,#f6dc9b)`;
 for(const [id,m] of [['editionField','field'],['editionHigh','high']]){const active=mode===m;$(id).classList.toggle('active',active);$(id).setAttribute('aria-pressed',String(active));}
 if(viewer&&values){viewer.setToothField({values,mode,threshold,min:metadata.min_pa,max:metadata.max_pa});$('toothFieldStatus').textContent=t('fieldReady');}
 chart();
}
async function connect(v){
 viewer=v;if(!metadata)return;
 try{values=new Float32Array(await get((viewer.fieldVariant||'tooth')+'-von-mises.bin','binary'));update();window.__stressFieldReady=true;window.__stressFieldMetadata=metadata;}catch(e){$('toothFieldStatus').textContent=t('fieldError');$('toothFieldStatus').classList.add('has-error');console.error(e)}
}
window.addEventListener('design-viewer-ready',()=>connect(window.__designViewer));
window.addEventListener('design-language-changed',()=>{register();viewer?.setLanguage?.();update();});
$('editionField').onclick=()=>{mode='field';update()};$('editionHigh').onclick=()=>{mode='high';update()};$('vmThreshold').oninput=e=>{threshold=Number(e.target.value);mode='high';update()};
try{
 metadata=await get('native-stress-provenance.json');threshold=metadata.threshold_pa;
 const slider=$('vmThreshold');slider.min=metadata.min_pa;slider.max=metadata.max_pa;slider.step='any';slider.value=threshold;
 for(const id of ['editionField','editionHigh','vmThreshold'])$(id).disabled=false;
 update();if(window.__designViewer)await connect(window.__designViewer);
}catch(e){$('toothFieldStatus').textContent=t('fieldWaiting');$('toothFieldStatus').classList.add('has-error');console.warn(String(e));}

try{const manifest=await get('release-manifest.json');for(const el of document.querySelectorAll('[data-artifact]')){const n=manifest[el.dataset.artifact]?.bytes;if(n)el.textContent=(n>=1e9?(n/1e9).toFixed(2)+' GB':(n/1e6).toFixed(2)+' MB');}}catch{}
