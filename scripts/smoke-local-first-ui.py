"""Optional local UI smoke test with fake provider responses; never contacts upstream APIs.

Requires an existing Python Playwright and Chromium installation. Run the Vite
server at port 4175 first. This test has not completed in the delivery sandbox:
Chromium could not create its internal sockets under the OS permission profile.
"""
import asyncio, json, hashlib, os, shutil
from pathlib import Path
from urllib.parse import quote, urlsplit
from playwright.async_api import async_playwright
BASE_URL=os.environ.get('ZITIE_SMOKE_URL','http://127.0.0.1:4175/')
parsed_url=urlsplit(BASE_URL)
if parsed_url.scheme!='http' or parsed_url.hostname not in ('127.0.0.1','localhost') or parsed_url.username or parsed_url.password:
 raise ValueError('ZITIE_SMOKE_URL must point to your own local HTTP test server')
OUTPUT=Path(os.environ.get('ZITIE_SMOKE_OUTPUT','/tmp/zitie-local-first-smoke'))
OUTPUT.mkdir(parents=True,exist_ok=True)
PIN='b8594f81a89752241442f2ce267d6f66f96704ee'

def fixture(title='秋夜試讀',index=1):
 text='江上清風起，山間明月來。\n閒看雲水外，獨坐夜窗前。'
 path='御定全唐詩/json/733.json'
 return dict(provider='local-corpus',verification='source_fetched',revisionId=PIN,title=title,authorHint='待核作者',text=text,url=f'https://github.com/chinese-poetry/chinese-poetry/blob/{PIN}/{quote(path)}',contentHash=hashlib.sha256(text.encode()).hexdigest(),sourcePath=path,sourceIndex=index,edition='御定全唐詩（chinese-poetry 公开整理本）',acquiredAt='2026-10-12T00:00:00Z')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox'])
  context=await browser.new_context(viewport={'width':1440,'height':1100})
  page=await context.new_page();errors=[];calls=[]
  page.on('pageerror',lambda err:errors.append(str(err)))
  async def route(r):
   path=r.request.url.split('/api/poetry/')[-1];calls.append(path)
   if path=='status':data={'available':True,'baiduAvailable':True,'localAvailable':True}
   elif path=='search':
    await asyncio.sleep(.12);data={'status':'completed','message':'本地已找到，联网尚在查找。','sources':[fixture()]}
   elif path=='hints':
    await asyncio.sleep(2)
    data={'suggestions':[],'localSources':[fixture('联网晚到候选',2)],'online':{'status':'completed','message':'联网结束。','providers':[{'provider':'deepseek','status':'unavailable','message':'模拟识别超时，使用原始查询。'},{'provider':'baidu','status':'completed','message':'模拟取得网页线索。'},{'provider':'wikisource','status':'disabled','message':'模拟可选来源未启用。'}],'sources':[],'discoveries':[{'provider':'baidu','verification':'discovery_only','title':'只能打开的网页线索','url':'https://example.org/poem','snippet':'摘要，不是正文。'}]}}
   else:data={'online':{'status':'completed','sources':[],'discoveries':[],'message':'empty'}}
   try:await r.fulfill(status=200,content_type='application/json',body=json.dumps(data,ensure_ascii=False))
   except Exception:pass
  await page.route('**/api/poetry/**',route)
  await page.goto(BASE_URL)
  await page.get_by_role('button',name='查找诗文 ↗',exact=True).click()
  await page.locator('#poem-query').fill('試讀')
  await page.get_by_role('button',name='✧ AI 帮我找',exact=True).click()
  await page.get_by_role('button',name='秋夜試讀',exact=False).click()
  assert await page.get_by_role('button',name='停止等待',exact=True).is_visible()
  selected='測試未經簡化。\n溪水流。'
  await page.locator('#online-text').fill(selected)
  await page.get_by_role('checkbox',name='我已打开来源',exact=False).check()
  await page.screenshot(path=str(OUTPUT/'before-remote.png'),full_page=True)
  await page.get_by_role('button',name='联网晚到候选',exact=False).wait_for()
  assert await page.locator('#online-text').input_value()==selected
  assert await page.get_by_role('checkbox',name='我已打开来源',exact=False).is_checked()
  assert await page.get_by_role('link',name='只能打开的网页线索 ↗',exact=True).is_visible()
  assert await page.get_by_text('DeepSeek 识别：暂不可用',exact=False).is_visible()
  assert await page.get_by_text('百度搜索：已完成',exact=False).is_visible()
  assert await page.get_by_text('维基文库：未启用',exact=False).is_visible()
  assert await page.get_by_role('button',name='只能打开的网页线索',exact=False).count()==0
  await page.get_by_role('button',name='用已核对的正文替换练习内容',exact=True).click()
  assert await page.locator('#content').input_value()==selected
  await page.wait_for_timeout(100)
  draft=await page.evaluate("JSON.parse(localStorage.getItem('yizi-draft'))")
  assert draft['source']['provenance']['source']['text']==fixture()['text']
  assert draft['source']['provenance']['version']==2
  assert await page.evaluate("async()=>{const m=await import('/src/online-search.js');return m.isReviewedOnlineDraft(JSON.parse(localStorage.getItem('yizi-draft')))}")
  await page.reload()
  assert await page.locator('#content').input_value()==selected
  edited=selected+'\n用戶摘選。'
  await page.locator('#content').fill(edited)
  await page.wait_for_timeout(100)
  assert await page.evaluate("async()=>{const m=await import('/src/online-search.js');return m.isReviewedOnlineDraft(JSON.parse(localStorage.getItem('yizi-draft')))}")
  await page.get_by_role('button',name='保存字帖',exact=True).click()
  await page.get_by_role('button',name='我的字帖',exact=True).click()
  await page.get_by_role('button',name='打开 / 编辑',exact=True).first.click()
  assert await page.locator('#content').input_value()==edited
  assert await page.evaluate("async()=>{const m=await import('/src/online-search.js');return m.isReviewedOnlineDraft(JSON.parse(localStorage.getItem('yizi-draft')))}")
  await page.get_by_role('button',name='查找诗文 ↗',exact=True).click()
  await page.locator('#poem-query').fill('第二次試讀')
  await page.get_by_role('button',name='✧ AI 帮我找',exact=True).click()
  await page.get_by_role('button',name='秋夜試讀',exact=False).wait_for()
  await page.get_by_role('button',name='停止等待',exact=True).click()
  await page.wait_for_timeout(2200)
  assert await page.get_by_role('button',name='秋夜試讀',exact=False).is_visible()
  assert await page.get_by_role('button',name='联网晚到候选',exact=False).count()==0
  await page.locator('#poem-query').fill('新的查找')
  assert await page.get_by_role('button',name='秋夜試讀',exact=False).count()==0
  await page.get_by_role('button',name='查找',exact=True).click()
  await page.get_by_role('button',name='秋夜試讀',exact=False).wait_for()
  assert calls.count('hints')==2
  await page.screenshot(path=str(OUTPUT/'after-cancel.png'),full_page=True)
  assert not errors,errors
  print('PASS browser: local-first while AI pending; selected edited review survives remote update; explicit review/apply; raw evidence and draft reload; edited history restore; discovery links cannot apply; cancellation ignores late response; subsequent normal search avoids AI; no browser errors')
  await browser.close()
asyncio.run(main())
