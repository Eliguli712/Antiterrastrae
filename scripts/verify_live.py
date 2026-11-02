"""Check the two actual public deployments against this checkout.

Run in the publishing environment, with --browser for functional checks.
This checker never treats a local build or a successful Git push as deployment.
"""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.parse import quote, urljoin, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SITES = {'github_pages': 'https://eliguli712.github.io/Antiterrastrae/',
         'vercel': 'https://eliguli.vercel.app/'}


def fetch(url):
    request = Request(url, headers={'User-Agent': 'Antiterrastrae-release-check/1.0', 'Cache-Control': 'no-cache'})
    with urlopen(request, timeout=35) as response:
        if urlsplit(response.url).netloc != urlsplit(url).netloc:
            raise ValueError('Unexpected cross-host redirect')
        return response.read()


def check_file(base, relative, expected, commit, evidence):
    url = urljoin(base, quote(relative, safe='/')) + '?verify=' + commit
    data = fetch(url)
    actual = sha256(data).hexdigest()
    wanted = sha256(expected).hexdigest()
    evidence.append({'path': relative, 'bytes': len(data), 'sha256': actual, 'matches': actual == wanted})
    if data != expected:
        raise ValueError(f'Published file differs: {relative}; expected SHA-256 {wanted}, observed {actual}')
    return data


def check_http(base, root, commit):
    checked = []
    check_file(base, 'cv.html', (root / 'cv.html').read_bytes(), commit, checked)
    if urlsplit(base).netloc == 'eliguli.vercel.app':
        check_file(base, '', (root / 'cv.html').read_bytes(), commit, checked)
    catalog_bytes = check_file(base, 'publications/catalog.json', (root / 'publications/catalog.json').read_bytes(), commit, checked)
    documents = json.loads(catalog_bytes)['documents']
    if documents[-1]['file'] != 'K_class_q_copy_m_slot_markov_symmetry_report.pdf' or documents[-1]['pages'] != 18:
        raise ValueError('The uploaded 18-page report is not the final entry')
    files = ['cv.pdf', 'cv.docx', 'cv.md', 'assets/cv-additions.css',
             'assets/publications.js', 'assets/portfolio/gallery.js', 'assets/portfolio/cards.json',
             'assets/portfolio/card-backs/CardBack.pdf', 'assets/portfolio/card-backs/provenance.json',
             'assets/portfolio/card-backs/coronodon-back.png', 'assets/portfolio/card-backs/zygophyseter-back.png',
             'publications/research-index.html', 'publications/work-directory.json',
             'publications/library-entry.html', 'assets/library-entry.js',
             'assets/work-directory.css', 'assets/work-directory.js',
             'publications/card.html', 'assets/card-reader.css', 'assets/card-reader.js',
             'assets/cynthiacetus/viewer.js', 'assets/cynthiacetus/chunked-model.js',
             'publications/reader.html', 'publications/reader.js', 'publications/reader.css',
             'downloads/cynthiacetus/Cynthiacetus_Skull_Supports_1-20.3mf',
             'assets/cynthiacetus/print-project-manifest.json',
             'assets/cynthiacetus/print-project-1-20-supports.parts.json']
    for name in files:
        check_file(base, name, (root / name).read_bytes(), commit, checked)
    directory = json.loads((root / 'publications/work-directory.json').read_text())
    if (len(directory['groups']) != 51 or directory['main_manuscripts'] != 29 or
            directory['pdf_entries'] != 223 or directory['source_archives'] != 3):
        raise ValueError('The complete supplied works index is missing entries')
    for paper in documents:
        name = 'publications/' + paper['file']
        check_file(base, name, (root / name).read_bytes(), commit, checked)
    parts_path = 'assets/cynthiacetus/print-project-1-20-supports.parts.json'
    parts = json.loads((root / parts_path).read_text())
    combined = sha256()
    for part in parts['parts']:
        name = 'assets/cynthiacetus/' + part['path']
        data = check_file(base, name, (root / name).read_bytes(), commit, checked)
        if len(data) != part['bytes'] or sha256(data).hexdigest() != part['sha256']:
            raise ValueError('Published support part failed integrity verification')
        combined.update(data)
    if combined.hexdigest() != parts['sha256']:
        raise ValueError('Reassembled live support model failed integrity verification')
    return checked


