"""Import the supplied TeX index as data and build a complete English directory.

No TeX commands or linked library documents are executed or downloaded. Original
file identities and library access links are retained in the catalog data.
"""
from collections import OrderedDict
from hashlib import sha256
import html
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'publications/index-source/Research_PDF_Index_2026-11-01.tex'
SECTION_NAMES = {
    '数学与计算': 'Mathematics and Computation',
    '古生物与力学': 'Palaeobiology and Mechanics',
    '声学与信号处理': 'Acoustics and Signal Processing',
    'NLP 与模型研究': 'NLP and Model Research',
    '人文与形式化讨论': 'Humanities and Formal Studies',
    '数学推导与实验补充': 'Mathematical Derivations and Experiments',
    '研究计划与技术记录': 'Research Plans and Technical Records',
    '已保存参考论文': 'Reference Literature',
    '架空生物与创作附录': 'Speculative Palaeobiology and Creative Work',
    '文本实验与创作附录': 'Text Experiments and Creative Work',
    '待进一步辨认的图像稿': 'Unidentified Image Documents',
    '相关源文件与数据包': 'Source Archives and Data Packages',
}
TITLES = {
    '立方 Wallis 乘积与整数 ζ 值的最优截断': ('cubic-wallis', 'Cubic Wallis Products and Optimal Truncation at Integer Zeta Values'),
    '多项式与隐式幂递推：C++ 算法与数值比较': ('polynomial-recurrences', 'Polynomial and Implicit Power Recurrences: C++ Algorithms and Numerical Comparisons'),
    '参数六次多项式的实根几何、判别式与 Galois 分析': ('sextic-polynomials', 'Real-Root Geometry, Discriminants and Galois Analysis of Parametric Sextic Polynomials'),
    'Poincaré 圆盘测地线排列着色与 Cayley 变换': ('poincare-shading', 'Geodesic Arrangement Shading in the Poincare Disk and the Cayley Transform'),
    'Steiner 链与 Pappus 链：递归反演、双链与旋转': ('circle-chains', 'Steiner and Pappus Chains: Recursive Inversion, Double Chains and Rotation'),
    '抽选消除模型：吸收 Markov 链、鞅与对称性': ('markov-symmetry', 'Draw-and-Eliminate Models: Absorbing Markov Chains, Martingales and Symmetry'),
    '从赌徒破产到线性算子：生成函数、多项式提升与延迟 DMD': ('formal-recurrences', 'From Gambler\'s Ruin to Linear Operators: Generating Functions, Polynomial Lifts and Delay DMD'),
    '集合观测多项模型：概率闭合与参数拟合': ('grouped-logit', 'Grouped-Observation Multinomial Models: Probability Closure and Parameter Fitting'),
    '挂谷型集合：条件归约与度量测度框架': ('kakeya', 'Kakeya-Type Sets: Conditional Reductions and Metric Measure Frameworks'),
    '随机游走、Brownian 运动与鞅校准': ('brownian-motion', 'Random Walks, Brownian Motion and Martingale Calibration'),
    '巨齿鲨牙齿尺度应力局域化：CT 校准、数值验证与区域敏感性': ('megalodon-mechanics', 'Tooth-Scale Stress Localisation in Megalodon: CT Calibration, Numerical Verification and Regional Sensitivity'),
    'Massa Corporis：大型鲸类与中生代海生爬行动物的体重比较': ('body-mass', 'Body Mass in Large Cetaceans and Mesozoic Marine Reptiles'),
    'De Natura Livyatanis：抹香鲸总科与暴龙类的平行系统讨论': ('livyatan-systematics', 'Livyatan: Parallel Systematics of Sperm Whales and Tyrannosauroids'),
    '海洋非滤食掠食者功能梯度与极限数据汇编': ('marine-predators', 'Functional Gradients and Limits in Non-Filter-Feeding Marine Predators'),
    '古地层学与新生代地质：勘误、证据分级与可检验假设': ('stratigraphy', 'Stratigraphy and Cenozoic Geology: Corrections, Evidence Grades and Testable Hypotheses'),
    '铁砧与荆棘之冠：圈养鲸类的生理与认知约束': ('captive-cetaceans', 'The Anvil and the Crown of Thorns: Physiological and Cognitive Constraints in Captive Cetaceans'),
    '先于文明的歌：海洋巨型动物智能的能量、认知与介质约束': ('song-before-civilisation', 'The Song Before Civilisation: Energetic, Cognitive and Medium Constraints on Marine Megafaunal Intelligence'),
    'Physeter Voice：STFT、频带能量、分段与节奏分析': ('physeter-voice', 'Physeter Voice: STFT, Band Energy, Segmentation and Rhythm Analysis'),
    '从 Ancient Greek UD 编译语义 DAG': ('greek-semantic-dags', 'Compiling Semantic DAGs from Ancient Greek Universal Dependencies'),
    'Gemini 条件效价、语义安全与目标扩张分析': ('gemini-analysis', 'Conditional Valence, Semantic Safety and Goal Expansion in Gemini'),
    'AI 辅助研究的价值与核查成本': ('ai-assisted-research', 'The Value and Verification Costs of AI-Assisted Research'),
    '开放信息生态系统：稳定性、通量预算与情景模拟': ('information-ecosystems', 'Open Information Ecosystems: Stability, Flux Budgets and Scenario Simulation'),
    'Kafka《审判》：回声定位、主体与制度过程': ('kafka-trial', 'Kafka\'s The Trial: Echolocation, Subjectivity and Institutional Processes'),
    '托勒密埃及：王权委托、腐败与衰落的边界': ('ptolemaic-egypt', 'Ptolemaic Egypt: Delegated Kingship, Corruption and the Limits of Decline'),
    '名实、雅俗与文化圈归化命名': ('cultural-naming', 'Names and Realities, Elite and Popular Culture, and Culturally Adapted Naming'),
    '圣像、共同信仰与帝国选制': ('imperial-elections', 'Icons, Shared Faith and Imperial Elections'),
    '古欧亚人群三元网络模型与证据协议': ('eurasian-networks', 'Ancient Eurasian Populations: A Ternary Network Model and Evidence Protocol'),
    'Ūhtcearu：语言、预刻之路与生成式注释': ('uhtcearu', 'Uhtcearu: Language, Predetermined Paths and Generative Commentary'),
    'Antiterrastrae：名称、希腊语形态与数学形式化': ('antiterrastrae-formalisation', 'Antiterrastrae: Naming, Greek Morphology and Mathematical Formalisation'),
    'Brownian 热半群与补偿子完整推导': ('brownian-derivations', 'Complete Derivations for the Brownian Heat Semigroup and Compensators'),
    '网球 Monte Carlo、Pareto 尾部与 KL 散度': ('probability-experiments', 'Tennis Monte Carlo, Pareto Tails and Kullback-Leibler Divergence'),
    '三角网格路径搜索比较图': ('mesh-pathfinding', 'Pathfinding Comparisons on Triangular Meshes'),
    'Eisenstein 素数与六角截断可视化': ('eisenstein-primes', 'Eisenstein Primes and Hexagonal Truncation Visualisations'),
    '巨齿鲨验证研究：预注册、经费与后续路线图': ('megalodon-research-plan', 'Megalodon Validation Research: Preregistration, Funding and Future Roadmap'),
    '古鲸、中兽类与犬熊类骨架结构比较研究计划': ('comparative-skeletons', 'A Comparative Skeletal Research Plan for Archaeocetes, Mesonychians and Amphicyonids'),
    '巨齿鲨完整 CT 网格修复与验证记录': ('ct-mesh-records', 'Full Megalodon CT Mesh Repair and Validation Records'),
    'NLP 工作文档': ('nlp-working-records', 'NLP Working Documents'),
    '巨齿鲨生物力学汇报与演讲稿': ('megalodon-presentations', 'Megalodon Biomechanics Presentations and Speaking Notes'),
    'StereoSet 论文阅读回应': ('stereoset-response', 'Reading Responses to the StereoSet Paper'),
    '巨齿鲨 CT 切片图册': ('ct-slice-atlases', 'Megalodon CT Slice Atlases'),
    'Zhao & Zhang：多材料拓扑优化设计梯度多孔仿骨结构': ('reference-zhao-zhang', 'Zhao and Zhang: Graded Porous Bone-Like Structures via Multi-Material Topology Optimisation'),
    'Luong 等：Invar–cenosphere 复合泡沫的结构与压缩性能': ('reference-luong', 'Luong et al.: Structure and Compression of Invar-Cenosphere Composite Foams'),
    'Wu 等：增材制造仿骨多孔填充拓扑优化': ('reference-wu', 'Wu et al.: Topology Optimisation of Additively Manufactured Bone-Like Porous Infill'),
    'Rowan 等：Sivameryx africanus 的首个头骨': ('reference-rowan', 'Rowan et al.: The First Skull of Sivameryx africanus'),
    'Kotek 等：Gender bias and stereotypes in Large Language Models': ('reference-kotek', 'Kotek et al.: Gender Bias and Stereotypes in Large Language Models'),
    'Blodgett 等：Language (Technology) is Power': ('reference-blodgett', 'Blodgett et al.: Language (Technology) Is Power'),
    '架空古生物与模拟论文': ('speculative-palaeobiology', 'Speculative Palaeobiology and Fictional Research Papers'),
    '虚构评论区文本与批评分析': ('fictional-comments', 'Fictional Comment Threads and Critical Analysis'),
    'Arcaniaei Aaineae：语言与法律文本创作': ('creative-language', 'Arcaniaei Aaineae: Creative Linguistic and Legal Texts'),
    'ba_ague_smaragd_manuscript.pdf': ('unidentified-image-manuscript', 'Unidentified Image-Based Manuscript: ba_ague_smaragd'),
    '源文件与数据包': ('source-archives', 'Source Files and Data Packages'),
}
HOSTED = {
    'markov-symmetry': 'K_class_q_copy_m_slot_markov_symmetry_report',
    'kakeya': 'kakeya-conditional-reduction', 'brownian-motion': 'brownian-motion-notes',
    'megalodon-mechanics': 'megalodon-9page-report', 'body-mass': 'massa-corporis',
    'song-before-civilisation': 'song-before-civilisation',
    'greek-semantic-dags': 'ancient-greek-semantic-dags',
    'probability-experiments': 'mathematical-probability-report',
}


