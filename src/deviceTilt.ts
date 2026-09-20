type Acceleration = {x:number|null;y:number|null};
export type TiltGravity = {x:number;y:number};

// Device coordinates point right and up; screen physics points right and down.
// The sensor axes remain in the device's natural orientation after screen rotation.
export function gravityFromMotion(sample:Acceleration|null,screenAngle:number):TiltGravity|null {
 if(!sample||sample.x===null||sample.y===null||!Number.isFinite(sample.x)||!Number.isFinite(sample.y))return null;
 const angle=((screenAngle%360)+360)%360;
 let x=sample.x,y=sample.y;
 if(angle===90){[x,y]=[sample.y,-sample.x];}
 else if(angle===180){[x,y]=[-sample.x,-sample.y];}
 else if(angle===270){[x,y]=[-sample.y,sample.x];}
 const limit=Math.max(9.81,Math.hypot(x,y));
 const horizontal=-x/limit,vertical=y/limit;
 return {x:Math.abs(horizontal)<1e-12?0:horizontal,y:Math.abs(vertical)<1e-12?0:vertical};
}
