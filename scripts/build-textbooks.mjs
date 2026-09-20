import fs from 'node:fs';
import crypto from 'node:crypto';
const catalog=JSON.parse(fs.readFileSync('data/textbooks/catalog.json','utf8'));
const texts=JSON.parse(fs.readFileSync('data/textbooks/texts.json','utf8'));
const books=catalog.map(book=>({...book,
 coverageNote:'收录课内古诗文与古诗词诵读；暂不含语文园地中的日积月累。',
 entries:book.entries.map(entry=>{
  const work=texts[entry.title];
  if(!work?.text?.trim()||!work.author||!work.sourceUrl?.startsWith('https://'))throw Error(`Missing source/text: ${book.id} ${entry.title}`);
  if(/\[object Object\]|\uFFFD|https?:\/\//u.test(work.text))throw Error(`Invalid body: ${entry.title}`);
  return {...entry,...work,id:crypto.createHash('sha256').update(`${book.id}:${entry.title}`).digest('hex').slice(0,16)};
 })}));
const data={checkedAt:'2026-09-20',editions:[
 {id:'pep63',label:'人教版统编教材 · 六三学制',note:'小学六年、初中三年。按官方平台公开册次整理，各册修订状态见下方。'},
 {id:'sh54',label:'上海现行统编教材 · 五四学制',note:'小学五年、初中四年。收录上海现行统编体系，不含历史沪教版。各册修订状态见下方。'}
],books};
const result=JSON.stringify(data);
const output='public/library/textbooks.json';
if(process.argv.includes('--check')){
 if(fs.readFileSync(output,'utf8')!==result)throw Error('Textbook bundle is stale. Run pnpm build:textbooks');
}else fs.writeFileSync(output,result);
console.log(`Textbooks: ${books.length} books, ${books.reduce((s,b)=>s+b.entries.length,0)} placements, ${Object.keys(texts).length} unique works.`);