def plain(text):
    return (text.replace(r'\allowbreak{}', '').replace(r'\_', '_').replace(r'\&', '&')
            .replace(r'\textemdash{}', '').strip())


def argument(text, start):
    if text[start] != '{':
        raise ValueError('Expected braced field')
    depth, cursor = 1, start + 1
    while depth:
        if cursor >= len(text): raise ValueError('Unclosed field')
        if text[cursor] == '\\': cursor += 2; continue
        if text[cursor] == '{': depth += 1
        if text[cursor] == '}': depth -= 1
        cursor += 1
    return text[start + 1:cursor - 1], cursor


def href(line):
    start = line.index(r'\href') + len(r'\href')
    url, end = argument(line, start)
    label, end = argument(line, end)
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc != 'chatgpt.com' or parsed.path != '/library':
        raise ValueError('Unexpected catalog link')
    identity = parse_qs(parsed.query)['file_id'][0]
    return identity, url, plain(label), line[end:]


def parse_source(text):
    section = group = ''
    groups = OrderedDict()
    primary_ids = []
    for line in text.splitlines():
        if re.match(r'^\d+ & ', line):
            primary_ids.append(href(line)[0])
        if line.startswith(r'\section{'):
            section, _ = argument(line, len(r'\section'))
        elif line.startswith(r'\groupheading{'):
            group, _ = argument(line, len(r'\groupheading'))
            group = plain(group)
        elif line.startswith(r'\href{'):
            identity, url, filename, tail = href(line)
            key, title = TITLES[group]
            if key not in groups:
                groups[key] = {'id': key, 'title': title, 'category': SECTION_NAMES[section],
                               'hosted_document': HOSTED.get(key), 'entries': []}
            cells = tail.rstrip('\\').split(' & ')
            pages = plain(cells[1])
            groups[key]['entries'].append({'id': identity, 'library_url': url,
                'source_filename': filename, 'primary': r'\primary' in cells[0],
                'pages': int(pages) if pages else None, 'listed_size': plain(cells[2]),
                'saved_date': plain(cells[3]), 'kind': 'archive' if filename.lower().endswith('.zip') else 'pdf'})
    flat = [entry for item in groups.values() for entry in item['entries']]
    assert len(flat) == 226 and len(primary_ids) == 29
    assert len({item['id'] for item in flat}) == 226
    assert sum(item['kind'] == 'pdf' for item in flat) == 223
    for item in groups.values():
        item['main_work'] = any(entry['id'] in primary_ids for entry in item['entries'])
        for number, entry in enumerate(item['entries'], 1):
            entry['title'] = item['title'] + (' — Source archive ' if entry['kind'] == 'archive' else ' — Version ') + f'{number:02d}'
    return list(groups.values())


