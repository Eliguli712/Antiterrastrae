"""Prepare only this page's new source; preserve R14 as an explicit archive."""
from pathlib import Path
import json,shutil
from bs4 import BeautifulSoup
O=Path(__file__).resolve().parents[1];ROOT=O.parents[1]
P=O/'source-owned/design/megalodon';P.mkdir(parents=True,exist_ok=True)
OLD=ROOT/'output/web_native74_batch_2026-11-24/source-owned/design/megalodon'
original=(OLD/'index.html').read_text();(P/'archive-r14.html').write_text(original)
soup=BeautifulSoup(original,'html.parser');soup.html['data-native-shared-r15']='true'
for script in list(soup.find_all('script',src=True)):
 if any(n in script['src'] for n in ['exhibition-r12.js','support-r12.js','native-workbench-r13.js','native-batch-r14.js']):script.decompose()
for node in [soup.select_one('section.exhibition'),soup.select_one('section#study'),soup.select_one('section#support')]:
 if node:node.decompose()
for a in soup.select('.masthead a[href="#study"]'):a['href']='#native-statistics'
for p in list(soup.find_all('p')):
 if p.get_text().startswith('Earlier 1 MPa pressure study'):p.decompose()
edition=soup.select_one('.edition-switch')
if edition:edition.clear();edition.append(BeautifulSoup('<a href="./" aria-current="page">Current native explorer</a><a href="archive-r14.html">Earlier pressure / support study</a><a href="legacy.html">Legacy</a>','html.parser'))
art=soup.select_one('#art');title=art.find('h2');intro=art.find('p',class_='section-intro')
if title:title.string='Light, inside the native form.'
mount=soup.new_tag('div',id='nativeArtMount');art.insert(3,mount)
filter_note=BeautifulSoup('<div class="native-filter-note"><h3>Mask first. Then choose the display.</h3><p>The complete native surface preserves every original internal cavity wall. Exact 18 µm binary planes are retained separately. Artistic grey and filtered intensity textures use a labelled 144 µm display cache, pooled from every original CT voxel.</p><p>Basic mask-aware filtration and patch-intensity MPPCA are display derivatives. Original voxel masks, 3MF colours and numerical stresses remain unchanged. Residuals describe the display change, not an error against anatomical ground truth.</p><div id="nativeFilterDownloads" class="batch-downloads"></div><img id="nativeFilterComparison" class="native-filter-comparison" loading="lazy" alt="Original masked intensity, basic filtration and conditional MPPCA comparison"/></div>','html.parser');mount.insert_after(filter_note)
internal=soup.select_one('#internal');movies=internal.select_one('.ct-movies')
mount=soup.new_tag('div',id='nativeInternalMount')
if movies:movies.insert_before(mount)
else:internal.insert(3,mount)
note=BeautifulSoup('<section class="native-archive-note"><h3>Earlier mechanical and support editions</h3><p>The independently documented 1 MPa pressure study, fixed-boundary tables, support mechanics and its earlier interactive assembly remain available in the preserved R14 edition.</p><a href="archive-r14.html">Open the full earlier study and support visualizer</a></section>','html.parser');soup.select_one('#files').insert_before(note)
for node in soup.select('.native-module-links'):node.decompose()
css=soup.new_tag('link',rel='stylesheet',href='native-shared-r15.css?v=1');soup.head.append(css)
script=soup.new_tag('script',src='native-app-r15.js?v=1',type='module');soup.body.append(script)
(P/'index.html').write_text(str(soup)+'\n')

