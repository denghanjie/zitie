import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {getSimplifier,simplifiedSource,simplifiedWork} from '../src/simplified.js';
import {findPoetry,textHash,reviewedOnlineWork,isReviewedOnlineDraft,editReviewedSource,LOCAL_CORPUS_REVISION} from '../src/online-search.js';
import {readHistory,saveHistory} from '../src/history.js';
import {canUseImportedDraft} from '../src/quality.js';
import {mergeLibraries} from '../src/library-search.js';
const simplify=await getSimplifier();
assert.equal(simplify('乾坤 乾燥 干戈 後來 皇后 發出 頭髮 沖天 衝天'),'乾坤 干燥 干戈 后来 皇后 发出 头发 冲天 冲天');
const source={provider:'local-corpus',verification:'source_fetched',title:'不第後賦菊',authorHint:'黃巢',text:'待到秋來九月八，我花開後百花殺。\n沖天香陣透長安，滿城盡帶黃金甲。',revisionId:LOCAL_CORPUS_REVISION,sourcePath:'御定全唐詩/json/733.json',sourceIndex:21,edition:'御定全唐詩（chinese-poetry 公开整理本）',acquiredAt:'2026-10-12T00:00:00Z'};
source.url=`https://github.com/chinese-poetry/chinese-poetry/blob/${source.revisionId}/${source.sourcePath.split('/').map(encodeURIComponent).join('/')}`;source.contentHash=await textHash(source.text);
const snapshot=JSON.parse(gunzipSync(Buffer.from(fs.readFileSync('server/data/chinese-poetry/sources/yuding-733.json.gz.b64','utf8'),'base64')))[20];
assert.equal(source.text,snapshot.paragraphs.join('\n'));assert.equal(source.title,snapshot.title);assert.equal(source.authorHint,snapshot.author);
const original=JSON.stringify(source),shown=simplifiedSource(source,simplify);
assert.equal(shown.display.title,'不第后赋菊');assert.equal(shown.display.author,'黄巢');assert.match(shown.display.text,/冲天香阵透长安/);assert.equal(JSON.stringify(source),original);assert.equal(shown.text,source.text);assert.equal(shown.contentHash,source.contentHash);
const other=simplifiedSource({...source,text:source.text.replace('沖','衝'),sourceIndex:22},simplify);assert.equal(other.display.text,shown.display.text);assert.notEqual(other.text,shown.text);assert.notEqual(other.sourceIndex,shown.sourceIndex);
const work=await reviewedOnlineWork(shown,{...shown.display,confirmed:true});
assert.equal(work.text,shown.display.text);assert.equal(work.provenance.source.text,source.text);assert.equal(work.provenance.source.contentHash,source.contentHash);assert.equal(work.provenance.source.authorHint,'黃巢');assert.equal(work.qualityKey,undefined);assert.equal(work.provenance.source.display,undefined);
const draft={content:work.text,source:{title:work.title,author:work.author,url:work.sourceUrl,provenance:work.provenance}};
assert.equal(await isReviewedOnlineDraft(draft),true);assert.equal(await canUseImportedDraft(draft),true);
const edited={...draft,content:'使用者保留的繁體髮字',source:editReviewedSource(draft.source,'使用者保留的繁體髮字')};
const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};saveHistory(edited,'manual',storage);const restored=readHistory(storage)[0].input;assert.deepEqual(restored,edited);assert.equal(await canUseImportedDraft(restored),true);
const old=await reviewedOnlineWork(source,{title:source.title,author:source.authorHint,text:source.text,confirmed:true});assert.equal(await canUseImportedDraft({content:source.text,source:{title:old.title,author:old.author,url:old.sourceUrl,provenance:old.provenance}}),true,'existing traditional drafts remain valid without migration');
const reply=sources=>({ok:true,json:async()=>({status:'completed',sources})});
const library=Promise.resolve({works:[],simplify});
let release;const progress=[];
const delayed=findPoetry({library,query:'黄巢',converter:new Promise(r=>release=r),fetcher:async()=>reply([{...source,display:{title:'伪造',author:'伪造',text:'伪造'}}]),onProgress:r=>progress.push(r)});
await new Promise(r=>setTimeout(r,10));assert.ok(progress.some(r=>r.localCorpus.sources.length&&r.conversionPending&&!r.localCorpus.sources[0].display));release(simplify);const ready=await delayed;assert.equal(ready.localCorpus.sources[0].display.title,'不第后赋菊');assert.equal(ready.pending,false);
for(const converter of [Promise.reject(Error('load failed')),Promise.resolve(()=>{throw Error('conversion failed')})]){
 const result=await findPoetry({library,query:'黄巢',converter,fetcher:async()=>reply([{...source,display:shown.display}])});assert.match(result.conversionError,/简体转换/);assert.equal(result.localCorpus.sources[0].display,undefined);assert.equal(result.localCorpus.sources[0].text,source.text);
}
let late;const abort=new AbortController(),cancelled=[];
const pending=findPoetry({library,query:'黄巢',signal:abort.signal,converter:new Promise(r=>late=r),fetcher:async()=>reply([source]),onProgress:r=>cancelled.push(r)});await new Promise(r=>setTimeout(r,5));abort.abort(Error('new query'));await assert.rejects(pending,/new query/);const count=cancelled.length;late(simplify);await new Promise(r=>setTimeout(r,5));assert.equal(cancelled.length,count);
const works=mergeLibraries(JSON.parse(fs.readFileSync('public/library/works.json')).works,JSON.parse(fs.readFileSync('public/library/textbooks.json')));
for(const w of works){const out=simplifiedWork(w,simplify);assert.equal(out.qualityKey,w.qualityKey);assert.equal(out.id,w.id);assert.equal(out.text,simplify(w.text));assert.equal(out.original.text,w.text)}
console.log('PASS: OpenCC context, separate original evidence, edition identity, simplified review/import, unchanged edited/legacy drafts, delayed/failed/cancelled conversion and preserved library quality keys');
