const [nodeMajor] = process.versions.node.split('.').map(Number);

if (nodeMajor !== 22) {
  console.error(
    `Node.js 22 LTS가 필요합니다. 현재 버전: ${process.versions.node}`
  );
  process.exit(1);
}

console.log(`환경 확인 완료: Node.js ${process.versions.node} · ${process.platform} · ${process.arch}`);
