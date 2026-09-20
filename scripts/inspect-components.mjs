import sharp from 'sharp';
import {readdir} from 'node:fs/promises';
for(const file of (await readdir('assets/grids')).filter(f=>f.endsWith('.png'))){
 const {data,info}=await sharp('assets/grids/'+file).ensureAlpha().raw().toBuffer({resolveWithObject:true});const {width:w,height:h}=info;const visited=new Uint8Array(w*h);const comps=[];
 for(let i=0;i<w*h;i++){if(visited[i]||data[i*4+3]<180)continue;let queue=[i],head=0,minX=w,minY=h,maxX=0,maxY=0;visited[i]=1;while(head<queue.length){let p=queue[head++],x=p%w,y=Math.floor(p/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1]){if(n>=0&&!visited[n]&&data[n*4+3]>=180){visited[n]=1;queue.push(n);}}}if(queue.length>1000)comps.push({area:queue.length,box:[minX,minY,maxX,maxY]});}
 console.log(file,w,h,JSON.stringify(comps.sort((a,b)=>b.area-a.area).slice(0,8)));
}
