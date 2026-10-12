import {getSimplifier,simplifiedSource} from './simplified.js';
import {searchWorks,hintedWorks,normalize} from './library-search.js';

export const LOCAL_CORPUS_REVISION='b8594f81a89752241442f2ce267d6f66f96704ee';
export const REVIEW_VERSION=2;
const hashPattern=/^[a-f0-9]{64}$/;
const plainUrl=value=>typeof value==='string'&&value.startsWith('https://')&&value.length<=2048&&!/[\s\p{C}\\]/u.test(value)&&!/%(?![a-f0-9]{2})|%(?:0[a-f0-9]|1[a-f0-9]|7f|5c)/i.test(value);
const nonempty=(value,max=30000)=>typeof value==='string'&&value.trim().length>0&&[...value].length<=max;
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)&&Number.isFinite(Date.parse(value));
export async function textHash(text){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
// Each provider has its own pinned, reviewable evidence format. Discovery links are never evidence.
export function safeOnlineSource(source){
 if(!source||source.verification!=='source_fetched'||source.qualityKey||!nonempty(source.text)||!nonempty(source.title,240)||!hashPattern.test(source.contentHash)||!validDate(source.acquiredAt)||!plainUrl(source.url))return false;
 try{
  const u=new URL(source.url);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!['https://'+u.hostname,'https://'+u.hostname+':443'].includes(source.url.split(/[/?#]/).slice(0,3).join('/').toLowerCase()))return false;
  if(source.provider==='wikisource'){
   const revision=String(source.revisionId);
   return /^[1-9]\d{0,14}$/.test(revision)&&Number.isSafeInteger(Number(revision))&&u.hostname==='zh.wikisource.org'&&u.pathname==='/w/index.php'&&u.searchParams.getAll('oldid').length===1&&u.searchParams.get('oldid')===revision&&u.searchParams.getAll('title').length<=1&&[...u.searchParams.keys()].every(k=>k==='oldid'||k==='title');
  }
  if(source.provider==='local-corpus'){
   const path=source.sourcePath;
   if(source.revisionId!==LOCAL_CORPUS_REVISION||!nonempty(path,240)||!Number.isSafeInteger(source.sourceIndex)||source.sourceIndex<1||!nonempty(source.edition,240))return false;
   if(!/^(?:全唐诗\/poet\.tang\.(?:0|(?:[1-9]|[1-4]\d|5[0-7])000)\.json|御定全唐詩\/json\/733\.json)$/.test(path))return false;
   const edition=path.startsWith('全唐诗/')?'全唐诗（chinese-poetry 公开整理本）':'御定全唐詩（chinese-poetry 公开整理本）';
   if(source.edition!==edition)return false;
   const expected='/chinese-poetry/chinese-poetry/blob/'+LOCAL_CORPUS_REVISION+'/'+path.split('/').map(encodeURIComponent).join('/');
   return u.hostname==='github.com'&&u.pathname===expected&&!u.search;
  }
 }catch{}
 return false;
}
async function intactSource(source){return safeOnlineSource(source)&&await textHash(source.text)===source.contentHash}
export function safeDiscovery(item){
 if(!item||item.provider!=='baidu'||item.verification!=='discovery_only'||!nonempty(item.title,500)||typeof item.snippet!=='string'||item.snippet.length>4000||!plainUrl(item.url))return false;
 try{const u=new URL(item.url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['https://'+u.hostname,'https://'+u.hostname+':443'].includes(item.url.split(/[/?#]/).slice(0,3).join('/').toLowerCase())&&/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i.test(u.hostname)&&!/(?:^|\.)(?:localhost|local|localdomain|lan|internal|intranet|home|arpa|test|invalid|example|onion)$|\.home\.arpa$/i.test(u.hostname)}catch{return false}
}
// This is only an informational retrieval check; never alter the fetched body or its raw check.
export function compareConvertedQuote(source,simplify){
 if(typeof simplify!=='function'||source.matchedQuote!==false||typeof source.quote!=='string')return source;
 const quote=normalize(simplify(source.quote));
 if([...quote].length<4||!normalize(simplify(source.text)).includes(quote))return source;
 return {...source,rawQuoteCheck:source.quoteCheck,quoteCheck:'matched_after_conversion'};
}
const reviewedHash=({title,author,text})=>textHash(JSON.stringify([title,author,text]));
export async function reviewedOnlineWork(source,{title,author,text,confirmed}){
 if(!await intactSource(source)||confirmed!==true||!nonempty(title,200)||!nonempty(author,120)||!nonempty(text,3000))throw Error('请先核对来源、篇名、作者和正文，并确认后再填入。');
 const reviewed={title:title.trim(),author:author.trim(),text};
 const evidence=Object.fromEntries(['provider','title','authorHint','url','text','revisionId','verification','contentHash','acquiredAt','sourcePath','sourceIndex','edition'].filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));
 return {id:`reviewed:${source.provider}:${source.revisionId}:${source.sourcePath||''}:${source.sourceIndex||''}`, ...reviewed,layout:'auto',collection:`${source.provider==='local-corpus'?source.edition:'维基文库'} · 用户核对`,sourceUrl:source.url,provenance:{kind:'online-user-reviewed',version:REVIEW_VERSION,provider:source.provider,revisionId:source.revisionId,contentHash:source.contentHash,verification:'source_fetched',reviewed:true,reviewedTitle:reviewed.title,reviewedAuthor:reviewed.author,reviewedText:text,reviewedHash:await reviewedHash(reviewed),sourceHash:await textHash(JSON.stringify(evidence)),source:evidence}};
}
export function editReviewedSource(source,text){
 if(source?.provenance?.kind!=='online-user-reviewed')return null;
 return {...source,provenance:{...source.provenance,editedAfterReview:true,editedText:text}};
}
export async function isReviewedOnlineDraft(draft){
 const s=draft?.source,p=s?.provenance,e=p?.source;
 if(s?.qualityKey||p?.kind!=='online-user-reviewed'||p.version!==REVIEW_VERSION||p.reviewed!==true||!nonempty(s.title,200)||!nonempty(s.author,120)||!nonempty(p.reviewedText,3000)||p.reviewedTitle!==s.title||p.reviewedAuthor!==s.author||s.url!==e?.url||p.provider!==e?.provider||p.revisionId!==e?.revisionId||p.contentHash!==e?.contentHash||p.verification!=='source_fetched'||!hashPattern.test(p.reviewedHash)||!hashPattern.test(p.sourceHash))return false;
 if(p.editedAfterReview===true){if(typeof p.editedText!=='string'||p.editedText!==draft.content)return false}
 else if(p.editedAfterReview!==undefined||p.editedText!==undefined||p.reviewedText!==draft.content)return false;
 try{return await intactSource(e)&&await textHash(JSON.stringify(e))===p.sourceHash&&await reviewedHash({title:s.title,author:s.author,text:p.reviewedText})===p.reviewedHash}catch{return false}
}
// Cancel only this wait, not shared cached library loading. Completed results survive a deadline.
function waitForSearch(promise,signal){
 if(!signal)return Promise.resolve(promise);
 return new Promise((resolve,reject)=>{
  const onAbort=()=>{cleanup();reject(signal.reason||new Error('查询已取消'))};
  const cleanup=()=>signal.removeEventListener('abort',onAbort);
  Promise.resolve(promise).then(value=>{cleanup();resolve(value)},error=>{cleanup();reject(error)});
  if(signal.aborted)onAbort();else signal.addEventListener('abort',onAbort,{once:true});
 });
}
const sourceStatus=value=>['completed','partial','unavailable'].includes(value)?value:'unavailable';
const checkedProviders=value=>(Array.isArray(value)?value.slice(0,10):[]).filter(p=>['deepseek','baidu','wikisource'].includes(p?.provider)&&['completed','partial','unavailable','disabled','not_configured','ready'].includes(p?.status)).map(p=>({provider:p.provider,status:p.status,message:typeof p.message==='string'?p.message.slice(0,2000):''}));
async function checkedSources(sources,provider){
 if(!Array.isArray(sources))return [];
 const rows=await Promise.all(sources.slice(0,60).map(async source=>source?.provider===provider&&await intactSource(source)?source:null));
 return rows.filter(Boolean);
}
// Static library and server-local corpus start together. Explicit remote searches never delay local progress.
export async function findPoetry({library,query,ai=false,discover=false,fetcher=fetch,signal,onProgress,converter=getSimplifier()}){
 let simplify=null,conversionPending=true,conversionError='',displayCache=new WeakMap();
 const displaySource=s=>{const {display:ignored,...raw}=s;if(!simplify)return raw;if(!displayCache.has(s)){try{displayCache.set(s,simplifiedSource(s,simplify))}catch{conversionError='简体转换失败，请重新查找后再填入。';displayCache.set(s,raw)}}return displayCache.get(s)};
 const displayDiscovery=d=>{if(!simplify)return d;try{return {...d,display:{title:simplify(d.title),snippet:simplify(d.snippet)}}}catch{conversionError='简体转换失败，请重新查找后再填入。';return d}};
 let lib=null,hints=[],hintedSources=[],staticPending=true,corpusPending=true,remotePending=ai||discover;
 let localCorpus={status:'loading',sources:[],message:'正在查找本地扩展语料…'},online=remotePending?{status:'loading',sources:[],discoveries:[],message:'正在联网查找…',providers:[]}:null;
 const snapshot=()=>{
  let found=lib?searchWorks(lib.works,lib.simplify(query),lib.works.length):[];
  if(lib&&ai){const safeHints=hints.map(s=>Object.fromEntries(['title','author','quote'].map(k=>[k,lib.simplify(typeof s?.[k]==='string'?s[k]:'')])));const seen=new Set(found.map(w=>w.id));found=[...found,...hintedWorks(lib.works,safeHints).filter(w=>!seen.has(w.id))]}
  const mergedSources=[...new Map([...localCorpus.sources,...hintedSources].map(s=>[JSON.stringify([s.provider,s.revisionId,s.sourcePath,s.sourceIndex]),s])).values()];
  const corpus={...localCorpus,sources:mergedSources.map(displaySource),...(hintedSources.length&&localCorpus.status==='unavailable'?{status:'partial',message:localCorpus.message+' 已根据 AI 线索在本地扩展语料中找到候选。'}:{})};
  const remote=online?{...online,sources:online.sources.map(s=>displaySource(compareConvertedQuote(s,lib?.simplify))),discoveries:online.discoveries.map(displayDiscovery)}:null;
  return {found,conversionPending,conversionError,localCorpus:corpus,online:remote,localPending:staticPending,localUnavailable:!staticPending&&!lib,pending:staticPending||corpusPending||remotePending||conversionPending};
 };
 const emit=()=>{if(typeof onProgress==='function'&&(!signal?.aborted||signal.reason?.name==='TimeoutError')){try{onProgress(snapshot())}catch{}}};
 const post=async path=>{const r=await fetcher(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:query.trim()}),signal});const d=await r.json();if(!r.ok)throw Error(d?.error||d?.message||'查找服务暂不可用，请稍后重试。');return d};
 const conversionTask=(async()=>{try{simplify=await waitForSearch(converter,signal);if(typeof simplify!=='function')throw Error()}catch{conversionError='简体转换加载失败，请重新查找；原始来源仍可打开核对。'}finally{conversionPending=false;emit()}})();
 const localTask=(async()=>{try{const value=await waitForSearch(library,signal);if(!value||!Array.isArray(value.works)||typeof value.simplify!=='function')throw Error('资料库格式不正确');lib=value}catch{}finally{staticPending=false;emit()}})();
 const corpusTask=(async()=>{try{const d=await waitForSearch(post('/api/poetry/search'),signal);localCorpus={status:sourceStatus(d?.status),sources:await checkedSources(d?.sources,'local-corpus'),message:typeof d?.message==='string'?d.message:'本地扩展语料查找已完成。'}}catch(e){localCorpus={status:'unavailable',sources:[],message:e?.message||'本地扩展语料暂不可用。'}}finally{corpusPending=false;emit()}})();
 const remoteTask=remotePending?(async()=>{try{const d=await waitForSearch(post(ai?'/api/poetry/hints':'/api/poetry/discover'),signal);hints=Array.isArray(d?.suggestions)?d.suggestions:[];hintedSources=ai?await checkedSources(d?.localSources,'local-corpus'):[];online={status:sourceStatus(d?.online?.status),sources:await checkedSources(d?.online?.sources,'wikisource'),discoveries:(Array.isArray(d?.online?.discoveries)?d.online.discoveries:[]).filter(safeDiscovery).map(({provider,verification,title,url,snippet})=>({provider,verification,title,url,snippet})),message:typeof d?.online?.message==='string'?d.online.message:'未收到可核对的网络来源。',providers:checkedProviders(d?.online?.providers)}}catch(e){online={status:'unavailable',sources:[],discoveries:[],message:e?.message||'联网查找失败，请重试。',providers:[]}}finally{remotePending=false;emit()}})():Promise.resolve();
 await Promise.all([localTask,corpusTask,remoteTask,conversionTask]);
 if(signal?.aborted&&signal.reason?.name!=='TimeoutError')throw signal.reason||new Error('查询已取消');
 return snapshot();
}
