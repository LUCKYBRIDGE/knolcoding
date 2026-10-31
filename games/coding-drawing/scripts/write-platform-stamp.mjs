import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const stampPath = path.join(projectRoot, 'node_modules', '.coding-drawing-platform.json');

const stamp = {
  platform: process.platform,
  arch: process.arch,
  nodeMajor: Number.parseInt(process.versions.node.split('.')[0], 10)
};

await mkdir(path.dirname(stampPath), { recursive: true });
await writeFile(stampPath, `${JSON.stringify(stamp, null, 2)}\n`, 'utf8');

console.log(`실행 환경 준비 완료: ${stamp.platform} ${stamp.arch} · Node.js ${stamp.nodeMajor}`);