# Preserve the earlier statistical plates and explanatory text verbatim.
source=(OLD/'native-batch-r14.js').read_text();analysis=source[source.index('function renderAnalysis(a){'):]
analysis=analysis.replace('function renderAnalysis(a){','export function renderAnalysis(target,a){',1).replace("q('#batchScientificAnalysis').innerHTML=",'target.innerHTML=',1)
helpers=r'''
import{words}from'./exhibition-i18n-r12.js?v=r12-1';
const $=id=>document.getElementById(id);let posterLang='en',posterPage=2;
const t=k=>words[k]?.[Math.max(0,['en','de','el'].indexOf(document.documentElement.lang))]||words[k]?.[0]||k;
function poster(){const root=`https://raw.githubusercontent.com/Eliguli712/Antiterrastrae/defa54fdf8ec93392453c5a90b6562b77cbbb299/assets/posters-r8/${posterLang}/`,title=t(['cover','workflow','anatomy','artist'][posterPage-1]);$('posterImage').src=root+`page-0${posterPage}.jpg`;$('posterImage').alt=`Source to Sculpture · ${posterLang} · ${title}`;$('posterCaption').textContent=title;$('posterPage').textContent=`0${posterPage} / 04`;$('posterDownload').href=root+'source.pdf';$('posterThumbs').innerHTML=Array.from({length:4},(_,i)=>`<button data-poster-page="${i+1}" aria-label="${t(['cover','workflow','anatomy','artist'][i])}" aria-pressed="${i+1===posterPage}"><img src="${root}thumb-0${i+1}.jpg" width="360" height="466" alt="Poster page ${i+1}" loading="lazy"/></button>`).join('');$('posterThumbs').querySelectorAll('button').forEach(b=>b.onclick=()=>{posterPage=Number(b.dataset.posterPage);poster();});document.querySelectorAll('[data-poster-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.posterLang===posterLang)));$('posterFull').src=root+`page-0${posterPage}.jpg`;$('dialogPage').textContent=`${posterPage} / 4`;$('dialogPosterTitle').textContent=title;}
function language(lang){document.documentElement.lang=lang;document.querySelectorAll('[data-t]').forEach(e=>{if(words[e.dataset.t])e.innerHTML=t(e.dataset.t);});document.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===lang)));poster();}
export function hydrateOtherContent(pub,interactive){
 for(const size of[50,100]){const c=pub.cases[size];$('batchDownloads'+size).innerHTML=`<a href="${c.model}">Current coloured 3MF</a><a href="${c.plate}">Complete normalized plate</a>`;}
 $('batchCommonDownloads').innerHTML=pub.downloads.map(d=>`<a href="${d.url}">${d.label}</a>`).join('');$('batchStaticPlates').innerHTML=[50,100].map(s=>`<figure class="batch-plate-fig"><a href="${pub.cases[s].plate}"><img class="batch-wide" loading="lazy" src="${pub.cases[s].plate}" alt="${s/10} cm front, oblique and reverse complete native views"/></a><figcaption>${pub.cases[s].label} · 74,293,846 source triangles in each view.</figcaption></figure>`).join('');
 $('nativeFilterComparison').src=interactive.comparison;$('nativeFilterDownloads').innerHTML=`<a href="${interactive.filter_record}">Filter / MPPCA record</a><a href="${interactive.filter_model}">Patch model · NPZ</a><a href="${interactive.mask}">Exact native mask slabs</a><a href="${interactive.compact_audit}">Full mesh and colour audit</a><a href="${pub.ruler.zip}">Traditional 5 cm CAD ruler</a>`;
 const files=$('downloadCards');files.className='native-current-files';files.innerHTML=[50,100].map(size=>`<article><h3>${size/10} cm</h3><p>74,293,846 original triangles · 37,951,699 source vertices.</p><div class="batch-downloads"><a href="${pub.cases[size].model}">Current coloured 3MF</a><a href="${pub.cases[size].plate}">Static plate</a></div><p>${size===50?'Preserved paper-reference appearance.':'Independently calculated nonlinear MR5; closed-solid proxy.'}</p><a href="${interactive.geometry}">Lossless native-grid viewer manifest</a></article>`).join('');
 document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>language(b.dataset.lang));document.querySelectorAll('[data-poster-lang]').forEach(b=>b.onclick=()=>{posterLang=b.dataset.posterLang;poster();});
 $('posterOpen').onclick=()=>$('posterDialog').showModal();$('posterClose').onclick=()=>$('posterDialog').close();$('posterPrev').onclick=()=>{posterPage=(posterPage+2)%4+1;poster();};$('posterNext').onclick=()=>{posterPage=posterPage%4+1;poster();};$('posterDialog').addEventListener('click',e=>{if(e.target===$('posterDialog'))e.target.close();});
 const selected=new URL(location.href).searchParams.get('lang');language(['en','de','el'].includes(selected)?selected:'en');
}
'''
(P/'native-content-r15.js').write_text(helpers+'\n'+analysis)
print('CURRENT PAGE SOURCE PREPARED; R14 archive preserved')
