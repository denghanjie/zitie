"""Optional official Baidu web discovery, never a verified-text provider.

API contract checked against the official documentation on 2026-10-12:
https://ai.baidu.com/ai-doc/AppBuilder/pmaxd1hvy
The curl example uses X-Appbuilder-Authorization with an AppBuilder API key.
Only the fixed API is contacted. Returned page URLs are never fetched here.
"""
import html
import ipaddress
import json
import os
import re
import unicodedata
import urllib.parse
import urllib.request

from provider_runtime import ProviderBusy, ProviderCoolingDown, ProviderGate, ProviderTimeout

API = 'https://qianfan.baidubce.com/v2/ai_search/web_search'
TIMEOUT = 6
MAX_BYTES = 256_000
MAX_QUERY = 120
MAX_RESULTS = 5
MAX_REFERENCES = 50
MAX_TITLE = 240
MAX_SNIPPET = 300
MAX_URL = 2048
GATE = ProviderGate(capacity=2, timeout=8, cooldown=30)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Provider redirects are not accepted')


# Never forward the bearer credential to a redirect destination or an
# environment-supplied proxy. TLS certificate verification stays enabled.
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)


def _key():
    value = os.environ.get('BAIDU_API_KEY', '')
    if not value.strip():
        return ''
    # Header safety, not an assertion that the provider will accept the key.
    if not re.fullmatch(r'[!-~]{1,4096}', value):
        raise ValueError('Invalid provider configuration')
    return value


def status():
    """Expose configuration state, never credentials or a claimed live check."""
    try:
        configured = bool(_key())
    except ValueError:
        return {'provider': 'baidu', 'configured': True, 'status': 'unavailable',
                'message': '百度搜索配置不可用，请检查服务器端设置。'}
    if not configured:
        return {'provider': 'baidu', 'configured': False, 'status': 'not_configured',
                'message': '百度搜索尚未配置，未执行百度网页检索。'}
    if GATE.cooling_down():
        return {'provider': 'baidu', 'configured': True, 'status': 'unavailable',
                'message': '百度搜索暂时不可用，正在短暂冷却。'}
    return {'provider': 'baidu', 'configured': True, 'status': 'ready',
            'message': '已配置百度搜索；实际可用性以查询结果为准。'}


def safe_url(value):
    """Accept unambiguous HTTPS URLs with public DNS-name syntax only.

    This is link validation, not a DNS lookup or a claim about the destination's
    content. No IP literal, local/reserved name, credentials or non-HTTPS port
    is permitted. Returning a link never authorizes fetching that link.
    """
    if not isinstance(value, str) or not 1 <= len(value) <= MAX_URL:
        return None
    if any(c.isspace() or unicodedata.category(c).startswith('C') for c in value) or '\\' in value:
        return None
    if re.search(r'%(?![0-9a-fA-F]{2})|%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)', value, re.I):
        return None
    try:
        parts = urllib.parse.urlsplit(value)
        host = parts.hostname or ''
        if (parts.scheme != 'https' or not parts.netloc or parts.username is not None
                or parts.password is not None or parts.port not in (None, 443)):
            return None
        # Reject alternate authority spellings (including an empty port),
        # Unicode host confusion, trailing dots and bracketed literals.
        if parts.netloc.lower() not in (host, host + ':443'):
            return None
        if not host.isascii() or len(host) > 253 or '.' not in host:
            return None
        try:
            ipaddress.ip_address(host)
            return None
        except ValueError:
            pass
        labels = host.split('.')
        if any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label) for label in labels):
            return None
        if not re.fullmatch(r'(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})', labels[-1]):
            return None
        reserved = ('localhost', 'local', 'localdomain', 'internal', 'intranet',
                    'lan', 'home', 'arpa', 'test', 'invalid', 'example', 'onion')
        if any(host == suffix or host.endswith('.' + suffix) for suffix in reserved):
            return None
        return urllib.parse.urlunsplit(('https', host, parts.path, parts.query, parts.fragment))
    except (ValueError, UnicodeError):
        return None


