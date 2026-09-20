import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Converter} from 'opencc-js/t2cn';
import {prepareWorks,searchWorks,hintedWorks} from '../src/library-search.js';
const data=JSON.parse(fs.readFileSync('public/library/works.json','utf8'));
const works=prepareWorks(data.works);const simplify=Converter({from:'t',to:'cn'});
for(const q of ['李白 梦游天姥吟留别','苏轼 水调歌头','但愿人长久','苏轼水调歌头','苏轼前赤壁赋'])assert(searchWorks(works,q).length,q);
const ru=searchWorks(works,'李清照 如梦令');assert.equal(ru.length,2);assert(ru.some(w=>w.text.startsWith('常记')));assert(ru.some(w=>w.text.startsWith('昨夜')));
assert(searchWorks(works,simplify('蘇軾 水調歌頭')).length);
assert.equal(searchWorks(works,'这是一部完全不存在的诗词名称').length,0);
assert.equal(searchWorks(works,'   ').length,0);
assert(searchWorks(works,'水调歌头').every(w=>w._title.includes('水调歌头')));
assert(hintedWorks(works,[{title:'梦游天姥吟留别',author:'李白',quote:''}]).every(w=>w.author==='李白'));
assert.equal(hintedWorks(works,[{title:'编造的无名诗词xyz',author:'不存在'}]).length,0);
assert.equal(new Set(works.map(w=>w.id)).size,works.length);
for(const w of works){assert(w.text.trim());assert(w.title);assert.match(w.sourceUrl,/^https:\/\/github\.com\/chinese-poetry\/chinese-poetry\/blob\/[a-f0-9]{40}\//);assert(w.sourceIndex>0);}
assert(works.some(w=>[...w.text].length>3000));
console.log(`PASS: ${works.length} source-linked records, title/author/verse/traditional search, homonyms, AI hints cannot invent bodies.`);
