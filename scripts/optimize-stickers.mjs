import sharp from 'sharp';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Always encode from the original PNG, including on repeated runs.
export async function optimizeCatalog(catalog){
 let originalBytes=0,webBytes=0;
 const optimized=[];
 for(const sticker of catalog){
  const downloadImage=sticker.downloadImage||sticker.image;
  if(!downloadImage.endsWith('.png'))throw new Error(`Missing PNG original for ${sticker.id}`);
  const image=downloadImage.replace(/\.png$/,'.webp');
  const output=await sharp(`public${downloadImage}`).webp({quality:85,alphaQuality:100,effort:5,smartSubsample:true}).toFile(`public${image}`);
  originalBytes+=(await stat(`public${downloadImage}`)).size;webBytes+=output.size;
  optimized.push({...sticker,image,downloadImage,width:output.width,height:output.height});
 }
 console.log(`Optimized ${optimized.length} stickers: ${(originalBytes/1e6).toFixed(2)} MB PNG → ${(webBytes/1e6).toFixed(2)} MB WebP (${(100*(1-webBytes/originalBytes)).toFixed(1)}% smaller).`);
 return optimized;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const path='public/stickers/catalog.json';
 const catalog=await optimizeCatalog(JSON.parse(await readFile(path,'utf8')));
 await writeFile(path,JSON.stringify(catalog,null,2));
}
