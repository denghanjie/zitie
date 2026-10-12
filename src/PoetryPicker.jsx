import {track,requestFeedback} from './feedback';
import {qualityFor,qualityLabel,canApplyWork} from './quality';
import React,{useState,useRef,useEffect} from 'react';
import {mergeLibraries} from './library-search';
import {findPoetry,reviewedOnlineWork} from './online-search.js';
let loading;
function getLibrary(){
 if(!loading)loading=Promise.all([fetch(`${import.meta.env.BASE_URL}library/works.json`).then(r=>{if(!r.ok)throw Error();return r.json()}),fetch(`${import.meta.env.BASE_URL}library/textbooks.json`).then(r=>{if(!r.ok)throw Error();return r.json()}),import('opencc-js/t2cn')]).then(([data,textbooks,cc])=>({...data,works:mergeLibraries(data.works,textbooks),simplify:cc.Converter({from:'t',to:'cn'})})).catch(e=>{loading=null;throw e});
 return loading;
}
const sourceIdentity=s=>`${s.provider}:${s.revisionId}:${s.sourcePath||''}:${s.sourceIndex||''}`;
export function SourceCandidates({group,local=false,selected,onSelect}){
 if(!group)return null;
 return <section className="online-results" aria-label={local?'本地扩展语料候选':'联网来源候选'}>
  <h3>{local?'本地扩展语料':'联网来源候选'} · 未经资料库校勘</h3>
  <p role="status">{group.status==='loading'?'正在查找':group.status==='completed'?'查找已完成':group.status==='partial'?'部分来源暂不可用':'暂不可用'}。{!group.providers?.length&&group.message}</p>
  {!!group.providers?.length&&<ul className="source-note" aria-label="各来源服务状态">{group.providers.map(p=><li key={p.provider}>{({deepseek:'DeepSeek 识别',baidu:'百度搜索',wikisource:'维基文库'})[p.provider]}：{({completed:'已完成',partial:'部分不可用',unavailable:'暂不可用',not_configured:'尚未配置',disabled:'未启用',ready:'已配置'})[p.status]}。{p.message}</li>)}</ul>}
  {!!group.sources.length&&<><p className="source-note">{local?'这些正文已保存在本站，可直接预览；它们是公开整理本，尚未经本站校勘。':'已抓取来源页面不代表作者、篇名或原文已核准，可能包含序言、注释、异文或多篇作品。'} 请打开对应来源版本，自行核对后再填入。正文并非 AI 编写。</p>
  <ul className="poem-results">{group.sources.map(s=><li key={sourceIdentity(s)}><button type="button" aria-pressed={selected&&sourceIdentity(selected)===sourceIdentity(s)} onClick={()=>onSelect(s)}>
   <strong>{s.title}</strong><span>{s.authorHint||'作者待核'} · {local?s.edition:'维基文库'} · 来源已取得</span>
   {local?<small>{s.sourcePath} · 第 {s.sourceIndex} 条 · 版本 {s.revisionId.slice(0,12)}</small>:<small>{s.quoteCheck==='matched_after_conversion'?'繁简归一后找到提示诗句，仍需核对篇名、作者及异文。':s.quoteCheck==='matched'?'来源中找到提示诗句，仍需核对篇名和作者。':s.quoteCheck==='not_found'?'来源中未找到提示诗句，可能有异文或繁简差异，请谨慎核对。':'未进行有效的诗句匹配核对。'}</small>}
   <small>{s.text.slice(0,120)}</small></button><a href={s.url} target="_blank" rel="noreferrer">打开来源版本 ↗</a></li>)}</ul></>}
  {group.status!=='loading'&&!group.sources.length&&<p>{local?'本地扩展语料暂无匹配正文。':'暂无已取得的网络正文。'}</p>}
  {!!group.discoveries?.length&&<div><h4>百度网页线索 · 仅供自行打开查阅</h4><p className="source-note">这里只展示搜索标题、链接和摘要，未取得或核准网页正文，不能直接填入字帖。</p><ul className="poem-results">{group.discoveries.map((d,i)=><li key={`${d.url}:${i}`}><a href={d.url} target="_blank" rel="noreferrer">{d.title} ↗</a><p>{d.snippet}</p><small>{new URL(d.url).hostname}</small></li>)}</ul></div>}
 </section>
}
export default function PoetryPicker({onApply}){
 const[query,setQuery]=useState(''),[results,setResults]=useState([]),[selected,setSelected]=useState(null),[excerpt,setExcerpt]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[aiAvailable,setAiAvailable]=useState(false),[baiduAvailable,setBaiduAvailable]=useState(false),[baiduStatus,setBaiduStatus]=useState(null);
 const request=useRef(0),controller=useRef(null),reviewRequest=useRef(0);
 const[localCorpus,setLocalCorpus]=useState(null),[online,setOnline]=useState(null),[onlineSelected,setOnlineSelected]=useState(null),[onlineTitle,setOnlineTitle]=useState(''),[onlineAuthor,setOnlineAuthor]=useState(''),[onlineText,setOnlineText]=useState(''),[confirmed,setConfirmed]=useState(false),[reviewBusy,setReviewBusy]=useState(false),[reviewError,setReviewError]=useState('');
 const [showPending,setShowPending]=useState(false);
 const visibleResults=showPending?results:results.filter(w=>canApplyWork(w.qualityKey));
 useEffect(()=>{let active=true;fetch('/api/poetry/status').then(r=>r.ok?r.json():null).then(d=>{if(active){setAiAvailable(d?.available===true);setBaiduAvailable(d?.baiduAvailable===true);setBaiduStatus(d?.baiduStatus?.status||null)}}).catch(()=>{});return()=>{active=false;request.current++;reviewRequest.current++;controller.current?.abort()}},[]);
 function editQuery(value){request.current++;reviewRequest.current++;controller.current?.abort();setLocalCorpus(null);setOnline(null);setOnlineSelected(null);setConfirmed(false);setReviewError('');setQuery(value);setBusy(false);setResults([]);setSelected(null);setMessage('');}
 function cancelSearch(){request.current++;controller.current?.abort();setBusy(false);setMessage('已停止等待。已找到的结果仍可查看、核对和使用。');setLocalCorpus(s=>s?.status==='loading'?{...s,status:'unavailable',message:'已停止等待本地扩展语料服务。'}:s);setOnline(s=>s?.status==='loading'?{...s,status:'unavailable',message:'已停止联网等待。'}:s)}
 async function search(mode='local'){
  if(query.trim().length<2){setMessage('请输入至少两个字，例如“苏轼 水调歌头”。');return;}
  controller.current?.abort();const abort=new AbortController();controller.current=abort;
  const id=++request.current;reviewRequest.current++;setBusy(true);setSelected(null);setResults([]);setLocalCorpus(null);setOnline(null);setOnlineSelected(null);setConfirmed(false);setReviewError('');setMessage('正在查找本站资料；本地结果会先显示…');
  const timeout=setTimeout(()=>abort.abort(new DOMException('查找超时，已找到的本地结果仍可使用。','TimeoutError')),65000);
  const publish=({found,localCorpus:corpus,online:remote,localUnavailable,localPending,pending})=>{
   if(id!==request.current)return;
   setResults(found);setLocalCorpus(corpus);setOnline(remote);setMessage(`${localPending?'内置资料库仍在加载。':localUnavailable?'内置资料库暂时加载失败。':found.length?`内置资料库找到 ${found.length} 条候选。请选择作者和首句吻合的作品。`:'内置资料库暂无匹配结果。'}${corpus.sources.length?` 本地扩展语料找到 ${corpus.sources.length} 条，需自行核对。`:''}${pending?' 其余来源仍在查找，已显示的结果可先使用。':''}`);
  };
  try{
   const result=await findPoetry({library:getLibrary(),query,ai:mode==='ai',discover:mode==='discover',signal:abort.signal,onProgress:publish});
   if(id!==request.current)return;
   publish(result);track('search');if(!result.found.length&&!result.localCorpus.sources.length&&!result.online?.sources.length)track('search_empty');
  }catch(e){if(id===request.current)setMessage(e.message&&e.message!=='Failed to fetch'?e.message:'查找失败，请检查网络后重试。')}
  finally{clearTimeout(timeout);if(id===request.current)setBusy(false)}
 }
 function selectOnline(source){reviewRequest.current++;setSelected(null);setOnlineSelected(source);setOnlineTitle(source.title);setOnlineAuthor(source.authorHint||'');setOnlineText(source.text);setConfirmed(false);setReviewError('')}
 function editOnline(setter,value){reviewRequest.current++;setter(value);setConfirmed(false);setReviewError('')}
 async function applyReviewed(){const id=reviewRequest.current;setReviewBusy(true);setReviewError('');try{const work=await reviewedOnlineWork(onlineSelected,{title:onlineTitle,author:onlineAuthor,text:onlineText,confirmed});if(id===reviewRequest.current)onApply(work)}catch(e){if(id===reviewRequest.current)setReviewError(e.message)}finally{setReviewBusy(false)}}
 const length=[...excerpt].length;
 return <section className="poetry-picker" aria-label="查找诗词全文">
  <label htmlFor="poem-query">作品名、作者或记得的诗句</label>
  <div className="search-bar"><input id="poem-query" value={query} maxLength={120} placeholder="如：李清照 如梦令 / 但愿人长久" onChange={e=>editQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();search()}}}/><button type="button" className="primary" disabled={busy} onClick={()=>search()}>查找</button>{busy&&<button type="button" onClick={cancelSearch}>停止等待</button>}</div>
  <div className="ai-search"><button type="button" disabled={busy||!baiduAvailable} onClick={()=>search('discover')}>联网找线索</button><small>{baiduAvailable?'把当前查找线索发送给百度，寻找可自行查阅的网页。':baiduStatus==='not_configured'?'百度搜索尚未配置，本站资料检索仍可使用。':'百度联网线索暂不可用，本站资料检索仍可使用。'}</small></div>
  <div className="ai-search"><button type="button" disabled={busy||!aiAvailable} onClick={()=>search('ai')}>✧ AI 帮我找</button><small>{aiAvailable?'适合模糊描述，如“李白梦里游仙山的诗”。线索会发送给 DeepSeek，并据此查询已配置的网络来源。':'AI 暂不可用，作品名与诗句检索仍可使用。'}</small></div>
  <p className="search-message" role="status">{message||'普通查找先检索本站诗词库、教材古诗文与本地扩展语料，无需 DeepSeek 或百度。不同整理本分开显示，正文保留来源原字形。'}</p>
  {message&&!busy&&!results.length&&!localCorpus?.sources.length&&<button type="button" onClick={()=>requestFeedback(query)}>没找到？提交收录建议</button>}
  <label className="quality-filter"><input type="checkbox" checked={showPending} onChange={e=>setShowPending(e.target.checked)}/>显示待校勘篇目（仅查看）</label>
  {!!results.length&&!visibleResults.length&&<p className="source-note">匹配篇目尚未完成校勘，暂不开放填入。可勾选上方选项查看原因及原文。</p>}
  {!!visibleResults.length&&<ul className="poem-results">{visibleResults.slice(0,30).map(w=><li key={w.id}><button type="button" aria-pressed={selected?.id===w.id} onClick={()=>{reviewRequest.current++;setOnlineSelected(null);setConfirmed(false);setSelected(w);setExcerpt(w.text)}}><strong>{w.title}</strong><span>{w.author} · {w.collection} · {qualityLabel[qualityFor(w.qualityKey).status]}</span><small>{w.searchNote&&<strong>{w.searchNote}</strong>}{w.text.split('\n')[0]}</small></button></li>)}</ul>}
  <SourceCandidates group={localCorpus} local selected={onlineSelected} onSelect={selectOnline}/>
  <SourceCandidates group={online} selected={onlineSelected} onSelect={selectOnline}/>
  {onlineSelected&&<div className="poem-detail"><h3>核对来源正文</h3><p className="source-note">此文本未经资料库校勘；填入后标记为“用户核对”，不会加入已校勘资料库。请移除目录、注释及不需要的段落。</p><a href={onlineSelected.url} target="_blank" rel="noreferrer">核对{onlineSelected.provider==='local-corpus'?onlineSelected.edition:'维基文库'}原始版本 ↗</a>{onlineSelected.sourcePath&&<p className="source-note">{onlineSelected.sourcePath} · 第 {onlineSelected.sourceIndex} 条 · 固定版本 {onlineSelected.revisionId}</p>}<label htmlFor="online-title">核对篇名</label><input id="online-title" value={onlineTitle} maxLength={200} onChange={e=>editOnline(setOnlineTitle,e.target.value)}/><label htmlFor="online-author">核对作者（预填仅为来源署名或查找线索，无署名可填“佚名”）</label><input id="online-author" value={onlineAuthor} maxLength={120} onChange={e=>editOnline(setOnlineAuthor,e.target.value)}/><label htmlFor="online-text">来源正文（可编辑、摘选；保留来源原字形）</label><textarea id="online-text" value={onlineText} onChange={e=>editOnline(setOnlineText,e.target.value)}/><p className={[...onlineText].length>3000?'length-warning':''}>{[...onlineText].length} / 3000 字{[...onlineText].length>3000?' · 请先摘选段落，不会自动截断。':''}</p><label className="quality-filter"><input type="checkbox" checked={confirmed} onChange={e=>{reviewRequest.current++;setConfirmed(e.target.checked)}}/>我已打开来源，核对篇名、作者和所选正文，了解此版本未经资料库校勘。</label>{reviewError&&<p role="alert">{reviewError}</p>}<button type="button" className="primary" disabled={reviewBusy||!confirmed||!onlineTitle.trim()||!onlineAuthor.trim()||!onlineText.trim()||[...onlineText].length>3000} onClick={applyReviewed}>{reviewBusy?'正在检查来源记录…':'用已核对的正文替换练习内容'}</button></div>}
  {selected&&<div className="poem-detail"><h3>{selected.title}</h3><p className="source-note">{qualityLabel[qualityFor(selected.qualityKey).status]}：{qualityFor(selected.qualityKey).reason} <a href="library/collation.html" target="_blank" rel="noreferrer">查看全库校勘记录 ↗</a></p>{selected.editorialNote&&<p className="source-note">{selected.editorialNote} <a href={selected.editorialSourceUrl} target="_blank" rel="noreferrer">所选对照本 ↗</a></p>}<p>{selected.author} · {selected.collection}</p><a href={selected.sourceUrl} target="_blank" rel="noreferrer">查看原始来源 ↗</a>{selected.correctionNote&&<p className="source-note">用字校订：{selected.correctionNote}。<a href={selected.correctionSourceUrl} target="_blank" rel="noreferrer">查看校订依据 ↗</a></p>}<small>{selected.textNote?selected.textNote:<>原始文件第 {selected.sourceIndex} 条记录；繁体转为简体。</>} 可能存在异文或录入差异，填入前请核对。分阕可在填入后用空行调整。</small><label htmlFor="poem-fulltext">全文预览（可编辑或摘选段落）</label><textarea id="poem-fulltext" value={excerpt} onChange={e=>setExcerpt(e.target.value)}/><p className={length>3000?'length-warning':''}>{length} / 3000 字{length>3000?' · 全文超出限制，请先删减或摘选段落，系统不会截断正文。':''}{excerpt!==selected.text?' · 已编辑':''}</p><button type="button" className="primary" disabled={!excerpt.trim()||length>3000||!canApplyWork(selected.qualityKey)} onClick={()=>onApply({...selected,text:excerpt,qualityKey:selected.qualityKey})}>用此正文替换练习内容</button></div>}
 </section>
}
