import {mountInlineVideoControls} from './inline-video-controls-r17.js?v=3';
import {words} from './exhibition-i18n-r12.js?v=r12-1';
// Measured on the displayed mask, using only the frames in each playback speed.
const peakFrames={
 "broadface": {
  "fast": {
   "time_s": 8.9,
   "poster": "./assets/native-cut-playback/CT_broadface_fast_maximum_section.jpg"
  },
  "original": {
   "time_s": 89.06,
   "poster": "./assets/native-cut-playback/CT_broadface_original_maximum_section.jpg"
  }
 },
 "axes": {
  "fast": {
   "time_s": 6.58,
   "poster": "./assets/native-cut-playback/CT_axes_fast_maximum_section.jpg"
  },
  "original": {
   "time_s": 65.62,
   "poster": "./assets/native-cut-playback/CT_axes_original_maximum_section.jpg"
  }
 }
};
mountInlineVideoControls();
const response=await fetch(new URL('./assets/native74-batch-publication.json?v=1',import.meta.url)).catch(()=>null);
if(response?.ok){
 const p=await response.json(),media=p.media;
 for(const[id,key]of [['ctBroadface','broadface'],['ctThreeAxes','axes']]){
  const video=document.getElementById(id),m=media[key];if(!video||!m)continue;
  const source=video.querySelector('source'),original=source.src,card=video.closest('.ct-movie-card');
  const previewMovie=new URL('./assets/native-cut-playback/'+new URL(m.mp4).pathname.split('/').pop(),import.meta.url).href;
  let fast=true,format='video';
  const tools=document.createElement('div');tools.className='ct-speed-tools';tools.setAttribute('aria-label','CT playback speed and format');
  const bFast=document.createElement('button'),bOriginal=document.createElement('button'),bVideo=document.createElement('button'),bGif=document.createElement('button'),bPeak=document.createElement('button');
  for(const[b,label]of [[bFast,'10× preview'],[bOriginal,'Original speed'],[bVideo,'Video'],[bGif,'GIF'],[bPeak,'Largest frame']]){
   b.type='button';b.textContent=label;tools.append(b);
  }
  const gif=document.createElement('img');gif.className='ct-gif-display';gif.hidden=true;gif.alt='Full-HD 10× CT sweep; native acquisition sampling 18 micrometres';(video.closest('.inline-video')??video).after(gif);gif.after(tools);
  const note=document.createElement('p');note.className='caption';tools.after(note);
  const selected=()=>peakFrames[key][fast?'fast':'original'];
  let seekPeak=false;
  function seekLargest(){
   if(!seekPeak||video.readyState<1||video.currentSrc!==source.src)return;
   video.currentTime=Math.min(video.duration,selected().time_s);
   seekPeak=false;
  }
  video.addEventListener('loadedmetadata',seekLargest);
  function update({play=false,peak=false}={}){
   seekPeak=peak;
   bFast.setAttribute('aria-pressed',String(fast));bOriginal.setAttribute('aria-pressed',String(!fast));
   bVideo.setAttribute('aria-pressed',String(format==='video'));bGif.setAttribute('aria-pressed',String(format==='gif'));
   video.hidden=format==='gif';gif.hidden=format!=='gif';
   if(format==='gif'){
    video.pause();
    gif.src=fast?m.gif:m.originalGif;
   }else{
    gif.removeAttribute('src');
    video.poster=selected().poster;
    const url=fast?previewMovie:original;
    if(source.src!==url){source.src=url;video.load();}
    else if(peak){
     if(video.readyState>=1)seekLargest();
     else {
      video.preload='metadata';
      video.load();
     }
    }
    if(play)video.play().catch(()=>{});
   }
   const playback=fast?'10× preview · 12.2 seconds · 1920 × 1080 · 25 output fps.':'Original playback · 122 seconds · 3,050 frames at 25 fps.';
   const opening=key==='axes'?' Largest frame jumps to the greatest combined material area in the three sections.':' Largest frame jumps to the greatest longitudinal section in the selected clip.';
   note.textContent=playback+opening;
  }
  bFast.onclick=()=>{fast=true;format='video';update({play:true});};
  bOriginal.onclick=()=>{fast=false;format='video';update({play:true});};
  bVideo.onclick=()=>{format='video';update({play:true});};
  bGif.onclick=()=>{format='gif';update();};
  bPeak.onclick=()=>{format='video';video.pause();video.preload='metadata';update({peak:true});};
  const fallback=()=>{
   if(!fast||format!=='video')return;
   fast=false;
   update();
   note.textContent='Preview unavailable. Play the original clip below.';
  };
  video.addEventListener('error',fallback);
  source.addEventListener('error',fallback);
  update();
  const links=card.querySelector('.ct-downloads');
  const originalVideo=links.querySelector('a[href$=".mp4"]'),originalGif=links.querySelector('a[href$=".gif"]');
  originalVideo.textContent='Original MP4 · 3,050 frames';
  originalGif.textContent='Original GIF · 3,050 frames';
  for(const[url,label]of [[previewMovie,'10× preview MP4'],[m.gif,'10× preview GIF']]){
   const link=document.createElement('a');
   link.href=url;
   link.textContent=label;
   link.download='';
   links.append(link);
  }
 }
 for(const[name,record]of Object.entries(media.slices)){
  const image=document.querySelector(`.ct-planes img[src*="${name}"]`);if(!image)continue;image.src=record.gif;image.classList.add('ct-slice-gif');image.alt='Original binary CT segmentation at 18 micrometre sampling; pixel-exact GIF';const link=image.closest('a');if(link){link.href=record.gif;link.download='';}
 }
 words.movieClock=['The default 10× previews contain approximately every tenth source playback frame: 305 frames, 25 fps, 12.2 seconds. Original 3,050-frame, 122-second movies remain available. Playback time is separate from acquisition or mechanical time.','Die 10×-Vorschau enthält ungefähr jedes zehnte Bild: 305 Bilder, 25 fps, 12,2 Sekunden. Die ursprünglichen 3.050 Bilder und 122 Sekunden bleiben verfügbar.','Οι προεπισκοπήσεις 10× περιλαμβάνουν περίπου κάθε δέκατο καρέ: 305 καρέ, 25 fps, 12,2 δευτερόλεπτα. Τα αρχικά 3.050 καρέ και 122 δευτερόλεπτα παραμένουν διαθέσιμα.'];
 const clock=document.querySelector('[data-t="movieClock"]');
 const refresh=()=>{const lang=document.documentElement.lang,i=['en','de','el'].indexOf(lang);if(clock)clock.textContent=words.movieClock[i<0?0:i];};refresh();new MutationObserver(refresh).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
}
