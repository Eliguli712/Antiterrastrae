"""Build the paper catalog and CV shelf from complete, unchanged local PDFs."""
from pathlib import Path
import hashlib
import html
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PUBLICATIONS = ROOT / 'publications'
DOCUMENTS = [
    ('megalodon-9page-report', 'Tooth-scale Stress Localisation in a µCT-derived Otodus megalodon Model',
     'Computational biomechanics', 'Revised technical report', '31 October 2026',
     'Calibrated geometry, numerical verification and regional sensitivity. Current condensed edition with the complete report content.'),
    ('massa-corporis', 'Massa Corporis et Densitas Architecturae',
     'Comparative palaeobiology', 'Working draft', 'October 2026',
     'Body-mass estimation in cetaceans and Mesozoic marine reptiles, with explicit scaling assumptions and alternative estimates.'),
    ('song-before-civilisation', 'The Song Before Civilisation / Das Lied vor der Zivilisation',
     'Theoretical ecology', 'Theoretical manuscript', 'July 2026',
     'Energetic, cognitive and medium constraints on marine megafaunal intelligence, cultural transmission and information persistence.'),
    ('ancient-greek-semantic-dags', 'Compiling Ancient Greek Semantic DAGs with Phoneme, Morpheme, and Lexeme Layers',
     'Computational linguistics', 'Course-project manuscript', 'May 2026',
     'Inspectable semantic graphs compiled from Ancient Greek Universal Dependencies, with corpus evaluation and explicit intermediate layers.'),
    ('brownian-motion-notes', 'From Random Walks to Brownian Motion',
     'Probability theory', 'Mathematical notes', 'September 2026',
     'Martingales, Lévy continuity, Donsker scaling, Wiener measure, Itô calculus, Girsanov and PDE methods.'),
    ('mathematical-probability-report', 'Tennis PMFs, Pareto Tails, Fires, and Kullback–Leibler Divergence',
     'Mathematical probability', 'Coursework report', '2026',
     'Complete solutions, reproducible computational output, exact and Monte Carlo checks, and visual verification.'),
    ('mathematical-statistics-practice', 'Mathematical Statistics: Midterm 1 Practice Set and Solutions',
     'Mathematical statistics', 'Study material', 'September 2026',
     'A mock exam, full solutions and correction audit. Included as mathematical study material, rather than a research manuscript.'),
    ('kakeya-conditional-reduction', 'Compact Limits and a Conditional Maximal-Function Reduction for Kakeya-Type Carriers',
     'Geometric measure theory', 'Conditional reduction note', 'July 2026',
     'Separates compactness from an explicitly assumed maximal-function estimate. The note does not claim a proof of the Kakeya conjecture.'),
    ('megalodon-20page-revised', 'Tooth-scale Stress Localisation: Expanded Revised Edition',
     'Research archive', 'Expanded technical report', '31 October 2026',
     'Expanded edition of the revised megalodon tooth-scale report.'),
    ('megalodon-26page-recalculated', 'Tooth-Level Finite-Element Analysis: Recalculated Archive',
     'Research archive', 'Earlier technical report', 'July 2026',
     'Earlier recalculated report preserved separately from the current calibrated experiment.'),
    ('megalodon-durf-report', 'Tooth-Level Finite-Element Analysis: Original DURF Report',
     'Research archive', 'Original technical report', 'July 2026',
     'Original DURF report, preserved as an earlier edition with its original assumptions.'),
]
LAST_FILE = 'K_class_q_copy_m_slot_markov_symmetry_report.pdf'


def describe(entry):
    slug, title, category, status, date, description = entry
    file = slug + '.pdf'
    path = PUBLICATIONS / file
    info = subprocess.run(['/usr/bin/pdfinfo', str(path)], check=True, capture_output=True, text=True).stdout
    pages = int(re.search(r'^Pages:\s+(\d+)', info, re.M)[1])
    assert pages > 0 and path.read_bytes().startswith(b'%PDF-')
    return dict(id=slug, file=file, title=title, category=category, status=status,
                date=date, description=description, pages=pages, bytes=path.stat().st_size,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest())


