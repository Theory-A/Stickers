import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCells } from '../src/matchLayout';

test('match slots keep the same viewport proportions at different zoom levels',()=>{
 for(const mobile of [false,true]){
  for(const count of [2,7,10]){
   const normal=matchCells(1200,800,320,count,mobile);
   const zoomed=matchCells(600,400,160,count,mobile);
   assert.equal(normal.length,zoomed.length);
   for(let i=0;i<count;i++){
    assert.ok(Math.abs(normal[i].x/1200-zoomed[i].x/600)<1e-10);
    assert.ok(Math.abs(normal[i].y/800-zoomed[i].y/400)<1e-10);
   }
  }
 }
});

test('partial rows stay centered under the search area',()=>{
 const cells=matchCells(375,800,320,7,true);
 assert.equal(cells.length,7);
 assert.ok(cells[0].x<cells[4].x);
 assert.equal((cells[5].x+cells[6].x)/2,375/2);
 assert.ok(cells[0].y>320);
 assert.ok(cells[5].y>cells[0].y);
});

test('mobile slots move closer without shrinking the sticker size allowance',()=>{
 const cells=matchCells(375,800,320,10,true);
 assert.ok(Math.abs((cells[1].x-cells[0].x)-375*.64/5)<1e-10);
 assert.ok(Math.abs((cells[5].y-cells[0].y)-800*.075)<1e-10);
 assert.equal(cells[0].stickerWidth,375*.88/5);
 assert.equal(cells[0].stickerHeight,800*.1);
});