def render_group(group):
    e = html.escape
    count = len(group['entries'])
    hosted = ''
    if group['hosted_document']:
        hosted = f'<a class="hosted-edition" href="reader.html?paper={e(group["hosted_document"])}">Read hosted edition ↗</a>'
    rows = []
    for entry in group['entries']:
        pages = '' if entry['kind'] == 'archive' else (f'{entry["pages"]} pages' if entry['pages'] else 'Page count not recorded')
        metadata = ' · '.join(value for value in [pages, entry['listed_size'], entry['saved_date']] if value)
        primary = '<span class="primary-label">Primary entry</span>' if entry['primary'] else ''
        rows.append(f'<li data-entry="{e(entry["id"])}"><a href="library-entry.html?entry={e(entry["id"])}">{e(entry["title"])}</a>{primary}<small>{e(metadata)}</small></li>')
    main = 'Main manuscript' if group['main_work'] else ('Reference literature' if group['category'] == 'Reference Literature' else 'Additional material')
    return f'''<details class="work-group" id="work-{group['id']}" data-category="{e(group['category'])}" data-title="{e(group['title'].lower())}"><summary><span><span class="work-category">{e(group['category'])} / {main}</span><strong>{e(group['title'])}</strong><small>{count} catalog {'entry' if count == 1 else 'entries'}</small></span><span class="expand" aria-hidden="true"></span></summary><div class="work-versions">{hosted}<ol>{''.join(rows)}</ol></div></details>'''


