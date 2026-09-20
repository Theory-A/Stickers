import test from 'node:test';
import assert from 'node:assert/strict';
import { gravityFromMotion, inferMotionPolarity } from '../src/deviceTilt';

test('tilting the right side down pulls stickers right in portrait',()=>{
 assert.deepEqual(gravityFromMotion({x:9.81,y:0},0),{x:1,y:0});
});

test('an upright phone pulls stickers down in every screen rotation',()=>{
 assert.deepEqual(gravityFromMotion({x:0,y:-9.81},0),{x:0,y:1});
 assert.deepEqual(gravityFromMotion({x:9.81,y:0},90),{x:0,y:1});
 assert.deepEqual(gravityFromMotion({x:0,y:9.81},180),{x:0,y:1});
 assert.deepEqual(gravityFromMotion({x:-9.81,y:0},270),{x:0,y:1});
});

test('a flat phone has no in-plane gravity',()=>{
 assert.deepEqual(gravityFromMotion({x:0,y:0},0),{x:0,y:0});
 assert.equal(gravityFromMotion({x:null,y:0},0),null);
});

test('normalizes opposite sensor conventions from a resting reading',()=>{
 const safari={x:0,y:-9.81,z:0};
 const android={x:0,y:9.81,z:0};
 assert.equal(inferMotionPolarity(safari,0),-1);
 assert.equal(inferMotionPolarity(android,0),1);
 assert.deepEqual(gravityFromMotion(android,0,1),{x:0,y:1});
 assert.equal(inferMotionPolarity({x:0,y:0,z:-9.81},0),-1);
 assert.equal(inferMotionPolarity({x:0,y:0,z:9.81},0),1);
});
