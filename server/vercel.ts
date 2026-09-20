import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { createApi } from './api.ts';

const api=createApi(process.env,resolve(process.cwd(),'public/stickers/catalog.json'));

export default async function handler(req:IncomingMessage,res:ServerResponse){
 await api(req,res,()=>{res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Not found'}));});
}
