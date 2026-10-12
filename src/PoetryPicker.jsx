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
export default function PoetryPicker({onApply}){
 const[query,setQuery]=useState(''),[results,setResults]=useState([]),[selected,setSelected]=useState(null),[excerpt,setExcerpt]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[aiAvailable,setAiAvailable]=useState(false);
 const request=useRef(0),controller=useRef(null);
 const[online,setOnline]=useState(null),[onlineSelected,setOnlineSelected]=useState(null),[onlineTitle,setOnlineTitle]=useState(''),[onlineAuthor,setOnlineAuthor]=useState(''),[onlineText,setOnlineText]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [showPending,setShowPending]=useState(false);
 const visibleResults=showPending?results:results.filter(w=>canApplyWork(w.qualityKey));
 useEffect(()=>{let active=true;fetch('/api/poetry/status').then(r=>r.ok?r.json():null).then(d=>{if(active)setAiAvailable(d?.available===true)}).catch(()=>{});return()=>{active=false;request.current++;controller.current?.abort()}},[]);
 function editQuery(value){request.current++;controller.current?.abort();setOnline(null);setOnlineSelected(null);setConfirmed(false);setQuery(value);setBusy(false);setResults([]);setSelected(null);setMessage('');}
 async function search(ai=false){
  if(query.trim().length<2){setMessage('请输入至少两个字，例如“苏轼 水调歌头”。');return;}
  controller.current?.abort();const abort=new AbortController();controller.current=abort;
  const id=++request.current;setBusy(true);setSelected(null);setResults([]);setOnline(null);setOnlineSelected(null);setConfirmed(false);setMessage(ai?'正在查找资料库，并用 AI 线索联网寻找来源…':'正在查找诗词库…');
  const timeout=setTimeout(()=>abort.abort(new DOMException('联网查询超时，请重试。','TimeoutError')),65000);
  try{
   const {found,online:remote,localUnavailable}=await findPoetry({library:getLibrary(),query,ai,signal:abort.signal});
   if(id!==request.current)return;
   track('search');if(!found.length)track('search_empty');
   setResults(found);setOnline(remote);setMessage(`${localUnavailable?'资料库暂时加载失败。':found.length?`资料库找到 ${found.length} 条候选。请选择作者和首句吻合的作品。`:'资料库暂无匹配正文，可尝试作者加篇名。'}${ai?' 联网结果单独列在下方，需自行核对。':''}`);
  }catch(e){if(id===request.current)setMessage(e.message&&e.message!=='Failed to fetch'?e.message:'查找失败，请检查网络后重试。')}
  finally{clearTimeout(timeout);if(id===request.current)setBusy(false)}
 }
 function selectOnline(source){setSelected(null);setOnlineSelected(source);setOnlineTitle(source.title);setOnlineAuthor(source.authorHint||'');setOnlineText(source.text);setConfirmed(false)}
 function editOnline(setter,value){setter(value);setConfirmed(false)}
 const length=[...excerpt].length;
 return <section className="poetry-picker" aria-label="查找诗词全文">
  <label htmlFor="poem-query">作品名、作者或记得的诗句</label>
  <div className="search-bar"><input id="poem-query" value={query} maxLength={120} placeholder="如：李清照 如梦令 / 但愿人长久" onChange={e=>editQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();search()}}}/><button type="button" className="primary" disabled={busy} onClick={()=>search()}>查找</button></div>
  <div className="ai-search"><button type="button" disabled={busy||!aiAvailable} onClick={()=>search(true)}>✧ AI 帮我找</button><small>{aiAvailable?'适合模糊描述，如“李白梦里游仙山的诗”。查找线索会发送给 DeepSeek，并据此查询维基文库。':'AI 暂不可用，作品名与诗句检索仍可使用。'}</small></div>
  <p className="search-message" role="status">{message||'统一查找诗词库与教材古诗文，包含《关雎》《木兰诗》等教材选篇。正文来自资料库，不由 AI 编写。'}</p>
  {message&&!busy&&!results.length&&<button type="button" onClick={()=>requestFeedback(query)}>没找到？提交收录建议</button>}
  <label className="quality-filter"><input type="checkbox" checked={showPending} onChange={e=>setShowPending(e.target.checked)}/>显示待校勘篇目（仅查看）</label>
  {!!results.length&&!visibleResults.length&&<p className="source-note">匹配篇目尚未完成校勘，暂不开放填入。可勾选上方选项查看原因及原文。</p>}
  {!!visibleResults.length&&<ul className="poem-results">{visibleResults.slice(0,30).map(w=><li key={w.id}><button type="button" aria-pressed={selected?.id===w.id} onClick={()=>{setOnlineSelected(null);setConfirmed(false);setSelected(w);setExcerpt(w.text)}}><strong>{w.title}</strong><span>{w.author} · {w.collection} · {qualityLabel[qualityFor(w.qualityKey).status]}</span><small>{w.searchNote&&<strong>{w.searchNote}</strong>}{w.text.split('\n')[0]}</small></button></li>)}</ul>}
  {online&&<section className="online-results" aria-label="联网来源候选"><h3>联网来源候选 · 未经资料库校勘</h3><p role="status">{online.status==='completed'?'联网查找已完成':online.status==='partial'?'部分联网来源暂不可用':'联网查找暂不可用'}。{online.message}</p><p className="source-note">已抓取来源页面不代表作者、篇名或原文已核准。请打开原始版本核对，页面可能包含序言、注释、异文或多篇作品；正文并非 AI 编写。</p>{!!online.sources.length&&<ul className="poem-results">{online.sources.map((s,i)=><li key={`${s.revisionId}:${i}`}><button type="button" aria-pressed={onlineSelected===s} onClick={()=>selectOnline(s)}><strong>{s.title}</strong><span>维基文库 · 来源已抓取 · 版本 {s.revisionId}</span><small>{s.quoteCheck==='matched_after_conversion'?'繁简归一后找到提示诗句，仍需核对篇名、作者及异文。':s.quoteCheck==='matched'?'来源中找到提示诗句，仍需核对篇名和作者。':s.quoteCheck==='not_found'?'来源中未找到提示诗句，可能有异文或繁简差异，请谨慎核对。':'未进行有效的诗句匹配核对。'}</small><small>{s.text.slice(0,120)}</small></button><a href={s.url} target="_blank" rel="noreferrer">打开来源版本 ↗</a></li>)}</ul>}{!online.sources.length&&<p>暂无可核对的网络正文。可以更换线索重试。</p>}</section>}
  {onlineSelected&&<div className="poem-detail"><h3>核对网络正文</h3><p className="source-note">此文本未经资料库校勘；填入后标记为“用户核对”，不会加入已校勘资料库。请移除目录、注释及不需要的段落。</p><a href={onlineSelected.url} target="_blank" rel="noreferrer">核对维基文库原始版本 {onlineSelected.revisionId} ↗</a><label htmlFor="online-title">核对篇名</label><input id="online-title" value={onlineTitle} maxLength={200} onChange={e=>editOnline(setOnlineTitle,e.target.value)}/><label htmlFor="online-author">核对作者（预填仅为 AI 线索，无署名可填“佚名”）</label><input id="online-author" value={onlineAuthor} maxLength={120} onChange={e=>editOnline(setOnlineAuthor,e.target.value)}/><label htmlFor="online-text">来源正文（可编辑、摘选；保留来源原字形）</label><textarea id="online-text" value={onlineText} onChange={e=>editOnline(setOnlineText,e.target.value)}/><p className={[...onlineText].length>3000?'length-warning':''}>{[...onlineText].length} / 3000 字{[...onlineText].length>3000?' · 请先摘选段落，不会自动截断。':''}</p><label className="quality-filter"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已打开来源，核对篇名、作者和所选正文，了解此版本未经资料库校勘。</label><button type="button" className="primary" disabled={!confirmed||!onlineTitle.trim()||!onlineAuthor.trim()||!onlineText.trim()||[...onlineText].length>3000} onClick={()=>onApply(reviewedOnlineWork(onlineSelected,{title:onlineTitle,author:onlineAuthor,text:onlineText,confirmed}))}>用已核对的网络正文替换练习内容</button></div>}
  {selected&&<div className="poem-detail"><h3>{selected.title}</h3><p className="source-note">{qualityLabel[qualityFor(selected.qualityKey).status]}：{qualityFor(selected.qualityKey).reason} <a href="library/collation.html" target="_blank" rel="noreferrer">查看全库校勘记录 ↗</a></p>{selected.editorialNote&&<p className="source-note">{selected.editorialNote} <a href={selected.editorialSourceUrl} target="_blank" rel="noreferrer">所选对照本 ↗</a></p>}<p>{selected.author} · {selected.collection}</p><a href={selected.sourceUrl} target="_blank" rel="noreferrer">查看原始来源 ↗</a>{selected.correctionNote&&<p className="source-note">用字校订：{selected.correctionNote}。<a href={selected.correctionSourceUrl} target="_blank" rel="noreferrer">查看校订依据 ↗</a></p>}<small>{selected.textNote?selected.textNote:<>原始文件第 {selected.sourceIndex} 条记录；繁体转为简体。</>} 可能存在异文或录入差异，填入前请核对。分阕可在填入后用空行调整。</small><label htmlFor="poem-fulltext">全文预览（可编辑或摘选段落）</label><textarea id="poem-fulltext" value={excerpt} onChange={e=>setExcerpt(e.target.value)}/><p className={length>3000?'length-warning':''}>{length} / 3000 字{length>3000?' · 全文超出限制，请先删减或摘选段落，系统不会截断正文。':''}{excerpt!==selected.text?' · 已编辑':''}</p><button type="button" className="primary" disabled={!excerpt.trim()||length>3000||!canApplyWork(selected.qualityKey)} onClick={()=>onApply({...selected,text:excerpt,qualityKey:selected.qualityKey})}>用此正文替换练习内容</button></div>}
 </section>
}
