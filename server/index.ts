import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { loadEnv } from 'vite';
import { createApi } from './api.ts';
const env = {...loadEnv('production',process.cwd(),''),...process.env};
const api = createApi(env);
const root = resolve('dist');
if(!existsSync(root)) throw new Error('Run npm run build before npm start');
const mime:Record<string,string> = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json','.svg':'image/svg+xml'};
createServer((req,res)=>void api(req,res,()=>{
 let path:string;try {path=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname);} catch {res.writeHead(400).end();return;}
 let file=resolve(root,'.'+path);
 if(file!==root && !file.startsWith(root+sep)){res.writeHead(403).end();return;}
 if(file===root) file=resolve(root,'index.html');
 if(!existsSync(file)||!statSync(file).isFile()){res.writeHead(404).end('Not found');return;}
 res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});
 createReadStream(file).pipe(res);
})).listen(Number(env.PORT||3000),'127.0.0.1',()=>console.log(`Little Paper World: http://localhost:${env.PORT||3000}`));
