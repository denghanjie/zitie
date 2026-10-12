import sys
from pathlib import Path
sys.path.insert(0, str(Path('server').resolve()))
import json
import unittest
from unittest.mock import patch, MagicMock
import online

HINT = {'title': '春晓', 'author': '孟浩然', 'quote': '春眠不觉晓'}
HTML = '<div><table><p>作者、导航</p></table><div class="poem"><p>春眠不觉晓，处处闻啼鸟。<br/>夜来风雨声<sup>[1]</sup>，花落知多少。</p></div><script>evil()</script><div class="licenseContainer"><p>版权导航</p></div></div>'

def parsed(text=HTML, revision=12):
    return {'parse': {'title': '春曉 (孟浩然)', 'revid': revision, 'text': text}}

class SourceTests(unittest.TestCase):
    def test_extracts_actual_body_and_checks_quote(self):
        with patch.object(online, 'api', return_value=parsed()) as api:
            source = online.fetch_source((12, HINT))
        self.assertEqual(source['text'], '春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。')
        self.assertTrue(source['matchedQuote'])
        self.assertEqual(source['verification'], 'source_fetched')
        self.assertEqual(source['url'], 'https://zh.wikisource.org/w/index.php?oldid=12')
        api.assert_called_once_with(action='parse', oldid=12, prop='text|revid', disableeditsection=1)
    def test_variant_mismatch_is_not_falsely_verified(self):
        with patch.object(online, 'api', return_value=parsed('<p>春眠不覺曉，處處聞啼鳥。</p>')):
            source = online.fetch_source((12, HINT))
        self.assertFalse(source['matchedQuote'])
        self.assertEqual(source['quoteCheck'], 'not_found')
    def test_absent_quote_is_not_a_match(self):
        with patch.object(online, 'api', return_value=parsed()):
            self.assertIsNone(online.fetch_source((12, {'title': '春晓'}))['matchedQuote'])
    def test_normalization_does_not_invent_content(self):
        self.assertEqual(online.normalized('春 眠，不觉晓。'), '春眠不觉晓')
        self.assertNotEqual(online.normalized('春眠不覺曉'), online.normalized('春眠不觉晓'))
    def test_bad_revision_markup_and_oversize_rejected(self):
        for payload in [parsed(revision=13), parsed('<script>春眠不觉晓</script>'), parsed('<p>'+'字'*16001+'</p>'), {'parse': {'text': {}}}]:
            with self.subTest(payload=str(payload)[:70]), patch.object(online, 'api', return_value=payload):
                with self.assertRaises(ValueError): online.fetch_source((12, HINT))
    def test_search_uses_fixed_origin_and_excludes_disambiguation(self):
        payload = {'query': {'pages': [
            {'ns': 0, 'revisions': [{'revid': 12}]},
            {'ns': 0, 'pageprops': {'disambiguation': ''}, 'revisions': [{'revid': 13}]},
        ]}}
        with patch.object(online, 'api', return_value=payload) as api:
            self.assertEqual(online.search_hint(HINT), [(12, HINT)])
        self.assertEqual(api.call_args.kwargs['gsrsearch'], '春晓 孟浩然')
        self.assertEqual(api.call_args.kwargs['gsrnamespace'], 0)
    def test_search_no_results_is_honest(self):
        with patch.object(online, 'api', return_value={}):
            result = online.retrieve([HINT])
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(result['sources'], [])
        self.assertIn('未完成在线核对', result['message'])
    def test_failures_and_partial_results(self):
        with patch.object(online, 'search_hint', side_effect=TimeoutError('SECRET')):
            result = online.retrieve([HINT])
        self.assertEqual(result['status'], 'unavailable')
        self.assertNotIn('SECRET', str(result))
        def fetch(candidate):
            if candidate[0] == 13: raise TimeoutError()
            return {'revisionId': 12}
        with patch.object(online, 'search_hint', return_value=[(12,HINT),(13,HINT)]), patch.object(online, 'fetch_source', side_effect=fetch):
            result = online.retrieve([HINT])
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(len(result['sources']), 1)
    def test_search_and_fetch_counts_are_bounded(self):
        with patch.object(online, 'search_hint', return_value=[(12,HINT),(13,HINT)]) as search, patch.object(online, 'fetch_source', return_value={}) as fetch:
            online.retrieve([HINT]*9)
        self.assertEqual(search.call_count,3)
        self.assertEqual(fetch.call_count,2)
    def test_network_request_size_timeout_and_no_model_url(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = b'{"batchcomplete":true}'
        with patch.object(online.OPENER, 'open', return_value=response) as opener:
            online.api(action='query', srsearch='http://127.0.0.1/private')
        request = opener.call_args.args[0]
        self.assertTrue(request.full_url.startswith(online.API+'?'))
        self.assertEqual(opener.call_args.kwargs['timeout'],6)
        self.assertNotIn('Authorization', request.headers)
        response.read.assert_called_once_with(online.MAX_BYTES+1)
    def test_redirects_and_api_errors_fail_closed(self):
        with self.assertRaises(ValueError): online.NoRedirect().redirect_request(None,None,302,'',{},'http://127.0.0.1')
        response = MagicMock()
        response.__enter__.return_value = response
        for data in [b'bad',b'{"error":{}}',b'[]',b'x'*(online.MAX_BYTES+1)]:
            response.read.return_value = data
            with patch.object(online.OPENER,'open',return_value=response), self.assertRaises(ValueError): online.api(action='query')

if __name__ == '__main__': unittest.main()