def _plain(value, limit):
    if not isinstance(value, str):
        return ''
    value = html.unescape(re.sub(r'<[^>]*>', ' ', value))
    value = ''.join(c for c in value if not unicodedata.category(c).startswith('C') or c in '\n\r\t')
    return ' '.join(value.split())[:limit]


def _discoveries(payload, key):
    # Baidu documents code/message only on errors. Do not leak these fields.
    if (not isinstance(payload, dict) or 'code' in payload or 'error' in payload
            or not isinstance(payload.get('references'), list)):
        raise ValueError('Invalid provider response')
    out, seen = [], set()
    for item in payload['references'][:MAX_REFERENCES]:
        if not isinstance(item, dict) or item.get('type') != 'web':
            continue
        # Inspect before truncating: a credential crossing a snippet boundary
        # must not leak even a prefix to the frontend.
        fields = [item.get(name) for name in ('url', 'title', 'content')]
        if any(isinstance(value, str) and key in urllib.parse.unquote(html.unescape(value)) for value in fields):
            continue
        url = safe_url(item.get('url'))
        title = _plain(item.get('title'), MAX_TITLE)
        snippet = _plain(item.get('content'), MAX_SNIPPET)
        if not url or not title or url in seen:
            continue
        # Fail closed if a misbehaving upstream echoes the credential.
        if any(key in value or key in urllib.parse.unquote(value) for value in (url, title, snippet)):
            continue
        seen.add(url)
        out.append({'provider': 'baidu', 'verification': 'discovery_only',
                    'title': title, 'url': url, 'snippet': snippet})
        if len(out) >= MAX_RESULTS:
            break
    return out


def _request(query, key):
    body = json.dumps({
        'messages': [{'role': 'user', 'content': query}],
        'search_source': 'baidu_search_v2',
        'resource_type_filter': [{'type': 'web', 'top_k': MAX_RESULTS}],
    }, ensure_ascii=False).encode('utf-8')
    request = urllib.request.Request(API, data=body, method='POST', headers={
        'X-Appbuilder-Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'YiziYilian/1.0 (https://github.com/denghanjie/zitie)',
    })
    with OPENER.open(request, timeout=TIMEOUT) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('Provider response too large')
    return _discoveries(json.loads(raw), key)


def retrieve(query, suggestions=None):
    """At most one bounded request; no retry, generated answer or page fetch.

    The optional hints argument is accepted for the orchestrator, but searching
    the original query does not assume an AI-inferred work or author is correct.
    """
    result = {'status': 'unavailable', 'message': '', 'discoveries': []}
    try:
        key = _key()
    except ValueError:
        result['message'] = '百度搜索配置不可用，请检查服务器端设置。'
        return result
    if not key:
        return {**result, 'status': 'not_configured',
                'message': '百度搜索尚未配置，未执行百度网页检索。'}
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= MAX_QUERY:
        return {**result, 'message': '百度搜索需要 2 至 120 字的查询线索。'}
    query = ' '.join(query.split())
    if len(query) < 2 or any(unicodedata.category(c).startswith('C') for c in query):
        return {**result, 'message': '百度搜索查询格式不正确。'}
    try:
        discoveries = GATE.run(lambda: _request(query, key))
    except ProviderBusy:
        return {**result, 'message': '百度搜索当前繁忙，请稍后再试。'}
    except ProviderCoolingDown:
        return {**result, 'message': '百度搜索暂时不可用，正在短暂冷却；本次未重试。'}
    except ProviderTimeout:
        return {**result, 'message': '百度搜索超时，本次未取得网页线索。'}
    except Exception:
        return {**result, 'message': '百度搜索暂时无法响应，未完成网页检索。'}
    return {'status': 'completed', 'discoveries': discoveries,
            'message': ('已取得百度网页线索；摘要并非已核验正文，请打开原网页核对。' if discoveries else
                        '百度搜索未找到可展示的安全网页线索，未读取或核验作品正文。')}
