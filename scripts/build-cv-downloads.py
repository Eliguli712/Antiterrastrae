"""Refresh the research CV downloads and their embedded HTML download links."""
import base64
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    with tempfile.TemporaryDirectory() as directory:
        stage = Path(directory)
        subprocess.run(['pandoc', str(ROOT / 'cv.md'), '--reference-doc=' + str(ROOT / 'cv.docx'),
                        '-o', str(stage / 'cv.docx')], check=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                    args=['--no-sandbox', '--disable-dev-shm-usage'])
                page = browser.new_page()
                page.goto(f'http://127.0.0.1:{server.server_port}/cv.html', wait_until='networkidle')
                page.evaluate('''() => {
                  document.title='Eliguli Han | Research CV';
                  for (const link of document.querySelectorAll('a[href]')) {
                    const url=new URL(link.href);
                    if(url.hostname==='127.0.0.1') link.href='https://eliguli712.github.io/Antiterrastrae'+url.pathname+url.search+url.hash;
                  }
                }''')
                page.pdf(path=str(stage / 'cv.pdf'), prefer_css_page_size=True, print_background=False)
                browser.close()
        finally:
            server.shutdown(); server.server_close()
        text = subprocess.run(['/usr/bin/pdftotext', str(stage / 'cv.pdf'), '-'],
                              capture_output=True, text=True, check=True).stdout
        normalized = ' '.join(text.lower().split())
        compact = re.sub(r'\s+', '', normalized)
        assert 'researchpublications' in compact and 'workinprogress' in compact
        assert '223 pdf' not in normalized, 'The research CV must not print the entire works directory'
        assert (stage / 'cv.pdf').read_bytes().startswith(b'%PDF-')
        source = (ROOT / 'cv.html').read_text()
        files = [('docx', stage / 'cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
                 ('md', ROOT / 'cv.md', 'text/markdown;charset=utf-8'),
                 ('pdf', stage / 'cv.pdf', 'application/pdf')]
        for identifier, path, mime in files:
            value = f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()
            pattern = rf'(<a\b[^>]*id="download-{identifier}"[^>]*href=")[^"]*"'
            source, count = re.subn(pattern, lambda match: match[1] + value + '"', source)
            assert count == 1, f'Missing unique {identifier} CV download control'
        for name in ['cv.pdf', 'cv.docx']:
            shutil.copy2(stage / name, ROOT / name)
        (ROOT / 'cv.html').write_text(source)
    print('Updated English CV PDF, DOCX, Markdown and embedded download links')


if __name__ == '__main__':
    main()
