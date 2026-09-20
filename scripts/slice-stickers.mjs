import {optimizeCatalog} from './optimize-stickers.mjs';
// Extract connected sticker silhouettes, rather than cutting blindly through 2x2 axes.
// The generator may shift its gutters. This preserves whole silhouettes and the alpha.
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('assets/manifest.json','utf8'));
await mkdir('public/stickers',{recursive:true});
const fromBatch=Number(process.argv[2] || 1);
if(!Number.isInteger(fromBatch)||fromBatch<1)throw new Error('First batch must be a positive integer');
let existing=[];
try {existing=JSON.parse(await readFile('assets/cutouts.json','utf8'));} catch(e) {if(e.code!=='ENOENT')throw e;}
const dimensions=existing.filter(e=>e.batch<fromBatch);
const metadata=JSON.parse(await readFile('assets/metadata.json','utf8'));
for(const entry of manifest)if(!metadata[entry.id])throw new Error(`Missing metadata: ${entry.id}`);
const batches=[...new Set(manifest.map(e=>e.batch))].filter(batch=>batch>=fromBatch).sort((a,b)=>a-b);
for(const batch of batches){
 const entries=manifest.filter(e=>e.batch===batch),path=`assets/grids/batch-${String(batch).padStart(2,'0')}.png`;
 const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});const {width:w,height:h}=info;
 const labels=new Int32Array(w*h);const components=[];let label=0;
 for(let start=0;start<w*h;start++){
  if(labels[start]||data[start*4+3]<180)continue;
  label++;const pixels=[start];labels[start]=label;let minX=w,minY=h,maxX=0,maxY=0;
  for(let head=0;head<pixels.length;head++){const p=pixels[head],x=p%w,y=Math.floor(p/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&!labels[n]&&data[n*4+3]>=180){labels[n]=label;pixels.push(n);}
  }
  if(pixels.length>1000)components.push({label,pixels,minX,minY,maxX,maxY});
 }
 const chosen=components.sort((a,b)=>b.pixels.length-a.pixels.length).slice(0,entries.length);
 if(chosen.length!==entries.length)throw new Error(`${path}: expected ${entries.length} silhouettes, found ${chosen.length}`);
 chosen.sort((a,b)=>(a.minY+a.maxY)-(b.minY+b.maxY));
 const ordered=entries.length===1?chosen:[...chosen.slice(0,2).sort((a,b)=>a.minX-b.minX),...chosen.slice(2).sort((a,b)=>a.minX-b.minX)];
 const allowed=new Set(chosen.map(c=>c.label));const owners=new Int32Array(w*h);const distance=new Uint8Array(w*h);const queue=[];
 for(const c of chosen)for(const p of c.pixels){owners[p]=c.label;queue.push(p);}
 // Expand the solid outline by up to 8 px; use original alpha in this soft fringe.
 for(let head=0;head<queue.length;head++){const p=queue[head];if(distance[p]>=8)continue;const x=p%w,y=Math.floor(p/w);
  for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&!owners[n]&&(!allowed.has(labels[n])||labels[n]===owners[p])){owners[n]=owners[p];distance[n]=distance[p]+1;queue.push(n);}
 }
 for(const [index,c]of ordered.entries()){
  const entry=entries[index],left=Math.max(0,c.minX-9),top=Math.max(0,c.minY-9),right=Math.min(w-1,c.maxX+9),bottom=Math.min(h-1,c.maxY+9),width=right-left+1,height=bottom-top+1;
  const output=Buffer.alloc(width*height*4);
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const p=y*w+x,q=((y-top)*width+x-left)*4;if(owners[p]===c.label){output[q]=data[p*4];output[q+1]=data[p*4+1];output[q+2]=data[p*4+2];output[q+3]=data[p*4+3];}}
  const image=`/stickers/${entry.id}.png`;
  const result=await sharp(output,{raw:{width,height,channels:4}}).extend({top:12,bottom:12,left:12,right:12,background:{r:0,g:0,b:0,alpha:0}}).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).png().toFile(`public${image}`);
  dimensions.push({...entry,image,width:result.width,height:result.height,bounds:{left,top,width,height},alpha:true});
 }
}
dimensions.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
if(dimensions.length!==manifest.length)throw new Error('Cutout count does not match the source manifest');
await writeFile('assets/cutouts.json',JSON.stringify(dimensions,null,2));
const catalog=dimensions.map(({id,source,sourceFolder,image,width,height})=>{if(!metadata[id])throw new Error(`Missing metadata: ${id}`);return {id,source,sourceFolder:sourceFolder || 'images',image,width,height,...metadata[id]};});
await writeFile('public/stickers/catalog.json',JSON.stringify(await optimizeCatalog(catalog),null,2));console.log(`Sliced and catalogued ${catalog.length} transparent stickers.`);
