import importlib.util,json,os,tempfile,threading,unittest,urllib.request,urllib.error
from pathlib import Path
from unittest.mock import patch
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
  with patch.object(ai,'interpret',return_value=[{'title':'水调歌头','author':'苏轼','quote':''}]) as model:
   code,data=self.post({'query':'但愿人长久'});self.assertEqual(code,200);self.assertNotIn('text',data);model.assert_called_once()
 def test_invalid(self):
  for q in ['',1,None,'a'*121]:self.assertEqual(self.post({'query':q})[0],400)
  self.assertEqual(self.post({'query':'李白'},'https://example.org')[0],403)
 def test_disabled_and_failure(self):
  ai.KEY='';self.assertEqual(self.post({'query':'李白'})[0],503);ai.KEY='test'
  with patch.object(ai,'interpret',side_effect=RuntimeError('do-not-leak-secret')):
   code,data=self.post({'query':'李白'});self.assertEqual(code,502);self.assertNotIn('do-not-leak',str(data))
 def test_rate_limit(self):
  for _ in range(10):self.assertTrue(ai.reserve('a'))
  self.assertFalse(ai.reserve('a'));self.assertTrue(ai.reserve('b'))
  with patch.dict(os.environ,{'AI_DAILY_LIMIT':'11'}):self.assertFalse(ai.reserve('c'))
 def test_model_validation(self):
  self.assertEqual(ai.clean_suggestions({'suggestions':[{'title':'诗','body':'invented','url':'evil'}]}),[{'title':'诗','author':'','quote':''}])
  with self.assertRaises(ValueError):ai.clean_suggestions({'text':'invented body'})
if __name__=='__main__':unittest.main()
