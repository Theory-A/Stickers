import Matter from 'matter-js';
import type { Sticker } from './types';
const {Engine,Bodies,Body,Composite,Sleeping} = Matter;
type Item = {sticker:Sticker;body:Matter.Body;element:HTMLButtonElement;width:number;height:number;target?:{x:number;y:number};scale:number;targetScale:number;pinned?:boolean};
export class StickerWorld {
 private engine=Engine.create({enableSleeping:true});
 private items:Item[]=[];
 private walls:Matter.Body[]=[];
 private frame=0;
 private last=0;
 private accumulator=0;
 private selected:string[]=[];
 private width=0;
 private stickerCount=29;
 private height=0;
 private drag?:{item:Item;pointer:number;x:number;y:number;startX:number;startY:number;dx:number;dy:number;moved:boolean;stillSince?:number;anchorX:number;anchorY:number};
 private reduced=matchMedia('(prefers-reduced-motion: reduce)');
 private resizeObserver:ResizeObserver;
 constructor(private stage:HTMLElement, stickers:Sticker[], private resultTop:()=>number, onOpen:(s:Sticker)=>void) {
  this.width=stage.clientWidth; this.height=stage.clientHeight;this.stickerCount=stickers.length;
  this.engine.gravity.y=1.15;
  for(const [i,sticker] of stickers.entries()) {
   const size=this.baseSize();const factor=size/Math.max(sticker.width,sticker.height); const width=sticker.width*factor,height=sticker.height*factor;
   const element=document.createElement('button');element.className='sticker';element.dataset.id=sticker.id;element.setAttribute('aria-label',sticker.title);element.title=sticker.title+' · Click to view, drag and hold still to pin';
   const img=document.createElement('img');img.src=sticker.image;img.alt='';img.draggable=false;element.append(img);element.style.width=width+'px';element.style.height=height+'px';stage.append(element);
   const body=Bodies.rectangle(80+Math.random()*Math.max(1,this.width-160),-80-i*70,width*.83,height*.88,{chamfer:{radius:Math.min(width,height)*.2},restitution:.32,friction:.65,frictionAir:.018,angle:(Math.random()-.5)*1.8,sleepThreshold:90});
   const item:Item={sticker,body,element,width,height,scale:1,targetScale:1};this.items.push(item);Composite.add(this.engine.world,body);
   element.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    if(this.drag)return;
    this.drag={item,pointer:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,dx:e.clientX-body.position.x,dy:e.clientY-body.position.y,moved:false,anchorX:e.clientX,anchorY:e.clientY};
    if(!item.pinned){Sleeping.set(body,false);body.collisionFilter.mask=0;element.style.zIndex='100';}element.setPointerCapture(e.pointerId);
   });
   element.addEventListener('pointermove',e=>{const d=this.drag;if(!d||d.pointer!==e.pointerId)return;d.x=e.clientX;d.y=e.clientY;if(Math.hypot(d.x-d.startX,d.y-d.startY)>5){d.moved=true;if(item.pinned)this.unpin(item);}if(Math.hypot(d.x-d.anchorX,d.y-d.anchorY)>6){d.stillSince=undefined;d.anchorX=d.x;d.anchorY=d.y;}});
   const release=(e:PointerEvent)=>{const d=this.drag;if(!d||d.pointer!==e.pointerId)return;this.drag=undefined;body.collisionFilter.mask=item.target?0:0xffffffff;element.style.zIndex=item.pinned?'0':item.target?'20':'1';if(e.type==='pointerup'&&!d.moved)onOpen(sticker);};
   element.addEventListener('pointerup',release);element.addEventListener('pointercancel',release);element.addEventListener('lostpointercapture',release);
   element.addEventListener('click',e=>{if(e.detail===0)onOpen(sticker);});
  }
  this.setWalls();
  if(this.reduced.matches){for(let i=0;i<500;i++)Engine.update(this.engine,1000/60);this.render();}
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(stage);
  this.frame=requestAnimationFrame(this.tick);
 }
 private mobileScale(){return this.width<=700?.7:1;}
 private baseSize(){return (this.width<600?105:Math.min(175,Math.max(125,this.width/8.5)))*Math.min(1,Math.sqrt(29/this.stickerCount))*this.mobileScale();}
 private setWalls(){Composite.remove(this.engine.world,this.walls);const opts={isStatic:true,friction:.8};this.walls=[Bodies.rectangle(this.width/2,this.height-25,this.width+300,50,opts),Bodies.rectangle(-50,this.height/2,100,this.height*8,opts),Bodies.rectangle(this.width+50,this.height/2,100,this.height*8,opts)];Composite.add(this.engine.world,this.walls);}
 private resize(){const width=this.stage.clientWidth,height=this.stage.clientHeight;if(width===this.width&&height===this.height)return;const oldWidth=this.width,oldHeight=this.height;this.width=width;this.height=height;for(const item of this.items){const factor=this.baseSize()/Math.max(item.width,item.height);Body.scale(item.body,factor,factor);item.width*=factor;item.height*=factor;item.element.style.width=item.width+'px';item.element.style.height=item.height+'px';Body.setPosition(item.body,{x:Math.min(width-item.width/2,Math.max(item.width/2,item.body.position.x/oldWidth*width)),y:Math.min(height-70,item.body.position.y/oldHeight*height)});Sleeping.set(item.body,false);}this.setWalls();this.setMatches(this.selected);}
 setMatches(ids:string[]){
  this.selected=[...ids].filter(id=>!this.items.some(item=>item.sticker.id===id&&item.pinned)).slice(0,10);
  const columns=this.width<700?5:Math.min(10,Math.max(5,Math.floor((this.width-120)/125)));
  const rows=Math.ceil(this.selected.length/columns);
  const availableWidth=Math.min(this.width-32,1080);
  const cellWidth=Math.min(140,availableWidth/Math.min(columns,Math.max(1,this.selected.length)));
  const top=this.resultTop()+18;
  const room=Math.max(90,this.height-140-top);
  const cellHeight=Math.min(this.width<700?80:128,room/Math.max(1,rows));
  for(const item of this.items){if(item.pinned)continue;const index=this.selected.indexOf(item.sticker.id);const hadTarget=!!item.target;
   if(index>=0){const row=Math.floor(index/columns),count=Math.min(columns,this.selected.length-row*columns),col=index%columns;
    item.target={x:this.width/2+(col-(count-1)/2)*cellWidth,y:top+cellHeight*(row+.5)};
    item.targetScale=Math.min((cellWidth-12)*this.mobileScale()/item.width,(cellHeight-8)*this.mobileScale()/item.height,1.05);item.body.collisionFilter.mask=0;item.element.style.zIndex='20';
    Sleeping.set(item.body,false);
    if(this.reduced.matches){Body.setPosition(item.body,item.target);Body.setAngle(item.body,0);Body.setVelocity(item.body,{x:0,y:0});item.scale=item.targetScale;}
   }else {item.target=undefined;item.targetScale=1;item.body.collisionFilter.mask=0xffffffff;item.element.style.zIndex='1';if(hadTarget){Sleeping.set(item.body,false);Body.setAngularVelocity(item.body,(Math.random()-.5)*.06);}}
   item.element.classList.toggle('matched',index>=0);item.element.setAttribute('aria-pressed',String(index>=0));
  }
  if(this.reduced.matches){for(let i=0;i<400;i++)this.step();this.render();}
  return this.selected.length;
 }
 shake(){for(const item of this.items){if(item.target||item.pinned)continue;Sleeping.set(item.body,false);if(this.reduced.matches){Body.setPosition(item.body,{x:50+Math.random()*(this.width-100),y:this.height-100-Math.random()*200});}else{Body.setVelocity(item.body,{x:(Math.random()-.5)*13,y:-9-Math.random()*8});Body.setAngularVelocity(item.body,(Math.random()-.5)*.2);}}if(this.reduced.matches){for(let i=0;i<400;i++)this.step();this.render();}}
 private step(){for(const item of this.items){if(item.pinned)continue;const body=item.body;const d=this.drag?.item===item?this.drag:undefined;const target=d?{x:Math.max(20,Math.min(this.width-20,d.x-d.dx)),y:Math.max(30,Math.min(this.height-70,d.y-d.dy))}:item.target;
   if(target){Sleeping.set(body,false);Body.applyForce(body,body.position,{x:body.mass*((target.x-body.position.x)*.000055-body.velocity.x*.00046),y:body.mass*((target.y-body.position.y)*.000055-body.velocity.y*.00046-this.engine.gravity.y*.001)});Body.setAngularVelocity(body,body.angularVelocity*.7-body.angle*.035);}
   // Recover bodies after a drastic resize or an energetic throw.
   if(body.position.y>this.height+200||body.position.x < -250||body.position.x>this.width+250){Body.setPosition(body,{x:this.width/2,y:this.height-200});Body.setVelocity(body,{x:0,y:0});}
  }Engine.update(this.engine,1000/60);}
 private unpin(item:Item){
  item.pinned=false;item.targetScale=1;
  Composite.add(this.engine.world,item.body);Sleeping.set(item.body,false);item.body.collisionFilter.mask=0;
  item.element.classList.remove('pinned');item.element.style.zIndex='100';
  item.element.setAttribute('aria-label',item.sticker.title);item.element.title=item.sticker.title+' · Click to view, drag and hold still to pin';
 }
 private pinWhenStill(now:number){
  const d=this.drag;if(!d||!d.moved)return;
  const item=d.item,body=item.body;
  const x=Math.max(20,Math.min(this.width-20,d.x-d.dx)),y=Math.max(30,Math.min(this.height-70,d.y-d.dy));
  if(Math.hypot(body.position.x-x,body.position.y-y)>6||Math.hypot(body.velocity.x,body.velocity.y)>.6){d.stillSince=undefined;return;}
  d.stillSince??=now;
  if(now-d.stillSince<700)return;
  item.pinned=true;item.target=undefined;item.targetScale=Math.max(1.525,item.targetScale*1.6);
  Body.setVelocity(body,{x:0,y:0});Body.setAngularVelocity(body,0);Composite.remove(this.engine.world,body);
  item.element.classList.remove('matched');item.element.classList.add('pinned');item.element.style.zIndex='0';
  item.element.setAttribute('aria-pressed','false');item.element.setAttribute('aria-label',item.sticker.title+' · Pinned');item.element.title=item.sticker.title+' · Pinned · Drag to unpin, click to view';
  this.drag=undefined;
  if(item.element.hasPointerCapture(d.pointer))item.element.releasePointerCapture(d.pointer);
  this.setMatches(this.selected);
 }
 private render(){for(const item of this.items){item.scale=this.reduced.matches?item.targetScale:item.scale+(item.targetScale-item.scale)*(item.pinned?.06:.15);const {x,y}=item.body.position;item.element.style.transform=`translate3d(${x-item.width/2}px,${y-item.height/2}px,0) rotate(${item.body.angle}rad) scale(${item.scale})`;}}
 private tick=(now:number)=>{if(!document.hidden){this.accumulator+=Math.min(now-(this.last||now),50);while(this.accumulator>=1000/60){if(!this.reduced.matches||this.drag)this.step();this.accumulator-=1000/60;}this.pinWhenStill(now);this.render();}else if(this.drag){this.drag.stillSince=undefined;}this.last=now;this.frame=requestAnimationFrame(this.tick);};
 destroy(){cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();Composite.clear(this.engine.world,false);Engine.clear(this.engine);this.stage.replaceChildren();}
}
