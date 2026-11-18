const $=id=>document.getElementById(id);
const tabs=document.querySelector('.gallery-tabs');
document.querySelector('.gallery-top').insertBefore(tabs,document.querySelector('.language-switch'));
let selected='object';
function panel(name,scroll=true){
 selected=name;
 for(const key of ['study','files'])$(key+'-panel').hidden=name!==key;
 document.querySelectorAll('[data-panel]').forEach(b=>{const on=b.dataset.panel===name;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 if(scroll)(name==='object'?$('workbench'):$(name+'-panel')).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>panel(b.dataset.panel)));
document.querySelectorAll('[data-open-panel]').forEach(b=>b.addEventListener('click',()=>panel(b.dataset.openPanel)));
for(const id of ['assemblyClosed','assemblyOpen'])$(id).addEventListener('click',()=>panel('object',false));
const hash=location.hash;
panel(['#study','#analysis','#method'].includes(hash)?'study':['#files','#downloads','#native-downloads'].includes(hash)?'files':'object',false);
function ready(){
 const v=window.__designViewer;if(!v)return;
 v.showCOM($('showCOM').checked);
 document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>{v.setView(b.dataset.camera);document.querySelectorAll('[data-camera]').forEach(q=>q.classList.toggle('active',q===b));});
 $('homeView').addEventListener('click',()=>document.querySelectorAll('[data-camera]').forEach(q=>q.classList.toggle('active',q.dataset.camera==='oblique')));
 $('rootView').addEventListener('click',()=>document.querySelectorAll('[data-camera]').forEach(q=>q.classList.remove('active')));
}
window.addEventListener('design-viewer-ready',ready);if(window.__designViewer)ready();
const options=document.querySelector('.display-options');
document.addEventListener('pointerdown',e=>{if(options.open&&!options.contains(e.target))options.open=false;});
