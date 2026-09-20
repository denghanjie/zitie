"""Build a reproducible full-corpus comparison ledger; never label matching text error-free."""
import json, re, hashlib, difflib, collections, sys, html
from pathlib import Path
root=Path(__file__).resolve().parent.parent
read=lambda p:json.loads((root/p).read_text())
poems=read('public/library/works.json')['works']
texts=read('data/textbooks/texts.json')
entries={**{f"poetry:{w['id']}":w for w in poems},**{f'textbook:{t}':dict(w,title=t) for t,w in texts.items()}}
evidence=read('data/library/collation-evidence.json')['rows']
assert len(entries)==len(evidence)
assert set(entries)=={r['key'] for r in evidence}
def han(s):return ''.join(re.findall(r'[\u3400-\u9fff\U00020000-\U0003134f]',s))
def normal_author(s):
 s=re.sub(r'^.*?：|^（[^）]*）','',s).strip()
 return {'不详':'佚名','无名氏':'佚名','朱庆余':'朱庆馀','魏徵':'魏征','西晋·李密':'李密','司马光 撰':'司马光','刘向 撰':'刘向','《战国策》':'刘向','乐府诗集':'佚名','《乐府诗集》':'佚名','诗经·国风·周南':'佚名','诗经·国风·秦风':'佚名','诗经·国风·邶风':'佚名','诗经·国风·郑风':'佚名','礼记':'佚名','孟子及其弟子':'孟子','列御寇':'列子','（宋）杜小山':'杜耒','杜小山':'杜耒','高菊卿':'高翥'}.get(s,s)
# Explicit edition choices; preserve textbook readings instead of forcing another edition.
retained={
 '闻王昌龄左迁龙标遥有此寄':'随君／随风为版本差异，保留教材选篇采用的“随君”。',
 '陈太丘与友期行':'答曰／答为整理本差异，保留当前选篇。',
 '木兰诗':'唯／惟为用字差异，保留当前选篇。',
 '登飞来峰':'自缘／只缘为异文，保留当前选篇“自缘”。',
 '过松源晨炊漆公店（其五）':'政／正、围子／圈子、放出／放过为版本差异，保留当前选篇。',
 '答谢中书书':'五色交晖／五色交辉为用字差异，保留当前选篇“交晖”。',
 '龟虽寿':'腾蛇／螣蛇为通假用字差异，保留当前选篇。',
 '愚公移山':'夸蛾氏／夸娥氏为版本用字差异，保留当前选篇“夸蛾氏”。',
 '周亚夫军细柳':'乎／呼为古书用字差异，保留当前选篇。',
 '庄子与惠子游于濠梁之上':'鲦／鯈为鱼名用字差异，作者与篇章出处保留当前选篇。',
 '卜算子·咏梅':'着／著为版本用字差异，保留当前选篇。',
 '岳阳楼记':'隐曜／隐耀为版本用字差异，保留当前选篇。',
 '曹刿论战':'遍／徧为通假用字差异，保留当前选篇。',
 '十五从军征':'饴／贻为版本用字差异，保留当前选篇。',
 '唐雎不辱使命':'尔／耳为版本用字差异，保留当前选篇。',
 '题临安邸':'薰／熏为用字差异，保留当前选篇。',
 '山行':'生处／深处为异文，保留当前选篇“生处”。',
 '稚子弄冰':'钲／铮为用字差异，保留当前选篇“钲”。',
}
scope_decisions=read('data/library/scope-decisions.json')
edits={e['key']:e for e in read('data/library/editorial.json')['edits']}
quality={};report=[]
for old in evidence:
 key=old['key'];w=entries[key];text=w['text'];h=hashlib.sha256(text.encode()).hexdigest()
 assert h==old['textHash'],f'Stale comparison: {key}'
 status='pending';reason='尚无适合本篇的另一对照文本；仅有原始来源，未完成校勘。'
 ref=old.get('reference');body=text;target=old.get('referenceText');ops=[];punct=[]
 if target:
  a,b=han(body),han(target)
  for tag,i,j,k,l in difflib.SequenceMatcher(None,a,b,autojunk=False).get_opcodes():
   if tag!='equal':ops.append({'type':tag,'offset':i,'before':a[i:j],'after':b[k:l],'context':a[max(0,i-10):min(len(a),j+10)]})
  # Preserve all non-whitespace codepoints in the second comparison, including punctuation.
  raw_a=re.sub(r'\s','',body);raw_b=re.sub(r'\s','',target)
  for tag,i,j,k,l in difflib.SequenceMatcher(None,raw_a,raw_b,autojunk=False).get_opcodes():
   if tag!='equal':punct.append({'type':tag,'offset':i,'before':raw_a[i:j],'after':raw_b[k:l]})
  if a==b and normal_author(w['author'])==normal_author(ref['author']):
   status='compared';reason='正文汉字与所列对照文本逐字一致；标点差异另列。这不是所有版本均无误的认证。'
  elif key.startswith('textbook:') and w['title'] in retained:
   status='retained';reason=retained[w['title']]+' 此条记录版本选择，不宣称逐字等同每个教材印次。'
  elif a in b and normal_author(w['author'])==normal_author(ref['author']):
   status='retained' if key in scope_decisions else 'excerpt';reason=scope_decisions.get(key,'当前正文逐字匹配对照本的一段；篇章完整性、序文或组诗节选范围仍待复核。')
  else:reason='已逐字列出差异，尚未裁定其属于异文、讹误或节选范围差异。'
  if normal_author(w['author'])!=normal_author(ref['author']) and status!='retained':
   reason='作者署名与候选对照本不同，需要核实作品归属，不能据相似正文自动改署名。'
 if re.search('[□�〓]',text):status='blocked';reason='原文含缺字占位符，暂停填入；不能由 AI 猜补。'
 elif len(normal_author(w['author']))==1:status='blocked';reason='作者姓名疑似截断，暂停填入，等待可靠署名依据。'
 elif re.search(r'[a-zA-Z]|\([^)]*一作|（[^）]*一作',text):status='blocked';reason='正文仍疑似含现代夹注，暂停填入等待核对。'
 meta={'status':status,'reason':reason,'textHash':h,'reference':ref}
 quality[key]=meta
 report.append({'key':key,'title':w['title'],'author':w['author'],'codepoints':len(text),'hanCharacters':len(han(text)),**meta,'sourceUrl':w['sourceUrl'],'characterDifferences':ops,'allCodepointDifferences':punct,'editorialChange':edits.get(key)})
counts=dict(collections.Counter(r['status'] for r in report))
summary={'revision':'2026-09-20-1','entries':len(report),'poetryEntries':len(poems),'textbookEntries':len(texts),'codepoints':sum(len(w['text']) for w in entries.values()),'counts':counts,'complete':False,'editorialEntries':len(edits),'method':'全量字符比对；移除空白后另比对标点及全部码点。对照本是公开整理本，可能与原资料有共同来源，不能冒充独立权威校勘。教材仅对应当前选用正文，未逐本核实所有印次。','remaining':'待补可靠底本、裁定异文及核实署名。未完成的记录不标为已校勘。'}
outputs={'data/library/quality.json':json.dumps(quality,ensure_ascii=False,separators=(',',':'))+'\n','public/library/collation.json':json.dumps({'summary':summary,'entries':report},ensure_ascii=False,separators=(',',':'))+'\n'}
for file,content in outputs.items():
 path=root/file
 if '--check' in sys.argv:assert path.read_text()==content,f'Outdated {file}'
 else:path.write_text(content)
print(json.dumps(summary,ensure_ascii=False))
