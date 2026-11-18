"""Keep the website's CV download formats consistent with its visible wording."""
from pathlib import Path
from io import BytesIO
from zipfile import ZipFile
import base64
import re
import fitz

ROOT = Path(__file__).resolve().parents[1]
PHRASE = '; AI-assisted development and debugging.'
PATTERN = re.compile(r'chatgpt|openai|\bAI\b', re.I)


def plain(text):
    return text.replace(PHRASE, '.')


def docx(raw):
    src = ZipFile(BytesIO(raw))
    out = BytesIO()
    with ZipFile(out, 'w') as target:
        for item in src.infolist():
            data = src.read(item.filename)
            if item.filename.endswith('.xml'):
                text = plain(data.decode('utf-8'))
                assert not PATTERN.search(text), item.filename
                data = text.encode('utf-8')
            target.writestr(item, data)
    return out.getvalue()


def pdf(raw):
    doc = fitz.open(stream=raw, filetype='pdf')
    found = 0
    for page in doc:
        bounds = page.search_for(PHRASE)
        for rect in bounds:
            page.add_redact_annot(rect, fill=(1, 1, 1))
        if bounds:
            page.apply_redactions(images=0, graphics=0)
            found += len(bounds)
    assert not PATTERN.search('\n'.join(p.get_text() for p in doc))
    return doc.tobytes(garbage=4, deflate=True)


def embedded(match):
    prefix, encoded = match.groups()
    raw = base64.b64decode(encoded)
    if 'wordprocessingml' in prefix:
        raw = docx(raw)
    elif 'application/pdf' in prefix:
        raw = pdf(raw)
    elif 'text/markdown' in prefix:
        raw = plain(raw.decode('utf-8')).encode('utf-8')
        assert not PATTERN.search(raw.decode())
    else:
        return match.group(0)
    return prefix + base64.b64encode(raw).decode('ascii')


if __name__ == '__main__':
    for name, cleaner in [('cv.docx', docx), ('cv.pdf', pdf)]:
        path = ROOT / name
        path.write_bytes(cleaner(path.read_bytes()))
    path = ROOT / 'cv.md'
    text = plain(path.read_text())
    assert not PATTERN.search(text)
    path.write_text(text)
    path = ROOT / 'cv.html'
    text = plain(path.read_text())
    text = re.sub(r'(data:[^"\s]+?;base64,)([A-Za-z0-9+/=]+)', embedded, text)
    assert not PATTERN.search(re.sub(r'data:[^"\s]+?;base64,[A-Za-z0-9+/=]+', '', text))
    path.write_text(text)
    print('Cleaned the visible CV, embedded downloads and PDF / Word / Markdown files.')
