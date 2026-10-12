import io
import json
import os
import sys
import threading
import time
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path('server').resolve()))
import baidu
from provider_runtime import ProviderBusy, ProviderCoolingDown, ProviderGate, ProviderTimeout

KEY = 'test-server-only-key-not-a-real-credential'
REFERENCE = {'type': 'web', 'title': '春晓 - 孟浩然',
             'url': 'https://www.gushiwen.cn/shiwenv_1.aspx',
             'content': '有关春晓的网页摘要。'}


def response_for(payload):
    response = MagicMock()
    response.__enter__.return_value = response
    response.read.return_value = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    return response


class BaiduTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'BAIDU_API_KEY': KEY})
        self.env.start()
        self.gate = patch.object(baidu, 'GATE', ProviderGate(capacity=2, timeout=0.5, cooldown=30))
        self.gate.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(self.gate.stop)

    def test_missing_key_is_honest_and_makes_no_request(self):
        with patch.dict(os.environ, {'BAIDU_API_KEY': ''}), patch.object(baidu.OPENER, 'open') as opener:
            result = baidu.retrieve('春晓')
            status = baidu.status()
        self.assertEqual(result['status'], 'not_configured')
        self.assertEqual(result['discoveries'], [])
        self.assertFalse(status['configured'])
        self.assertEqual(status['status'], 'not_configured')
        opener.assert_not_called()

    def test_whitespace_only_key_is_not_configured(self):
        with patch.dict(os.environ, {'BAIDU_API_KEY': ' \n\t '}), patch.object(baidu.OPENER, 'open') as opener:
            self.assertEqual(baidu.retrieve('春晓')['status'], 'not_configured')
        opener.assert_not_called()

    def test_malformed_keys_never_leave_server(self):
        for value in ('secret\r\nX-Leak: evil', '密钥', 'Bearer secret', 'k' * 4097):
            with self.subTest(value=value[:10]), patch.dict(os.environ, {'BAIDU_API_KEY': value}), patch.object(baidu.OPENER, 'open') as opener:
                result = baidu.retrieve('春晓')
                self.assertEqual(result['status'], 'unavailable')
                self.assertEqual(baidu.status()['status'], 'unavailable')
                self.assertNotIn(value, json.dumps(result, ensure_ascii=False))
                opener.assert_not_called()

    def test_status_is_configuration_only_without_a_live_probe(self):
        with patch.object(baidu.OPENER, 'open') as opener:
            status = baidu.status()
        self.assertTrue(status['configured'])
        self.assertEqual(status['status'], 'ready')
        self.assertIn('以查询结果为准', status['message'])
        self.assertNotIn(KEY, str(status))
        opener.assert_not_called()

    def test_official_request_schema_fixed_endpoint_and_bounded_read(self):
        response = response_for({'references': [REFERENCE]})
        with patch.object(baidu.OPENER, 'open', return_value=response) as opener:
            result = baidu.retrieve('春晓 孟浩然', [{'title': 'https://127.0.0.1/secret'}] * 999)
        opener.assert_called_once()
        request = opener.call_args.args[0]
        self.assertEqual(request.full_url, 'https://qianfan.baidubce.com/v2/ai_search/web_search')
        self.assertEqual(request.method, 'POST')
        self.assertEqual(opener.call_args.kwargs['timeout'], baidu.TIMEOUT)
        self.assertEqual(request.get_header('X-appbuilder-authorization'), 'Bearer ' + KEY)
        self.assertEqual(request.get_header('Content-type'), 'application/json')
        self.assertEqual(json.loads(request.data), {
            'messages': [{'role': 'user', 'content': '春晓 孟浩然'}],
            'search_source': 'baidu_search_v2',
            'resource_type_filter': [{'type': 'web', 'top_k': baidu.MAX_RESULTS}],
        })
        response.read.assert_called_once_with(baidu.MAX_BYTES + 1)
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(result['discoveries'], [{
            'provider': 'baidu', 'verification': 'discovery_only', 'title': REFERENCE['title'],
            'url': REFERENCE['url'], 'snippet': REFERENCE['content'],
        }])
        self.assertNotIn(KEY, str(result))
        self.assertNotIn('text', result['discoveries'][0])
        self.assertNotIn('verified', result['discoveries'][0])

    def test_key_cannot_be_sent_to_an_environment_selected_url(self):
        with patch.dict(os.environ, {'BAIDU_API_URL': 'http://127.0.0.1/secret'}), patch.object(baidu.OPENER, 'open', return_value=response_for({'references': []})) as opener:
            baidu.retrieve('春晓')
        self.assertEqual(opener.call_args.args[0].full_url, baidu.API)

    def test_invalid_queries_make_no_request(self):
        for query in (None, 123, [], {}, '', '字', ' \n ', '字' * 121, '春\x00晓'):
            with self.subTest(query=query), patch.object(baidu.OPENER, 'open') as opener:
                self.assertEqual(baidu.retrieve(query)['status'], 'unavailable')
                opener.assert_not_called()

    def test_empty_success_does_not_claim_verification(self):
        with patch.object(baidu.OPENER, 'open', return_value=response_for({'references': []})):
            result = baidu.retrieve('春晓')
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(result['discoveries'], [])
        self.assertIn('未读取或核验', result['message'])

    def test_bad_json_schema_and_oversize_are_unavailable(self):
        bad = (b'bad json', b'[]', b'null', {}, {'references': {}}, {'references': None},
               {'code': 216003, 'message': KEY}, {'references': [], 'error': KEY},
               b'x' * (baidu.MAX_BYTES + 1))
        for payload in bad:
            with self.subTest(payload=str(payload)[:60]), patch.object(baidu, 'GATE', ProviderGate()), patch.object(baidu.OPENER, 'open', return_value=response_for(payload)) as opener:
                result = baidu.retrieve('春晓')
                self.assertEqual(result['status'], 'unavailable')
                self.assertEqual(result['discoveries'], [])
                self.assertNotIn(KEY, str(result))
                opener.assert_called_once()

    def test_bad_key_rate_limit_and_transport_errors_are_sanitized_without_retry(self):
        errors = [urllib.error.HTTPError(baidu.API, code, KEY, {}, io.BytesIO(KEY.encode())) for code in (401, 403, 429, 500)]
        errors += [TimeoutError(KEY), urllib.error.URLError(KEY), ValueError(KEY)]
        for error in errors:
            with self.subTest(error=type(error).__name__), patch.object(baidu, 'GATE', ProviderGate()), patch.object(baidu.OPENER, 'open', side_effect=error) as opener:
                result = baidu.retrieve('春晓')
                self.assertEqual(result['status'], 'unavailable')
                self.assertNotIn(KEY, str(result))
                opener.assert_called_once()

    def test_failure_enters_cooldown_and_does_not_reissue_request(self):
        with patch.object(baidu.OPENER, 'open', side_effect=TimeoutError(KEY)) as opener:
            first = baidu.retrieve('春晓')
            second = baidu.retrieve('静夜思')
            status = baidu.status()
        self.assertEqual(first['status'], 'unavailable')
        self.assertEqual(second['status'], 'unavailable')
        self.assertIn('冷却', second['message'])
        self.assertEqual(status['status'], 'unavailable')
        opener.assert_called_once()

    def test_busy_cooling_and_timeout_results_are_sanitized(self):
        for error, expected in ((ProviderBusy(KEY), '繁忙'), (ProviderCoolingDown(KEY), '冷却'), (ProviderTimeout(KEY), '超时')):
            with self.subTest(error=type(error).__name__), patch.object(baidu.GATE, 'run', side_effect=error), patch.object(baidu.OPENER, 'open') as opener:
                result = baidu.retrieve('春晓')
                self.assertEqual(result['status'], 'unavailable')
                self.assertIn(expected, result['message'])
                self.assertNotIn(KEY, str(result))
                opener.assert_not_called()

    def test_exhausted_capacity_does_not_start_an_http_request(self):
        gate = ProviderGate(capacity=1)
        self.assertTrue(gate.slots.acquire(blocking=False))
        try:
            with patch.object(baidu, 'GATE', gate), patch.object(baidu.OPENER, 'open') as opener:
                result = baidu.retrieve('春晓')
            self.assertIn('繁忙', result['message'])
            opener.assert_not_called()
        finally:
            gate.slots.release()

    def test_slow_body_hits_wall_deadline_and_retains_capacity(self):
        gate = ProviderGate(capacity=1, timeout=0.03, cooldown=0)
        release, entered = threading.Event(), threading.Event()
        response = response_for({'references': []})
        def slow_read(size):
            entered.set()
            release.wait(1)
            return b'{"references": []}'
        response.read.side_effect = slow_read
        try:
            with patch.object(baidu, 'GATE', gate), patch.object(baidu.OPENER, 'open', return_value=response) as opener:
                start = time.monotonic()
                result = baidu.retrieve('春晓')
                self.assertTrue(entered.is_set())
                self.assertLess(time.monotonic() - start, 0.5)
                self.assertIn('超时', result['message'])
                self.assertIn('繁忙', baidu.retrieve('静夜思')['message'])
                opener.assert_called_once()
        finally:
            release.set()
        # The worker, not the timed-out caller, returns its occupied slot.
        self.assertTrue(gate.slots.acquire(timeout=0.5))
        gate.slots.release()

    def test_redirect_handler_rejects_all_destinations(self):
        for destination in ('http://127.0.0.1', 'https://www.baidu.com', baidu.API):
            with self.subTest(destination=destination), self.assertRaises(ValueError):
                baidu.NoRedirect().redirect_request(None, None, 302, '', {}, destination)

    def test_invalid_references_are_filtered_and_only_web_results_are_returned(self):
        references = [None, [], 'bad', {}, {**REFERENCE, 'type': 'video'},
                      {**REFERENCE, 'title': {'bad': 'title'}},
                      {**REFERENCE, 'url': 'http://www.gushiwen.cn'}, REFERENCE]
        with patch.object(baidu.OPENER, 'open', return_value=response_for({'references': references})):
            result = baidu.retrieve('春晓')
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(len(result['discoveries']), 1)

    def test_results_are_deduplicated_and_count_and_text_lengths_bounded(self):
        references = [{**REFERENCE, 'url': f'https://www.gushiwen.cn/{i}', 'title': '字' * 1000,
                       'content': '文' * 2000} for i in range(8)]
        with patch.object(baidu.OPENER, 'open', return_value=response_for({'references': [REFERENCE, REFERENCE, *references]})):
            result = baidu.retrieve('春晓')
        self.assertEqual(len(result['discoveries']), baidu.MAX_RESULTS)
        self.assertEqual(len({item['url'] for item in result['discoveries']}), baidu.MAX_RESULTS)
        self.assertTrue(all(len(item['title']) <= baidu.MAX_TITLE for item in result['discoveries']))
        self.assertTrue(all(len(item['snippet']) <= baidu.MAX_SNIPPET for item in result['discoveries']))

    def test_provider_markup_controls_and_secret_echoes_do_not_escape(self):
        references = [{**REFERENCE, 'title': '<b>春晓</b>\u0000', 'content': '网页\n <em>摘要</em>\u202e &amp; 内容'},
                      {**REFERENCE, 'url': 'https://www.baidu.com/' + KEY},
                      {**REFERENCE, 'title': KEY}, {**REFERENCE, 'content': KEY}]
        with patch.object(baidu.OPENER, 'open', return_value=response_for({'references': references})):
            result = baidu.retrieve('春晓')
        self.assertEqual(len(result['discoveries']), 1)
        self.assertEqual(result['discoveries'][0]['title'], '春晓')
        self.assertEqual(result['discoveries'][0]['snippet'], '网页 摘要 & 内容')
        self.assertNotIn(KEY, str(result))

    def test_secret_crossing_truncation_boundary_is_filtered_before_truncation(self):
        references = [{**REFERENCE, 'title': '字' * (baidu.MAX_TITLE - 3) + KEY},
                      {**REFERENCE, 'content': '字' * (baidu.MAX_SNIPPET - 3) + KEY}]
        with patch.object(baidu.OPENER, 'open', return_value=response_for({'references': references})):
            self.assertEqual(baidu.retrieve('春晓')['discoveries'], [])

    def test_reference_scan_is_bounded(self):
        references = [None] * baidu.MAX_REFERENCES + [REFERENCE]
        with patch.object(baidu.OPENER, 'open', return_value=response_for({'references': references})):
            self.assertEqual(baidu.retrieve('春晓')['discoveries'], [])


