import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const stampPath = path.join(projectRoot, 'node_modules', '.coding-drawing-platform.json');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const expectedEnvironment = {
  platform: process.platform,
  arch: process.arch,
  nodeMajor: Number.parseInt(process.versions.node.split('.')[0], 10)
};

function runNpm(args) {
  return spawnSync(npmCommand, args, {
    cwd: projectRoot,
    stdio: 'inherit'
  });
}

if (expectedEnvironment.nodeMajor !== 22) {
  console.error(`Node.js 22 LTS가 필요합니다. 현재 버전: ${process.versions.node}`);
  console.error('https://nodejs.org/ 에서 Node.js 22 LTS를 설치한 뒤 다시 실행해 주세요.');
  process.exit(1);
}

const npmCheck = spawnSync(npmCommand, ['--version'], {
  cwd: projectRoot,
  encoding: 'utf8'
});

if (npmCheck.error || npmCheck.status !== 0) {
  console.error('npm을 찾을 수 없습니다. Node.js 22 LTS를 설치한 뒤 다시 실행해 주세요.');
  process.exit(1);
}

let installedEnvironment = null;
try {
  installedEnvironment = JSON.parse(await readFile(stampPath, 'utf8'));
} catch {
  // 첫 실행 또는 이전 방식으로 설치된 node_modules는 현재 컴퓨터 기준으로 다시 준비한다.
}

const needsInstall = Object.entries(expectedEnvironment).some(
  ([key, value]) => installedEnvironment?.[key] !== value
);

if (needsInstall) {
  console.log('현재 컴퓨터에 맞게 놀이터 실행 파일을 준비합니다. 처음 한 번만 시간이 조금 걸릴 수 있습니다.');
  const installResult = runNpm(['ci']);
  if (installResult.error || installResult.status !== 0) {
    console.error('필요한 실행 파일을 준비하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.');
    process.exit(installResult.status || 1);
  }
}

if (process.argv.includes('--prepare-only')) {
  console.log('현재 컴퓨터에서 실행할 준비가 끝났습니다.');
  process.exit(0);
}

console.log('모눈종이 코딩 놀이터를 엽니다. 이 창은 놀이터를 사용하는 동안 닫지 마세요.');
const devResult = runNpm(['run', 'dev', '--', '--open']);
process.exit(devResult.status || 0);
