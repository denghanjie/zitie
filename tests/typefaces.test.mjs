import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TYPEFACES,normalizeTypeface,loadTypeface} from '../src/typefaces.js';
import {paginate,pageSvg} from '../src/worksheet.js';
const manifest=JSON.parse(fs.readFileSync('public/fonts/manifest.json','utf8'));
for(const id of ['serif','sans']){
 const m=manifest.fonts[id];let count=0;
 for(const block of m.blocks){
  const data=JSON.parse(fs.readFileSync(`public/fonts/${id}/${block}.json`,'utf8'));
  for(const [c,g] of Object.entries(data)){
   assert.equal(Math.floor(c.codePointAt(0)/128),block);assert(g.d.startsWith('M'));assert(g.u>0&&g.a>=0);assert(!/[<>"']/.test(g.d));count++;
  }
 }
 assert.equal(count,m.glyphCount);assert(count>10000);assert(fs.readFileSync(`public/fonts/${id}-OFL.txt`,'utf8').includes('SIL OPEN FONT LICENSE'));
}
assert.equal(normalizeTypeface(undefined),'kai');assert.equal(normalizeTypeface('unknown'),'kai');assert.equal(TYPEFACES.length,3);
let calls=0,failNext=false;
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{
 calls++;
 if(failNext){failNext=false;return {ok:false,status:503};}
 const data=JSON.parse(fs.readFileSync(`public${url}`,'utf8'));
 return {ok:true,status:200,json:async()=>data};
};
try{
 assert.deepEqual(await loadTypeface('kai','永'),{});assert.equal(calls,0);
 const serif=await loadTypeface('serif','永，春眠不觉晓。');const before=calls;
 await loadTypeface('serif','永永');assert.equal(calls,before,'reuse cached block');
 const sans=await loadTypeface('sans','永，春眠不觉晓。');
 assert(serif['永']);assert(sans['永']);assert.notEqual(serif['永'].d,sans['永'].d);
 const unsupported=await loadTypeface('sans',String.fromCodePoint(0x10ffff));assert.deepEqual(unsupported,{});
 failNext=true;await assert.rejects(loadTypeface('serif','龟'),/字体加载失败/);
 assert((await loadTypeface('serif','龟'))['龟'],'failed requests can retry');
 const input={content:'永',title:'字体测试',mode:'single',grid:'tian',font:'serif'};
 const strokes={'永':JSON.parse(fs.readFileSync('public/data/永.json','utf8'))};
 const pages=paginate(input,strokes);
 const sample={永:{d:'M11 12L13 14Z',a:1000,u:1000}};
 const svg=pageSvg(input,strokes,pages[0],0,1,sample);
 assert.equal(svg.split('M11 12L13 14Z').length-1,6,'all six model characters use selected typeface');
 assert(svg.includes(strokes['永'].strokes[0]),'stroke order still uses original strokes');
 assert(svg.includes('范字：宋体 · 笔顺示意：笔顺楷体'));
 assert(!svg.includes('<style')&&!svg.includes('@font-face')&&!svg.includes('href='),'font outlines need no network at print/export time');
 const prose={...input,mode:'article',layout:'prose',content:'永，永。'};
 const page=paginate(prose,strokes)[0];
 assert.equal(pageSvg(prose,strokes,page,0,1,sample).split('M11 12L13 14Z').length-1,2);
 assert(pageSvg({...input,font:'kai'},strokes,pages[0],0,1).includes(strokes['永'].strokes[0]));
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: licensed font coverage, vector rendering, six model cells, independent stroke order, fallback, lazy caching and retry.');
