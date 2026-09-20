import {qualityFor,qualityLabel,canApplyWork} from './quality';
import React,{useState,useRef,useEffect} from 'react';
import {prepareWorks,searchWorks,hintedWorks} from './library-search';
let loading;
function getLibrary(){
 if(!loading)loading=Promise.all([fetch(`${import.meta.env.BASE_URL}library/works.json`).then(r=>{if(!r.ok)throw Error();return r.json()}),import('opencc-js/t2cn')]).then(([data,cc])=>({...data,works:prepareWorks(data.works),simplify:cc.Converter({from:'t',to:'cn'})})).catch(e=>{loading=null;throw e});
 return loading;
}
export default function PoetryPicker({onApply}){
 const[query,setQuery]=useState(''),[results,setResults]=useState([]),[selected,setSelected]=useState(null),[excerpt,setExcerpt]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[aiAvailable,setAiAvailable]=useState(false);
 const request=useRef(0);
 const [showPending,setShowPending]=useState(false);
 const visibleResults=showPending?results:results.filter(w=>canApplyWork(`poetry:${w.id}`));
 useEffect(()=>{let active=true;fetch('/api/poetry/status').then(r=>r.ok?r.json():null).then(d=>{if(active)setAiAvailable(d?.available===true)}).catch(()=>{});return()=>{active=false;request.current++}},[]);
 function editQuery(value){request.current++;setQuery(value);setBusy(false);setResults([]);setSelected(null);setMessage('');}
 async function search(ai=false){
  if(query.trim().length<2){setMessage('请输入至少两个字，例如“苏轼 水调歌头”。');return;}
  const id=++request.current;setBusy(true);setSelected(null);setResults([]);setMessage(ai?'AI 正在理解线索，再从诗词库核对…':'正在查找诗词库…');
  try{
   const lib=await getLibrary();let found;
   if(ai){
    const r=await fetch('/api/poetry/hints',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:query.trim()}),signal:AbortSignal.timeout(35000)});
    const d=await r.json();if(!r.ok)throw Error(d.error||'AI 查询失败，请稍后重试。');
    found=hintedWorks(lib.works,d.suggestions.map(s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,lib.simplify(v)]))));
   }else found=searchWorks(lib.works,lib.simplify(query),lib.works.length);
   if(id!==request.current)return;
   setResults(found);setMessage(found.length?`${ai?'AI 提供检索线索，已在诗词库找到':'找到'} ${found.length}${found.length===30?' 条候选（最多展示 30 条）':' 条候选'}。请选择作者和首句吻合的作品。`:`当前收录的 ${lib.works.length} 条记录中没有匹配结果。${ai?'未生成或补写原文。':'可换一个标题、作者或原句，也可以尝试 AI 帮找。'}`);
  }catch(e){if(id===request.current)setMessage(e.message&&e.message!=='Failed to fetch'?e.message:'诗词库加载失败，请检查网络后重试。')}
  finally{if(id===request.current)setBusy(false)}
 }
 const length=[...excerpt].length;
 return <section className="poetry-picker" aria-label="查找诗词全文">
  <label htmlFor="poem-query">作品名、作者或记得的诗句</label>
  <div className="search-bar"><input id="poem-query" value={query} maxLength={120} placeholder="如：李清照 如梦令 / 但愿人长久" onChange={e=>editQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();search()}}}/><button type="button" className="primary" disabled={busy} onClick={()=>search()}>查找</button></div>
  <div className="ai-search"><button type="button" disabled={busy||!aiAvailable} onClick={()=>search(true)}>✧ AI 帮我找</button><small>{aiAvailable?'适合模糊描述，如“李白梦里游仙山的诗”。只发送查找线索给 DeepSeek。':'AI 暂不可用，作品名与诗句检索仍可使用。'}</small></div>
  <p className="search-message" role="status">{message||'收录唐诗、宋词、古文观止、千家诗和楚辞。正文来自资料库，不由 AI 编写。'}</p>
  <label className="quality-filter"><input type="checkbox" checked={showPending} onChange={e=>setShowPending(e.target.checked)}/>显示待校勘篇目（仅查看）</label>
  {!!results.length&&!visibleResults.length&&<p className="source-note">匹配篇目尚未完成校勘，暂不开放填入。可勾选上方选项查看原因及原文。</p>}
  {!!visibleResults.length&&<ul className="poem-results">{visibleResults.slice(0,30).map(w=><li key={w.id}><button type="button" aria-pressed={selected?.id===w.id} onClick={()=>{setSelected(w);setExcerpt(w.text)}}><strong>{w.title}</strong><span>{w.author} · {w.collection} · {qualityLabel[qualityFor(`poetry:${w.id}`).status]}</span><small>{w.text.split('\n')[0]}</small></button></li>)}</ul>}
  {selected&&<div className="poem-detail"><h3>{selected.title}</h3><p className="source-note">{qualityLabel[qualityFor(`poetry:${selected.id}`).status]}：{qualityFor(`poetry:${selected.id}`).reason} <a href="library/collation.html" target="_blank" rel="noreferrer">查看全库校勘记录 ↗</a></p>{selected.editorialNote&&<p className="source-note">{selected.editorialNote} <a href={selected.editorialSourceUrl} target="_blank" rel="noreferrer">所选对照本 ↗</a></p>}<p>{selected.author} · {selected.collection}</p><a href={selected.sourceUrl} target="_blank" rel="noreferrer">查看原始来源 ↗</a>{selected.correctionNote&&<p className="source-note">用字校订：{selected.correctionNote}。<a href={selected.correctionSourceUrl} target="_blank" rel="noreferrer">查看校订依据 ↗</a></p>}<small>原始文件第 {selected.sourceIndex} 条记录；繁体转为简体。可能存在异文或录入差异，填入前请核对。分阕可在填入后用空行调整。</small><label htmlFor="poem-fulltext">全文预览（可编辑或摘选段落）</label><textarea id="poem-fulltext" value={excerpt} onChange={e=>setExcerpt(e.target.value)}/><p className={length>3000?'length-warning':''}>{length} / 3000 字{length>3000?' · 全文超出限制，请先删减或摘选段落，系统不会截断正文。':''}{excerpt!==selected.text?' · 已编辑':''}</p><button type="button" className="primary" disabled={!excerpt.trim()||length>3000||!canApplyWork(`poetry:${selected.id}`)} onClick={()=>onApply({...selected,text:excerpt,qualityKey:`poetry:${selected.id}`})}>用此正文替换练习内容</button></div>}
 </section>
}
