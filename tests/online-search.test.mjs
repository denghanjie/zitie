import assert from 'node:assert/strict';
import {Converter} from 'opencc-js/t2cn';
import {prepareWorks} from '../src/library-search.js';
import {findPoetry,compareConvertedQuote,safeOnlineSource,safeDiscovery,reviewedOnlineWork,isReviewedOnlineDraft,editReviewedSource,textHash,LOCAL_CORPUS_REVISION} from '../src/online-search.js';
import {canUseImportedDraft} from '../src/quality.js';
import {saveHistory,readHistory} from '../src/history.js';
const work={id:'test-online-local',title:'测试诗',author:'作者',text:'第一句，第二句。',qualityKey:'poetry:missing-key'};
const library=Promise.resolve({works:prepareWorks([work]),simplify:s=>s});
const source={provider:'wikisource',title:'未收录篇名',url:'https://zh.wikisource.org/w/index.php?oldid=123',revisionId:123,verification:'source_fetched',text:'网上来源正文。',authorHint:'待核作者',quoteCheck:'not_found',acquiredAt:'2026-10-12T00:00:00Z'};
source.contentHash=await textHash(source.text);
const corpus={...source,provider:'local-corpus',revisionId:LOCAL_CORPUS_REVISION,sourcePath:'御定全唐詩/json/733.json',sourceIndex:1,edition:'御定全唐詩（chinese-poetry 公开整理本）'};
corpus.url=`https://github.com/chinese-poetry/chinese-poetry/blob/${LOCAL_CORPUS_REVISION}/${corpus.sourcePath.split('/').map(encodeURIComponent).join('/')}`;
const discovery={provider:'baidu',verification:'discovery_only',title:'某诗词网页',url:'https://example.org/poem',snippet:'这只是搜索摘要。'};
const calls=[];
const reply=body=>({ok:true,json:async()=>body});
const fetcher=async(url,options)=>{calls.push(url);assert.equal(JSON.parse(options.body).query,'测试诗');return reply(url==='/api/poetry/search'?{status:'completed',sources:[corpus],message:'本地已找到'}:{suggestions:[],online:{status:'completed',sources:url.endsWith('/hints')?[source]:[],discoveries:[discovery],message:'已完成',providers:{baidu:'completed'}}})};
const local=await findPoetry({library,query:'测试诗',fetcher});assert.deepEqual(calls,['/api/poetry/search']);assert.equal(local.found.length,1);assert.equal(local.localCorpus.sources.length,1);assert.equal(local.online,null);
const ai=await findPoetry({library,query:'测试诗',ai:true,fetcher});assert.deepEqual(calls.slice(-2),['/api/poetry/search','/api/poetry/hints']);assert.equal(ai.found.length,1);assert.equal(ai.localCorpus.sources.length,1);assert.equal(ai.online.sources.length,1);
await findPoetry({library,query:'测试诗',ai:true,fetcher});assert.equal(calls.filter(p=>p.endsWith('/hints')).length,2,'repeat explicit searches request AI even with local matches');
const discover=await findPoetry({library,query:'测试诗',discover:true,fetcher});assert.deepEqual(calls.slice(-2),['/api/poetry/search','/api/poetry/discover']);assert.equal(discover.online.sources.length,0);assert.equal(discover.online.discoveries.length,1);
for(const fetcher of [async()=>{throw Error('provider down')},async()=>({ok:false,json:async()=>({error:'provider failed'})}),async()=>({ok:true,json:async()=>{throw Error('bad json')}})]){
 const r=await findPoetry({library,query:'测试诗',ai:true,fetcher});assert.equal(r.found.length,1);assert.equal(r.online.status,'unavailable');assert.equal(r.localCorpus.status,'unavailable');assert.equal(r.localUnavailable,false);
}
for(const body of [null,{},'malformed',{suggestions:[null,42,{title:9,quote:[]}],online:{sources:[null,{},source],status:'garbage',message:4}}]){
 const r=await findPoetry({library,query:'测试诗',ai:true,fetcher:async()=>reply(body)});assert.equal(r.found.length,1);assert.equal(r.online.status,'unavailable');
}
const remoteOnly=await findPoetry({library:Promise.reject(Error('static unavailable')),query:'测试诗',ai:true,fetcher});assert.equal(remoteOnly.localUnavailable,true);assert.equal(remoteOnly.localCorpus.sources.length,1);assert.equal(remoteOnly.online.sources.length,1);

