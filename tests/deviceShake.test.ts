import test from 'node:test';
import assert from 'node:assert/strict';
import { DeviceShakeDetector } from '../src/deviceShake';

const motion=(x:number)=>({x,y:0,z:0});

test('requires a quick reversal before triggering a shake',()=>{
 const detector=new DeviceShakeDetector();
 assert.equal(detector.sample(motion(0),0),null);
 assert.equal(detector.sample(motion(13),100),null);
 assert.equal(detector.sample(motion(26),220),null);
 assert.equal(detector.sample(motion(0),340)?.horizontal,1);
});

test('ignores a single jolt and applies a cooldown',()=>{
 const detector=new DeviceShakeDetector();
 detector.sample(motion(0),0);
 assert.equal(detector.sample(motion(16),100),null);
 assert.ok(detector.sample(motion(-16),220));
 assert.equal(detector.sample(motion(16),340),null);
 assert.equal(detector.sample(motion(-16),460),null);
 detector.sample(motion(0),2100);
 assert.equal(detector.sample(motion(14),2200),null);
 assert.ok(detector.sample(motion(-14),2320));
});

test('forgets a pulse after a sensor gap',()=>{
 const detector=new DeviceShakeDetector();
 detector.sample(motion(0),0);
 detector.sample(motion(14),100);
 assert.equal(detector.sample(motion(-14),500),null);
 assert.equal(detector.sample(motion(14),620),null);
});

test('responds to lighter back-and-forth motion',()=>{
 const detector=new DeviceShakeDetector();
 detector.sample(motion(0),0);
 assert.equal(detector.sample(motion(6),100),null);
 assert.ok(detector.sample(motion(-6),220));
});
