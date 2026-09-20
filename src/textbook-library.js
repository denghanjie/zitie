import {normalize} from './library-search.js';
export const gradeNames=['一年级','二年级','三年级','四年级','五年级','六年级','七年级','八年级','九年级'];
export function selectBook(data,edition,grade,term){return data.books.find(b=>b.edition===edition&&b.grade===Number(grade)&&b.term===term)}
export function filterEntries(entries,query,type='all'){
 const tokens=query.trim().split(/\s+/u).map(normalize).filter(Boolean);
 return entries.filter(e=>(type==='all'||e.type===type)&&tokens.every(t=>normalize(`${e.title} ${e.author} ${e.text}`).includes(t)));
}
