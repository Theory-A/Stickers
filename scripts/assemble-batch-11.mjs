// Reassemble the corrected portrait with the three unchanged original stickers.
// Connected components prevent touching die-cut borders from joining two assets.
import sharp from 'sharp';
import {copyFile} from 'node:fs/promises';
async function components(path){
 const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});const {width:w,height:h}=info,visited=new Uint8Array(w*h),found=[];
 for(let p=0;p<w*h;p++){
  if(visited[p]||data[p*4+3]<180)continue;const pixels=[p];visited[p]=1;let x0=w,y0=h,x1=0,y1=0;
  for(let head=0;head<pixels.length;head++){const q=pixels[head],x=q%w,y=Math.floor(q/w);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);for(const n of[x>0?q-1:-1,x<w-1?q+1:-1,y>0?q-w:-1,y<h-1?q+w:-1])if(n>=0&&!visited[n]&&data[n*4+3]>=180){visited[n]=1;pixels.push(n);}}
  if(pixels.length<10000)continue;const width=x1-x0+1,height=y1-y0+1,buffer=Buffer.alloc(width*height*4);
  for(const q of pixels){const dest=((Math.floor(q/w)-y0)*width+q%w-x0)*4;data.copy(buffer,dest,q*4,q*4+4);}
  found.push({x0,y0,width,height,buffer});
 }return found;
}
const originals=await components('assets/grids/batch-11-v1.png');originals.sort((a,b)=>a.y0-b.y0);const ordered=[...originals.slice(0,2).sort((a,b)=>a.x0-b.x0),...originals.slice(2).sort((a,b)=>a.x0-b.x0)];
const corrected=await components('assets/grids/batch-11-corrected.png');ordered[0]=corrected.find(c=>c.x0<700&&c.y0<100);
const layers=[];
for(const [i,c]of ordered.entries()){if(!c)throw new Error('Missing sticker');const {data,info}=await sharp(c.buffer,{raw:{width:c.width,height:c.height,channels:4}}).resize({width:820,height:820,fit:'inside'}).png().toBuffer({resolveWithObject:true});layers.push({input:data,left:(i%2)*1024+Math.round((1024-info.width)/2),top:Math.floor(i/2)*1024+Math.round((1024-info.height)/2)});}
await sharp({create:{width:2048,height:2048,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).png().toFile('assets/grids/batch-11.png');
