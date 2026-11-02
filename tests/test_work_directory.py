import base64
from hashlib import sha256
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
import re
import struct
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


class Anchors(HTMLParser):
    def __init__(self): super().__init__(); self.anchors = {}
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'a' and values.get('id'): self.anchors[values['id']] = values


class DirectorySourceTests(unittest.TestCase):
    def test_all_original_library_identities_and_english_titles(self):
        source = (ROOT / 'publications/index-source/Research_PDF_Index_2026-11-01.tex').read_text()
        data = json.loads((ROOT / 'publications/work-directory.json').read_text())
        groups = data['groups']; entries = [entry for group in groups for entry in group['entries']]
        self.assertEqual(len(groups), 51)
        self.assertEqual(sum(group['main_work'] for group in groups), 29)
        self.assertEqual(len(entries), 226)
        self.assertEqual(sum(entry['kind'] == 'pdf' for entry in entries), 223)
        self.assertEqual(sum(entry['kind'] == 'archive' for entry in entries), 3)
        originals = set(re.findall(r'\\href\{(https://chatgpt.com/library[^}]+)\}', source))
        self.assertEqual({entry['library_url'] for entry in entries}, originals)
        for group in groups:
            self.assertNotRegex(group['title'] + group['category'], r'[\u3400-\u9fff]')
            if group['category'] == 'Reference Literature': self.assertFalse(group['main_work'])
        self.assertNotRegex((ROOT / 'publications/research-index.html').read_text(), r'[\u3400-\u9fff]')

    def test_supplied_card_back_pages_preserved(self):
        root = ROOT / 'assets/portfolio/card-backs'
        data = json.loads((root / 'provenance.json').read_text())
        self.assertEqual(sha256((root / data['source']).read_bytes()).hexdigest(), data['source_sha256'])
        for key, page in data['pages'].items():
            content = (root / page['image']).read_bytes()
            self.assertEqual(content[:8], b'\x89PNG\r\n\x1a\n')
            self.assertEqual(struct.unpack('>II', content[16:24]), (1000, 1400))
            self.assertEqual(sha256(content).hexdigest(), page['sha256'])
            self.assertEqual(page['page'], 1 if key == 'coronodon' else 2)

    def test_cv_downloads_match_updated_files(self):
        source = (ROOT / 'cv.html').read_text()
        parser = Anchors(); parser.feed(source)
        for kind in ['pdf', 'docx', 'md']:
            value = parser.anchors['download-' + kind]['href']
            self.assertEqual(base64.b64decode(value.split(',', 1)[1]), (ROOT / ('cv.' + kind)).read_bytes())
        self.assertLess(source.index('<section class="research-pub"'), source.index('<section aria-labelledby="education"'))
        self.assertIn('## Research Publications', (ROOT / 'cv.md').read_text())
        with zipfile.ZipFile(ROOT / 'cv.docx') as archive:
            self.assertIn('Research Publications', archive.read('word/document.xml').decode())