// Neither external providers nor a hung static library can hold back server-local matches.
let finishRemote;
const progressive=[],controller=new AbortController();
const pending=findPoetry({library,query:'测试诗',ai:true,signal:controller.signal,onProgress:r=>progressive.push(r),fetcher:(url)=>url.endsWith('/search')?Promise.resolve(reply({status:'completed',sources:[corpus],message:'ready'})):new Promise(resolve=>{finishRemote=resolve})});
await new Promise(resolve=>setTimeout(resolve,20));
assert.ok(progressive.some(r=>r.found.length===1&&r.pending));assert.ok(progressive.some(r=>r.localCorpus.sources.length===1&&r.online.status==='loading'&&r.pending));
const progressCount=progressive.length;controller.abort(new Error('superseded'));await assert.rejects(pending,/superseded/);finishRemote(reply({online:{status:'completed',sources:[source]}}));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(progressive.length,progressCount,'cancelled searches never emit late results');
const deadline=new AbortController(),beforeDeadline=[];
const timed=findPoetry({library,query:'测试诗',ai:true,signal:deadline.signal,onProgress:r=>beforeDeadline.push(r),fetcher:url=>url.endsWith('/search')?Promise.resolve(reply({status:'completed',sources:[corpus]})):new Promise(()=>{})});
await new Promise(resolve=>setTimeout(resolve,20));deadline.abort(new DOMException('network deadline','TimeoutError'));const keptLocal=await timed;assert.equal(keptLocal.found.length,1);assert.equal(keptLocal.localCorpus.sources.length,1);assert.equal(keptLocal.online.status,'unavailable');assert.equal(keptLocal.pending,false);
const libraryDeadline=new AbortController(),corpusFirst=[];
const hungLibrary=findPoetry({library:new Promise(()=>{}),query:'测试诗',ai:true,signal:libraryDeadline.signal,onProgress:r=>corpusFirst.push(r),fetcher});
await new Promise(resolve=>setTimeout(resolve,20));assert.ok(corpusFirst.some(r=>r.localCorpus.sources.length===1&&r.pending));libraryDeadline.abort(new DOMException('library deadline','TimeoutError'));const hungResult=await hungLibrary;assert.equal(hungResult.localUnavailable,true);assert.equal(hungResult.online.status,'completed');assert.equal(hungResult.localCorpus.sources.length,1);
console.log('PASS: immediate independent local searches, explicit AI and Baidu, missing providers, progressive results, cancellation and deadlines');

