import assert from 'node:assert/strict';
import {Converter} from 'opencc-js/t2cn';
import {prepareWorks} from '../src/library-search.js';
import {findPoetry,compareConvertedQuote,safeOnlineSource,reviewedOnlineWork,isReviewedOnlineDraft} from '../src/online-search.js';
import {canUseImportedDraft} from '../src/quality.js';
import {saveHistory,readHistory} from '../src/history.js';
const work={id:'test-online-local',title:'测试诗',author:'作者',text:'第一句，第二句。',qualityKey:'poetry:missing-key'};
const library=Promise.resolve({works:prepareWorks([work]),simplify:s=>s});
const source={title:'未收录篇名',url:'https://zh.wikisource.org/w/index.php?title=测试&oldid=123',revisionId:123,verification:'source_fetched',text:'网上来源正文。',authorHint:'待核作者',quoteCheck:'not_found'};
let calls=0;
const fetcher=async(url,options)=>{calls++;assert.equal(url,'/api/poetry/hints');assert.equal(JSON.parse(options.body).query,'测试诗');return {ok:true,json:async()=>({suggestions:[],online:{status:'completed',sources:[source],message:'已抓取'}})}};
const local=await findPoetry({library,query:'测试诗',fetcher});assert.equal(calls,0);assert.equal(local.found.length,1);
const ai=await findPoetry({library,query:'测试诗',ai:true,fetcher});assert.equal(calls,1);assert.equal(ai.found.length,1);assert.equal(ai.online.sources.length,1);
await findPoetry({library,query:'测试诗',ai:true,fetcher});assert.equal(calls,2,'repeat searches make new requests');
for(const fetcher of [async()=>{throw Error('provider down')},async()=>({ok:false,json:async()=>({error:'provider failed'})}),async()=>({ok:true,json:async()=>{throw Error('bad json')}})]){
 const r=await findPoetry({library,query:'测试诗',ai:true,fetcher});assert.equal(r.found.length,1);assert.equal(r.online.status,'unavailable');
}
for(const body of [null,{},'malformed',{suggestions:[null,42,{title:9,quote:[]}],online:{sources:[null,{},source],status:'garbage',message:4}}]){
 const r=await findPoetry({library,query:'测试诗',ai:true,fetcher:async()=>({ok:true,json:async()=>body})});assert.equal(r.found.length,1);assert.equal(r.online.status,'unavailable');
}
const remoteOnly=await findPoetry({library:Promise.reject(Error('local unavailable')),query:'测试诗',ai:true,fetcher});assert.equal(remoteOnly.localUnavailable,true);assert.equal(remoteOnly.online.sources.length,1);
const abort=new AbortController();let resolve;
const pending=findPoetry({library,query:'测试诗',ai:true,signal:abort.signal,fetcher:()=>new Promise(r=>{resolve=r})});
abort.abort(new Error('superseded'));resolve({ok:true,json:async()=>({online:{status:'completed',sources:[source]}})});await assert.rejects(pending,/superseded/);
const timeout=new AbortController();const timed=findPoetry({library,query:'测试诗',ai:true,signal:timeout.signal,fetcher:()=>new Promise((_,reject)=>timeout.signal.addEventListener('abort',()=>reject(timeout.signal.reason)))});await new Promise(resolve=>setTimeout(resolve,0));timeout.abort(new DOMException('timed out','TimeoutError'));const timedResult=await timed;assert.equal(timedResult.found.length,1);assert.equal(timedResult.online.status,'unavailable');
assert.equal(safeOnlineSource(source),true);
for(const change of [{url:'javascript:alert(1)'},{url:'https://evil.test/?oldid=123'},{url:'https://zh.wikisource.org/?oldid=999'},{verification:'verified'},{text:''},{revisionId:'not-a-revision'}])assert.equal(safeOnlineSource({...source,...change}),false);
const review={title:'核对篇名',author:'核对作者',text:'网上来源正文。',confirmed:true};
for(const change of [{confirmed:false},{author:''},{title:''},{text:'字'.repeat(3001)}])assert.throws(()=>reviewedOnlineWork(source,{...review,...change}));
const imported=reviewedOnlineWork(source,review);assert.equal(imported.qualityKey,undefined);
const draft={content:imported.text,source:{title:imported.title,author:imported.author,url:imported.sourceUrl,provenance:imported.provenance}};
assert.equal(isReviewedOnlineDraft(draft),true);assert.equal(await canUseImportedDraft(draft),true);
assert.equal(await canUseImportedDraft({...draft,source:{...draft.source,qualityKey:work.qualityKey}}),false,'online provenance never overrides a local ledger gate');
assert.equal(isReviewedOnlineDraft({...draft,content:'意外改动'}),false);
const edited={...draft,content:'用户自行摘选',source:{...draft.source,provenance:{...draft.source.provenance,editedAfterReview:true}}};assert.equal(await canUseImportedDraft(edited),true);assert.equal(edited.source.provenance.reviewedText,review.text);
const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};saveHistory(draft,'manual',storage);const restored=readHistory(storage)[0].input;assert.deepEqual(restored,draft);assert.equal(await canUseImportedDraft(restored),true);
console.log('PASS: online search always requested, local fallback, malformed data, cancellation, source review, ledger gates and provenance persistence');

