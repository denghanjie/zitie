"""Pinned, server-only Chinese poetry retrieval with an on-disk SQLite index.

Only ancient paragraph text is imported. A result is a fetched edition, never a
collation approval. Existing curated-library overlaps are excluded at build time.
No query, source fetch, or model request leaves the machine from this module.
"""
from __future__ import annotations

import base64
from collections import OrderedDict
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import tempfile
import threading
import unicodedata
import urllib.parse
import zlib

REVISION = 'b8594f81a89752241442f2ce267d6f66f96704ee'
DATA_DIR = Path(__file__).resolve().parent / 'data' / 'chinese-poetry'
INDEX_VERSION = 'bigram-v2'
MAX_LIMIT = 50
MAX_QUERY = 160
MAX_SHARD_BYTES = 5_000_000


def normalized(text):
    """Matches generated keys; conversion itself happens offline with OpenCC."""
    return ''.join(c for c in unicodedata.normalize('NFKC', text)
                   if unicodedata.category(c)[0] not in 'PZSC').lower()


def _tokens(keys):
    # Unigrams are indexed for title and author. Text uses bigrams to avoid a
    # huge single-character posting list while still supporting two-character
    # Chinese names/titles. Identical traditional/simplified tokens are deduped.
    tokens = set()
    for kind, variants in enumerate(keys):
        for key in variants:
            if kind < 2:
                tokens.update('u' + c for c in key)
            tokens.update('g' + key[i:i + 2] for i in range(len(key) - 1))
    for title in keys[0]:
        for author in keys[1]:
            for key in (title + author, author + title):
                tokens.update('g' + key[i:i + 2] for i in range(len(key) - 1))
    return ' '.join(sorted(tokens))


def _query_parts(query):
    # Spaces/book-title punctuation separate terms; punctuation in a quoted
    # line is also ignored so the exact normalized line can match.
    parts = [normalized(p) for p in re.split(r'[\s《》〈〉「」『』【】]+', query.strip())]
    return [p for p in parts if p]


def _match_expression(parts):
    grams = set()
    for part in parts:
        grams.update(['u' + part] if len(part) == 1 else
                     ['g' + part[i:i + 2] for i in range(len(part) - 1)])
    return ' AND '.join('"' + value.replace('"', '""') + '"' for value in sorted(grams))


