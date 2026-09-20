import {isHan, articleLayout, paginatePoetry, wrapLine} from './poetry.js';
export {isHan, articleLayout} from './poetry.js';
const cache = new Map();
export async function loadCharacters(text, progress) {
  const chars = [...new Set([...text].filter(isHan))];
  let done = 0;
  const data = {};
  async function worker() {
    while(chars.length) {
      const c = chars.shift();
      if(!cache.has(c)) {
        try {
          const r = await fetch(`${import.meta.env.BASE_URL}data/${encodeURIComponent(c)}.json`);
          if(!r.ok) throw Error();
          const d = await r.json();
          if(!Array.isArray(d.strokes)) throw Error();
          cache.set(c,d);
        } catch { data[c] = null; }
      }
      data[c] = cache.get(c) || null;
      progress?.(++done);
    }
  }
  await Promise.all(Array.from({length:8},worker));
  return data;
}
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function text(s,x,y,size=14,fill='#738079',anchor='start') {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-family="KaiTi, STKaiti, Kaiti SC, Songti SC, serif">${esc(s)}</text>`;
}
function glyph(c,d,x,y,size,color,step) {
  if(!d) return text(c,x+size/2,y+size*.77,size*.77,color,'middle');
  return `<g transform="translate(${x+size*.08} ${y+size*.08}) scale(${size*.84/1024} ${-size*.84/1024}) translate(0 -900)">${d.strokes.map((p,i)=>`<path d="${p}" fill="${step===undefined?color:i<step?'#606c65':i===step?'#202f27':'#eeeeeb'}"/>`).join('')}</g>`;
}
function grid(x,y,s,type) {
 return `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="none" stroke="#95b1a0" stroke-width="1"/><path d="M${x+s/2} ${y}v${s} M${x} ${y+s/2}h${s}${type==='mi'?` M${x} ${y}l${s} ${s} M${x+s} ${y}l-${s} ${s}`:''}" fill="none" stroke="#b4c8bc" stroke-width=".65" stroke-dasharray="4 4"/>`;
}
export function paginate(input,data) {
 if(input.mode==='single') {
  const pages=[]; let rows=[],used=0;
  for(const c of [...input.content].filter(isHan)) {
   const h=120+Math.max(1,Math.ceil((data[c]?.strokes.length||0)/20))*34;
   if(used+h>890&&rows.length){pages.push(rows);rows=[];used=0;}
   rows.push({c,y:155+used,h});used+=h;
  }
  if(rows.length)pages.push(rows);
  return pages;
 }
 const layout=articleLayout(input);
 if(layout.poetry)return paginatePoetry(layout);
 const rows=[];
 for(const p of layout.lines) {
  const chars=[...p];
  if(!chars.length){rows.push([]);continue;}
  rows.push(...wrapLine(p,layout.columns));
 }
 return Array.from({length:Math.ceil(rows.length/layout.perPage)},(_,i)=>{
  const page=rows.slice(i*layout.perPage,(i+1)*layout.perPage);
  page.layout=layout;
  return page;
 });
}
export function pageSvg(input,data,page,index,total) {
 let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 794 1123" width="794" height="1123" role="img" aria-label="${esc(input.title||'汉字练习')} 第${index+1}页"><rect width="794" height="1123" fill="white"/>`;
 s+=text(input.title||'汉字练习',397,77,32,'#18271e','middle');
 s+=text('姓名：____________    日期：____________',704,120,15,'#66746b','end');
 s+='<path d="M85 137H709" stroke="#d5ded7"/>';
 if(input.mode==='single') {
  for(const {c,y,h} of page){
   for(let i=0;i<6;i++)s+=grid(85+i*105,y,97,input.grid)+glyph(c,data[c],85+i*105,y,97,i===0?'#202721':'#aeb3ae');
   s+=text('笔顺',85,y+121,12);
   const d=data[c];
   if(d) d.strokes.forEach((_,i)=>{
    const x=122+(i%20)*29, yy=y+104+Math.floor(i/20)*34;
    s+=glyph(c,d,x,yy,27,'#222',i)+text(i+1,x+13.5,yy+32,7,'#778078','middle');
   });
   else s+=text('此字暂无笔顺数据，可照范字临摹',125,y+121,12,'#a5683c');
   s+=`<path d="M85 ${y+h-9}H709" stroke="#e3e7e2"/>`;
  }
 } else {
  const layout=page.layout||articleLayout(input);
  const {poetry,columns,cell,gap}=layout;
  const top=poetry?175:155;
  const left=(794-columns*cell)/2;
  page.forEach((row,r)=>{
   // Blank stanzas remain whitespace, rather than a full line of empty boxes.
   if(poetry&&!row.length)return;
   const count=poetry?row.length:columns;
   for(let col=0;col<count;col++){
    const x=left+col*cell,y=page.rowY?.[r]??(top+r*(cell+gap));
    s+=grid(x,y,cell,input.grid);
    if(row[col])s+=glyph(row[col],data[row[col]],x,y,cell,'#a8afa8');
   }
  });
 }
 s+=text('静下心，写好每一个字。',397,1076,13,'#8b968d','middle')+text(`${index+1} / ${total}`,709,1076,12,'#8b968d','end');
 return s+'</svg>';
}
export async function downloadPdf(svgs,title,progress) {
 const {jsPDF}=await import('jspdf');
 const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
 for(let i=0;i<svgs.length;i++){
  const url=URL.createObjectURL(new Blob([svgs[i]],{type:'image/svg+xml;charset=utf-8'}));
  try{
   const img=new Image();
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
   const canvas=document.createElement('canvas');canvas.width=1588;canvas.height=2246;
   const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1588,2246);ctx.drawImage(img,0,0,1588,2246);
   if(i)pdf.addPage();
   pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,210,297,undefined,'FAST');
   canvas.width=canvas.height=1;progress(i+1);
  }finally{URL.revokeObjectURL(url);}
  await new Promise(r=>setTimeout(r,0));
 }
 pdf.save(`${(title||'汉字练习').replace(/[\\/:*?"<>|]/g,'_')}.pdf`);
}
