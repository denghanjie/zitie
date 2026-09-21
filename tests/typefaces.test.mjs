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
 for(const mode of ['single','article'])for(const font of ['kai','serif','sans']){
  const base={...input,mode,font,content:'永',layout:'prose'};
  const originalPage=paginate(base,strokes)[0];
  const outlines=font==='kai'?{}:sample;
  const normal=pageSvg(base,strokes,originalPage,0,1,outlines);
  assert.equal(pageSvg({...base,fontSize:'invalid'},strokes,originalPage,0,1,outlines),normal);
  for(const [fontSize,scale] of [['small',.8],['large',1.1]]){
   const sized={...base,fontSize};
   assert.deepEqual(paginate(sized,strokes)[0],originalPage,'size must preserve pagination');
   const svg=pageSvg(sized,strokes,originalPage,0,1,outlines);
   assert.equal((svg.match(/data-model-scale=/g)||[]).length,mode==='single'?6:1,'only model characters scale');
   const unwrapped=svg.replace(/<g data-model-scale="[^"]+" transform="translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\) translate\(([^ ]+) ([^)]+)\)">([\s\S]*?)<\/g><\/g>/g,(_,cx,cy,k,nx,ny,inner)=>{
    assert.equal(Number(k),scale);assert.equal(Number(cx),-Number(nx));assert.equal(Number(cy),-Number(ny));return inner+'</g>';
   });
   assert.equal(unwrapped,normal,'grids, headings, stroke diagrams and glyph paths are unchanged');
   const fallback=pageSvg(sized,{},originalPage,0,1,{});
   assert.equal((fallback.match(/data-model-scale=/g)||[]).length,mode==='single'?6:1,'fallback text scales too');
  }
 }
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: licensed font coverage, vector rendering, six model cells, independent stroke order, fallback, lazy caching and retry.');

const {INK_LEVELS,normalizeInk,comparisonSvg}=await import('../src/worksheet.js');
assert.equal(normalizeInk('bad'),'light');
const inkInput={content:'永',title:'试印',mode:'single',grid:'tian',font:'kai',fontSize:'normal'};
const inkData={永:JSON.parse(fs.readFileSync('public/data/永.json','utf8'))};
const inkPages=paginate(inkInput,inkData);
const light=pageSvg(inkInput,inkData,inkPages[0],0,1);
assert(light.includes(INK_LEVELS[0].color));
const hollow=pageSvg({...inkInput,traceStyle:'outline'},inkData,inkPages[0],0,1);
assert.equal((hollow.match(/data-model-outline="true"/g)||[]).length,5,'first model and stroke instructions remain solid');
assert.deepEqual(paginate({...inkInput,ink:'dark',traceStyle:'outline'},inkData),inkPages,'ink does not affect pagination');
assert(comparisonSvg(inkInput,inkData).includes('空心'));

assert(comparisonSvg(inkInput,inkData,{},'size').includes('65%'));
assert(comparisonSvg(inkInput,inkData,{},'size').includes('data-model-scale="0.5"'));
