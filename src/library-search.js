import {applyEditorial} from './editorial.js';
import {correctWork} from './text-corrections.js';
export const normalize = s => String(s).normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'').toLowerCase();
export function prepareWorks(works){return works.map(correctWork).map(w=>applyEditorial(w)).map(w=>({...w,_title:normalize(w.title),_author:normalize(w.author.replace(/^[^：]+：|^（[^）]*）/u,'')),_text:normalize(w.text)}));}
// Keep source-specific quality keys and distinct versions when unifying the two libraries.
export function mergeLibraries(poetry,textbooks){
 const works=prepareWorks(poetry).map(w=>({...w,qualityKey:`poetry:${w.id}`}));
 const seen=new Set();
 for(const book of textbooks.books){
  for(const entry of book.entries){
   const qualityKey=`textbook:${entry.title}`;
   const w=applyEditorial(entry,qualityKey);
   const identity=JSON.stringify([w.title,w.author,w.text]);
   if(seen.has(identity))continue;
   seen.add(identity);
   works.push({...w,id:`textbook:${entry.id}`,qualityKey,layout:w.type,collection:'教材古诗文',sourceKind:'textbook',
    _title:normalize(w.title),_author:normalize(w.author),_text:normalize(w.text)});
  }
 }
 return works;
}
function nearVerseWorks(works,tokens,limit){
 // Only suggest a single-character difference in a long Han phrase; never edit the text.
 const patterns=tokens.map(t=>{
  if(!/^[\p{Script=Han}]{6,}$/u.test(t))return null;
  const c=[...t],variants=[];
  for(let i=0;i<=c.length;i++)variants.push(c.slice(0,i).join('')+'[\\p{Script=Han}]'+c.slice(i).join(''));
  for(let i=0;i<c.length;i++){
   variants.push(c.slice(0,i).join('')+'[\\p{Script=Han}]'+c.slice(i+1).join(''));
   variants.push(c.slice(0,i).join('')+c.slice(i+1).join(''));
  }
  return new RegExp(variants.join('|'),'u');
 });
 return works.flatMap(w=>{
  let differences=0;
  for(let i=0;i<tokens.length;i++){
   const t=tokens[i];
   if(w._title.includes(t)||w._author.includes(t)||w._text.includes(t))continue;
   if(patterns[i]?.test(w._text))differences++;else return [];
  }
  return differences===1?[{...w,searchNote:'近似诗句匹配：输入可能有一字差异，请核对原文。'}]:[];
 }).slice(0,limit);
}
function grams(s){return new Set([...s].slice(0,-1).map((_,i)=>[...s].slice(i,i+2).join('')));}
export function searchWorks(works,query,limit=30){
 const tokens=query.trim().split(/[\s《》·]+/u).map(normalize).filter(Boolean);
 if(!tokens.length)return [];
 const compact=normalize(query);
 const ranked=works.map(w=>{
  let score=0,matched=0;
  for(const t of tokens){
   if(w._title===t){score+=120;matched++;}
   else if(w._title.includes(t)){score+=80;matched++;}
   else if(w._author.includes(t)){score+=60;matched++;}
   else if(w._text.includes(t)){score+=40;matched++;}
  }
  // Also allow author/title without spaces, e.g. 苏轼水调歌头.
  if(compact===w._author+w._title||compact===w._title+w._author){score+=220;matched=tokens.length;}
  if(matched!==tokens.length){
   const a=grams(compact),b=grams(w._title);const overlap=[...a].filter(g=>b.has(g)).length;
   if(compact.length>=4&&overlap/Math.max(a.size,b.size)>=.55)score=15+overlap;
   else score=0;
  }
  return {work:w,score};
 }).filter(r=>r.score>0);
 if(!ranked.length)return nearVerseWorks(works,tokens,limit);
 return (ranked.some(r=>r.score>=40)?ranked.filter(r=>r.score>=40):ranked).sort((a,b)=>b.score-a.score||a.work.title.localeCompare(b.work.title,'zh')).slice(0,limit).map(r=>r.work);
}
export function hintedWorks(works,suggestions){
 const seen=new Set(),results=[];
 for(const item of suggestions){
  // Only corpus records can be selected: the model never supplies worksheet text.
  const query=[item.author,item.title].filter(Boolean).join(' ')||item.quote;
  let candidates=searchWorks(works,query||'',12);
  if(!candidates.length&&item.quote)candidates=searchWorks(works,item.quote,12);
  // 教材的署名有时记录的是文献来源（诗经、乐府诗集），而 AI 会返回“佚名”。
  if(!candidates.length&&item.title&&/^(佚名|无名氏|未知|乐府)$/.test(item.author||'')){
   candidates=works.filter(w=>w.sourceKind==='textbook'&&/^(诗经|乐府诗集)/.test(w.author)&&w._title===normalize(item.title));
  }
  for(const w of candidates)if(!seen.has(w.id)){seen.add(w.id);results.push(w);}
 }
 return results.slice(0,30);
}
