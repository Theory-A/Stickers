import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TypeSafeClient} from '@typesafe-ai/sdk';
import {createSearchService,localSearch,rankMatches} from '../server/search';
import {parseSearchResponse,type Sticker} from '../src/types';
const metadata=JSON.parse(readFileSync('assets/metadata.json','utf8'));
const stickers:Sticker[]=Object.entries(metadata).filter(([id])=>Number(id.replace('sticker-',''))<=29).map(([id,m])=>({id,...m as Omit<Sticker,'id'>}));
test('local search finds concrete attributes, combinations, synonyms, and no matches',()=>{
 assert.deepEqual(localSearch('coffee',stickers).map(s=>s.id),['sticker-14']);
 assert.deepEqual(localSearch('red helmet',stickers).map(s=>s.id),['sticker-12']);
 assert.deepEqual(localSearch('kitty',stickers).map(s=>s.id),['sticker-05']);
 assert.equal(localSearch('spaceship',stickers).length,0);
 assert.equal(localSearch('',stickers).length,0);
 assert.equal(localSearch('black',stickers).length,10);
});
test('ranking excludes invalid/weak probabilities and caps at 10',()=>{
 const result=rankMatches([...Array.from({length:15},(_,i)=>({id:String(i),score:.7+i*.01})),{id:'weak',score:.2},{id:'bad',score:NaN},{id:'high',score:1.1}]);
 assert.equal(result.length,10);assert.equal(result[0].id,'14');assert.ok(result.every(r=>r.score>=.65&&r.score<=1));
});
test('official SDK transport receives atomic questions; probabilities rank and cache',async()=>{
 let calls=0;const client=new TypeSafeClient({apiKey:'test-key-not-real',retry:{maxRetries:0},fetch:async(url,init)=>{
  calls++;assert.equal(url,'https://api.typesafe.ai/v1/systemone');
  const body=JSON.parse(String(init?.body));assert.equal(body.state.search,'coffee');assert.equal(Object.keys(body.questions).length,stickers.length);
  for(const s of stickers){assert.equal(body.questions[s.id].type,'noul');assert.ok(body.questions[s.id].instructions.includes(s.id));assert.ok(body.questions[s.id].criteria.false);}
  const answers=Object.fromEntries(stickers.map(s=>[s.id,{type:'noul',noul:s.id==='sticker-14'?.98:.01}]));
  return new Response(JSON.stringify({model:'jev-latest',answers,usage:{input_tokens:400,output_tokens:29}}),{status:200,headers:{'Content-Type':'application/json'}});
 }});
 const search=createSearchService(stickers,client);const result=await search('coffee');assert.deepEqual(result.matches,[{id:'sticker-14',score:.98}]);assert.equal(result.mode,'jev');await search('COFFEE');assert.equal(calls,1);
});
test('API errors propagate rather than pretending local results are Jev',async()=>{
 const client=new TypeSafeClient({apiKey:'test-key',retry:{maxRetries:0},fetch:async()=>new Response('{}',{status:401})});
 await assert.rejects(()=>createSearchService(stickers,client)('coffee'));
});
test('browser rejects unknown, duplicate, oversized and invalid matches',()=>{
 const ids=new Set(stickers.map(s=>s.id));const response={mode:'jev',query:'coffee',matches:[{id:'sticker-14',score:.9}]};
 assert.equal(parseSearchResponse(response,ids).matches.length,1);
 for(const matches of [[{id:'unknown',score:.9}],[{id:'sticker-14',score:NaN}],[...response.matches,...response.matches],Array(11).fill(response.matches[0])])assert.throws(()=>parseSearchResponse({...response,matches},ids));
});
