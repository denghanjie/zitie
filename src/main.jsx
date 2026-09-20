import {canUseImportedDraft} from './quality';
import {textIntegrityIssue} from './editorial.js';
import {migrateLibraryDraft,knownTextCorrection} from './text-corrections.js';
import React,{useState,useEffect,useRef} from 'react';
import{createRoot}from'react-dom/client';
import{isHan,articleLayout,loadCharacters,paginate,pageSvg,downloadPdf}from'./worksheet';
import './style.css';
import PoetryPicker from './PoetryPicker';
import TextbookPicker from './TextbookPicker';
import {TYPEFACES,normalizeTypeface,loadTypeface,FONT_SIZES,normalizeFontSize} from './typefaces';
const example={content:'春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。',title:'春晓',mode:'single',grid:'tian'};
function getDraft(){try{const d={...example,...JSON.parse(localStorage.getItem('yizi-draft')||'{}')};return migrateLibraryDraft({...d,font:normalizeTypeface(d.font),fontSize:normalizeFontSize(d.fontSize)})}catch{return {...example,font:'kai',fontSize:'normal'}}}
function Settings({draft,setDraft,busy,generate}){
 const [inputMode,setInputMode]=useState('paste');
 const correction=knownTextCorrection(draft.content);
 const change=(k,v)=>setDraft(d=>({...d,[k]:v,...(k==='content'?{source:null}:{})}));
 const applyWork=w=>{setDraft(d=>({...d,content:w.text,title:w.title.slice(0,24),layout:w.layout,lineBreak:'auto',source:{title:w.title,author:w.author,url:w.sourceUrl,collection:w.collection,qualityKey:w.qualityKey}}));setInputMode('paste')};
 return <form className="settings" onSubmit={e=>{e.preventDefault();generate()}}>
 <label className="section-title" htmlFor="content">练习内容</label>
 <div className="input-tabs" role="group" aria-label="输入方式"><button type="button" aria-pressed={inputMode==='paste'} onClick={()=>setInputMode('paste')}>粘贴文字</button><button type="button" aria-pressed={inputMode==='search'} onClick={()=>setInputMode('search')}>按名称查找</button><button type="button" aria-pressed={inputMode==='textbook'} onClick={()=>setInputMode('textbook')}>教材选篇</button></div>
 {inputMode==='search'&&<PoetryPicker onApply={applyWork}/>}
 {inputMode==='textbook'&&<TextbookPicker onApply={applyWork}/>}
 {draft.source&&<p className="source-note">已填入：《{draft.source.title}》 · {draft.source.author}{draft.source.collection&&<> · {draft.source.collection}</>} · 正文可继续修改</p>}
 <textarea id="content" maxLength={3000} value={draft.content} onChange={e=>change('content',e.target.value)} placeholder="粘贴想练习的汉字、段落或文章…"/>
 {correction&&<p className="source-note" role="alert">这份《{correction.title}》含已确认的旧版用字差异。<button type="button" onClick={()=>change('content',correction.content)}>改用校订正文</button></p>}
 <div className="text-tools"><button type="button" onClick={()=>setDraft({...draft,...example,source:null,mode:draft.mode,grid:draft.grid})}>填入《春晓》</button><span>{[...draft.content].length} / 3000</span><button type="button" onClick={()=>change('content','')}>清空文本</button></div>
 <fieldset><legend>练习方式</legend>{[['single','逐字练习','每字一行 · 六次描写 · 笔顺分解'],['article','整篇临摹','保留标点与段落 · 连贯书写']].map(([v,t,d])=><label className="radio-row" key={v}><input type="radio" name="mode" value={v} checked={draft.mode===v} onChange={()=>change('mode',v)}/><span><strong>{t}</strong><small>{d}</small></span></label>)}</fieldset>
 {draft.mode==='article'&&<label className="layout-setting">内容排版<select aria-label="内容排版" value={draft.layout||'auto'} onChange={e=>change('layout',e.target.value)}><option value="auto">自动识别诗词 / 文章</option><option value="poem">诗词 · 按句长排版</option><option value="prose">文章 · 连续排版</option></select><small>长短句自动折行；空行表示分阕或分节，分页尽量保持完整。</small></label>}
 {draft.mode==='article'&&draft.layout!=='prose'&&<label className="layout-setting">诗词断句<select aria-label="诗词断句" value={draft.lineBreak||'auto'} onChange={e=>change('lineBreak',e.target.value)}><option value="auto">自动 · 优先保留原有分行</option><option value="original">完全保留原有分行</option><option value="punctuation">按标点分句（保留空行分阕）</option></select><small>在上方文字框编辑换行；空一行即可分阕。自动识别不合适时，请选择「诗词」或「文章」。</small></label>}
 <label className="layout-setting typeface-setting">范字字体<select aria-label="范字字体" value={draft.font||'kai'} onChange={e=>change('font',e.target.value)}>{TYPEFACES.map(f=><option key={f.id} value={f.id}>{f.label} · {f.description}</option>)}</select><small>{draft.mode==='single'&&draft.font&&draft.font!=='kai'?'六个范字使用所选字体；下方笔顺仍以笔顺楷体示意。':'初学建议选笔顺楷体；宋体、黑体适合感受不同的字形结构。'} 选择后点击「生成字帖」更新。</small></label>
 <label className="layout-setting">范字大小<select aria-label="范字大小" value={draft.fontSize} onChange={e=>change('fontSize',e.target.value)}>{FONT_SIZES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select><small>按标准范字比例缩放，字格大小和分页保持不变；笔顺示意不缩放。选择后点击「生成字帖」更新。</small></label>
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
  if(textIntegrityIssue(draft.content)){setError(textIntegrityIssue(draft.content));return;}
  if(knownTextCorrection(draft.content)){setError('正文含已确认的旧版用字差异，请先点击「改用校订正文」。');return;}
  if(!draft.content.trim()){setError('请先输入想练习的文字。');return;}
  if(draft.mode==='single'&&![...draft.content].some(isHan)){setError('逐字练习需要至少一个汉字。');return;}
  if([...draft.content].length>3000){setError('一次最多生成 3000 个字符，请分段制作。');return;}
  setBusy(true);setMessage('正在准备字形和笔顺…');
  try{
   if(!await canUseImportedDraft(draft)){setError('已保存的资料库正文尚未完成校勘，请重新查找文字已对照的版本，或查看正文校勘记录。');return;}
   const input={...draft,font:normalizeTypeface(draft.font),fontSize:normalizeFontSize(draft.fontSize)};
   const [data,fontGlyphs]=await Promise.all([loadCharacters(input.content),loadTypeface(input.font,input.content)]);
   const layoutInfo=input.mode==='article'?articleLayout(input):null;
   const layoutNote=layoutInfo?.poetry?`诗词排版 · ${layoutInfo.breakMode} · 空行分阕。 `:'';
   const pages=paginate(input,data);const svgs=pages.map((p,i)=>pageSvg(input,data,p,i,pages.length,fontGlyphs));
   const fontName=TYPEFACES.find(f=>f.id===input.font).label;
   const shapeMissing=Object.keys(data).filter(c=>!data[c]&&!fontGlyphs[c]);
   const strokeMissing=input.mode==='single'?Object.keys(data).filter(c=>!data[c]):[];
   const fontMissing=input.font==='kai'?[]:Object.keys(data).filter(c=>!fontGlyphs[c]);
   setResult({input,svgs});setPage(0);
   const notes=[layoutNote+`${fontName} · 已生成 ${pages.length} 页。`];
   if(fontMissing.length)notes.push(`「${fontMissing.slice(0,10).join('、')}」等 ${fontMissing.length} 个字不在所选字体中，改用笔顺字形或系统字体。`);
   if(shapeMissing.length)notes.push(`「${shapeMissing.slice(0,10).join('、')}」等 ${shapeMissing.length} 个字暂无矢量字形，已使用系统字体。`);
   if(strokeMissing.length)notes.push(`${strokeMissing.length} 个字暂无笔顺，已在纸上标注。`);
   setMessage(notes.join(' '));
  }catch(e){setError(e.message?.startsWith('字体加载失败')?e.message:'生成失败，请稍后重试。');console.error(e)}finally{setBusy(false)}
 }
 useEffect(()=>{if(!initialized.current){initialized.current=true;generate()}},[]);
 const dirty=result&&JSON.stringify(draft)!==JSON.stringify(result.input);
 async function save(){if(!result)return;setPdfBusy(true);setMessage('正在制作 PDF…');try{await downloadPdf(result.svgs,result.input.title,n=>setMessage(`正在制作 PDF：${n} / ${result.svgs.length} 页`));setMessage('PDF 已生成，请查看浏览器下载列表。')}catch(e){console.error(e);setMessage('PDF 下载失败。可使用「打印」并选择「另存为 PDF」。')}finally{setPdfBusy(false)}}
 return <><header><a className="brand" href="./">一字一练</a><span className="brand-tag">用喜欢的文字，遇见更好的自己</span><span className="motto"><a href="library/collation.html" target="_blank" rel="noreferrer">正文校勘记录 ↗</a></span></header>
 <section className="intro"><h1>把喜欢的文字，写成自己的字。</h1><p>粘贴文字，生成属于你的练字帖。</p></section>
 <main><Settings {...{draft,setDraft,busy,generate}}/><section className="preview"><div className="preview-toolbar"><div><h2>字帖预览</h2><span>A4 · 纵向</span></div><div className="export-actions"><button onClick={()=>window.print()} disabled={!result||busy||pdfBusy||dirty}>打印</button><span></span><button onClick={save} disabled={!result||busy||pdfBusy||dirty}>{pdfBusy?'制作中…':'保存 PDF'}</button></div></div>
 <div className="status" role="status" aria-live="polite">{error || (busy?message:dirty?'内容或设置已修改，点击「生成字帖」更新预览。':message)}</div>
 <div className="paper-wrap">{result?<div className="paper" dangerouslySetInnerHTML={{__html:result.svgs[page]}}/>:<div className="empty">输入文字后，你的字帖会出现在这里。</div>}</div>
 {result&&<nav className="pagination" aria-label="预览分页"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>← 上一页</button><label>第 <select aria-label="跳转页码" value={page} onChange={e=>setPage(+e.target.value)}>{result.svgs.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select> / {result.svgs.length} 页</label><button disabled={page===result.svgs.length-1} onClick={()=>setPage(p=>p+1)}>下一页 →</button></nav>}
 <p className="privacy">练习正文在本机排版；使用 AI 帮找时，仅查找线索发送给 DeepSeek。</p></section></main>
 <footer>打印建议：A4 纸张 · 纵向 · 100% 比例 · 关闭浏览器页眉页脚 <span>笔顺数据：<a href="https://hanziwriter.org" target="_blank" rel="noreferrer">Hanzi Writer</a> / Make Me a Hanzi</span></footer>
 <div className="print-pages">{result?.svgs.map((s,i)=><div key={i} className="print-page" dangerouslySetInnerHTML={{__html:s}}/>)}</div></>
}
createRoot(document.getElementById('root')).render(<App/>);
