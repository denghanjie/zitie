import {searchWorks,hintedWorks,normalize} from './library-search.js';

export function safeOnlineSource(source){
 if(!source||source.verification!=='source_fetched'||typeof source.text!=='string'||!source.text.trim()||typeof source.title!=='string'||!/^\d+$/.test(String(source.revisionId)))return false;
 try{const u=new URL(source.url);return u.protocol==='https:'&&u.hostname==='zh.wikisource.org'&&!u.username&&!u.password&&u.searchParams.get('oldid')===String(source.revisionId)}catch{return false}
}
// This is only an informational retrieval check; never alter the fetched body or its raw check.
export function compareConvertedQuote(source,simplify){
 if(typeof simplify!=='function'||source.matchedQuote!==false||typeof source.quote!=='string')return source;
 const quote=normalize(simplify(source.quote));
 if([...quote].length<4||!normalize(simplify(source.text)).includes(quote))return source;
 return {...source,rawQuoteCheck:source.quoteCheck,quoteCheck:'matched_after_conversion'};
}
export function reviewedOnlineWork(source,{title,author,text,confirmed}){
 if(!safeOnlineSource(source)||confirmed!==true||!title?.trim()||!author?.trim()||!text?.trim()||[...text].length>3000)throw Error('请先核对来源、篇名、作者和正文，并确认后再填入。');
 return {id:`online:${source.revisionId}`,title:title.trim(),author:author.trim(),text,layout:'auto',collection:'维基文库 · 用户核对',sourceUrl:source.url,provenance:{kind:'online-user-reviewed',revisionId:String(source.revisionId),...(typeof source.contentHash==='string'?{contentHash:source.contentHash}:{}),verification:'source_fetched',reviewed:true,reviewedText:text}};
}
export function isReviewedOnlineDraft(draft){
 const s=draft.source,p=s?.provenance;
 return !s?.qualityKey&&p?.kind==='online-user-reviewed'&&p.reviewed===true&&typeof p.reviewedText==='string'&&(p.reviewedText===draft.content||p.editedAfterReview===true)&&safeOnlineSource({title:s.title,url:s.url,text:p.reviewedText,revisionId:p.revisionId,verification:p.verification});
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
// Start the network request on every explicit AI search, even if the local corpus matches.
export async function findPoetry({library,query,ai=false,fetcher=fetch,signal}){
 const network=ai?(async()=>{const r=await fetcher('/api/poetry/hints',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:query.trim()}),signal});const d=await r.json();if(!r.ok)throw Error(d.error||'AI 联网查找失败，请稍后重试。');return d})():Promise.resolve(null);
 const [local,remote]=await Promise.allSettled([waitForSearch(library,signal),waitForSearch(network,signal)]);
 if(signal?.aborted&&signal.reason?.name!=='TimeoutError')throw signal.reason||new Error('查询已取消');
 const lib=local.status==='fulfilled'?local.value:null;
 const d=remote.status==='fulfilled'?remote.value:null;
 const hints=Array.isArray(d?.suggestions)?d.suggestions:[];
 let found=lib?searchWorks(lib.works,lib.simplify(query),lib.works.length):[];
 if(lib&&ai){const safeHints=hints.map(s=>Object.fromEntries(['title','author','quote'].map(k=>[k,lib.simplify(typeof s?.[k]==='string'?s[k]:'')])));const seen=new Set(found.map(w=>w.id));found=[...found,...hintedWorks(lib.works,safeHints).filter(w=>!seen.has(w.id))]}
 const online=ai?{status:['completed','partial','unavailable'].includes(d?.online?.status)?d.online.status:'unavailable',sources:(Array.isArray(d?.online?.sources)?d.online.sources:[]).filter(safeOnlineSource).map(source=>compareConvertedQuote(source,lib?.simplify)),message:typeof d?.online?.message==='string'?d.online.message:remote.status==='rejected'?(remote.reason?.message||'联网查找失败，请重试。'):'未收到可核对的网络来源。'}:null;
 return {found,online,localUnavailable:!lib};
}