def disclosure(paper):
    escape = html.escape
    slug = paper['id']
    title = escape(paper['title'])
    reader = 'publications/reader.html?paper=' + slug
    size = f"{paper['bytes'] / 1_000_000:.2f} MB" if paper['bytes'] > 1_000_000 else f"{paper['bytes'] / 1_000:.0f} KB"
    return f'''<details class="paper-entry" id="paper-{slug}">
<summary><span><span class="paper-category">{escape(paper['category'])}</span><strong>{title}</strong><span class="paper-meta">{escape(paper['status'])} · {paper['pages']} pages · {escape(paper['date'])}</span></span><span class="paper-expand" aria-hidden="true"></span></summary>
<div class="paper-content"><p>{escape(paper['description'])}</p><div class="paper-actions"><a href="{reader}">Read full paper ↗</a><a href="publications/{escape(paper['file'])}" download="{escape(paper['file'])}">Download PDF ↓ <small>{size}</small></a></div><iframe data-reader="{reader}&amp;embedded=1" title="Complete paper: {title}" loading="lazy"></iframe><p class="paper-return"><a href="#cv">↑ Research CV</a></p></div>
</details>'''


def main():
    documents = [describe(entry) for entry in DOCUMENTS]
    # The requested Markov report must be the final document once supplied.
    # Do not fabricate or link an absent PDF.
    if (PUBLICATIONS / LAST_FILE).is_file():
        document = describe((LAST_FILE[:-4], '(K, q, m) Draw-and-Eliminate Models: Markov Chains, Martingales and Symmetry',
                             'Probability and algebra', 'Unified revised mathematical report', 'September 2026',
                             'A unified report on transition matrices, sampling without replacement, absorbing Markov chains, martingales, finite-group equivariance and character decompositions. Includes exact computations and visualisations. Original Chinese text with German terminology.'))
        documents.append(document)
    else:
        print('Still required from the author:', LAST_FILE)
    catalog = {'documents': documents}
    (PUBLICATIONS / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    source = (ROOT / 'cv.html').read_text()
    section = f'''<section class="manuscripts" id="manuscripts" aria-labelledby="manuscripts-title">
<header class="manuscripts-header"><div><p class="manuscripts-kicker">Research / Mathematics / Selected writing</p><h2 id="manuscripts-title">Works &amp; reading directory.</h2><p class="manuscripts-intro">Browse the complete supplied research index in English, or expand a hosted paper below to read its full text and download the original PDF.</p></div><span class="manuscripts-count">{len(documents):02d} <small>HOSTED PDFS</small></span></header>
<div class="complete-directory"><p class="paper-category">Complete supplied catalog / English edition</p><h3>29 main manuscripts. Every version retained.</h3><p>223 PDF entries and 3 source archives across research, mathematics, reference literature and creative work. Library entries retain their original access permissions.</p><a class="directory-launch" href="publications/research-index.html">Browse the complete English directory ↗</a><details class="paper-entry directory-disclosure" id="complete-work-directory"><summary><span><strong>Explore the complete index here</strong><span class="paper-meta">Search by English title or category · 226 catalog entries</span></span><span class="paper-expand" aria-hidden="true"></span></summary><div class="paper-content"><iframe data-reader="publications/research-index.html?embedded=1" title="Complete English research works directory" loading="lazy"></iframe></div></details></div>
<h3 class="hosted-heading">Complete papers hosted on this site</h3>
<ol class="paper-catalog">{''.join('<li>' + disclosure(paper) + '</li>' for paper in documents)}</ol>
</section>'''
    start = source.index('<section class="manuscripts"')
    end = source.index('<section class="artworks gallery-wall"', start)
    source = source[:start] + section + '\n' + source[end:]
    (ROOT / 'cv.html').write_text(source)
    print(f'Built {len(documents)} complete paper entries')


if __name__ == '__main__':
    main()
