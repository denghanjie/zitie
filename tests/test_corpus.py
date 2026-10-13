import base64
from concurrent.futures import ThreadPoolExecutor
import gzip
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import corpus

ROOT = Path(__file__).resolve().parents[1]


class CorpusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.store = corpus.Corpus()
        cls.store.search('不第后赋菊', 1)

    def test_coverage_and_provenance(self):
        status = self.store.status()
        self.assertTrue(status['available'])
        self.assertGreater(status['records'], 56000)
        self.assertEqual(status['revisionId'], corpus.REVISION)
        self.assertRegex(status['acquiredAt'], r'^2026-10-12T00:00:00Z$')
        rows = self.store.search('满城尽带黄金甲')
        row = next(r for r in rows if r['sourcePath'] == '御定全唐詩/json/733.json')
        self.assertEqual(row['sourceIndex'], 21)
        self.assertEqual(row['title'], '不第後賦菊')
        self.assertEqual(row['authorHint'], '黃巢')
        self.assertEqual(row['text'], '待到秋來九月八，我花開後百花殺。\n沖天香陣透長安，滿城盡帶黃金甲。')
        self.assertEqual(row['contentHash'], hashlib.sha256(row['text'].encode()).hexdigest())
        self.assertEqual(row['verification'], 'source_fetched')
        self.assertEqual(row['provider'], 'local-corpus')
        self.assertEqual(row['quoteCheck'], 'matched')
        self.assertIn('/blob/' + corpus.REVISION + '/', row['url'])
        self.assertTrue(row['url'].endswith('/json/733.json'))
        self.assertNotIn('notes', row)
        self.assertNotIn('tags', row)
        # The other edition has 衝 instead of 沖. Neither text is silently merged.
        other = next(r for r in rows if r['sourcePath'].startswith('全唐诗/'))
        self.assertIn('衝天香陣', other['text'])
        self.assertNotEqual(other['contentHash'], row['contentHash'])
        self.assertNotEqual(other['edition'], row['edition'])

    def test_query_forms_and_limits(self):
        for query in ['不第后赋菊', '不第後賦菊', '黄巢《不第后赋菊》',
                      '不第后赋菊 黄巢', '《不第后赋菊》', '滿城盡帶黃金甲',
                      '黄巢不第后赋菊', '不第後賦菊黃巢']:
            with self.subTest(query=query):
                self.assertTrue(any(r['sourcePath'] == '御定全唐詩/json/733.json' for r in self.store.search(query)))
        self.assertTrue(self.store.search('黃巢'))
        self.assertTrue(self.store.search('黄巢'))
        self.assertEqual(self.store.search('桂管童謠'), [])
        self.assertTrue(self.store.conflicts_with_library({'title': '短句', 'text': '一二三。'}))
        self.assertLessEqual(len(self.store.search('李白', 10000)), 50)
        self.assertEqual(self.store.search('李白', 0), [])
        self.assertEqual(self.store.search('我是一串不存在的随机测试题名甲乙丙丁'), [])
        for query in ['', '  ', '《》', None]:
            self.assertEqual(self.store.search(query), [])
        with self.assertRaises(ValueError):
            self.store.search('字' * 161)
        with self.assertRaises(ValueError):
            self.store.search('李白', '5')

    def test_curated_overlaps_are_never_reenabled(self):
        self.assertEqual(self.store.search('李白《静夜思》'), [])
        self.assertFalse(any(r['title'] == '登高' and r['authorHint'] == '杜甫' for r in self.store.search('杜甫《登高》')))
        self.assertTrue(self.store.conflicts_with_library({'title': '失調名 (高安更過幾重山)', 'authorHint': '蘇軾', 'text': '高安更過幾重山。'}))
        self.assertTrue(self.store.conflicts_with_library({'title': '另一整理本', 'text': '床前明月光，疑是地上霜。'}))
        self.assertTrue(self.store.conflicts_with_library({'title': '另一整理本', 'text': '風急天高猿嘯哀，渚清沙白鳥飛回。'}))
        self.assertFalse(self.store.conflicts_with_library(self.store.search('不第后赋菊')[0]))
        audit = json.loads((corpus.DATA_DIR / 'excluded.json').read_text())
        self.assertTrue(any('pending' in r['statuses'] for r in audit['records']))
        self.assertFalse(any('unlisted' in r['statuses'] for r in audit['records']))
        for key in [r['key'] for r in json.loads((ROOT / 'public/library/collation.json').read_text())['entries'] if r['status'] in ('blocked', 'pending')][:25]:
            if key.startswith('poetry:'):
                work = next(w for w in json.loads((ROOT / 'public/library/works.json').read_text())['works'] if w['id'] == key[7:])
                self.assertTrue(self.store.conflicts_with_library(work), key)

    def test_no_network_and_concurrent_reads(self):
        with patch('urllib.request.urlopen', side_effect=AssertionError('Network must not be used')):
            with ThreadPoolExecutor(max_workers=4) as pool:
                rows = list(pool.map(self.store.search, ['不第后赋菊', '黄巢', '滿城盡帶黃金甲', '黄巢《不第后赋菊》']))
        self.assertTrue(all(rows))
        self.assertLessEqual(len(self.store._digest_cache), 8)

    def test_source_snapshots_are_pinned_and_hash_verified(self):
        manifest = json.loads((corpus.DATA_DIR / 'upstream-manifest.json').read_text())
        self.assertEqual(manifest['revisionId'], corpus.REVISION)
        selected = next(f for f in manifest['files'] if f['path'] == '御定全唐詩/json/733.json')
        raw = gzip.decompress(base64.b64decode((corpus.DATA_DIR / 'sources' / selected['file']).read_bytes()))
        self.assertEqual(hashlib.sha256(raw).hexdigest(), selected['sha256'])
        self.assertEqual(hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest(), selected['gitBlob'])
        self.assertEqual(json.loads(raw)[20]['paragraphs'][-1], '沖天香陣透長安，滿城盡帶黃金甲。')


