import { cp, mkdir, readFile, rm } from 'node:fs/promises';
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

const games = ['algorithm-playground', 'coding-drawing'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ['index.html', 'privacy.html', '404.html', 'style.css', 'brand-nav.mjs', 'privacy.mjs', '_headers']) {
  await cp(path.join(root, file), path.join(output, file));
}
await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });

for (const id of games) {
  const target = path.join(output, id);
  await cp(path.join(root, 'games', id), target, {
    recursive: true,
    filter: src => {
      const name = path.basename(src);
      return !skipNames.has(name) && !name.startsWith('._');
    }
  });
  await checkGame(id, target);
}

console.log(`Built static site in dist/ for ${SITE_URL} (no server or database required).`);

// Both games carry the 놀코딩 home link in their own source. Fail the build if a
// game loses it or still points at the previous host, e.g. after re-syncing a copy.
async function checkGame(id, target) {
  const html = await readFile(path.join(target, 'index.html'), 'utf8');
  const homeLink = html.match(/<a\b[^>]*\bhref="\.\.\/"[^>]*>([^<]*)<\/a>/);
  if (!homeLink || !homeLink[1].includes(HOME_LABEL)) {
    throw new Error(`${id}/index.html is missing the ${HOME_LABEL} link to ../`);
  }
  const js = await readFile(path.join(target, 'app.js'), 'utf8');
  for (const leftover of ['pinky-ne.com', '핑키네']) {
    if (js.includes(leftover) || html.includes(leftover)) {
      throw new Error(`${id} still mentions ${leftover}`);
    }
  }
}