def main():
    source = SOURCE.read_bytes()
    groups = parse_source(source.decode())
    result = {'date': '2026-11-01', 'display_language': 'en', 'source_sha256': sha256(source).hexdigest(),
              'main_manuscripts': 29, 'pdf_entries': 223, 'source_archives': 3, 'groups': groups}
    out = ROOT / 'publications'
    (out / 'work-directory.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    options = ''.join(f'<option>{html.escape(category)}</option>' for category in SECTION_NAMES.values())
    document = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Research Works Directory · Eliguli Han</title><link rel="stylesheet" href="../assets/work-directory.css"><link rel="icon" href="data:,"></head><body>
<header class="directory-header"><a href="../cv.html#manuscripts" target="_top">← Return to CV</a><p>ELIGULI HAN / RESEARCH WORKS DIRECTORY</p><h1>Research, notes &amp; creative work.</h1><p class="directory-intro">The complete supplied index, with English titles and categories. Source documents retain their original languages. Research manuscripts, reference literature and creative work are labelled separately.</p><div class="directory-stats"><span><b>29</b> main manuscripts</span><span><b>223</b> PDF entries</span><span><b>3</b> source archives</span></div></header>
<main><aside class="access-note"><strong>Reading access</strong><p>Hosted editions open in this website's reader. Library versions open through your ChatGPT library and may require the account that owns the file. The index preserves versions and duplicate uploads; it does not make private library files public.</p></aside>
<form class="directory-tools" role="search"><label>Find a work<input id="work-search" type="search" placeholder="Search English titles"></label><label>Category<select id="work-category"><option value="">All categories</option>{options}</select></label><button type="button" id="expand-all">Expand visible entries</button><button type="button" id="collapse-all">Collapse all</button><span id="work-results" role="status">51 groups · 226 catalog entries</span></form>
<section id="work-groups" aria-label="Complete English works catalog">{''.join(render_group(group) for group in groups)}</section><p id="work-empty" hidden>No works match this search.</p><footer>Source index dated 1 November 2026, New York time. All 226 original file identities and access links are retained.</footer></main><script type="module" src="../assets/work-directory.js"></script></body></html>'''
    assert not re.search(r'[\u3400-\u9fff]', document)
    (out / 'research-index.html').write_text(document)
    print(f'Built an English directory: {len(groups)} groups, 223 PDFs, 3 archives, 29 main manuscripts')


if __name__ == '__main__':
    main()
