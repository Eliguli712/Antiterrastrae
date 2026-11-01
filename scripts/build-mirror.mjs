import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const required = ['cv.html', 'index.html', 'assets', 'publications', 'cv.pdf', 'cv.docx', 'cv.md', 'fea_research', 'downloads'];
for (const name of required) {
  if (!existsSync(join(root, name))) throw new Error('Missing source: ' + name);
}
// Both hosts serve the same source bytes, including titles and download links.
const cv = readFileSync(join(root, 'cv.html'), 'utf8');
const demo = readFileSync(join(root, 'index.html'), 'utf8');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const name of required.slice(2)) cpSync(join(root, name), join(out, name), { recursive: true });
// A named entry keeps relative archive assets in their directory after clean-URL redirects.
const researchDirectory = 'fea_research/high_res_meg_teeth';
writeFileSync(join(out, researchDirectory, 'archive.html'), readFileSync(join(root, researchDirectory, 'index.html')));
writeFileSync(join(out, 'index.html'), cv);
writeFileSync(join(out, 'cv.html'), cv);
writeFileSync(join(out, 'antiterrastrae.html'), demo);
console.log('Built Eliguli: CV homepage, local prototype, publications and downloads.');
