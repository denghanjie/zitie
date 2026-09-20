import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {correctWork} from '../src/text-corrections.js';
import * as OpenCC from 'opencc-js';
const source=process.argv[2];
if(!source)throw Error('Usage: node scripts/build-library.mjs <downloaded-source-directory>');
const convert=OpenCC.Converter({from:'t',to:'cn'});
const revision=fs.readFileSync(path.join(source,'revision.txt'),'utf8').trim();
const sources=[['ci-extras.json','宋词','宋词补充（李清照、苏轼）','poem'],['tang.json','全唐诗/唐诗三百首.json','唐诗三百首','poem'],['ci.json','宋词/宋词三百首.json','宋词三百首','poem'],['guwen.json','蒙学/guwenguanzhi.json','古文观止','prose'],['qianjia.json','蒙学/qianjiashi.json','千家诗','poem'],['chuci.json','楚辞/chuci.json','楚辞','poem']];
const works=[];
function paragraphsText(parts){
 if(!Array.isArray(parts))throw Error('Expected paragraph array');
 return parts.map(p=>typeof p==='string'?p:paragraphsText(p.paragraphs)).join(parts.some(p=>typeof p!=='string')?'\n\n':'\n');
}
function leaves(obj){if(Array.isArray(obj))return obj.flatMap(leaves);if(obj&&Array.isArray(obj.paragraphs))return [obj];if(obj&&Array.isArray(obj.content)&&typeof obj.content[0]==='string')return [obj];if(obj?.content)return leaves(obj.content);return [];}
for(const[file,upstream,collection,layout]of sources){
 const records=leaves(JSON.parse(fs.readFileSync(path.join(source,file),'utf8')));
 records.forEach((r,index)=>{
  const title=convert(r.title||r.rhythmic||r.chapter||'');const author=convert((r.author||'佚名').trim());
  const text=convert(paragraphsText(r.paragraphs||r.content)).trim();
  if(!title||!text)throw Error(`Invalid record ${file}:${index}`);
  if(works.some(w=>w.title===title&&w.author===author&&w.text===text))return;
  const filePath=r._source||upstream;const sourceIndex=r._index??index;
  const id=crypto.createHash('sha256').update(`${filePath}:${sourceIndex}`).digest('hex').slice(0,16);
  works.push({id,title,author,text,collection,layout,sourceUrl:`https://github.com/chinese-poetry/chinese-poetry/blob/${revision}/${encodeURI(filePath)}`,sourceIndex:sourceIndex+1});
 });
}
fs.writeFileSync('public/library/works.json',JSON.stringify({version:revision,notice:'正文来自公开整理本，经 OpenCC 转为简体。可能存在异文或录入错误，请结合原始来源核对；分行沿用数据源，未自动补充分阕。',works:works.map(correctWork)}));
fs.copyFileSync(path.join(source,'LICENSE'),'public/library/LICENSE.txt');
fs.writeFileSync('public/library/SOURCES.md',`# 诗词全文来源\n\n数据源：[chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，MIT 许可。\n\n固定版本：\`${revision}\`。共 ${works.length} 条记录。同名、不同首句或不同整理本保留为独立候选，不合并文本。\n\n${sources.map(([,p,c])=>`- ${c}：[原始文件](https://github.com/chinese-poetry/chinese-poetry/blob/${revision}/${encodeURI(p)})`).join('\n')}\n\n繁体文本使用 OpenCC 转为简体，未用模型生成或补全文本；标点、异文与段落以此来源为准。已核对的现代用字差异按 src/text-corrections.js 校订，正文保留原始来源并另列校订依据；校订不会全局替换通假字，也不代表全库逐字审核完成。部分长文超过字帖的 3000 字限制，需要选择段落填入。\n`);
console.log(`Built ${works.length} source-linked records.`);
