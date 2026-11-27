
const root = document.documentElement;
const art = document.getElementById('studioArtDisplay');
const translations = {
  studioExactArt: ['Art display', 'Kunstansicht', 'Καλλιτεχνική προβολή'],
  studioExactRuler: ['Show 50 mm ruler', '50-mm-Maßstab anzeigen', 'Εμφάνιση κλίμακας 50 mm'],
  studioExactDownload: ['Download original artwork', 'Originalbild herunterladen', 'Λήψη πρωτότυπης εικόνας'],
  studioExactPop: ['Open art station', 'Kunststation öffnen', 'Άνοιγμα καλλιτεχνικής προβολής'],
  studioExactCap: ['Cap withdrawal video', 'Video zum Ausziehen der Kappe', 'Βίντεο απόσυρσης καλύμματος'],
  studioExactField: ['Original 3MF colours and stress field', 'Originale 3MF-Farben und Spannungsfeld', 'Αρχικά χρώματα 3MF και πεδίο τάσεων'],
  studioExactBench: ['Open the assembly and calculations workbench', 'Arbeitsbereich für Montage und Berechnung öffnen', 'Άνοιγμα χώρου συναρμολόγησης και υπολογισμών'],
  studioCapMotion: ['Cap motion', 'Kappenbewegung', 'Κίνηση καλύμματος'],
  studioCapVertical: ['Vertical lift', 'Vertikal anheben', 'Κατακόρυφη ανύψωση'],
  studioCapFree: ['Free drag', 'Frei ziehen', 'Ελεύθερη μετακίνηση'],
  studioCapRail: ['Original slide rail', 'Ursprüngliche Führung', 'Αρχικός οδηγός ολίσθησης'],
  studioCapReset: ['Reset cap', 'Kappe zurücksetzen', 'Επαναφορά καλύμματος'],
  studioToothFinish: ['Tooth finish', 'Zahnoberfläche', 'Φινίρισμα δοντιού'],
  studioResinFinish: ['Cobalt resin', 'Kobaltharz', 'Ρητίνη κοβαλτίου'],
  studioABSFinish: ['ABS plastic', 'ABS-Kunststoff', 'Πλαστικό ABS'],
  studioPLAFinish: ['Matte PLA · artwork colours', 'Mattes PLA · Kunstfarben', 'Ματ PLA · χρώματα έργου'],
  studioFinishHelp: ['Changes the tooth appearance. The stand and cap keep their original materials.', 'Ändert das Aussehen des Zahns. Ständer und Kappe behalten ihre Originalmaterialien.', 'Αλλάζει την εμφάνιση του δοντιού. Η βάση και το κάλυμμα διατηρούν τα αρχικά υλικά τους.'],
  studioLiftMeasure: ['Lift cap', 'Kappe anheben', 'Ανύψωση καλύμματος'],
  studioRailMeasure: ['Withdraw cap', 'Kappe ausziehen', 'Απόσυρση καλύμματος'],
  studioVerticalHelp: ['Lift the cap straight up from 0 to 40 mm.', 'Kappe von 0 bis 40 mm senkrecht anheben.', 'Ανύψωση του καλύμματος κατακόρυφα από 0 έως 40 mm.'],
  studioRailHelp: ['Slide the cap 0–40 mm along the original CAD rail.', 'Kappe auf der ursprünglichen CAD-Führung um 0–40 mm verschieben.', 'Ολίσθηση του καλύμματος κατά 0–40 mm στον αρχικό οδηγό CAD.'],
  studioFreeHelp: ['Drag the cap to move it. Drag elsewhere to rotate. With the view focused, use the arrow keys to move, Page Up or Page Down to change height, or Escape to reset the cap.', 'Kappe zum Verschieben ziehen. Zum Drehen außerhalb der Kappe ziehen. In der fokussierten Ansicht Pfeiltasten zum Verschieben, Bild auf oder Bild ab für die Höhe und Esc zum Zurücksetzen verwenden.', 'Σύρετε το κάλυμμα για να το μετακινήσετε. Σύρετε αλλού για περιστροφή. Με εστιασμένη την προβολή, χρησιμοποιήστε τα βέλη για μετακίνηση, Page Up ή Page Down για το ύψος ή Esc για επαναφορά.']
};

const support=document.getElementById('studioDoubleCube');
if(support){
  let loadingSupport=false;
  const loadSupport=()=>{
    if(!support.open||loadingSupport)return;
    loadingSupport=true;
    import('./studio-support-r17.js?v=1')
      .then(({mountStudioSupport})=>mountStudioSupport(support))
      .catch(()=>{
        loadingSupport=false;
        support.querySelector('.studio-support-status').textContent='3D preview unavailable. Download the original STL, or reopen this section to retry.';
      });
  };
  support.addEventListener('toggle',loadSupport);
  loadSupport();
}

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
  const cap=element('studioArtCap'),capControls=element('studioArtCapControls');
  const capMode=element('studioArtCapMode'),capSlider=element('studioArtCapSlide');
  const capPosition=element('studioArtCapPosition'),capHelp=element('studioArtCapHelp');
  const toothFinish=element('studioArtToothFinish');
  let capOffset=[0,0,0];
  let mode='interactive',visible=false,viewer=null,loading=null,failed=false;

  function paintCapPosition(offset){
    capOffset=offset;
    const round=value=>Math.round(value*100)/100;
    const [x,y,z]=offset.map(round);
    if(capMode.value==='free'){
      const signed=value=>value>0?`+${value}`:String(value);
      capPosition.value=`X ${signed(x)} · Y ${signed(y)} · Z ${signed(z)} mm`;
    }else{
      const distance=capMode.value==='rail'?-y:z;
      cap.value=String(distance);
      element('studioArtCapValue').value=`${distance} mm`;
    }
  }

  function paintCapMode(){
    const free=capMode.value==='free',rail=capMode.value==='rail';
    const t=window.designI18n.t;
    capSlider.hidden=free;
    capPosition.hidden=!free;
    element('studioArtCapMeasure').textContent=t(rail?'studioRailMeasure':'studioLiftMeasure');
    capHelp.textContent=t(free?'studioFreeHelp':rail?'studioRailHelp':'studioVerticalHelp');
    paintCapPosition(capOffset);
  }

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
    capControls.hidden=!live;
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
    loading=import('./studio-art-view-r16.js?v=3').then(({mountStudioArt})=>
      mountStudioArt(canvas,{onCapMove:paintCapPosition}))
      .then(view=>{
        viewer=view;
        viewer.setCapMode(capMode.value);
        viewer.setToothFinish(toothFinish.value);
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
  capMode.addEventListener('change',()=>{
    viewer?.setCapMode(capMode.value);
    paintCapMode();
  });
  cap.addEventListener('input',()=>viewer?.setCap(Number(cap.value)));
  element('studioArtCapReset').addEventListener('click',()=>viewer?.resetCap());
  toothFinish.addEventListener('change',()=>viewer?.setToothFinish(toothFinish.value));
  window.addEventListener('design-language-changed',paintCapMode);
  paintCapMode();
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
