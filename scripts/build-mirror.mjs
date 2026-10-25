import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const required = ['cv.html', 'index.html', 'assets', 'publications', 'cv.pdf', 'cv.docx', 'cv.md'];
for (const name of required) {
  if (!existsSync(join(root, name))) throw new Error('Missing source: ' + name);
}
const outputOnly = (html) => html
  .replace(/<a\b[^>]*class=["'][^"']*\bmirror-entry\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '')
  .replace(/https:\/\/eliguli712\.github\.io\/Antiterrastrae\/(?:index\.html)?\??demo=1#antiterrastrae/gi, 'antiterrastrae?demo=1#antiterrastrae')
  .replace(/https:\/\/eliguli712\.github\.io\/Antiterrastrae\//gi, './');
const cv = outputOnly(readFileSync(join(root, 'cv.html'), 'utf8'))
  .replace(/<title>[\s\S]*?<\/title>/i, '<title>Eliguli</title>');
const demo = outputOnly(readFileSync(join(root, 'index.html'), 'utf8'))
  .replace(/<title>[\s\S]*?<\/title>/i, '<title>Antiterrastrae</title>');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const name of required.slice(2)) cpSync(join(root, name), join(out, name), { recursive: true });
writeFileSync(join(out, 'index.html'), cv);
writeFileSync(join(out, 'cv.html'), cv);
writeFileSync(join(out, 'antiterrastrae.html'), demo);
console.log('Built Eliguli: CV homepage, local prototype, publications and downloads.');