assert.equal(safeOnlineSource(source),true);assert.equal(safeOnlineSource(corpus),true);
for(const change of [{url:'javascript:alert(1)'},{url:'https://evil.test/?oldid=123'},{url:'https://zh.wikisource.org/?oldid=123'},{url:'https://zh.wikisource.org/w/index.php?oldid=999'},{url:'https://zh.wikisource.org/w/index.php?oldid=123&oldid=123'},{url:'https://zh.wikisource.org/w/index.php?oldid=123&action=edit'},{url:'https://user@zh.wikisource.org/w/index.php?oldid=123'},{url:source.url+'#other'},{provider:undefined},{verification:'verified'},{text:''},{revisionId:'not-a-revision'},{revisionId:0},{contentHash:'a'.repeat(63)},{acquiredAt:'yesterday'}])assert.equal(safeOnlineSource({...source,...change}),false,JSON.stringify(change));
for(const change of [{revisionId:'a'.repeat(40)},{url:corpus.url.replace(LOCAL_CORPUS_REVISION,'main')},{url:corpus.url+'?raw=true'},{url:corpus.url.replace('github.com','raw.githubusercontent.com')},{url:corpus.url+'#L1'},{sourcePath:'御定全唐詩/json/../733.json'},{sourceIndex:0},{sourceIndex:'1'},{edition:''},{provider:'baidu'},{verification:'discovery_only'}])assert.equal(safeOnlineSource({...corpus,...change}),false,JSON.stringify(change));
assert.equal(safeDiscovery(discovery),true);
for(const change of [{verification:'source_fetched'},{url:'javascript:alert(1)'},{url:'https://user:password@example.org/'},{url:'http://127.0.0.1/admin'},{provider:'wikisource'}])assert.equal(safeDiscovery({...discovery,...change}),false);
const review={title:'核对篇名',author:'核对作者',text:'网上来源正文。',confirmed:true};
for(const change of [{confirmed:false},{author:''},{title:''},{text:'字'.repeat(3001)}])await assert.rejects(reviewedOnlineWork(source,{...review,...change}));
await assert.rejects(reviewedOnlineWork({...source,text:'来源正文被损坏'},review));await assert.rejects(reviewedOnlineWork(discovery,review));
for(const evidence of [source,corpus]){
 const imported=await reviewedOnlineWork(evidence,review);assert.equal(imported.qualityKey,undefined);
 const draft={content:imported.text,source:{title:imported.title,author:imported.author,url:imported.sourceUrl,provenance:imported.provenance}};
 assert.equal(await isReviewedOnlineDraft(draft),true);assert.equal(await canUseImportedDraft(draft),true);
 assert.equal(await canUseImportedDraft({...draft,source:{...draft.source,qualityKey:work.qualityKey}}),false,'review cannot bypass local quality gates');
 assert.equal(await isReviewedOnlineDraft({...draft,content:'意外改动'}),false);
 for(const change of [{version:undefined},{version:1},{source:undefined},{reviewedHash:'0'.repeat(64)},{reviewedText:'来源被改'},{reviewedTitle:'别的篇名'},{provider:'baidu'},{contentHash:'f'.repeat(64)},{source:{...evidence,text:'来源被改'}},{source:{...evidence,url:'https://evil.test'}}])assert.equal(await canUseImportedDraft({...draft,source:{...draft.source,provenance:{...draft.source.provenance,...change}}}),false);
 const edited={...draft,content:'用户自行摘选',source:editReviewedSource(draft.source,'用户自行摘选')};assert.equal(await canUseImportedDraft(edited),true);assert.equal(edited.source.provenance.reviewedText,review.text);
 assert.equal(await canUseImportedDraft({...edited,content:'历史记录意外改动'}),false);
 const booleanOnly={...draft,content:'任意改动',source:{...draft.source,provenance:{...draft.source.provenance,editedAfterReview:true}}};assert.equal(await canUseImportedDraft(booleanOnly),false,'legacy boolean alone cannot approve arbitrary draft text');
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};saveHistory(edited,'manual',storage);const restored=readHistory(storage)[0].input;assert.deepEqual(restored,edited);assert.equal(await canUseImportedDraft(restored),true);
}
const malicious=await findPoetry({library,query:'测试诗',ai:true,fetcher:async url=>reply(url.endsWith('/search')?{status:'completed',sources:[{...corpus,text:'损坏正文'},source,corpus]}:{online:{status:'completed',sources:[{...source,text:'损坏正文'},discovery,source],discoveries:[{...discovery,text:'不能当作正文',contentHash:source.contentHash}]}})});
assert.equal(malicious.localCorpus.sources.length,1);assert.equal(malicious.online.sources.length,1);assert.equal(malicious.online.discoveries[0].text,undefined);
console.log('PASS: pinned provider URLs, exact original hashes, discovery isolation, versioned review provenance, edited-history integrity and ledger protections');

