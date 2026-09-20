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
for(const w of works){assert(w.text.trim());assert(!w.text.includes("[object Object]"));assert(w.title);if(w.sourceKind!=='supplement')assert.match(w.sourceUrl,/^https:\/\/github\.com\/chinese-poetry\/chinese-poetry\/blob\/[a-f0-9]{40}\//);assert(w.sourceIndex>0);}
assert(works.some(w=>[...w.text].length>3000));
console.log(`PASS: ${works.length} source-linked records, title/author/verse/traditional search, homonyms, AI hints cannot invent bodies.`);

// Source corrections must survive rebuilds, cached responses and saved drafts.
const {TEXT_CORRECTIONS,correctWork,migrateLibraryDraft,knownTextCorrection}=await import('../src/text-corrections.js');
const {paginate,pageSvg}=await import('../src/worksheet.js');
const denggao=works.find(w=>w.title==='登高'&&w.author==='杜甫');
assert.equal(denggao.text,'风急天高猿啸哀，渚清沙白鸟飞回。\n无边落木萧萧下，不尽长江滚滚来。\n万里悲秋常作客，百年多病独登台。\n艰难苦恨繁霜鬓，潦倒新停浊酒杯。');
for(const c of TEXT_CORRECTIONS){
 const work=data.works.find(w=>w.id===c.id),old={...work,text:c.originalText};
 assert.equal(prepareWorks([old])[0].text,prepareWorks([work])[0].text);
 assert.equal(prepareWorks([old])[0]._text,prepareWorks([work])[0]._text,'cached corpus is corrected before search');
 const draft={content:c.originalText,source:{title:c.title,author:c.author},font:'serif',fontSize:'small'};
 assert.equal(migrateLibraryDraft(draft).content,work.text);
 assert.equal(migrateLibraryDraft(draft).font,'serif');
 assert.deepEqual(migrateLibraryDraft({...draft,content:draft.content+'自写内容'}),{...draft,content:draft.content+'自写内容'},'do not overwrite user edits');
 assert.equal(knownTextCorrection(c.originalText).content,work.text);
 assert.equal(knownTextCorrection(work.text),null);
 assert.equal(migrateLibraryDraft({...draft,source:null}).content,c.originalText,'pasted text requires explicit correction');
 assert.throws(()=>correctWork({...work,text:'不匹配的新来源'}),/校订记录与正文不一致/);
 assert(work.correctionSourceUrl.startsWith('https://github.com/'));
}
assert.equal(knownTextCorrection('衮衮诸公'),null,'no global replacement of legitimate words');
const entry=TEXT_CORRECTIONS.find(c=>c.title==='登高');
assert.equal(knownTextCorrection(entry.originalText.replace('衮衮','衮\n衮')).content,denggao.text);
const chars=Object.fromEntries([...new Set([...denggao.text])].filter(c=>/\p{Script=Han}/u.test(c)).map(c=>[c,JSON.parse(fs.readFileSync(`public/data/${c}.json`,'utf8'))]));
assert.deepEqual(chars['滚'].radStrokes,[0,1,2],'water radical exists');
const input={content:denggao.text,title:'登高',mode:'article',layout:'poem',grid:'tian'};
const pages=paginate(input,chars),svg=pages.map((p,i)=>pageSvg(input,chars,p,i,pages.length)).join('');
for(const stroke of chars['滚'].strokes)assert.equal(svg.split(`d="${stroke}"`).length-1,2,'both 滚 render all strokes including 氵');
console.log('PASS: corrected 登高 text, complete 滚 strokes, source provenance, cached corpus and draft migration, user edits preserved.');

const {EDITORIAL_EDITS,applyEditorial,migrateEditorialDraft,textIntegrityIssue}=await import('../src/editorial.js');
const {qualityFor,canApplyWork,canUseImportedDraft}=await import('../src/quality.js');
for(const edit of EDITORIAL_EDITS){
 const old={id:edit.key.replace('poetry:',''),title:edit.titleBefore,author:edit.authorBefore,text:edit.beforeText};
 const corrected=applyEditorial(old,edit.key);
 assert.equal(corrected.text,edit.afterText);assert.equal(corrected.author,edit.authorAfter);
 assert.deepEqual(applyEditorial(corrected,edit.key),corrected,'editorial corrections are idempotent');
 const draft={title:edit.titleBefore,content:edit.beforeText,source:{title:edit.titleBefore,author:edit.authorBefore}};
 assert.equal(migrateEditorialDraft(draft).content,edit.afterText);
 assert.equal(migrateEditorialDraft({...draft,content:edit.beforeText+'自写内容'}).content,edit.beforeText+'自写内容');
}
const ledger=JSON.parse(fs.readFileSync('public/library/collation.json','utf8'));
assert.equal(ledger.summary.entries,data.works.length+216);assert.equal(ledger.summary.complete,false);
assert.equal(ledger.entries.length,data.works.length+216);assert.equal(new Set(ledger.entries.map(r=>r.key)).size,data.works.length+216);
for(const w of works){
 const key=`poetry:${w.id}`;assert(qualityFor(key).textHash);
 if(/[□�〓]/u.test(w.text)||w.author.length===1)assert.equal(canApplyWork(key),false);
}
assert(textIntegrityIssue('空□'));assert.equal(textIntegrityIssue('不尽长江滚滚来'),null);
assert.equal(await canUseImportedDraft({content:'自由输入'}),true);
assert.equal(await canUseImportedDraft({content:'旧内容',source:{qualityKey:'unknown'}}),false);
for(const q of ['静夜思','登高','枫桥夜泊'])assert(searchWorks(works,q).some(w=>canApplyWork(`poetry:${w.id}`)),q);
const poem=(title,author)=>works.find(w=>w.title===title&&w.author===author);
assert(poem('行宫','元稹'));assert(poem('赤壁','杜牧'));assert(poem('登鹳雀楼','王之涣'));
assert(works.some(w=>w.text.includes('云中谁寄锦书来')));
assert(works.some(w=>w.text.includes('江枫渔火对愁眠')));
assert(works.some(w=>w.text.includes('休说鲈鱼堪脍')),'missing characters restored inside their clause');
assert(!works.some(w=>/[a-zA-Z]/u.test(w.text)),'pinyin must not enter worksheets');
console.log('PASS: full ledger coverage, immutable editorial evidence, unresolved-source gating, author fixes, missing-character placement, draft migration.');

// Unified search must include textbook-only works with their original quality gates.
const {mergeLibraries}=await import('../src/library-search.js');
const textbooks=JSON.parse(fs.readFileSync('public/library/textbooks.json','utf8'));
const unified=mergeLibraries(data.works,textbooks);
for(const [quote,title] of [['窈窕淑女，君子好逑','关雎'],['唧唧复唧唧，木兰当户织','木兰诗']]){
 for(const q of [quote,quote.replace('，',', '),title]){
  const found=searchWorks(unified,q,unified.length).filter(w=>w.title===title);
  assert.equal(found.length,1,'duplicate textbook placements are merged');
  assert.equal(found[0].qualityKey,`textbook:${title}`);
  assert(canApplyWork(found[0].qualityKey));
  assert.equal(found[0].layout,'poem');
 }
 assert(hintedWorks(unified,[{title,author:'佚名',quote:''}]).some(w=>w.title===title));
}
assert(searchWorks(unified,simplify('窈窕淑女，君子好逑')).some(w=>w.title==='关雎'));
assert.equal(new Set(unified.map(w=>w.id)).size,unified.length);
assert(unified.filter(w=>w.sourceKind==='textbook').some(w=>!canApplyWork(w.qualityKey)),'merging must not promote unverified texts');
console.log('PASS: unified poetry/textbook search, exact verses, AI anonymous-author hints, deduplication and quality keys.');

// Missing common works and a one-character omission must yield sourced candidates.
const yang=works.find(w=>w.id==='yangshen-linjiangxian');
assert(yang&&canApplyWork(`poetry:${yang.id}`));
for(const q of ['杨慎 临江仙','滚滚长江东逝水 浪花淘尽英雄','滚滚长江逝水 浪花淘尽英雄','滚滚长江逝水，浪花淘尽英雄']){
 const hit=searchWorks(unified,q).find(w=>w.id===yang.id);assert(hit,q);assert.equal(hit.text,yang.text);
 if(q.includes('长江逝水'))assert(hit.searchNote);
}
assert.equal(hintedWorks(unified,[{author:'杨慎',title:'临江仙',quote:''}])[0].id,yang.id);
assert.equal(searchWorks(unified,'滚滚黄河西游记 浪花淘尽英雄').length,0);
console.log('PASS: sourced Yang Shen poem, author/title hints, single-character verse suggestion without modifying the body.');
