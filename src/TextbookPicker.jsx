import React,{useEffect,useState} from 'react';
import {gradeNames,selectBook,filterEntries} from './textbook-library';
let pending;
function getTextbooks(){
 if(!pending)pending=fetch(`${import.meta.env.BASE_URL}library/textbooks.json`).then(r=>{if(!r.ok)throw Error();return r.json()}).catch(e=>{pending=null;throw e});
 return pending;
}
export default function TextbookPicker({onApply}){
 const[data,setData]=useState(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 const[edition,setEdition]=useState('pep63'),[grade,setGrade]=useState(1),[term,setTerm]=useState('上册'),[type,setType]=useState('all'),[query,setQuery]=useState(''),[selected,setSelected]=useState(null),[excerpt,setExcerpt]=useState('');
 useEffect(()=>{let active=true;setError(false);getTextbooks().then(d=>{if(active)setData(d)}).catch(()=>{if(active)setError(true)});return()=>{active=false}},[attempt]);
 const reset=()=>{setSelected(null);setExcerpt('')};
 if(error)return <section className="poetry-picker"><p role="alert">教材目录加载失败，请检查网络后重试。</p><button type="button" onClick={()=>setAttempt(n=>n+1)}>重新加载教材目录</button></section>;
 if(!data)return <p role="status">正在加载教材选篇…</p>;
 const book=selectBook(data,edition,grade,term), entries=filterEntries(book?.entries||[],query,type),length=[...excerpt].length;
 return <section className="poetry-picker textbook-picker" aria-label="教材古诗文选篇">
  <label htmlFor="textbook-edition">教材与学制</label>
  <select id="textbook-edition" value={edition} onChange={e=>{setEdition(e.target.value);reset()}}>{data.editions.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select>
  <div className="textbook-filters"><label>年级<select aria-label="教材年级" value={grade} onChange={e=>{setGrade(Number(e.target.value));reset()}}>{gradeNames.map((g,i)=><option key={g} value={i+1}>{g}</option>)}</select></label><label>册次<select aria-label="教材册次" value={term} onChange={e=>{setTerm(e.target.value);reset()}}><option>上册</option><option>下册</option></select></label></div>
  <p className="edition-note">{data.editions.find(e=>e.id===edition).note}</p>
  {book&&<div className="book-source"><strong>{gradeNames[grade-1]} · {term}</strong><span>{book.versionNote}</span><a href={book.sourceUrl} target="_blank" rel="noreferrer">核对官方教材 ↗</a></div>}
  <label htmlFor="textbook-query">在本册中查找</label><input id="textbook-query" value={query} placeholder="篇名、作者或正文" maxLength={120} onChange={e=>{setQuery(e.target.value);reset()}} onKeyDown={e=>{if(e.key==='Enter')e.preventDefault()}}/>
  <div className="textbook-types" role="group" aria-label="选篇类型">{[['all','全部'],['poem','古诗词'],['prose','文言文']].map(([value,label])=><button type="button" key={value} aria-pressed={type===value} onClick={()=>{setType(value);reset()}}>{label}</button>)}</div>
  <p className="search-message" role="status">{book?`本册已收录 ${book.entries.length} 篇，当前显示 ${entries.length} 篇。${book.coverageNote||''}`:'本册尚未完成核对，请换一册或使用按名称查找。'}</p>
  {entries.length>0?<ul className="poem-results">{entries.map(w=><li key={w.id}><button type="button" aria-pressed={selected?.id===w.id} onClick={()=>{setSelected(w);setExcerpt(w.text)}}><strong>{w.title}</strong><span>{w.author} · {w.section} · {w.type==='poem'?'古诗词':'文言文'}</span><small>{w.text.split('\n')[0]}</small></button></li>)}</ul>:<p className="textbook-empty">没有符合条件的篇目。可清除关键词或切换年级、册次。</p>}
  {selected&&<div className="poem-detail"><h3>{selected.title}</h3><p>{selected.author} · {selected.section}</p><a href={selected.sourceUrl} target="_blank" rel="noreferrer">查看正文来源 ↗</a><small>{selected.textNote} 教材若有节选或用字差异，请按手中课本核对；可在下方编辑后填入。</small><label htmlFor="textbook-fulltext">正文预览（可编辑或摘选段落）</label><textarea id="textbook-fulltext" value={excerpt} onChange={e=>setExcerpt(e.target.value)}/><p className={length>3000?'length-warning':''}>{length} / 3000 字{length>3000?' · 请摘选至 3000 字以内，不会自动截断。':''}{excerpt!==selected.text?' · 已编辑':''}</p><button className="primary" type="button" disabled={!excerpt.trim()||length>3000} onClick={()=>onApply({...selected,text:excerpt,layout:selected.type,collection:`${data.editions.find(e=>e.id===edition).label} · ${gradeNames[grade-1]}${term}`})}>用此正文替换练习内容</button></div>}
  <p className="source-note">目录核对日期：{data.checkedAt}。仅收录古代作品原文或注明范围的节选，不含现代课文、教材注释与插图。</p>
 </section>
}
