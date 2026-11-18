"""Copy the existing public gallery and verify every source asset before publishing."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import re
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'design/megalodon'
MANIFEST = json.loads((ROOT / '.github/gallery-transfer.json').read_text())


def transfer(item):
    path = Path(item['path'])
    if path.is_absolute() or '..' in path.parts:
        raise ValueError('Invalid asset path')
    request = urllib.request.Request(MANIFEST['source'] + urllib.parse.quote(path.as_posix()),
                                     headers={'User-Agent': 'Vrontiki-Gallery/5'})
    raw = urllib.request.urlopen(request, timeout=120).read()
    assert len(raw) == item['bytes'], str(path)
    assert hashlib.sha256(raw).hexdigest() == item['sha256'], str(path)
    target = DEST / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    return path.as_posix()


def update_pdf_address():
    # Preserve the original calculation pages; update only the obsolete website line.
    import fitz
    path = DEST / 'assets/Megalodon_Stand_Calculation_CN.pdf'
    doc = fitz.open(path)
    old = 'https://megalodon-dualcube-lab-eliguli.eliguli712.chatgpt.site'
    new = 'https://eliguli.vercel.app/design/megalodon'
    replaced = 0
    for page in doc:
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines', []):
                for span in line['spans']:
                    text = span['text']
                    if old not in text:
                        continue
                    matches = page.search_for(old)
                    assert len(matches) == 1, 'Unexpected URL text layout'
                    bounds = matches[0]
                    page.add_redact_annot(bounds, fill=(242/255, 246/255, 249/255))
                    page.apply_redactions(images=0, graphics=0)
                    color = tuple(((span['color'] >> shift) & 255) / 255 for shift in (16, 8, 0))
                    page.insert_text((bounds.x0, span['origin'][1]), new, fontname='helv', fontsize=span['size'], color=color)
                    replaced += 1
    assert replaced == 1, replaced
    temp = path.with_suffix('.updated.pdf')
    doc.save(temp, garbage=4, deflate=True)
    doc.close()
    temp.replace(path)
    doc = fitz.open(path)
    assert not re.search(r'chatgpt|openai|\bAI\b', '\n'.join(p.get_text() for p in doc), re.I)
    print('Updated the calculation PDF website address.')


if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=6) as pool:
        paths = list(pool.map(transfer, MANIFEST['files']))
    update_pdf_address()
    for path in DEST.rglob('*'):
        if path.is_file() and path.suffix in {'.html', '.js', '.css', '.json', '.txt', '.svg'}:
            assert not re.search(r'chatgpt|openai|\bAI\b', path.read_text(), re.I), str(path)
    print(f'Verified and imported {len(paths)} gallery assets.')