class SafeUrlTests(unittest.TestCase):
    def test_public_https_names_are_canonicalized_without_fetching(self):
        urls = {'https://www.gushiwen.cn/shiwenv_123.aspx': 'https://www.gushiwen.cn/shiwenv_123.aspx',
                'https://ZH.WIKISOURCE.ORG:443/wiki/春曉?q=古詩#正文': 'https://zh.wikisource.org/wiki/春曉?q=古詩#正文',
                'https://www.baidu.com/s?wd=%E6%98%A5%E6%99%93': 'https://www.baidu.com/s?wd=%E6%98%A5%E6%99%93'}
        with patch.object(baidu.OPENER, 'open') as opener:
            for url, expected in urls.items():
                with self.subTest(url=url):
                    self.assertEqual(baidu.safe_url(url), expected)
        opener.assert_not_called()

    def test_private_local_ip_and_reserved_urls_are_rejected(self):
        hosts = ['localhost', 'localhost.localdomain', 'service.local', 'server.internal', 'router.lan',
                 'printer.home.arpa', 'foo.invalid', 'a.test', 'a.onion', 'foo',
                 '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254',
                 '0.0.0.0', '8.8.8.8', '[::1]', '[fc00::1]', '[2001:4860:4860::8888]',
                 '127.1', '2130706433', '0177.0.0.1', '0x7f000001', '0x7f.0.0.1']
        for host in hosts:
            with self.subTest(host=host):
                self.assertIsNone(baidu.safe_url('https://' + host + '/'))

    def test_ambiguous_credentialed_or_non_https_urls_are_rejected(self):
        urls = [None, {}, '', 'http://www.baidu.com/', '//www.baidu.com', 'javascript:alert(1)',
                'data:text/html,test', 'file:///etc/passwd', 'https://user:pass@www.baidu.com/',
                'https://user@www.baidu.com/', 'https://www.baidu.com:444/', 'https://www.baidu.com:/',
                'https://www.baidu.com.:443/', 'https://www.baidu.com\\@127.0.0.1/',
                ' https://www.baidu.com/', 'https://www.baidu.com/\n', 'https://www.baidu.com/%0a',
                'https://www.baidu.com/%5c', 'https://www.baidu.com/%zz', 'https://%31%32%37.0.0.1/',
                'https://www。baidu.com/', 'https://百度.com/', 'https://www.baidu.com\u202e/',
                'https://a..com/', 'https://-a.com/', 'https://a_.com/', 'https://a.com/' + 'a' * 2048]
        for url in urls:
            with self.subTest(url=url):
                self.assertIsNone(baidu.safe_url(url))


if __name__ == '__main__':
    unittest.main()