class Corpus:
    def __init__(self, data_dir=DATA_DIR, cache_dir=None):
        self.data_dir = Path(data_dir)
        # Private cache directory; source corpus remains read-only at runtime.
        self.cache_dir = Path(cache_dir) if cache_dir else (Path(os.environ['ZITIE_STATE_DIR']) / 'corpus-index' if os.environ.get('ZITIE_STATE_DIR') else Path(tempfile.gettempdir()) / f'zitie-corpus-{os.getuid()}')
        self._lock = threading.Lock()
        self._path = None
        self._manifest = None
        self._protected = None
        self._digest_cache = OrderedDict()
        self._digest_lock = threading.Lock()

    def _metadata(self):
        raw = (self.data_dir / 'manifest.json').read_bytes()
        manifest = json.loads(raw)
        if manifest.get('schemaVersion') != 1 or manifest.get('revisionId') != REVISION or manifest.get('provider') != 'local-corpus':
            raise ValueError('Unsupported local corpus manifest')
        if not isinstance(manifest.get('indexedRecords'), int) or not manifest.get('shards'):
            raise ValueError('Invalid local corpus manifest')
        return manifest, hashlib.sha256(INDEX_VERSION.encode() + raw).hexdigest()

    def status(self):
        try:
            manifest, _ = self._metadata()
            available = all((self.data_dir / 'shards' / s['file']).is_file() for s in manifest['shards'])
            return {'available': available, 'provider': 'local-corpus',
                    'records': manifest['indexedRecords'], 'revisionId': REVISION,
                    'acquiredAt': manifest['acquiredAt'], 'excludedRecords': manifest['excludedRecords']}
        except (OSError, ValueError, KeyError, TypeError):
            return {'available': False, 'provider': 'local-corpus', 'records': 0}

    def conflicts_with_library(self, source):
        """Conservatively reject external candidates that overlap curated works."""
        if not isinstance(source, dict):
            return True
        if self._protected is None:
            with self._lock:
                if self._protected is None:
                    manifest, _ = self._metadata()
                    entry = manifest['protectedIndex']
                    raw = zlib.decompress(base64.b64decode((self.data_dir / entry['file']).read_bytes().strip(), validate=True), 16 + zlib.MAX_WBITS)
                    if len(raw) != entry['bytes'] or hashlib.sha256(raw).hexdigest() != entry['sha256']:
                        raise ValueError('Protected library index content hash mismatch')
                    data = json.loads(raw)
                    fragments = {text[i:i+12] for text in data['texts'] for i in range(len(text)-11)}
                    self._protected = (set(data['identities']), fragments, {text for text in data['texts'] if 4 <= len(text) < 12}, data['texts'])
        identities, fragments, short_texts, protected_texts = self._protected
        title = normalized(str(source.get('title') or ''))
        author = normalized(str(source.get('authorHint') or source.get('author') or ''))
        if title + '\0' + author in identities:
            return True
        text = normalized(str(source.get('text') or ''))
        if len(text) < 4:
            return True
        return ((4 <= len(text) < 12 and any(text in body for body in protected_texts))
                or any(short in text for short in short_texts)
                or any(text[i:i+12] in fragments for i in range(len(text)-11)))

    def _records(self, manifest, only_path=None):
        for shard in manifest['shards']:
            if only_path is not None and shard['sourcePath'] != only_path:
                continue
            if Path(shard['file']).name != shard['file']:
                raise ValueError('Invalid corpus shard path')
            encoded = (self.data_dir / 'shards' / shard['file']).read_bytes()
            compressed = base64.b64decode(encoded.strip(), validate=True)
            inflater = zlib.decompressobj(16 + zlib.MAX_WBITS)
            raw = inflater.decompress(compressed, MAX_SHARD_BYTES + 1)
            if len(raw) > MAX_SHARD_BYTES or inflater.unconsumed_tail or not inflater.eof:
                raise ValueError('Corpus shard exceeds size limit')
            if len(raw) != shard['bytes'] or hashlib.sha256(raw).hexdigest() != shard['sha256']:
                raise ValueError('Corpus shard content hash mismatch')
            data = json.loads(raw)
            source_path = data['sourcePath']
            if source_path != shard['sourcePath'] or not (re.fullmatch(r'全唐诗/poet\.tang\.\d+\.json', source_path) or source_path == '御定全唐詩/json/733.json'):
                raise ValueError('Invalid corpus source path')
            if len(data['records']) != shard['records']:
                raise ValueError('Corpus shard record count mismatch')
            for record in data['records']:
                if len(normalized(record['text'])) < 4 or not 4 <= len(record['text']) <= 16000:
                    raise ValueError('Unsupported corpus text length')
                if hashlib.sha256(record['text'].encode()).hexdigest() != record['contentHash']:
                    raise ValueError('Corpus record content hash mismatch')
                if type(record['sourceIndex']) is not int or record['sourceIndex'] < 1:
                    raise ValueError('Invalid corpus source index')
                yield {**record, 'sourcePath': source_path, 'edition': data['edition']}

    @staticmethod
    def _record_digest(record):
        return hashlib.sha256(json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).digest()

    def _authoritative_digests(self, source_path):
        with self._digest_lock:
            if source_path in self._digest_cache:
                self._digest_cache.move_to_end(source_path)
                return self._digest_cache[source_path]
        digests = {r['sourceIndex']: self._record_digest(r)
                   for r in self._records(self._manifest, only_path=source_path)}
        with self._digest_lock:
            self._digest_cache[source_path] = digests
            self._digest_cache.move_to_end(source_path)
            while len(self._digest_cache) > 8:
                self._digest_cache.popitem(last=False)
        return digests

    def _ensure_index(self):
        if self._path is not None:
            return self._path
        with self._lock:
            if self._path is not None:
                return self._path
            manifest, fingerprint = self._metadata()
            self.cache_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
            info = self.cache_dir.lstat()
            if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
                raise ValueError('Corpus cache directory must be private and owned by the service user')
            target = self.cache_dir / f'{fingerprint}.sqlite'
            if target.is_symlink():
                raise ValueError('Corpus cache must not be a symlink')
            if target.exists():
                info = target.lstat()
                if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
                    raise ValueError('Corpus cache must be a private regular file')
                try:
                    with sqlite3.connect(target.as_uri() + '?mode=ro', uri=True) as existing:
                        valid = existing.execute('SELECT fingerprint FROM metadata').fetchone() == (fingerprint,)
                        valid = valid and existing.execute('SELECT COUNT(*) FROM records').fetchone()[0] == manifest['indexedRecords']
                    if valid:
                        self._manifest, self._path = manifest, target
                        return target
                except sqlite3.DatabaseError:
                    pass
            fd, temporary = tempfile.mkstemp(prefix='build-', suffix='.sqlite', dir=self.cache_dir)
            os.close(fd)
            try:
                connection = sqlite3.connect(temporary)
                try:
                    connection.execute('PRAGMA journal_mode=OFF')
                    connection.execute('PRAGMA synchronous=OFF')
                    connection.execute('CREATE TABLE metadata (fingerprint TEXT NOT NULL)')
                    connection.execute('INSERT INTO metadata VALUES (?)', (fingerprint,))
                    connection.execute('CREATE TABLE records (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)')
                    connection.execute("CREATE VIRTUAL TABLE search_index USING fts5(tokens, content='', tokenize='unicode61 remove_diacritics 0')")
                    count = 0
                    for count, record in enumerate(self._records(manifest), 1):
                        connection.execute('INSERT INTO records VALUES (?, ?)', (count, json.dumps(record, ensure_ascii=False, separators=(',', ':'))))
                        connection.execute('INSERT INTO search_index(rowid, tokens) VALUES (?, ?)', (count, _tokens(record['keys'])))
                    if count != manifest['indexedRecords']:
                        raise ValueError('Corpus total record count mismatch')
                    connection.execute("INSERT INTO search_index(search_index) VALUES ('optimize')")
                    connection.commit()
                finally:
                    connection.close()
                os.replace(temporary, target)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
            self._manifest, self._path = manifest, target
            return target

    def search(self, query, limit=20):
        if not isinstance(query, str) or not query.strip():
            return []
        if len(query) > MAX_QUERY:
            raise ValueError('Local corpus query too long')
        if type(limit) is not int:
            raise ValueError('Local corpus limit must be an integer')
        limit = max(0, min(limit, MAX_LIMIT))
        parts = _query_parts(query)
        if not parts or not limit:
            return []
        path = self._ensure_index()
        with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as connection:
            # Index intersection narrows candidates before exact contiguous
            # matching; a fixed cap bounds pathological common-character queries.
            rows = connection.execute('SELECT records.payload FROM search_index JOIN records ON records.id=search_index.rowid WHERE search_index MATCH ? ORDER BY rank LIMIT 2000', (_match_expression(parts),)).fetchall()
        results = []
        authoritative = {}
        quote_key = normalized(query)
        for (payload,) in rows:
            record = json.loads(payload)
            title, author, body = record['keys']
            combined = [a + t for a in author for t in title] + [t + a for t in title for a in author]
            if not all(any(part in key for group in (title, author, body, combined) for key in group) for part in parts):
                continue
            score = sum(110 if part in combined else 100 if part in title else 80 if part in author else 55 if any(part in t for t in title) else 40 if any(part in a for a in author) else 20 for part in parts)
            matched = len(quote_key) >= 4 and any(quote_key in text for text in body)
            # Keep editions separate; deterministic tie-break makes exact title
            # and author hits precede incidental line matches.
            candidate = {'provider': 'local-corpus', 'verification': 'source_fetched',
                         'title': record['title'], 'authorHint': record['author'], 'text': record['text'],
                         'url': 'https://github.com/chinese-poetry/chinese-poetry/blob/' + REVISION + '/' + urllib.parse.quote(record['sourcePath'], safe='/'),
                         'revisionId': REVISION, 'contentHash': record['contentHash'],
                         'sourcePath': record['sourcePath'], 'sourceIndex': record['sourceIndex'],
                         'edition': record['edition'], 'acquiredAt': self._manifest['acquiredAt'],
                         'quote': query if matched else '', 'matchedQuote': True if matched else None,
                         'quoteCheck': 'matched' if matched else 'not_provided'}
            results.append((score, candidate, record))
        results.sort(key=lambda x: (-x[0], x[1]['title'], x[1]['authorHint'], x[1]['sourcePath'], x[1]['sourceIndex']))
        verified = []
        allowed_paths = {entry['sourcePath'] for entry in self._manifest['shards']}
        for _, candidate, record in results[:limit]:
            source_path = record.get('sourcePath')
            if source_path not in allowed_paths:
                raise ValueError('Corpus cache has an unknown source path')
            if source_path not in authoritative:
                authoritative[source_path] = self._authoritative_digests(source_path)
            if self._record_digest(record) != authoritative[source_path].get(record.get('sourceIndex')):
                raise ValueError('Corpus cache record differs from verified packaged source')
            verified.append(candidate)
        return verified


_DEFAULT = Corpus()


def search(query, limit=20):
    return _DEFAULT.search(query, limit)


def status():
    return _DEFAULT.status()


def conflicts_with_library(source):
    return _DEFAULT.conflicts_with_library(source)
