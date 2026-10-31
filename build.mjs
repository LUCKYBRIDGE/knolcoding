import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(root, 'dist');
// Only replace this project's generated output, never a caller-supplied path.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Unexpected build directory');

const SITE_URL = 'https://coding.knolquiz.com/';
const HOME_LABEL = '놀코딩 홈';

// Development-only files kept in the game folders but not deployed.
const skipNames = new Set([
  'node_modules', 'tests', 'scripts', 'dist', 'package.json', 'package-lock.json',
  'AGENTS.md', 'README.md', 'start-coding-playground.cmd', 'start-coding-playground.command', '.DS_Store'
]);

const games = [
  { id: 'algorithm-playground', patch: patchAlgorithmPlayground },
  { id: 'coding-drawing', patch: patchCodingDrawing }
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ['index.html', 'privacy.html', '404.html', 'style.css', 'brand-nav.mjs', 'privacy.mjs', '_headers']) {
  await cp(path.join(root, file), path.join(output, file));
}
await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });

for (const game of games) {
  const target = path.join(output, game.id);
  await cp(path.join(root, 'games', game.id), target, {
    recursive: true,
    filter: src => {
      const name = path.basename(src);
      return !skipNames.has(name) && !name.startsWith('._');
    }
  });
  await game.patch(target);
}

console.log(`Built static site in dist/ for ${SITE_URL} (no server or database required).`);

async function patchFile(filePath, transform) {
  const before = await readFile(filePath, 'utf8');
  const after = transform(before);
  await writeFile(filePath, after);
}

function replaceOnce(text, search, replacement, label) {
  if (!text.includes(search)) throw new Error(`Build patch target not found: ${label}`);
  return text.replace(search, replacement);
}

// The source already has a fixed "knol 홈" link to ../ ; rename it for this site.
async function patchAlgorithmPlayground(target) {
  await patchFile(path.join(target, 'index.html'), html => replaceOnce(
    html,
    'aria-label="knol 홈으로 이동">knol 홈</a>',
    `aria-label="${HOME_LABEL}으로 이동">${HOME_LABEL}</a>`,
    'algorithm-playground home link'
  ));
}

async function patchCodingDrawing(target) {
  await patchFile(path.join(target, 'index.html'), html => {
    if (html.includes('knolcoding-home-link')) return html;
    const match = html.match(/<div class="header-controls"[^>]*>\r?\n/);
    if (!match) throw new Error('Build patch target not found: coding-drawing header-controls');
    const link = `      <a class="knolcoding-home-link btn btn-secondary" href="../" aria-label="${HOME_LABEL}으로 이동" style="background: rgba(255, 255, 255, 0.15); border: 1.5px solid rgba(255, 255, 255, 0.3); color: #ffffff; font-weight: bold; text-decoration: none; display: inline-flex; align-items: center; justify-content: center;">${HOME_LABEL}</a>\n`;
    return html.replace(match[0], match[0] + link);
  });
  await patchFile(path.join(target, 'app.js'), js => replaceOnce(
    js,
    '실제 pinky-ne.com에서 만든 링크',
    `실제 ${new URL(SITE_URL).host}에서 만든 링크`,
    'coding-drawing local share note'
  ));
}
