import sys, tempfile, unittest, uuid, sqlite3
from pathlib import Path
sys.path.insert(0,str(Path('server').resolve()))
from community import submit,connect
class CommunityTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.state=Path(self.tmp.name)
 def tearDown(self):self.tmp.cleanup()
 def test_counts_idempotency_and_private_feedback(self):
  event={'id':str(uuid.uuid4()),'event':'search'}
  submit(self.state,'event',event,'192.0.2.1');submit(self.state,'event',event,'192.0.2.1')
  feedback={'id':str(uuid.uuid4()),'category':'request','message':'希望收录古诗'}
  submit(self.state,'feedback',feedback,'192.0.2.1');submit(self.state,'feedback',feedback,'192.0.2.1')
  with connect(self.state) as db:
   self.assertEqual(db.execute('SELECT count FROM metrics').fetchone()[0],1)
   self.assertEqual(db.execute('SELECT COUNT(*) FROM feedback').fetchone()[0],1)
   self.assertNotIn('192.0.2.1',''.join(db.iterdump()))
 def test_reject_content_in_analytics(self):
  with self.assertRaises(ValueError):submit(self.state,'event',{'id':str(uuid.uuid4()),'event':'search','query':'私人正文'},'test')
 def test_rate_and_retention(self):
  for _ in range(10):submit(self.state,'feedback',{'id':str(uuid.uuid4()),'category':'suggestion','message':'测试建议'},'test',100000)
  with self.assertRaises(OverflowError):submit(self.state,'feedback',{'id':str(uuid.uuid4()),'category':'suggestion','message':'测试建议'},'test',100000)
  submit(self.state,'event',{'id':str(uuid.uuid4()),'event':'page_view'},'test',100000+181*86400)
  with connect(self.state) as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM feedback').fetchone()[0],0)
