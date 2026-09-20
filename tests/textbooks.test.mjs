import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectBook,filterEntries} from '../src/textbook-library.js';
import {paginate} from '../src/worksheet.js';
const data=JSON.parse(fs.readFileSync('public/library/textbooks.json','utf8'));
assert.equal(data.books.length,36);
for(const edition of ['pep63','sh54'])for(let grade=1;grade<=9;grade++)for(const term of ['上册','下册']){
 const book=selectBook(data,edition,grade,term);assert(book,`${edition}/${grade}/${term}`);
 assert(book.entries.length);assert(book.catalogPages.length);assert(book.versionNote);
 assert.equal(new Set(book.entries.map(e=>e.title)).size,book.entries.length);
 for(const w of book.entries){assert(w.text.trim());assert(w.author);assert(w.sourceUrl.startsWith('https://'));assert(['poem','prose'].includes(w.type));assert(!/\[object Object\]|\uFFFD|部分教材|一作[:：]|译文|赏析/.test(w.text),w.title);}
}
const book=(e,g,t)=>selectBook(data,e,g,t).entries;
assert(book('pep63',6,'上册').some(w=>w.title==='曹冲称象'));
assert(book('sh54',6,'下册').some(w=>w.title==='关尹子教射'));
assert(!book('pep63',6,'下册').some(w=>w.title==='关尹子教射'));
assert(book('sh54',5,'下册').some(w=>w.title==='采薇（节选）'));
assert(!book('pep63',5,'下册').some(w=>w.title==='采薇（节选）'));
assert.deepEqual(filterEntries(book('sh54',6,'下册'),'关尹子','poem'),[]);
assert.equal(filterEntries(book('sh54',6,'下册'),'关尹子','prose')[0].title,'关尹子教射');
assert.equal(filterEntries(book('pep63',1,'下册'),'李白 明月光')[0].title,'静夜思');
assert.equal(filterEntries(book('pep63',1,'下册'),'不存在篇目').length,0);
const all=data.books.flatMap(b=>b.entries);const work=t=>all.find(w=>w.title===t);
assert.equal(work('赤壁').author,'杜牧');assert(work('芙蓉楼送辛渐').text.startsWith('寒雨连江夜入吴'));
assert(work('陈涉世家（节选）').text.endsWith('杀之以应陈涉。'));
assert(!work('墨梅').text.includes('\n\n'));assert(!work('惠崇春江晚景').text.includes('两两归鸿'));
assert(!work('六月二十七日望湖楼醉书').text.includes('放生鱼鳖'));
assert.equal(new Set(all.map(e=>e.id)).size,all.length);
// Every curated text must survive worksheet pagination, including rare Unicode characters.
for(const entry of new Map(all.map(w=>[w.title,w])).values()){
 const input={title:entry.title,content:entry.text,mode:'article',layout:entry.type,grid:'tian',lineBreak:'auto'};
 const pages=paginate(input,{});
 assert(pages.length>0,entry.title);
 assert.equal(pages.flat(2).join('').replace(/\s/gu,''),entry.text.replace(/\s/gu,''),entry.title);
}
console.log('PASS: textbook coverage, provenance, edition differences, disambiguation, excerpts, filters.');
