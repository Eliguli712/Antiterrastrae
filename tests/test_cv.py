"""Browser regression checks. Build the mirror first; run with Playwright installed."""
from hashlib import sha256
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import unittest
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietServer(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT.parent), **kwargs)

    def log_message(self, *_):
        pass


class CVBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not (ROOT / 'dist/cv.html').is_file():
            raise RuntimeError('Run node scripts/build-mirror.mjs before the tests.')
        cls.catalog = json.loads((ROOT / 'publications/catalog.json').read_text())['documents']
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), QuietServer)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}/{ROOT.name}'
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_catalog_downloads_and_mirror_bytes(self):
        self.assertGreaterEqual(len(self.catalog), 11)
        self.assertEqual(len({p['id'] for p in self.catalog}), len(self.catalog))
        self.assertEqual((ROOT / 'cv.html').read_bytes(), (ROOT / 'dist/cv.html').read_bytes())
        self.assertEqual((ROOT / 'cv.html').read_bytes(), (ROOT / 'dist/index.html').read_bytes())
        for paper in self.catalog:
            with self.subTest(paper=paper['id']):
                source = (ROOT / 'publications' / paper['file']).read_bytes()
                self.assertTrue(source.startswith(b'%PDF-'))
                self.assertEqual(sha256(source).hexdigest(), paper['sha256'])
                self.assertEqual(source, (ROOT / 'dist/publications' / paper['file']).read_bytes())
        requested = 'K_class_9_copy_m_slot_markov_symmetry_report.pdf'
        if (ROOT / 'publications' / requested).exists():
            self.assertEqual(self.catalog[-1]['file'], requested)

    def test_complete_papers_and_return_to_matching_cv(self):
        for suffix in ['', '/dist']:
            page = self.browser.new_page(viewport={'width': 1100, 'height': 850})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            for paper in self.catalog:
                with self.subTest(host=suffix or 'GitHub', paper=paper['id']):
                    response = page.goto(self.base + suffix + '/publications/reader.html?paper=' + paper['id'])
                    self.assertEqual(response.status, 200)
                    page.wait_for_selector('#page-1 canvas', timeout=60000)
                    self.assertEqual(page.locator('.pdf-page').count(), paper['pages'])
                    page.locator('#page-number').fill(str(paper['pages']))
                    page.locator('#page-number').press('Enter')
                    page.wait_for_selector(f'#page-{paper["pages"]} canvas', timeout=60000)
                    self.assertGreater(page.locator(f'#page-{paper["pages"]} canvas').evaluate('(c) => c.width'), 100)
                    target = page.locator('#return-cv').evaluate('(a) => a.href')
                    self.assertEqual(target, self.base + suffix + '/cv.html#paper-' + paper['id'])
                    self.assertEqual(urlsplit(page.locator('#paper-download').evaluate('(a) => a.href')).netloc,
                                     urlsplit(self.base).netloc)
            page.locator('#return-cv').click()
            page.wait_for_selector('#paper-' + self.catalog[-1]['id'] + '[open]')
            self.assertEqual(errors, [])
            page.close()

    def test_disclosures_cards_mobile_and_keyboard(self):
        card_text = json.loads((ROOT / 'assets/portfolio/cards.json').read_text())
        for suffix in ['', '/dist']:
            for width in [1280, 390]:
                with self.subTest(host=suffix or 'GitHub', width=width):
                    page = self.browser.new_page(viewport={'width': width, 'height': 844})
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(self.base + suffix + '/cv.html')
                    self.assertEqual(page.locator('.paper-entry iframe[src]').count(), 0)
                    entry = page.locator('#paper-brownian-motion-notes')
                    entry.locator('summary').focus()
                    page.keyboard.press('Enter')
                    entry.locator('iframe').wait_for()
                    frame = page.frame_locator('#paper-brownian-motion-notes iframe')
                    frame.locator('#page-1 canvas').wait_for(timeout=60000)
                    frame.locator('#page-number').fill('38')
                    frame.locator('#page-number').press('Enter')
                    frame.locator('#page-38 canvas').wait_for(timeout=60000)
                    entry.locator('summary').click()
                    page.wait_for_function('!document.querySelector("#paper-brownian-motion-notes iframe").hasAttribute("src")')
                    for key in ['coronodon', 'zygophyseter']:
                        page.locator(f'[data-card="{key}"]').click()
                        page.wait_for_selector('#viewer-flip:not([hidden])')
                        image = page.locator('#viewer-image')
                        self.assertTrue(image.is_visible())
                        page.wait_for_function('document.getElementById("viewer-image").complete && document.getElementById("viewer-image").naturalWidth > 0')
                        self.assertEqual(image.evaluate('(img) => img.naturalWidth'), 1000)
                        image.focus(); page.keyboard.press('Enter')
                        self.assertTrue(page.locator('#viewer-card-back').is_visible())
                        self.assertEqual(page.locator('#viewer-flip').get_attribute('aria-pressed'), 'true')
                        actual = page.locator('#viewer-card-back p:not(.card-back-code)').all_text_contents()
                        self.assertEqual(actual, card_text[key]['body'].split('\n\n'))
                        page.locator('#viewer-card-back').click()
                        self.assertTrue(image.is_visible())
                        page.locator('#viewer-flip').click()
                        self.assertTrue(page.locator('#viewer-card-back').is_visible())
                        page.keyboard.press('Escape')
                    page.locator('a[href="assets/portfolio/yi-qi-reconstruction.jpg"]').click()
                    self.assertFalse(page.locator('#viewer-flip').is_visible())
                    page.keyboard.press('Escape')
                    self.assertLessEqual(page.evaluate('document.documentElement.scrollWidth'), width + 1)
                    self.assertEqual(errors, [])
                    page.close()

    def test_original_textured_anatomy_remains_available(self):
        for suffix in ['', '/dist']:
            with self.subTest(host=suffix or 'GitHub'):
                page = self.browser.new_page(viewport={'width': 1100, 'height': 850})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(self.base + suffix + '/cv.html#cynthiacetus-downloads')
                page.locator('[data-explore-model="skull"]').click()
                page.wait_for_function('document.querySelector("model-viewer").loaded === true', timeout=60000)
                page.wait_for_function('document.getElementById("model-status").textContent.includes("98,812")', timeout=15000)
                self.assertIn('98,812', page.locator('#model-status').inner_text())
                self.assertIn('Original Opal texture', page.locator('#model-status').inner_text())
                self.assertFalse(page.locator('#model-support').is_visible())
                self.assertFalse(page.locator('#model-support-download').is_visible())
                page.locator('#model-reset').click()
                page.locator('#model-close').click()
                self.assertFalse(page.locator('#model-dialog').is_visible())
                self.assertEqual(errors, [])
                page.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
