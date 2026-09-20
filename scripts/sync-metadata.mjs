import {optimizeCatalog} from './optimize-stickers.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const metadata=JSON.parse(await readFile('assets/metadata.json','utf8'));
const people=JSON.parse(await readFile('assets/people.json','utf8'));
const cutouts=JSON.parse(await readFile('assets/cutouts.json','utf8'));
const reservedNames=new Set(Object.values(people).flatMap(person=>person.aliases));
for(const [id,item]of Object.entries(metadata)){
 const names=Object.values(people).filter(person=>person.stickers.includes(id)).flatMap(person=>person.aliases);
 item.people=names;
 item.tags=[...new Set([...names,...item.tags.filter(tag=>!reservedNames.has(tag))])];
}
const catalog=cutouts.map(({id,source,sourceFolder,image,width,height})=>{
 if(!metadata[id])throw new Error(`Missing metadata: ${id}`);
 return {id,source,sourceFolder:sourceFolder||'images',image,width,height,...metadata[id]};
});
await writeFile('assets/metadata.json',JSON.stringify(metadata,null,2));
await writeFile('public/stickers/catalog.json',JSON.stringify(await optimizeCatalog(catalog),null,2));
console.log(`Synced metadata and user-provided name aliases for ${catalog.length} stickers.`);
