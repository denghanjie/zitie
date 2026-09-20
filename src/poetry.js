export const isHan = c => /\p{Script=Han}/u.test(c);
const closing=/[，。！？；：、,.!?;:）】》」』”’]/u;
const opening=/[（【《「『“‘]/u;
// Keep punctuation and closing quotes attached to the preceding clause.
export function splitClauses(line) {
 const chars=[...line],result=[];let part='';
 chars.forEach((c,i)=>{
  part+=c;
  if(/[，。！？；!?;][」』”’）】]*$/u.test(part)&&!/[，。！？；!?;」』”’）】]/u.test(chars[i+1]||'')) {result.push(part);part='';}
 });
 if(part)result.push(part);
 return result;
}
export function wrapLine(line,columns,natural=false) {
 const chars=[...line],rows=[];let start=0;
 while(start<chars.length){
  let end=Math.min(start+columns,chars.length);
  if(end<chars.length){
   if(natural){
    for(let i=end-1;i>=start+Math.floor(columns*.6);i--){
     if(/[，。！？；：、]/u.test(chars[i])&&!closing.test(chars[i+1])){end=i+1;break;}
    }
   }
   while(end>start+1&&(closing.test(chars[end]||'')||opening.test(chars[end-1])))end--;
  }
  rows.push(chars.slice(start,end));start=end;
 }
 return rows;
}
export function articleLayout(input) {
 const content=input.content.replace(/\r\n?/g,'\n').replace(/\t/g,'  ');
 const original=content.split('\n');
 const nonempty=original.filter(s=>s.trim());
 const clauses=nonempty.flatMap(splitClauses).filter(s=>s.trim());
 const lengths=clauses.map(s=>[...s].filter(isHan).length);
 const regular=lengths.length>=2&&[4,5,7].includes(lengths[0])&&lengths.every(n=>n===lengths[0]);
 const explicitVerse=nonempty.length>=2&&nonempty.filter(s=>[...s.trim()].length<=20).length/nonempty.length>=.75;
 const lyric=lengths.length>=4&&lengths.every(n=>n>0&&n<=12)&&lengths.reduce((a,b)=>a+b,0)/lengths.length<=7.5;
 const knownTitle=/如梦令|水调歌头|梦游天姥吟留别/.test(input.title||'');
 const poetry=input.layout==='poem'||(input.layout!=='prose'&&(regular||explicitVerse||lyric||knownTitle));
 if(!poetry)return {poetry:false,lines:original,columns:12,cell:52,gap:1,perPage:16};
 const split=input.lineBreak==='punctuation'||(input.lineBreak!=='original'&&(nonempty.length<=1||nonempty.every(s=>[...s.trim()].length>24)));
 const lines=original.flatMap(line=>line.trim()?(split?splitClauses(line.trim()):[line.trim()]):['']);
 while(lines.length&&!lines[0])lines.shift();while(lines.length&&!lines.at(-1))lines.pop();
 const columns=Math.min(12,Math.max(1,...lines.map(s=>[...s].length)));
 let cell=Math.min(84,624/columns);const gap=24;
 // For moderately sized stanzas, trade a little grid size for an intact page.
 const stanzaLengths=lines.join('\n').split(/\n\n+/).map(s=>s.split('\n').reduce((n,line)=>n+wrapLine(line,columns,true).length,0));
 const largest=Math.max(0,...stanzaLengths);
 if(largest>0&&largest<=12){
  const fitting=(850-(largest-1)*gap)/largest;
  cell=Math.min(cell,Math.max(52,fitting));
 }
 return {poetry:true,lines,columns,cell,gap,perPage:Math.floor((850+gap)/(cell+gap)),breakMode:split?'按标点断句':'保留原有分行'};
}
export function paginatePoetry(layout) {
 const groups=[];let group=[];
 for(const line of layout.lines){
  if(!line){if(group.length)groups.push(group);group=[];}
  else group.push(wrapLine(line,layout.columns,true));
 }
 if(group.length)groups.push(group);
 const pages=[];let page=[],ys=[],bottom=0;
 const {cell,gap}=layout,limit=850;
 const unitHeight=rows=>rows.length*cell+(rows.length-1)*12;
 const groupHeight=g=>g.reduce((sum,rows)=>sum+unitHeight(rows),0)+(g.length-1)*gap;
 function flush(){if(page.length){page.layout=layout;page.rowY=ys;pages.push(page);}page=[];ys=[];bottom=0;}
 groups.forEach((g,gi)=>{
  const h=groupHeight(g);
  // Stanzas that fit on a page move as a whole, instead of straddling pages.
  if(page.length&&h<=limit&&bottom+gap+24+h>limit)flush();
  g.forEach((rows,vi)=>{
   let before=page.length?(vi===0&&gi>0?gap+24:gap):0;
   if(page.length&&bottom+before+unitHeight(rows)>limit){flush();before=0;}
   rows.forEach((row,ri)=>{
    let space=ri?12:before;
    if(page.length&&bottom+space+cell>limit){flush();space=0;}
    const y=bottom+space;page.push(row);ys.push(175+y);bottom=y+cell;
   });
  });
 });
 flush();return pages;
}
