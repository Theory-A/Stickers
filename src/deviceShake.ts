type MotionSample = {x:number|null;y:number|null;z:number|null};
type Vector = {x:number;y:number;z:number};
export type ShakeImpulse = {strength:number;horizontal:number};

const threshold=11;
const minPulseGap=80;
const maxPulseGap=700;
const cooldown=1700;

export class DeviceShakeDetector {
 private previous?:{vector:Vector;time:number};
 private pulse?:{vector:Vector;magnitude:number;time:number};
 private lastPulseAt=-Infinity;
 private lastShakeAt=-Infinity;

 sample(sample:MotionSample|null,now:number):ShakeImpulse|null {
  if(!sample||sample.x===null||sample.y===null||sample.z===null)return null;
  const vector={x:sample.x,y:sample.y,z:sample.z};
  const previous=this.previous;
  this.previous={vector,time:now};
  if(!previous||now<=previous.time||now-previous.time>250){this.pulse=undefined;return null;}
  const delta={x:vector.x-previous.vector.x,y:vector.y-previous.vector.y,z:vector.z-previous.vector.z};
  const magnitude=Math.hypot(delta.x,delta.y,delta.z);
  if(magnitude<threshold||now-this.lastPulseAt<minPulseGap)return null;
  this.lastPulseAt=now;
  if(now-this.lastShakeAt<cooldown)return null;

  const first=this.pulse;
  if(first&&now-first.time<=maxPulseGap){
   const dot=delta.x*first.vector.x+delta.y*first.vector.y+delta.z*first.vector.z;
   if(dot<-.35*magnitude*first.magnitude){
    this.pulse=undefined;
    this.lastShakeAt=now;
    return {strength:Math.min(1.5,Math.max(.85,(magnitude+first.magnitude)/32)),horizontal:-delta.x/magnitude};
   }
  }
  this.pulse={vector:delta,magnitude,time:now};
  return null;
 }

 reset(){this.previous=undefined;this.pulse=undefined;this.lastPulseAt=-Infinity;}
}
