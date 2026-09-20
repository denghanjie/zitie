import React,{useState,useEffect,useRef} from 'react';
import{createRoot}from'react-dom/client';
import{isHan,articleLayout,loadCharacters,paginate,pageSvg,downloadPdf}from'./worksheet';
import './style.css';
const example={content:'春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。',title:'春晓',mode:'single',grid:'tian'};
function getDraft(){try{return {...example,...JSON.parse(localStorage.getItem('yizi-draft')||'{}')}}catch{return example}}
function Settings({draft,setDraft,busy,generate}){
 const change=(k,v)=>setDraft(d=>({...d,[k]:v}));
 return <form className="settings" onSubmit={e=>{e.preventDefault();generate()}}>
 <label className="section-title" htmlFor="content">练习内容</label>
 <textarea id="content" maxLength={3000} value={draft.content} onChange={e=>change('content',e.target.value)} placeholder="粘贴想练习的汉字、段落或文章…"/>
 <div className="text-tools"><button type="button" onClick={()=>setDraft({...draft,...example,mode:draft.mode,grid:draft.grid})}>填入《春晓》</button><span>{[...draft.content].length} / 3000</span><button type="button" onClick={()=>change('content','')}>清空文本</button></div>
 <fieldset><legend>练习方式</legend>{[['single','逐字练习','每字一行 · 六次描写 · 笔顺分解'],['article','整篇临摹','保留标点与段落 · 连贯书写']].map(([v,t,d])=><label className="radio-row" key={v}><input type="radio" name="mode" value={v} checked={draft.mode===v} onChange={()=>change('mode',v)}/><span><strong>{t}</strong><small>{d}</small></span></label>)}</fieldset>
 {draft.mode==='article'&&<label className="layout-setting">内容排版<select aria-label="内容排版" value={draft.layout||'auto'} onChange={e=>change('layout',e.target.value)}><option value="auto">自动识别诗词 / 文章</option><option value="poem">诗词 · 按句长排版</option><option value="prose">文章 · 连续排版</option></select><small>长短句自动折行；空行表示分阕或分节，分页尽量保持完整。</small></label>}
 {draft.mode==='article'&&draft.layout!=='prose'&&<label className="layout-setting">诗词断句<select aria-label="诗词断句" value={draft.lineBreak||'auto'} onChange={e=>change('lineBreak',e.target.value)}><option value="auto">自动 · 优先保留原有分行</option><option value="original">完全保留原有分行</option><option value="punctuation">按标点分句（保留空行分阕）</option></select><small>在上方文字框编辑换行；空一行即可分阕。自动识别不合适时，请选择「诗词」或「文章」。</small></label>}
 <fieldset><legend>字格类型</legend><div className="grid-options">{[['tian','田字格','田'],['mi','米字格','米']].map(([v,t,g])=><button type="button" key={v} className={draft.grid===v?'selected':''} aria-pressed={draft.grid===v} onClick={()=>change('grid',v)}><span className="grid-icon">{g}</span>{t}</button>)}</div></fieldset>
 <label className="section-title" htmlFor="title">字帖标题</label><input id="title" maxLength={24} value={draft.title} onChange={e=>change('title',e.target.value)} placeholder="汉字练习"/>
 <button className="primary generate" disabled={busy} type="submit">{busy?'正在生成…':'生成字帖'}</button>
 </form>
}
function App(){
 const[draft,setDraft]=useState(getDraft),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[pdfBusy,setPdfBusy]=useState(false),[message,setMessage]=useState(''),[page,setPage]=useState(0),[error,setError]=useState('');
 const initialized=useRef(false);
 useEffect(()=>{try{localStorage.setItem('yizi-draft',JSON.stringify(draft))}catch{}},[draft]);
 useEffect(()=>setError(''),[draft]);
 async function generate(){
  setError('');
  if(!draft.content.trim()){setError('请先输入想练习的文字。');return;}
  if(draft.mode==='single'&&![...draft.content].some(isHan)){setError('逐字练习需要至少一个汉字。');return;}
  if([...draft.content].length>3000){setError('一次最多生成 3000 个字符，请分段制作。');return;}
  setBusy(true);setMessage('正在准备字形和笔顺…');
  try{
   const input={...draft};const data=await loadCharacters(input.content);
   const layoutInfo=input.mode==='article'?articleLayout(input):null;
   const layoutNote=layoutInfo?.poetry?`诗词排版 · ${layoutInfo.breakMode} · 空行分阕。 `:'';
   const pages=paginate(input,data);const svgs=pages.map((p,i)=>pageSvg(input,data,p,i,pages.length));
   const missing=Object.keys(data).filter(c=>!data[c]);
   setResult({input,svgs});setPage(0);
   setMessage(layoutNote+(missing.length?`已生成 ${pages.length} 页。「${missing.slice(0,15).join('、')}」等 ${missing.length} 个字暂无字形数据，已使用系统字体${input.mode==='single'?'，并在纸上标注缺失笔顺':''}。`:`已生成 ${pages.length} 页，所有汉字字形${input.mode==='single'?'与笔顺':''}已就绪。`));
  }catch(e){setMessage('生成失败，请稍后重试。');console.error(e)}finally{setBusy(false)}
 }
 useEffect(()=>{if(!initialized.current){initialized.current=true;generate()}},[]);
 const dirty=result&&JSON.stringify(draft)!==JSON.stringify(result.input);
 async function save(){if(!result)return;setPdfBusy(true);setMessage('正在制作 PDF…');try{await downloadPdf(result.svgs,result.input.title,n=>setMessage(`正在制作 PDF：${n} / ${result.svgs.length} 页`));setMessage('PDF 已生成，请查看浏览器下载列表。')}catch(e){console.error(e);setMessage('PDF 下载失败。可使用「打印」并选择「另存为 PDF」。')}finally{setPdfBusy(false)}}
 return <><header><a className="brand" href="./">一字一练</a><span className="brand-tag">用喜欢的文字，遇见更好的自己</span><span className="motto">静下心，写好每一个字。</span></header>
 <section className="intro"><h1>把喜欢的文字，写成自己的字。</h1><p>粘贴文字，生成属于你的练字帖。</p></section>
 <main><Settings {...{draft,setDraft,busy,generate}}/><section className="preview"><div className="preview-toolbar"><div><h2>字帖预览</h2><span>A4 · 纵向</span></div><div className="export-actions"><button onClick={()=>window.print()} disabled={!result||busy||pdfBusy||dirty}>打印</button><span></span><button onClick={save} disabled={!result||busy||pdfBusy||dirty}>{pdfBusy?'制作中…':'保存 PDF'}</button></div></div>
 <div className="status" role="status" aria-live="polite">{error || (busy?message:dirty?'内容或设置已修改，点击「生成字帖」更新预览。':message)}</div>
 <div className="paper-wrap">{result?<div className="paper" dangerouslySetInnerHTML={{__html:result.svgs[page]}}/>:<div className="empty">输入文字后，你的字帖会出现在这里。</div>}</div>
 {result&&<nav className="pagination" aria-label="预览分页"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>← 上一页</button><label>第 <select aria-label="跳转页码" value={page} onChange={e=>setPage(+e.target.value)}>{result.svgs.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select> / {result.svgs.length} 页</label><button disabled={page===result.svgs.length-1} onClick={()=>setPage(p=>p+1)}>下一页 →</button></nav>}
 <p className="privacy">所有内容仅保存在你的设备上，不会上传至服务器。</p></section></main>
 <footer>打印建议：A4 纸张 · 纵向 · 100% 比例 · 关闭浏览器页眉页脚 <span>笔顺数据：<a href="https://hanziwriter.org" target="_blank" rel="noreferrer">Hanzi Writer</a> / Make Me a Hanzi</span></footer>
 <div className="print-pages">{result?.svgs.map((s,i)=><div key={i} className="print-page" dangerouslySetInnerHTML={{__html:s}}/>)}</div></>
}
createRoot(document.getElementById('root')).render(<App/>);
