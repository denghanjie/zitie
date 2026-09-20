"""Private feedback and aggregate counters. No practice text or search queries in metrics."""
import hashlib, hmac, json, os, sqlite3, time, uuid
from pathlib import Path
EVENTS={'page_view','search','search_empty','worksheet_generated','pdf_download','print_request'}
CATEGORIES={'request','text_error','layout','suggestion'}
def connect(state):
 state.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(state/'community.sqlite',timeout=5)
 db.executescript('''CREATE TABLE IF NOT EXISTS metrics(day TEXT,event TEXT,count INTEGER,PRIMARY KEY(day,event));
 CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY,stamp INTEGER,category TEXT,message TEXT);
 CREATE TABLE IF NOT EXISTS seen(id TEXT PRIMARY KEY,stamp INTEGER);
 CREATE TABLE IF NOT EXISTS limits(bucket TEXT,kind TEXT,hour INTEGER,count INTEGER,PRIMARY KEY(bucket,kind,hour));
 CREATE TABLE IF NOT EXISTS secret(value BLOB);''')
 db.execute('INSERT INTO secret SELECT ? WHERE NOT EXISTS(SELECT 1 FROM secret)',(os.urandom(32),));db.commit()
 return db

def submit(state,kind,data,ip,now=None):
 now=int(time.time() if now is None else now)
 if not isinstance(data,dict):raise ValueError('请求格式不正确。')
 try:identifier=str(uuid.UUID(data.get('id','')))
 except (ValueError,TypeError,AttributeError):raise ValueError('请求编号不正确。')
 if kind=='event':
  if set(data)!={'id','event'} or data.get('event') not in EVENTS:raise ValueError('统计事件不正确。')
 else:
  if set(data)!={'id','category','message'} or data.get('category') not in CATEGORIES:raise ValueError('反馈类型不正确。')
  if not isinstance(data.get('message'),str) or not 2<=len(data['message'].strip())<=1500:raise ValueError('请填写 2 至 1500 字的反馈。')
 with connect(state) as db:
  db.execute('BEGIN IMMEDIATE')
  db.execute('DELETE FROM feedback WHERE stamp < ?',(now-180*86400,))
  db.execute('DELETE FROM seen WHERE stamp < ?',(now-7*86400,))
  db.execute('DELETE FROM limits WHERE hour < ?',(now//3600-24,))
  db.execute('DELETE FROM metrics WHERE day < ?',(time.strftime('%Y-%m-%d',time.gmtime(now-90*86400)),))
  if db.execute('SELECT 1 FROM seen WHERE id=?',(identifier,)).fetchone() or db.execute('SELECT 1 FROM feedback WHERE id=?',(identifier,)).fetchone():return identifier
  secret=db.execute('SELECT value FROM secret').fetchone()[0]
  bucket=hmac.new(secret,f'{now//86400}:{ip}'.encode(),hashlib.sha256).hexdigest()
  n=db.execute('SELECT count FROM limits WHERE bucket=? AND kind=? AND hour=?',(bucket,kind,now//3600)).fetchone()
  if n and n[0]>=(300 if kind=='event' else 10):raise OverflowError('提交较频繁，请稍后再试。')
  db.execute('INSERT INTO limits VALUES(?,?,?,1) ON CONFLICT(bucket,kind,hour) DO UPDATE SET count=count+1',(bucket,kind,now//3600))
  db.execute('INSERT INTO seen VALUES(?,?)',(identifier,now))
  if kind=='event':db.execute('INSERT INTO metrics VALUES(?,?,1) ON CONFLICT(day,event) DO UPDATE SET count=count+1',(time.strftime('%Y-%m-%d',time.gmtime(now)),data['event']))
  else:db.execute('INSERT INTO feedback VALUES(?,?,?,?)',(identifier,now,data['category'],data['message'].strip()))
 return identifier

if __name__=='__main__':
 state=Path(os.environ.get('ZITIE_STATE_DIR','/var/lib/zitie'))
 with connect(state) as db:
  totals=dict(db.execute('SELECT event,SUM(count) FROM metrics WHERE day>=? GROUP BY event',(time.strftime('%Y-%m-%d',time.gmtime(time.time()-30*86400)),)))
  print(json.dumps({'period':'最近30天（UTC）','counts':totals,'searchEmptyRate':round(totals.get('search_empty',0)/totals['search'],4) if totals.get('search') else None,'feedback':[{'id':r[0],'time':r[1],'category':r[2],'message':r[3]} for r in db.execute('SELECT id,stamp,category,message FROM feedback ORDER BY stamp DESC LIMIT 50')]},ensure_ascii=False,indent=2))
