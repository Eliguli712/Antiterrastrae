const root = document.documentElement;
const art = document.getElementById('studioArtDisplay');
const translations = {
  studioExactArt: ['Art display', 'Kunstansicht', 'Καλλιτεχνική προβολή'],
  studioExactRuler: ['Show 50 mm ruler', '50-mm-Maßstab anzeigen', 'Εμφάνιση κλίμακας 50 mm'],
  studioExactDownload: ['Download original artwork', 'Originalbild herunterladen', 'Λήψη πρωτότυπης εικόνας'],
  studioExactPop: ['Open art station', 'Kunststation öffnen', 'Άνοιγμα καλλιτεχνικής προβολής'],
  studioExactCap: ['Cap withdrawal video', 'Video zum Ausziehen der Kappe', 'Βίντεο απόσυρσης καλύμματος'],
  studioExactField: ['Original 3MF colours and stress field', 'Originale 3MF-Farben und Spannungsfeld', 'Αρχικά χρώματα 3MF και πεδίο τάσεων'],
  studioExactBench: ['Open the assembly and calculations workbench', 'Arbeitsbereich für Montage und Berechnung öffnen', 'Άνοιγμα χώρου συναρμολόγησης και υπολογισμών']
};
const {applyLanguage} = await import('./i18n.js');
window.designI18n.register(translations);
applyLanguage();

function withCurrentLanguage(link) {
  const url = new URL(link.href);
  url.searchParams.set('lang', window.designI18n.lang);
  link.href = url.href;
}

if (root.dataset.studioDisplay === 'workbench') {
  const returnLink = document.createElement('a');
  returnLink.href = './studio.html?appearance=art#studioArtDisplay';
  returnLink.className = 'studio-workbench-return';
  returnLink.dataset.i18n = 'studioExactArt';
  returnLink.textContent = window.designI18n.t('studioExactArt');
  withCurrentLanguage(returnLink);
  document.getElementById('workbench').before(returnLink);
  await Promise.all([
    import('./app.js'),
    import('./stress-edition.js'),
    import('./downloads.js'),
    import('./gallery.js')
  ]);
} else {
  const element=id=>document.getElementById(id);
  const toggle=element('studioRulerToggle'),ruler=element('studioRuler'),rulerImage=ruler.querySelector('img');
  const stage=element('studioArtworkStage'),canvas=element('studioArtCanvas'),photo=element('studioArtwork');
  const interactive=element('studioInteractive'),reference=element('studioReference');
  const navigation=element('studioArtNavigation'),status=element('studioArtStatus');
  const cap=element('studioArtCap');
  let mode='interactive',visible=false,viewer=null,loading=null,failed=false;

  function updateRuler(){
    const live=mode==='interactive'&&viewer!==null;
    if(toggle.checked&&!live&&!rulerImage.hasAttribute('src'))rulerImage.src=rulerImage.dataset.src;
    ruler.hidden=!toggle.checked||live;
    viewer?.setRuler(toggle.checked&&live).catch(()=>{
      status.textContent='The 3D ruler could not load. Toggle it to retry.';
    });
  }

  function paint(){
    const live=mode==='interactive'&&viewer!==null;
    stage.classList.toggle('studio-live',live);
    canvas.setAttribute('aria-hidden',String(!live));
    photo.hidden=live;
    navigation.hidden=!live;
    interactive.setAttribute('aria-pressed',String(mode==='interactive'));
    reference.setAttribute('aria-pressed',String(mode==='reference'));
    status.textContent=live?'Drag to rotate. Right-drag or use two fingers to pan. Scroll or pinch to zoom.':
      mode==='reference'?'Original artist render.':
      failed?'The 3D artwork could not load. The original render is shown. Select Interactive 3D to retry.':'Preparing the 3D artwork…';
    viewer?.setVisible(live&&visible&&!document.hidden);
    updateRuler();
  }

  function load(){
    if(mode!=='interactive'||!visible||viewer||loading||failed)return;
    loading=import('./studio-art-view-r16.js?v=1').then(({mountStudioArt})=>mountStudioArt(canvas))
      .then(view=>{
        viewer=view;
        stage.dataset.art3d='ready';
        paint();
      }).catch(()=>{
        failed=true;
        stage.dataset.art3d='failed';
        paint();
      }).finally(()=>{loading=null;});
  }

  new IntersectionObserver(([entry])=>{
    visible=entry.isIntersecting;
    paint();
    load();
  },{rootMargin:'120px'}).observe(stage);
  document.addEventListener('visibilitychange',paint);
  interactive.addEventListener('click',()=>{mode='interactive';failed=false;paint();load();});
  reference.addEventListener('click',()=>{mode='reference';paint();});
  toggle.addEventListener('change',updateRuler);
  element('studioArtHome').addEventListener('click',()=>viewer?.reset());
  cap.addEventListener('input',()=>{
    const distance=Number(cap.value);
    viewer?.setCap(distance);
    element('studioArtCapValue').textContent=`${distance} mm`;
  });
  paint();
  function updateLinks(){
    for (const link of art.querySelectorAll('.studio-pop-out, .studio-workbench-link a, a[href$="#native74-batch"]')) {
      withCurrentLanguage(link);
    }
  }
  updateLinks();
  window.addEventListener('design-language-changed', updateLinks);
  if (root.dataset.studioEmbed && parent !== window) {
    let lastHeight = 0;
    function reportHeight() {
      const height = Math.ceil(art.getBoundingClientRect().height);
      if (height === lastHeight) return;
      lastHeight = height;
      parent.postMessage({type: 'megalodon-art-height', height}, location.origin);
    }
    new ResizeObserver(reportHeight).observe(art);
    reportHeight();
  }

}