def check_browser(base, chromium):
    page = chromium.new_page(viewport={'width': 390, 'height': 844})
    page.set_extra_http_headers({'Cache-Control': 'no-cache'})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        response = page.goto(urljoin(base, 'cv.html'), wait_until='load', timeout=60000)
        if response.status != 200:
            raise ValueError('Live CV did not return HTTP 200')
        if 'Work in progress' not in page.locator('#research-publications').inner_text():
            raise ValueError('The current research projects section is missing')
        for card in ['coronodon', 'zygophyseter']:
            page.locator(f'[data-card="{card}"]').click()
            page.wait_for_selector('#viewer-flip:not([hidden])')
            page.locator('#viewer-flip').click()
            if not page.locator('#viewer-card-back').is_visible():
                raise ValueError('Live card did not flip')
            page.wait_for_function('document.querySelector("#viewer-card-back img").naturalWidth===1000')
            if 'publications/card' not in page.locator('#viewer-original').get_attribute('href'):
                raise ValueError('The original-image link does not open the full-size flip view')
            page.keyboard.press('Escape')
        page.goto(urljoin(base, 'publications/research-index.html'), wait_until='load', timeout=60000)
        if page.locator('.work-group').count() != 51 or page.locator('[data-entry]').count() != 226:
            raise ValueError('The live works directory is incomplete')
        if any('\u3400' <= char <= '\u9fff' for char in page.locator('body').inner_text()):
            raise ValueError('The live directory contains untranslated visible text')
        page.locator('#work-search').fill('Wallis')
        if page.locator('.work-group:not([hidden])').count() != 1:
            raise ValueError('The live English directory search failed')
        page.locator('#expand-all').click()
        page.locator('.work-group:not([hidden]) [data-entry] a').first.click()
        page.wait_for_selector('#library-open:not([hidden])')
        if page.locator('.directory-header>a').evaluate('(a)=>a.href') != urljoin(base, 'cv.html#manuscripts'):
            raise ValueError('The library entry does not return to the matching CV')
        for card in ['coronodon', 'zygophyseter']:
            page.goto(urljoin(base, 'publications/card.html?card=' + card), wait_until='load', timeout=60000)
            page.wait_for_function('document.getElementById("reader-front").naturalWidth===1000')
            page.locator('#reader-card').click()
            page.wait_for_function('!document.getElementById("reader-back").hidden && document.getElementById("reader-back").naturalWidth===1000')
            if page.locator('header>a').evaluate('(a)=>a.href') != urljoin(base, 'cv.html#artworks'):
                raise ValueError('The full-size card does not return to the matching CV')
            page.locator('#flip-card').click()
            if not page.locator('#reader-front').is_visible():
                raise ValueError('The full-size card did not flip back to its original front')
        reader = urljoin(base, 'publications/reader.html?paper=K_class_q_copy_m_slot_markov_symmetry_report')
        page.goto(reader, wait_until='load', timeout=60000)
        page.wait_for_selector('#page-1 canvas', timeout=60000)
        if page.locator('.pdf-page').count() != 18:
            raise ValueError('Live report does not expose all 18 pages')
        page.locator('#page-number').fill('18')
        page.locator('#page-number').press('Enter')
        page.wait_for_selector('#page-18 canvas', timeout=60000)
        target = page.locator('#return-cv').evaluate('(a) => a.href')
        expected = urljoin(base, 'cv.html#paper-K_class_q_copy_m_slot_markov_symmetry_report')
        if target != expected:
            raise ValueError('Reader returns to a different CV')
        page.locator('#return-cv').click()
        page.wait_for_selector('#paper-K_class_q_copy_m_slot_markov_symmetry_report[open]')
        page.goto(urljoin(base, 'cv.html#cynthiacetus-print-project'), wait_until='load')
        page.locator('[data-explore-model="print-1-20"]').click()
        page.wait_for_function('document.querySelector("model-viewer").loaded && document.getElementById("model-status").textContent.includes("154,472")', timeout=90000)
        page.locator('#model-support').click()
        page.wait_for_function('document.querySelector("model-viewer").loaded && document.getElementById("model-status").textContent.includes("Print supports visible")', timeout=120000)
        if not page.locator('model-viewer').get_attribute('src').startswith('blob:'):
            raise ValueError('Live support parts were not assembled')
        page.locator('#model-support').click()
        page.wait_for_function('document.querySelector("model-viewer").loaded && document.getElementById("model-status").textContent.includes("Full geometry")', timeout=60000)
        if errors:
            raise ValueError('Live page errors: ' + '; '.join(errors))
        return {'viewport_width': 390, 'card_backs': 2, 'full_size_card_flips': 2,
                'research_projects': 'passed', 'directory_groups': 51, 'directory_entries': 226,
                'english_directory_search': 'passed', 'report_pages': 18,
                'same_host_cv_return': 'passed', 'support_toggle': 'passed', 'page_errors': []}
    finally:
        page.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--browser', action='store_true')
    parser.add_argument('--attempts', type=int, default=4)
    parser.add_argument('--retry-delay', type=int, default=20)
    args = parser.parse_args()
    commit = subprocess.run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], check=True, capture_output=True, text=True).stdout.strip()
    report = {'source_commit': commit, 'verified_at': datetime.now(timezone.utc).isoformat(),
              'execution': 'GitHub Actions' if os.environ.get('GITHUB_ACTIONS') == 'true' else 'local',
              'run_url': os.environ.get('VERIFICATION_RUN_URL'), 'sites': {}, 'outcome': 'failed'}
    for attempt in range(max(1, args.attempts)):
        for name, base in SITES.items():
            if report['sites'].get(name, {}).get('http') == 'passed':
                continue
            try:
                checks = check_http(base, ROOT, commit)
                report['sites'][name] = {'url': base, 'http': 'passed', 'checked_files': checks}
            except Exception as error:
                report['sites'][name] = {'url': base, 'http': 'failed', 'error': str(error), 'attempts': attempt + 1}
        if all(site.get('http') == 'passed' for site in report['sites'].values()):
            break
        if attempt + 1 < args.attempts:
            time.sleep(min(max(args.retry_delay, 0), 30))
    if args.browser and any(site.get('http') == 'passed' for site in report['sites'].values()):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            options = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader']}
            executable = os.environ.get('CV_CHROMIUM_EXECUTABLE')
            if executable or Path('/usr/bin/chromium').is_file():
                options['executable_path'] = executable or '/usr/bin/chromium'
            browser = playwright.chromium.launch(**options)
            for name, base in SITES.items():
                site = report['sites'][name]
                if site.get('http') != 'passed':
                    continue
                try:
                    site['browser'] = {'outcome': 'passed', **check_browser(base, browser)}
                except Exception as error:
                    site['browser'] = {'outcome': 'failed', 'error': str(error)}
            browser.close()
    passed = all(site.get('http') == 'passed' and (not args.browser or site.get('browser', {}).get('outcome') == 'passed')
                 for site in report['sites'].values())
    report['outcome'] = 'passed' if passed else 'failed'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
