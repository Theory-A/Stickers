import sharp from 'sharp';
import { readdir, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
await mkdir('assets/references', { recursive: true });
const folder = process.argv[2] || 'images';
const files = (await readdir(folder)).filter(f => /\.(jpe?g|png)$/i.test(f)).sort();
let manifest = [];
try { manifest = JSON.parse(await readFile('assets/manifest.json','utf8')); } catch(e) { if(e.code !== 'ENOENT') throw e; }
const known = new Set(manifest.map(e => `${e.sourceFolder || 'images'}/${e.source}`));
const pending = files.filter(file => !known.has(`${folder}/${file}`));
const startId = Math.max(0,...manifest.map(e=>Number(e.id.replace('sticker-','')))) + 1;
const startBatch = Math.max(0,...manifest.map(e=>e.batch)) + 1;
for (const [i, file] of pending.entries()) {
 const id = `sticker-${String(startId+i).padStart(2,'0')}`;
 const reference = `assets/references/${id}.png`;
 await sharp(join(folder,file)).rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).png().toFile(reference);
 manifest.push({id,source:file,sourceFolder:folder,reference,batch:startBatch+Math.floor(i/4),cell:i%4});
}
await writeFile('assets/manifest.json', JSON.stringify(manifest,null,2));
console.log(`Prepared ${pending.length} new references from ${folder}; ${manifest.length} total.`);
