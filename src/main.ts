import './style.css';
import { StickerWorld } from './physics';
import { gravityFromMotion, inferMotionPolarity, type MotionPolarity, type TiltGravity } from './deviceTilt';
import { parseSearchResponse, type Sticker } from './types';
const $ = <T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=$<HTMLInputElement>('search'), status=$('search-status'),section=document.querySelector<HTMLElement>('.search-section')!;
const detail=$<HTMLDialogElement>('detail'),collection=$<HTMLDialogElement>('collection');
let world:StickerWorld;
let version=0, timer:ReturnType<typeof setTimeout>,controller:AbortController|undefined,composing=false;
const motionTip=$('motion-tip');
const tiltButton=$<HTMLButtonElement>('shuffle');
const motionSupported=isSecureContext&&'DeviceMotionEvent' in window&&matchMedia('(pointer: coarse)').matches&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
let tiltEnabled=false,motionRequesting=false,filteredTilt:TiltGravity|undefined,lastMotionAt=0;
let motionPolarity:MotionPolarity|undefined;
function onDeviceMotion(event:DeviceMotionEvent){
 if(document.hidden||detail.open||collection.open)return;
 const legacyAngle=(window as Window & {orientation?:number}).orientation;
 const screenAngle=screen.orientation?.angle??(typeof legacyAngle==='number'?-legacyAngle:0);
 motionPolarity??=inferMotionPolarity(event.accelerationIncludingGravity,screenAngle)??undefined;
 const gravity=gravityFromMotion(event.accelerationIncludingGravity,screenAngle,motionPolarity??-1);
 if(!gravity)return;
 const now=performance.now();
 const blend=filteredTilt?1-Math.exp(-Math.min(now-lastMotionAt,1000)/160):1;
 filteredTilt={x:filteredTilt?filteredTilt.x+(gravity.x-filteredTilt.x)*blend:gravity.x,y:filteredTilt?filteredTilt.y+(gravity.y-filteredTilt.y)*blend:gravity.y};
 lastMotionAt=now;
 world.setTiltGravity(filteredTilt.x,filteredTilt.y);
}
function onVisibilityChange(){if(document.hidden){filteredTilt=undefined;world.resetTiltGravity();}}
function disablePhoneTilt(){
 window.removeEventListener('devicemotion',onDeviceMotion);document.removeEventListener('visibilitychange',onVisibilityChange);
 filteredTilt=undefined;tiltEnabled=false;world.resetTiltGravity();
 tiltButton.classList.remove('tilt-active');tiltButton.setAttribute('aria-pressed','false');
 tiltButton.setAttribute('aria-label','Enable tilt physics');motionTip.textContent='tap to enable tilt';
}
async function togglePhoneTilt(){
 if(tiltEnabled){disablePhoneTilt();return;}
 if(motionRequesting)return;
 motionRequesting=true;
 try{
  const requestPermission=(DeviceMotionEvent as typeof DeviceMotionEvent & {requestPermission?:()=>Promise<'granted'|'denied'>}).requestPermission;
  if(requestPermission&&await requestPermission.call(DeviceMotionEvent)!=='granted'){
   motionTip.hidden=true;tiltButton.querySelector('.shake-label-mobile')!.textContent='Shake';
   tiltButton.setAttribute('aria-label','Shake things up');tiltButton.onclick=()=>world.shake();
   return;
  }
  window.addEventListener('devicemotion',onDeviceMotion);
  document.addEventListener('visibilitychange',onVisibilityChange);
  tiltEnabled=true;tiltButton.classList.add('tilt-active');tiltButton.setAttribute('aria-pressed','true');
  tiltButton.setAttribute('aria-label','Tilt physics on; tap to turn off');motionTip.textContent='tilt phone to move stickers';
 }catch{motionTip.hidden=true;tiltButton.querySelector('.shake-label-mobile')!.textContent='Shake';tiltButton.setAttribute('aria-label','Shake things up');tiltButton.onclick=()=>world.shake();}
 finally{motionRequesting=false;}
}
function setSearching(searching:boolean){
 section.classList.toggle('loading',searching);$('search-form').setAttribute('aria-busy',String(searching));
}
function showSticker(sticker:Sticker){
 collection.close();$<HTMLImageElement>('detail-image').src=sticker.image;$<HTMLImageElement>('detail-image').alt=sticker.description;
 $('detail-title').textContent=sticker.title;$('detail-description').textContent=sticker.description;
 const tags=$('detail-tags');tags.replaceChildren();for(const tag of sticker.tags.slice(0,8)){const button=document.createElement('button');button.textContent=tag;button.onclick=()=>{detail.close();input.value=tag;schedule(true);};tags.append(button);}
 const download=$<HTMLAnchorElement>('download');download.href=sticker.downloadImage||sticker.image;download.download=sticker.title.toLowerCase().replaceAll(' ','-')+'.png';detail.showModal();
}
for(const dialog of [detail,collection]){dialog.querySelector('.dialog-close')?.addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});}
let ids:Set<string>;
async function runSearch(query:string,requestVersion:number){
 controller=new AbortController();setSearching(true);status.classList.remove('error');status.textContent='Looking through the little things…';
 try{const res=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query}),signal:controller.signal});if(!res.ok)throw new Error('Search unavailable');const data=parseSearchResponse(await res.json(),ids);if(requestVersion!==version)return;
  const matchCount=world.setMatches(data.matches.map(m=>m.id));$('mode-label').textContent=data.mode==='jev'?'JEV SEARCH':'LOCAL SEARCH';
  const oldStatusBottom=status.getBoundingClientRect().bottom;
  status.textContent=matchCount?`${matchCount} little ${matchCount===1?'match':'matches'} for “${query}”${data.mode==='local'?' · local tag search':''}`:`No little matches yet. Try a color, an object, or an activity.`;
  if(Math.abs(status.getBoundingClientRect().bottom-oldStatusBottom)>1)world.relayoutMatches();
 }catch(error){if(requestVersion!==version||(error as Error).name==='AbortError')return;status.classList.add('error');status.textContent='Couldn’t search just now. Press Enter to try again.';
 }finally{if(requestVersion===version)setSearching(false);}
}
function schedule(immediate=false){
 clearTimeout(timer);controller?.abort();const requestVersion=++version;setSearching(false);const query=input.value.trim();$('clear').hidden=!input.value;$('shortcut').hidden=!!input.value;status.classList.remove('error');
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-query]'))b.classList.toggle('active',b.dataset.query===query);
 if(!query){world?.setMatches([]);status.textContent='Describe something. Watch it rise.';return;}
 status.textContent='Waiting for you to finish typing…';
 if(composing)return;
 timer=setTimeout(()=>void runSearch(query,requestVersion),immediate?0:320);
}
async function boot(){const res=await fetch('/stickers/catalog.json',{cache:'no-store'});if(!res.ok)throw new Error('Collection unavailable');const stickers:Sticker[]=await res.json();ids=new Set(stickers.map(s=>s.id));
 await Promise.all(stickers.map(s=>new Promise<void>(resolve=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>resolve();image.src=s.image;})));
 world=new StickerWorld($('sticker-stage'),stickers,()=>status.getBoundingClientRect().bottom,showSticker);$('collection-count').textContent=String(stickers.length);
 for(const sticker of stickers){const button=document.createElement('button');const image=document.createElement('img');image.src=sticker.image;image.alt='';image.loading='lazy';button.append(image,document.createTextNode(sticker.title));button.onclick=()=>showSticker(sticker);$('collection-grid').append(button);}
 $('browse').onclick=()=>collection.showModal();
 if(motionSupported){tiltButton.setAttribute('aria-pressed','false');tiltButton.setAttribute('aria-label','Enable tilt physics');tiltButton.onclick=()=>void togglePhoneTilt();}
 else{motionTip.hidden=true;tiltButton.querySelector('.shake-label-mobile')!.textContent='Shake';tiltButton.setAttribute('aria-label','Shake things up');tiltButton.onclick=()=>world.shake();}
 input.addEventListener('input',()=>schedule());input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);controller?.abort();version++;setSearching(false);status.textContent='Waiting for you to finish typing…';});input.addEventListener('compositionend',()=>{composing=false;schedule();});
 $('search-form').addEventListener('submit',e=>{e.preventDefault();schedule(true);});$('clear').onclick=()=>{input.value='';schedule();input.focus();};
 document.querySelectorAll<HTMLButtonElement>('[data-query]').forEach(b=>b.onclick=()=>{input.value=b.dataset.query!;schedule(true);});
 document.addEventListener('keydown',e=>{if(detail.open||collection.open)return;if(e.key==='/'&&document.activeElement!==input){e.preventDefault();input.focus();}if(e.key==='Escape'){input.value='';schedule();input.blur();}});
 try{const response=await fetch('/api/status');const data=await response.json();$('mode-label').textContent=data.mode==='jev'?'JEV SEARCH':'LOCAL SEARCH';}catch{/* Search reports an actionable error on use. */}
}
boot().catch(()=>{status.textContent='The collection couldn’t load. Please refresh to try again.';status.classList.add('error');});
if(import.meta.hot)import.meta.hot.dispose(()=>{controller?.abort();clearTimeout(timer);window.removeEventListener('devicemotion',onDeviceMotion);document.removeEventListener('visibilitychange',onVisibilityChange);world?.destroy();});
