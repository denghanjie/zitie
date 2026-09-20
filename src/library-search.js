import {applyEditorial} from './editorial.js';
import {correctWork} from './text-corrections.js';
export const normalize = s => String(s).normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'').toLowerCase();
export function prepareWorks(works){return works.map(correctWork).map(w=>applyEditorial(w)).map(w=>({...w,_title:normalize(w.title),_author:normalize(w.author.replace(/^[^：]+：|^（[^）]*）/u,'')),_text:normalize(w.text)}));}
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
 return (ranked.some(r=>r.score>=40)?ranked.filter(r=>r.score>=40):ranked).sort((a,b)=>b.score-a.score||a.work.title.localeCompare(b.work.title,'zh')).slice(0,limit).map(r=>r.work);
}
export function hintedWorks(works,suggestions){
 const seen=new Set(),results=[];
 for(const item of suggestions){
  // Only corpus records can be selected: the model never supplies worksheet text.
  const query=[item.author,item.title].filter(Boolean).join(' ')||item.quote;
  let candidates=searchWorks(works,query||'',12);
  if(!candidates.length&&item.quote)candidates=searchWorks(works,item.quote,12);
  for(const w of candidates)if(!seen.has(w.id)){seen.add(w.id);results.push(w);}
 }
 return results.slice(0,30);
}
