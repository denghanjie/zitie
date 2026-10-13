#!/usr/bin/env node
/** Rebuild the server-only corpus from pinned, byte-verified offline snapshots.
 * --check never uses the network. --fetch refreshes the SAME pinned snapshots.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import * as OpenCC from 'opencc-js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'server/data/chinese-poetry');
const PIN='b8594f81a89752241442f2ce267d6f66f96704ee';
const flags=new Set(process.argv.slice(2));
if([...flags].some(x=>!['--check','--fetch'].includes(x)) || (flags.has('--check')&&flags.has('--fetch'))) throw Error('Usage: node scripts/build-corpus.mjs [--check | --fetch]');
const sha=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const upstream=JSON.parse(fs.readFileSync(path.join(dir,'upstream-manifest.json'),'utf8'));
if(upstream.revisionId!==PIN)throw Error('Unexpected upstream revision');
const simplified=OpenCC.Converter({from:'t',to:'cn'});
const traditional=OpenCC.Converter({from:'cn',to:'t'});
const normalize=(s)=>s.normalize('NFKC').replace(/[\p{P}\p{Z}\p{S}\p{C}]/gu,'').toLowerCase();
const key=(s)=>normalize(simplified(s));
const json=(value)=>JSON.stringify(value)+'\n';
const verifyRaw=(raw,source)=>{
 if(raw.length!==source.bytes || sha(raw)!==source.sha256)throw Error(`Source bytes changed: ${source.path}`);
 const blob=crypto.createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex');
 if(blob!==source.gitBlob)throw Error(`Git blob mismatch: ${source.path}`);
};
if(flags.has('--fetch')){
 for(const source of upstream.files){
  const response=await fetch(`https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/${PIN}/${encodeURI(source.path)}`,{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Cannot fetch ${source.path}: ${response.status}`);
  const raw=Buffer.from(await response.arrayBuffer());verifyRaw(raw,source);
  fs.writeFileSync(path.join(dir,source.path==='LICENSE'?source.file:`sources/${source.file}`),source.path==='LICENSE'?raw:zlib.gzipSync(raw,{level:9,mtime:0}).toString('base64')+'\n');
 }
}
const inputs=['public/library/works.json','public/library/textbooks.json','data/library/editorial.json','public/library/collation.json'];
const inputBytes=inputs.map(p=>fs.readFileSync(path.join(root,p)));
const [library,textbooks,editorial,collation]=inputBytes.map(x=>JSON.parse(x));
const statuses=new Map(collation.entries.map(x=>[x.key,x.status]));
const identities=new Map(),fragments=new Map(),shortBodies=new Map(),protectedIdentities=new Set(),protectedTexts=new Set();
function add(map,k,id){if(!k)return;if(!map.has(k))map.set(k,new Set());map.get(k).add(id);}
function register(w,id){
 const title=key(w.title||''),author=key(w.author||'');
 const variants=s=>[...new Set([normalize(s),normalize(simplified(s)),normalize(traditional(s))])];
 for(const t of variants(w.title||''))for(const a of variants(w.author||''))if(t&&a)protectedIdentities.add(`${t}\0${a}`);
 for(const text of variants(w.text||''))if(text.length>=4)protectedTexts.add(text);
 if(title&&author)add(identities,`${title}\0${author}`,id);
 const body=key(w.text||'');
 // Match shared excerpts and alternate titles as well as exact texts. This
 // conservative boundary intentionally suppresses some related variant poems.
 if(body.length>=4&&body.length<12)add(shortBodies,body,id);
 if(body.length>=12)for(let i=0;i<=body.length-12;i++)add(fragments,body.slice(i,i+12),id);
}
for(const w of library.works)register(w,`poetry:${w.id}`);
for(const b of textbooks.books)for(const w of b.entries)register(w,`textbook:${w.title}`);
for(const e of editorial.edits||[])for(const stage of ['Before','After'])register({title:e[`title${stage}`],author:e[`author${stage}`],text:e[`${stage.toLowerCase()}Text`]},e.key);
const outputs=new Map(),shards=[],excluded=[],skipped=[];let count=0,sourceRecords=0;
for(const source of upstream.files){
 const raw=source.path==='LICENSE'?fs.readFileSync(path.join(dir,source.file)):zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(dir,'sources',source.file),'utf8').trim(),'base64'));
 verifyRaw(raw,source);if(source.path==='LICENSE')continue;
 if(!/^全唐诗\/poet\.tang\.\d+\.json$/.test(source.path)&&source.path!=='御定全唐詩/json/733.json')throw Error('Unexpected corpus source path');
 const records=JSON.parse(raw),rows=[];if(!Array.isArray(records))throw Error('Expected source array');
 const edition=source.path.startsWith('御定')?'御定全唐詩（chinese-poetry 公开整理本）':'全唐诗（chinese-poetry 公开整理本）';
 for(const [index,r] of records.entries()){
  sourceRecords++;
  // This additional volume is included only to make this precisely identified
  // edition available, not to silently duplicate the main corpus.
  if(source.path.startsWith('御定')&&index!==20)continue;
  if(typeof r.title!=='string'||typeof r.author!=='string'||!Array.isArray(r.paragraphs)||!r.paragraphs.every(p=>typeof p==='string'))throw Error(`Invalid source record ${source.path}:${index+1}`);
  const text=r.paragraphs.join('\n');
  if(!r.title.trim()||!r.author.trim()||key(text).length<4||text.length>16000){skipped.push({sourcePath:source.path,sourceIndex:index+1,reason:'unsupported_length_or_identity'});continue;}
  const matches=new Set(identities.get(`${key(r.title)}\0${key(r.author)}`)||[]);
  const body=key(text);
  for(let i=0;i<=body.length-12;i++)for(const id of fragments.get(body.slice(i,i+12))||[])matches.add(id);
  for(const [short,ids] of shortBodies)if(body.includes(short))for(const id of ids)matches.add(id);
  if(body.length>=4&&body.length<12)for(const [fragment,ids] of fragments)if(fragment.includes(body))for(const id of ids)matches.add(id);
  if(matches.size){excluded.push({sourcePath:source.path,sourceIndex:index+1,title:r.title,author:r.author,existingKeys:[...matches].sort(),statuses:[...new Set([...matches].map(k=>statuses.get(k)||'unlisted'))].sort(),reason:'existing_library_identity_or_shared_excerpt'});continue;}
  const titleKeys=[normalize(r.title),normalize(simplified(r.title)),normalize(traditional(r.title))];
  const authorKeys=[normalize(r.author),normalize(simplified(r.author)),normalize(traditional(r.author))];
  const textKeys=[normalize(text),normalize(simplified(text)),normalize(traditional(text))];
  rows.push({title:r.title,author:r.author,text,sourceIndex:index+1,contentHash:sha(Buffer.from(text)),keys:[titleKeys,authorKeys,textKeys].map(v=>[...new Set(v)])});
 }
 const filename=source.file.replace('.json.gz.b64','.index.json.gz.b64');
 const payload=Buffer.from(json({sourcePath:source.path,edition,records:rows}));
 const encoded=zlib.gzipSync(payload,{level:9,mtime:0}).toString('base64')+'\n';
 outputs.set(`shards/${filename}`,encoded);
 shards.push({file:filename,sourcePath:source.path,records:rows.length,sha256:sha(payload),bytes:payload.length});
 count+=rows.length;
}
const exclusionBytes=json({policy:'Exclude all existing-library overlaps regardless of collation status, including pre-editorial texts, normalized title + author, any shared 12-character excerpt, complete short texts of at least 4 characters, and short candidate excerpts of longer library texts. No existing record is re-enabled by this corpus.',records:excluded,skipped});
outputs.set('excluded.json',exclusionBytes);
const protectedBytes=Buffer.from(json({identities:[...protectedIdentities].sort(),texts:[...protectedTexts].sort()}));
outputs.set('protected.index.json.gz.b64',zlib.gzipSync(protectedBytes,{level:9,mtime:0}).toString('base64')+'\n');
const manifest={schemaVersion:1,provider:'local-corpus',repository:upstream.repository,revisionId:PIN,acquiredAt:upstream.acquiredAt,license:'MIT',licenseFile:'LICENSE.txt',normalization:'OpenCC-js 1.4.2 t→cn / cn→t; NFKC; remove punctuation, symbols, separators, controls; lowercase. Raw display text unchanged.',sourceRecords,indexedRecords:count,excludedRecords:excluded.length,skippedRecords:skipped.length,overlapInputs:inputs.map((p,i)=>({path:p,sha256:sha(inputBytes[i])})),exclusionSha256:sha(Buffer.from(exclusionBytes)),protectedIndex:{file:'protected.index.json.gz.b64',sha256:sha(protectedBytes),bytes:protectedBytes.length},shards};
outputs.set('manifest.json',JSON.stringify(manifest,null,2)+'\n');
for(const [name,content] of outputs){
 const target=path.join(dir,name);
 if(flags.has('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content)throw Error(`Corpus is stale: ${name}. Run node scripts/build-corpus.mjs.`);}
 else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
}
const extras=fs.readdirSync(path.join(dir,'shards')).filter(name=>!outputs.has(`shards/${name}`));
if(extras.length)throw Error(`Unexpected generated shards: ${extras.join(', ')}`);
console.log(`${flags.has('--check')?'Verified':'Built'} ${count.toLocaleString('en-US')} local-corpus records; excluded ${excluded.length} library overlaps; ${shards.length} pinned source shards.`);
