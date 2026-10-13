import sys
sys.path.insert(0,str(__import__('pathlib').Path('server').resolve()))
import importlib.util,json,os,tempfile,threading,unittest,urllib.request,urllib.error
from pathlib import Path
from unittest.mock import patch, MagicMock
spec=importlib.util.spec_from_file_location('ai','server/ai.py');ai=importlib.util.module_from_spec(spec);spec.loader.exec_module(ai)
class APITest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();ai.STATE=Path(self.tmp.name);ai.KEY='test-not-a-real-key'
  self.http=ai.ThreadingHTTPServer(('127.0.0.1',0),ai.Handler);self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start();self.url='http://127.0.0.1:%d/api/poetry/hints'%self.http.server_port
 def tearDown(self):self.http.shutdown();self.http.server_close();self.tmp.cleanup()
 def post(self,data,origin='https://zitie.denghanjie.vip'):
  req=urllib.request.Request(self.url,data=json.dumps(data).encode(),headers={'Origin':origin,'Content-Type':'application/json'})
  try:
   with urllib.request.urlopen(req) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as e:return e.code,json.load(e)
 def test_success(self):
  with patch.object(ai,'discover',return_value={'status':'completed','sources':[],'providers':[]}) as retrieve, patch.object(ai,'interpret',return_value=[{'title':'水调歌头','author':'苏轼','quote':''}]) as model:
   code,data=self.post({'query':'但愿人长久'});self.assertEqual(code,200);self.assertNotIn('text',data);model.assert_called_once();retrieve.assert_called_once_with('但愿人长久',data['suggestions']);self.assertEqual(data['online']['status'],'completed')
 def test_invalid(self):
  for q in ['',1,None,'a'*121]:self.assertEqual(self.post({'query':q})[0],400)
  self.assertEqual(self.post({'query':'李白'},'https://example.org')[0],403)
 def test_disabled_and_failure(self):
  ai.KEY='';self.assertEqual(self.post({'query':'李白'})[0],503);ai.KEY='test'
  with patch.object(ai.MODEL_GATE,'run',side_effect=RuntimeError('do-not-leak-secret')), patch.object(ai,'discover',return_value={'status':'unavailable','sources':[],'providers':[]}):
   code,data=self.post({'query':'李白'});self.assertEqual(code,200);self.assertNotIn('do-not-leak',str(data));self.assertEqual(data['online']['providers'][0]['status'],'unavailable')
 def test_local_does_not_require_or_call_any_network_provider(self):
  ai.KEY='';self.url=self.url.replace('/hints','/search')
  with patch.object(ai.corpus,'search',return_value=[{'title':'不第後賦菊'}]) as search, patch.object(ai,'interpret') as model, patch.object(ai,'discover') as remote:
   code,data=self.post({'query':'满城尽带黄金甲'})
  self.assertEqual(code,200);self.assertEqual(len(data['sources']),1);model.assert_not_called();remote.assert_not_called();search.assert_called_once()
 def test_discovery_works_without_deepseek(self):
  ai.KEY='';self.url=self.url.replace('/hints','/discover')
  with patch.object(ai,'discover',return_value={'status':'unavailable','sources':[],'providers':[]}) as remote, patch.object(ai,'interpret') as model:
   code,data=self.post({'query':'黄巢'})
  self.assertEqual(code,200);model.assert_not_called();remote.assert_called_once_with('黄巢',[])
 def test_wikisource_disabled_by_default_makes_no_calls(self):
  with patch.dict(os.environ,{'WIKISOURCE_ENABLED':'0'}), patch.object(ai,'retrieve') as retrieve:
   self.assertEqual(ai.wiki_lookup([])['status'],'disabled');retrieve.assert_not_called()
 def test_optional_wiki_cannot_bypass_existing_library(self):
  source={'title':'blocked existing work'}
  with patch.dict(os.environ,{'WIKISOURCE_ENABLED':'1'}), patch.object(ai.WIKI_GATE,'run',return_value={'status':'completed','sources':[source]}), patch.object(ai.corpus,'conflicts_with_library',return_value=True) as guard:
   result=ai.wiki_lookup([])
  self.assertEqual(result['sources'],[]);guard.assert_called_once_with(source)
 def test_rate_limit(self):
  for _ in range(10):self.assertTrue(ai.reserve('a'))
  self.assertFalse(ai.reserve('a'));self.assertTrue(ai.reserve('b'))
  with patch.dict(os.environ,{'AI_DAILY_LIMIT':'11'}):self.assertFalse(ai.reserve('c'))
 def test_model_validation(self):
  self.assertEqual(ai.clean_suggestions({'suggestions':[{'title':'诗','body':'invented','url':'evil'}]}),[{'title':'诗','author':'','quote':''}])
  with self.assertRaises(ValueError):ai.clean_suggestions({'text':'invented body'})
class ProviderTest(unittest.TestCase):
 def test_deepseek_request_and_untrusted_fields(self):
  response=MagicMock();response.__enter__.return_value=response
  response.read.return_value=json.dumps({'choices':[{'message':{'content':json.dumps({'suggestions':[{'title':'春晓','author':'孟浩然','quote':'春眠不觉晓','url':'http://127.0.0.1/secret','text':'模型编造正文','verified':True}]})}}]}).encode()
  with patch.object(ai.MODEL_OPENER,'open',return_value=response) as request:
   hints=ai.interpret('春晓')
  req=request.call_args.args[0];body=json.loads(req.data)
  self.assertEqual(req.full_url,'https://api.deepseek.com/chat/completions')
  self.assertEqual(body['messages'][1]['content'],'春晓')
  self.assertEqual(body['model'],ai.MODEL)
  self.assertEqual(request.call_args.kwargs['timeout'],12)
  self.assertEqual(set(hints[0]),{'title','author','quote'})
 def test_malformed_provider_response_rejected(self):
  for payload in [{}, {'choices':[]}, {'choices':[{'message':{'content':'not json'}}]}, {'choices':[{'message':{'content':'{"text":"invented"}'}}]}]:
   response=MagicMock();response.__enter__.return_value=response;response.read.return_value=json.dumps(payload).encode()
   with patch.object(ai.MODEL_OPENER,'open',return_value=response),self.assertRaises((ValueError,KeyError,IndexError)):ai.interpret('春晓')

if __name__=='__main__':unittest.main()

class CommunityAPITest(unittest.TestCase):
 post=APITest.post
 tearDown=APITest.tearDown
 def setUp(self):
  APITest.setUp(self);self.url=self.url.replace('/api/poetry/hints','/api/feedback')
 def test_feedback_and_private_read(self):
  import uuid
  status,data=self.post({'id':str(uuid.uuid4()),'category':'request','message':'请收录作品'})
  self.assertEqual(status,200);self.assertTrue(data['ok'])
  with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(self.url)
  self.assertEqual(e.exception.code,404)
 def test_event_fields(self):
  import uuid
  self.url=self.url.replace('/api/feedback','/api/events')
  self.assertEqual(self.post({'id':str(uuid.uuid4()),'event':'page_view'})[0],200)
  self.assertEqual(self.post({'id':str(uuid.uuid4()),'event':'search','query':'不应采集'})[0],400)
