import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', '.vite', 'coverage', '.cache', '.tmp']);
const requiredFiles = [
  'AGENTS.md',
  'README.md',
  'package.json',
  'package-lock.json',
  'index.html',
  'app.js',
  'style.css',
  'tests/coding-drawing.test.mjs'
];
const reservedWindowsName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const invalidWindowsCharacters = /[<>:"/\\|?*\u0000-\u001f]/;
const problems = [];
const seenCaseInsensitivePaths = new Map();
let checkedFiles = 0;

function validateSegment(segment, relativePath) {
  if (invalidWindowsCharacters.test(segment)) {
    problems.push(`${relativePath}: Windows에서 사용할 수 없는 문자가 있습니다.`);
  }
  if (/[ .]$/.test(segment)) {
    problems.push(`${relativePath}: 이름이 공백 또는 마침표로 끝납니다.`);
  }
  if (reservedWindowsName.test(segment)) {
    problems.push(`${relativePath}: Windows 예약 이름을 사용합니다.`);
  }
  if (segment === '.DS_Store' || segment.startsWith('._')) {
    problems.push(`${relativePath}: 운영체제 메타데이터 파일입니다.`);
  }
}

async function walk(directory, relativeDirectory = '') {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const relativePath = path.posix.join(relativeDirectory, entry.name);
    validateSegment(entry.name, relativePath);

    const foldedPath = relativePath.toLocaleLowerCase('en-US');
    const previousPath = seenCaseInsensitivePaths.get(foldedPath);
    if (previousPath && previousPath !== relativePath) {
      problems.push(`${relativePath}: ${previousPath}와 대소문자만 다른 충돌 경로입니다.`);
    } else {
      seenCaseInsensitivePaths.set(foldedPath, relativePath);
    }

    const absolutePath = path.join(directory, entry.name);
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      problems.push(`${relativePath}: 외장하드 간 이동에 불안정한 심볼릭 링크입니다.`);
      continue;
    }

    if (entry.isDirectory()) {
      await walk(absolutePath, relativePath);
    } else if (entry.isFile()) {
      checkedFiles += 1;
    }
  }
}

await walk(projectRoot);

for (const requiredFile of requiredFiles) {
  try {
    const stats = await lstat(path.join(projectRoot, requiredFile));
    if (!stats.isFile()) problems.push(`${requiredFile}: 필수 파일이 아닙니다.`);
  } catch {
    problems.push(`${requiredFile}: 필수 파일이 없습니다.`);
  }
}

if (problems.length > 0) {
  console.error('휴대성 검사 실패:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`휴대성 검사 완료: ${checkedFiles}개 파일 · Windows 이름 충돌 없음 · 심볼릭 링크 없음`);
