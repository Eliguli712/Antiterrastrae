from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

from scripts.verify_live import check_http

ROOT = Path(__file__).resolve().parents[1]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


class LiveCheckerTests(unittest.TestCase):
    def test_real_http_files_and_split_integrity(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT.parent)))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            checks = check_http(f'http://127.0.0.1:{server.server_port}/{ROOT.name}/', ROOT, 'local-test')
            self.assertGreater(len(checks), 20)
            self.assertTrue(all(item['matches'] for item in checks))
            self.assertTrue(any(item['path'].endswith('.part-003.bin') for item in checks))
        finally:
            server.shutdown(); server.server_close(); thread.join()

    def test_http_200_with_stale_content_fails(self):
        with patch('scripts.verify_live.fetch', return_value=b'old CV'):
            with self.assertRaisesRegex(ValueError, 'Published file differs: cv.html'):
                check_http('https://eliguli.vercel.app/', ROOT, 'test')