class CorpusIntegrityTests(unittest.TestCase):
    def fixture(self, root):
        """Small authentic shard, so integrity tests do not rebuild all 57k rows."""
        data = Path(root) / 'data'
        (data / 'shards').mkdir(parents=True)
        manifest = json.loads((corpus.DATA_DIR / 'manifest.json').read_text())
        selected = next(s for s in manifest['shards'] if s['sourcePath'] == '御定全唐詩/json/733.json')
        (data / 'shards' / selected['file']).write_bytes((corpus.DATA_DIR / 'shards' / selected['file']).read_bytes())
        manifest['shards'] = [selected]
        manifest['indexedRecords'] = selected['records']
        (data / 'manifest.json').write_text(json.dumps(manifest))
        return corpus.Corpus(data, Path(root) / 'cache')

    def test_cache_tamper_with_self_consistent_hash_fails_closed(self):
        with tempfile.TemporaryDirectory() as root:
            store = self.fixture(root)
            store.search('不第后赋菊')
            with sqlite3.connect(store._path) as connection:
                rowid, payload = connection.execute('SELECT id,payload FROM records LIMIT 1').fetchone()
                row = json.loads(payload)
                row['text'] += '偽'
                row['contentHash'] = hashlib.sha256(row['text'].encode()).hexdigest()
                connection.execute('UPDATE records SET payload=? WHERE id=?', (json.dumps(row, ensure_ascii=False), rowid))
            # A fresh instance must reject cached corruption even when row count
            # and fingerprint are correct and the text's own hash agrees.
            reused = corpus.Corpus(store.data_dir, store.cache_dir)
            with self.assertRaisesRegex(ValueError, 'verified packaged source'):
                reused.search('不第后赋菊')

    def test_stale_cache_is_rebuilt_and_missing_data_unavailable(self):
        with tempfile.TemporaryDirectory() as root:
            store = self.fixture(root)
            store.search('不第后赋菊')
            with sqlite3.connect(store._path) as connection:
                connection.execute("UPDATE metadata SET fingerprint='stale'")
            self.assertTrue(corpus.Corpus(store.data_dir, store.cache_dir).search('不第后赋菊'))
            selected = next((store.data_dir / 'shards').iterdir())
            selected.unlink()
            self.assertFalse(corpus.Corpus(store.data_dir).status()['available'])

    def test_corrupted_shard_and_unsafe_cache_fail_closed(self):
        with tempfile.TemporaryDirectory() as root:
            store = self.fixture(root)
            selected = next((store.data_dir / 'shards').iterdir())
            selected.write_text(base64.b64encode(gzip.compress(b'{}')).decode())
            with self.assertRaisesRegex(ValueError, 'content hash'):
                store.search('不第后赋菊')
        with tempfile.TemporaryDirectory() as root:
            store = self.fixture(root)
            store.cache_dir.mkdir(mode=0o755)
            with self.assertRaisesRegex(ValueError, 'private'):
                store.search('不第后赋菊')


if __name__ == '__main__':
    unittest.main()
