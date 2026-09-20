type Acceleration = {x:number|null;y:number|null;z?:number|null};
export type TiltGravity = {x:number;y:number};
export type MotionPolarity = -1|1;

// Sensor axes stay in the device's natural orientation after screen rotation.
function screenAcceleration(sample:Acceleration,screenAngle:number){
 const angle=((screenAngle%360)+360)%360;
 let x=sample.x!,y=sample.y!;
 if(angle===90){[x,y]=[sample.y!,-sample.x!];}
 else if(angle===180){[x,y]=[-sample.x!,-sample.y!];}
 else if(angle===270){[x,y]=[-sample.y!,sample.x!];}
 return {x,y};
}

// Some mobile browsers report the opposite accelerometer sign. A face-up or
// upright reading identifies which convention the current device uses.
export function inferMotionPolarity(sample:Acceleration|null,screenAngle:number):MotionPolarity|null {
 if(!sample)return null;
 if(sample.x!=null&&sample.y!=null&&Number.isFinite(sample.x)&&Number.isFinite(sample.y)){
  const {x,y}=screenAcceleration(sample,screenAngle);
  if(Math.abs(y)>4&&Math.abs(y)>Math.abs(x)*1.25)return y>0?1:-1;
 }
 if(sample.z!=null&&Number.isFinite(sample.z)&&Math.abs(sample.z)>5&&Math.abs(sample.z)>Math.hypot(sample.x??0,sample.y??0)*1.25)return sample.z>0?1:-1;
 return null;
}

export function gravityFromMotion(sample:Acceleration|null,screenAngle:number,polarity:MotionPolarity=-1):TiltGravity|null {
 if(!sample||sample.x===null||sample.y===null||!Number.isFinite(sample.x)||!Number.isFinite(sample.y))return null;
 const {x,y}=screenAcceleration(sample,screenAngle);
 const limit=Math.max(9.81,Math.hypot(x,y));
 const horizontal=-polarity*x/limit,vertical=polarity*y/limit;
 return {x:Math.abs(horizontal)<1e-12?0:horizontal,y:Math.abs(vertical)<1e-12?0:vertical};
}
