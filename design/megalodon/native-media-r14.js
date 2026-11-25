import {words} from './exhibition-i18n-r12.js?v=r12-1';
const response=await fetch(new URL('./assets/native74-batch-publication.json?v=1',import.meta.url));
if(response.ok){
 const p=await response.json(),media=p.media;
 for(const[id,key]of [['ctBroadface','broadface'],['ctThreeAxes','axes']]){
  const video=document.getElementById(id),m=media[key];if(!video||!m)continue;
  const original=video.querySelector('source').src,card=video.closest('.ct-movie-card');let fast=true,format='video';
  const tools=document.createElement('div');tools.className='ct-speed-tools';tools.setAttribute('aria-label','CT playback speed and format');
  const bFast=document.createElement('button'),bOriginal=document.createElement('button'),bVideo=document.createElement('button'),bGif=document.createElement('button');
  for(const[b,label]of [[bFast,'10× preview'],[bOriginal,'Original speed'],[bVideo,'Video'],[bGif,'GIF']]){b.type='button';b.textContent=label;tools.append(b);}
  const gif=document.createElement('img');gif.className='ct-gif-display';gif.hidden=true;gif.alt='Full-HD 10x CT sweep; native acquisition sampling 18 micrometres, no new acquired resolution';video.after(gif);gif.after(tools);
  const note=document.createElement('p');note.className='caption';tools.after(note);
  function update(play=false){
   bFast.setAttribute('aria-pressed',String(fast));bOriginal.setAttribute('aria-pressed',String(!fast));bVideo.setAttribute('aria-pressed',String(format==='video'));bGif.setAttribute('aria-pressed',String(format==='gif'));video.hidden=format==='gif';gif.hidden=format!=='gif';
   if(format==='gif'){video.pause();gif.src=fast?m.gif:m.originalGif;}
   else{gif.removeAttribute('src');const url=fast?m.mp4:original;if(video.querySelector('source').src!==url){video.querySelector('source').src=url;video.load();}if(play)video.play().catch(()=>{});}
   note.textContent=fast?'10× preview · 12.2 seconds · 1920 × 1080 · 25 output fps. Temporal acceleration does not add acquired spatial detail.':'Original playback · 122 seconds · 3,050 frames at 25 fps.';
  }
  bFast.onclick=()=>{fast=true;update(true);};bOriginal.onclick=()=>{fast=false;update(true);};bVideo.onclick=()=>{format='video';update(true);};bGif.onclick=()=>{format='gif';update();};update();
  const links=card.querySelector('.ct-downloads');
  for(const[a,url,label]of [[links.querySelector('a[href$=".mp4"]'),m.mp4,'10× MP4 · 1920 × 1080'],[links.querySelector('a[href$=".gif"]'),m.gif,'10× GIF · full HD · no dithering']])if(a){a.href=url;a.textContent=label;a.download='';}
  const a=document.createElement('a');a.href=original;a.textContent='Original MP4';a.download='';links.append(a);
 }
 for(const[name,record]of Object.entries(media.slices)){
  const image=document.querySelector(`.ct-planes img[src*="${name}"]`);if(!image)continue;image.src=record.gif;image.classList.add('ct-slice-gif');image.alt='Original binary CT segmentation at 18 micrometre sampling; pixel-exact GIF';const link=image.closest('a');if(link){link.href=record.gif;link.download='';}
 }
 words.movieClock=['The default 10× previews contain approximately every tenth source playback frame: 305 frames, 25 fps, 12.2 seconds. Original 3,050-frame, 122-second movies remain available. Playback time is separate from acquisition or mechanical time.','Die 10×-Vorschau enthält ungefähr jedes zehnte Bild: 305 Bilder, 25 fps, 12,2 Sekunden. Die ursprünglichen 3.050 Bilder und 122 Sekunden bleiben verfügbar.','Οι προεπισκοπήσεις 10× περιλαμβάνουν περίπου κάθε δέκατο καρέ: 305 καρέ, 25 fps, 12,2 δευτερόλεπτα. Τα αρχικά 3.050 καρέ και 122 δευτερόλεπτα παραμένουν διαθέσιμα.'];
 const refresh=()=>{const lang=document.documentElement.lang,i=['en','de','el'].indexOf(lang);document.querySelector('[data-t="movieClock"]').textContent=words.movieClock[i<0?0:i];};refresh();new MutationObserver(refresh).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
}