const simplify=Converter({from:'t',to:'cn'});
const traditional={...source,text:'春眠不覺曉，處處聞啼鳥。',quote:'春眠不觉晓',matchedQuote:false,quoteCheck:'not_found'};traditional.contentHash=await textHash(traditional.text);
const converted=compareConvertedQuote(traditional,simplify);assert.equal(converted.quoteCheck,'matched_after_conversion');assert.equal(converted.rawQuoteCheck,'not_found');assert.equal(converted.matchedQuote,false);assert.equal(converted.text,traditional.text);assert.equal(traditional.quoteCheck,'not_found');assert.equal(converted.verification,'source_fetched');
assert.equal(compareConvertedQuote({...traditional,quote:'床前明月光'},simplify).quoteCheck,'not_found');assert.equal(compareConvertedQuote({...traditional,quote:'不觉'},simplify).quoteCheck,'not_found');assert.equal(compareConvertedQuote(traditional,undefined).quoteCheck,'not_found');
const quoteFetcher=async url=>reply(url.endsWith('/search')?{status:'completed',sources:[]}:{online:{status:'completed',sources:[traditional]}});
const convertedResult=await findPoetry({library:Promise.resolve({works:[],simplify}),query:'春眠不觉晓',ai:true,fetcher:quoteFetcher});assert.equal(convertedResult.online.sources[0].quoteCheck,'matched_after_conversion');assert.equal(convertedResult.online.sources[0].text,traditional.text);
const unconvertedResult=await findPoetry({library:Promise.reject(Error('no library')),query:'春眠不觉晓',ai:true,fetcher:quoteFetcher});assert.equal(unconvertedResult.online.sources[0].quoteCheck,'not_found');
console.log('PASS: traditional/simplified matching is informational only; original source body is preserved');

// AI-hinted corpus candidates and the initial request can finish in either order.
for(const remoteFirst of [true,false]){
 let releaseDirect,releaseRemote;const progress=[];
 const second={...corpus,sourceIndex:2,title:'同篇另一记录'};
 const search=findPoetry({library,query:'测试诗',ai:true,onProgress:s=>progress.push(s),fetcher:url=>new Promise(resolve=>{if(url.endsWith('/search'))releaseDirect=()=>resolve(reply({status:'completed',sources:[corpus]}));else releaseRemote=()=>resolve(reply({localSources:[corpus,second],online:{status:'completed',sources:[],providers:[{provider:'deepseek',status:'unavailable',message:'AI 超时'},{provider:'baidu',status:'completed',message:'百度有线索'}]}}))})});
 if(remoteFirst)releaseRemote();else releaseDirect();await new Promise(resolve=>setTimeout(resolve,20));
 assert.ok(progress.some(s=>s.localCorpus.sources.length));
 if(remoteFirst)releaseDirect();else releaseRemote();const complete=await search;
 assert.equal(complete.localCorpus.sources.length,2);assert.equal(complete.online.providers[0].status,'unavailable');assert.equal(complete.online.providers[1].status,'completed');
}
const lateAbort=new AbortController();let finishLateCorpus;
const lateProgress=[];
const lateLocal=findPoetry({library,query:'测试诗',signal:lateAbort.signal,onProgress:s=>lateProgress.push(s),fetcher:()=>new Promise(resolve=>{finishLateCorpus=()=>resolve(reply({status:'completed',sources:[corpus]}))})});
await new Promise(resolve=>setTimeout(resolve,0));lateAbort.abort(new Error('new query'));await assert.rejects(lateLocal,/new query/);const lastCount=lateProgress.length;finishLateCorpus();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(lateProgress.length,lastCount);
for(const url of ['http://example.org','https://10.0.0.1','https://172.16.0.1','https://192.168.1.1','https://169.254.169.254','https://[::1]','https://2130706433','https://localhost.localdomain','https://metadata.internal','https://foo.onion','https://example.org/\\\\evil','https://exa\nmple.org','https://example.org/%0d','https://example.org/%zz'])assert.equal(safeDiscovery({...discovery,url}),false,url);
for(const url of [source.url.replace('zh.wiki','zh.\nwiki'),source.url+'&title=%0d',source.url.replace('/w/','\\\\w/')])assert.equal(safeOnlineSource({...source,url}),false,url);
console.log('PASS: AI corpus merge races, cancelled late local responses, provider-specific failure status and private/ambiguous discovery URLs');

for(const providers of [{length:1},'bad',[null,42,{provider:'baidu',status:'completed',message:{}},{provider:'evil',status:'completed',message:'omit'}]]){
 const result=await findPoetry({library,query:'测试诗',ai:true,fetcher:async url=>reply(url.endsWith('/search')?{status:'completed',sources:[]}:{online:{status:'completed',sources:[],providers}})});
 assert.ok(Array.isArray(result.online.providers));assert.ok(result.online.providers.every(p=>typeof p.message==='string'&&p.provider==='baidu'));
}
console.log('PASS: malformed provider status payloads are sanitized to safe arrays');
