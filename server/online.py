"""Bounded, read-only Wikisource retrieval. Never trusts model URLs or model text.

A fetched source is evidence of what a revision says, not an editorial approval.
The caller must keep online candidates separate from its collated local library.
"""
import hashlib
import json
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser

API = 'https://zh.wikisource.org/w/api.php'
MAX_BYTES = 1_000_000
MAX_TEXT = 16000
TIMEOUT = 6

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Source redirects are not accepted')

# No redirects: even a compromised upstream cannot redirect to a private host.
OPENER = urllib.request.build_opener(NoRedirect)

def api(**params):
    params = {'format': 'json', 'formatversion': 2, **params}
    request = urllib.request.Request(API + '?' + urllib.parse.urlencode(params), headers={
        'User-Agent': 'YiziYilian/1.0 (https://github.com/denghanjie/zitie)',
        'Accept': 'application/json',
    })
    with OPENER.open(request, timeout=TIMEOUT) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('Source response too large')
    data = json.loads(raw)
    if not isinstance(data, dict) or 'error' in data:
        raise ValueError('Source API error')
    return data

class SourceText(HTMLParser):
    """Extract reading paragraphs as plain text, excluding navigation and notes.

    Unsupported layouts fail closed rather than importing a page's menus. The
    resulting paragraphs may still include commentary; UI requires human review.
    """
    OMIT = {'script', 'style', 'table', 'sup', 'noscript', 'nav'}
    CLASSES = {'noprint', 'navbox', 'metadata', 'mw-editsection', 'references',
               'reflist', 'ws-noexport', 'header-container', 'licenseContainer'}
    VOID = {'br', 'hr', 'img', 'meta', 'link', 'input', 'wbr', 'source'}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.parts = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        ignored = bool(self.stack and self.stack[-1][1]) or tag in self.OMIT or bool(set(attrs.get('class', '').split()) & self.CLASSES)
        capture = not ignored and (tag == 'p' or 'poem' in attrs.get('class', '').split() or bool(self.stack and self.stack[-1][2]))
        if tag == 'br' and capture:
            self.parts.append('\n')
        if tag not in self.VOID:
            self.stack.append((tag, ignored, capture))
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, -1, -1):
            if self.stack[i][0] == tag:
                if self.stack[i][2] and tag in {'p', 'div'}:
                    self.parts.append('\n')
                del self.stack[i:]
                break
    def handle_data(self, data):
        if self.stack and self.stack[-1][2]:
            self.parts.append(re.sub(r'\s+', ' ', data))
    def text(self):
        text = '\n'.join(re.sub(r'[^\S\n]+', ' ', line).strip() for line in ''.join(self.parts).splitlines())
        return re.sub(r'\n{3,}', '\n\n', text).strip()

def normalized(text):
    # Deliberately no destructive character substitution or unverified variant mapping.
    return ''.join(c for c in unicodedata.normalize('NFKC', text) if unicodedata.category(c)[0] not in 'PZS').casefold()

def search_hint(hint):
    query = ' '.join(filter(None, [hint.get('title'), hint.get('author')])) or hint.get('quote', '')
    data = api(action='query', generator='search', gsrsearch=query, gsrnamespace=0,
               gsrlimit=2, prop='revisions|pageprops', rvprop='ids', ppprop='disambiguation')
    pages = data.get('query', {}).get('pages', [])
    if not isinstance(pages, list):
        raise ValueError('Invalid source search')
    candidates = []
    for page in pages[:2]:
        if not isinstance(page, dict) or page.get('ns') != 0 or 'disambiguation' in page.get('pageprops', {}):
            continue
        revisions = page.get('revisions', [])
        revision = revisions[0].get('revid') if revisions and isinstance(revisions[0], dict) else None
        if type(revision) is int and revision > 0:
            candidates.append((revision, hint))
    return candidates

def fetch_source(candidate):
    revision, hint = candidate
    parsed = api(action='parse', oldid=revision, prop='text|revid', disableeditsection=1).get('parse', {})
    if parsed.get('revid') != revision or not isinstance(parsed.get('text'), str) or not isinstance(parsed.get('title'), str):
        raise ValueError('Invalid source revision')
    parser = SourceText()
    parser.feed(parsed['text'])
    parser.close()
    text = parser.text()
    if not 4 <= len(text) <= MAX_TEXT:
        raise ValueError('Source text unavailable or too long')
    quote = hint.get('quote', '')
    quote_key = normalized(quote)
    matched = quote_key in normalized(text) if len(quote_key) >= 4 else None
    return {'title': parsed['title'][:240], 'url': 'https://zh.wikisource.org/w/index.php?oldid=' + str(revision),
            'text': text, 'revisionId': revision, 'verification': 'source_fetched',
            'authorHint': hint.get('author', ''), 'quote': quote, 'matchedQuote': matched,
            'quoteCheck': 'not_provided' if matched is None else 'matched' if matched else 'not_found',
            'contentHash': hashlib.sha256(text.encode()).hexdigest()}

def retrieve(suggestions):
    """At most three searches and six source fetches, each bounded to six seconds."""
    candidates, sources, failures = [], [], 0
    with ThreadPoolExecutor(max_workers=3) as pool:
        jobs = [pool.submit(search_hint, hint) for hint in suggestions[:3]]
        for job in jobs:
            try:
                candidates.extend(job.result())
            except Exception:
                failures += 1
        unique = {}
        for candidate in candidates:
            unique.setdefault(candidate[0], candidate)
        jobs = [pool.submit(fetch_source, candidate) for candidate in list(unique.values())[:6]]
        for job in jobs:
            try:
                sources.append(job.result())
            except Exception:
                failures += 1
    status = 'partial' if failures and sources else 'unavailable' if failures else 'completed'
    message = {'partial': '部分在线来源读取失败；已读取的候选仍可查看。',
               'unavailable': '在线来源暂时无法读取，未完成在线核对。',
               'completed': '已查询维基文库；在线候选需核对作品、作者及正文，尚未经本站校勘。' if sources else '维基文库未找到可读取的作品正文，未完成在线核对。'}[status]
    return {'status': status, 'sources': sources, 'message': message}
