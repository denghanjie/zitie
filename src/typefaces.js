import {FONT_BLOCKS} from './font-coverage.js';
export const TYPEFACES = [
 {id:'wenkai',label:'细笔文楷',description:'霞鹜文楷 Light · 硬笔练习'},
 {id:'kai',label:'笔顺楷体',description:'笔顺示范 · 笔画较饱满'},
 {id:'serif',label:'宋体',description:'Noto Serif SC · 端正清晰'},
 {id:'sans',label:'黑体',description:'Noto Sans SC · 简洁工整'},
];
export const normalizeTypeface=id=>TYPEFACES.some(f=>f.id===id)?id:'kai';
const blocks=new Map();
export async function loadTypeface(id,content){
 id=normalizeTypeface(id);
 if(id==='kai')return {};
 const chars=[...new Set([...content].filter(c=>!(/\s/u.test(c))))];
 const groups=[...new Set(chars.map(c=>Math.floor(c.codePointAt(0)/128)))].filter(b=>FONT_BLOCKS[id].includes(b));
 const result={};
 async function worker(){
  while(groups.length){
   const block=groups.shift(),key=`${id}/${block}`;
   if(!blocks.has(key)){
    const request=fetch(`${import.meta.env?.BASE_URL||'/'}fonts/${id}/${block}.json`).then(async r=>{
     if(!r.ok)throw Error('font request failed');
     const data=await r.json();
     if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid font block');
     return data;
    }).catch(e=>{blocks.delete(key);throw e});
    blocks.set(key,request);
   }
   Object.assign(result,await blocks.get(key));
  }
 }
 try{await Promise.all(Array.from({length:6},worker));}
 catch{throw Error('字体加载失败，请检查网络后重试，或改选笔顺楷体。');}
 return Object.fromEntries(chars.filter(c=>result[c]).map(c=>[c,result[c]]));
}

export const FONT_SIZES = [{id:'tiny',label:'很小 · 50%',scale:.5},{id:'compact',label:'较小 · 65%',scale:.65},{id:'small',label:'小 · 80%',scale:.8},{id:'normal',label:'标准 · 100%',scale:1},{id:'large',label:'大 · 110%',scale:1.1}];
export const normalizeFontSize=id=>FONT_SIZES.some(s=>s.id===id)?id:'normal';
export const fontScale=id=>FONT_SIZES.find(s=>s.id===normalizeFontSize(id)).scale;
