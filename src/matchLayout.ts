export type MatchCell = {x:number;y:number;slotWidth:number;slotHeight:number;stickerWidth:number;stickerHeight:number};

export function matchCells(width:number,height:number,resultBottom:number,count:number,mobile:boolean):MatchCell[] {
 if(count<=0)return [];
 const columns=mobile?5:10;
 const rows=Math.ceil(count/columns);
 const slotWidth=width*(mobile?.64:.84)/columns;
 const stickerWidth=width*(mobile?.88:.84)/columns;
 const top=Math.max(resultBottom+height*.025,height*(mobile?.44:.5));
 const room=Math.max(0,height-49-top);
 const slotHeight=Math.min(height*(mobile?.075:.14),room/rows);
 const stickerHeight=Math.min(height*(mobile?.1:.14),room/rows);
 return Array.from({length:count},(_,index)=>{
  const row=Math.floor(index/columns);
  const rowCount=Math.min(columns,count-row*columns);
  const col=index%columns;
  return {x:width/2+(col-(rowCount-1)/2)*slotWidth,y:top+(row+.5)*slotHeight,slotWidth,slotHeight,stickerWidth,stickerHeight};
 });
}