const simplify=Converter({from:'t',to:'cn'});
const traditional={...source,text:'春眠不覺曉，處處聞啼鳥。',quote:'春眠不觉晓',matchedQuote:false,quoteCheck:'not_found'};
const converted=compareConvertedQuote(traditional,simplify);assert.equal(converted.quoteCheck,'matched_after_conversion');assert.equal(converted.rawQuoteCheck,'not_found');assert.equal(converted.matchedQuote,false);assert.equal(converted.text,traditional.text);assert.equal(traditional.quoteCheck,'not_found');assert.equal(converted.verification,'source_fetched');
assert.equal(compareConvertedQuote({...traditional,quote:'床前明月光'},simplify).quoteCheck,'not_found');
assert.equal(compareConvertedQuote({...traditional,quote:'不觉'},simplify).quoteCheck,'not_found');
assert.equal(compareConvertedQuote(traditional,undefined).quoteCheck,'not_found');
const convertedResult=await findPoetry({library:Promise.resolve({works:[],simplify}),query:'春眠不觉晓',ai:true,fetcher:async()=>({ok:true,json:async()=>({online:{status:'completed',sources:[traditional]}})})});assert.equal(convertedResult.online.sources[0].quoteCheck,'matched_after_conversion');assert.equal(convertedResult.online.sources[0].text,traditional.text);
const unconvertedResult=await findPoetry({library:Promise.reject(Error('no library')),query:'春眠不觉晓',ai:true,fetcher:async()=>({ok:true,json:async()=>({online:{status:'completed',sources:[traditional]}})})});assert.equal(unconvertedResult.online.sources[0].quoteCheck,'not_found');
console.log('PASS: actual OpenCC traditional/simplified informational comparison, genuine mismatch, short quote, missing converter and original-body preservation');

const hungLibraryAbort=new AbortController();
const hungLibrary=findPoetry({library:new Promise(()=>{}),query:'测试诗',ai:true,signal:hungLibraryAbort.signal,fetcher});
await new Promise(resolve=>setTimeout(resolve,0));hungLibraryAbort.abort(new DOMException('library deadline','TimeoutError'));
const hungResult=await Promise.race([hungLibrary,new Promise((_,reject)=>setTimeout(()=>reject(Error('hung library blocked completed online results')),100))]);
assert.equal(hungResult.localUnavailable,true);assert.equal(hungResult.online.status,'completed');assert.equal(hungResult.online.sources.length,1);
const uncooperativeNetworkAbort=new AbortController();
const uncooperativeNetwork=findPoetry({library,query:'测试诗',ai:true,signal:uncooperativeNetworkAbort.signal,fetcher:()=>new Promise(()=>{})});
await new Promise(resolve=>setTimeout(resolve,0));uncooperativeNetworkAbort.abort(new DOMException('network deadline','TimeoutError'));
const keptLocal=await Promise.race([uncooperativeNetwork,new Promise((_,reject)=>setTimeout(()=>reject(Error('hung network blocked completed local results')),100))]);assert.equal(keptLocal.found.length,1);assert.equal(keptLocal.online.status,'unavailable');
console.log('PASS: independently bounded library and network waits preserve completed results on deadlines');
