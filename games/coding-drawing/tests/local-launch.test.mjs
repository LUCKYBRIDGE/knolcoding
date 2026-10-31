import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appJavaScript = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const worksheetJavaScript = await readFile(new URL('../worksheet.js', import.meta.url), 'utf8');
const styleSheet = await readFile(new URL('../style.css', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('file URL에서는 모듈을 요청하지 않고 실행 안내를 표시한다', () => {
  assert.doesNotMatch(indexHtml, /<script\s+type=["']module["'][^>]+src=["']\.\/app\.js["']/i);
  assert.match(indexHtml, /window\.location\.protocol === 'file:'/);
  assert.match(indexHtml, /import\('\.\/app\.js'\)/);
  assert.match(indexHtml, /id="file-launch-screen"/);
  assert.match(indexHtml, /start-coding-playground\.command/);
  assert.match(indexHtml, /start-coding-playground\.cmd/);
});

test('동적으로 불러온 앱도 문서 준비 시점과 관계없이 시작한다', () => {
  assert.match(appJavaScript, /document\.readyState === 'loading'/);
  assert.match(appJavaScript, /initializeApp\(\)/);
});

test('브라우저 첫 화면은 전체 문제은행 계산을 기다리지 않는다', () => {
  assert.match(appJavaScript, /ensurePresetProblemBankMode/);
  assert.doesNotMatch(appJavaScript, /Object\.hasOwn\(PRESET_LEVELS, mode\)/);
  assert.match(appJavaScript, /if \(typeof window === 'undefined'\) \{[\s\S]*expandPresetProblemBank\(PRESET_LEVELS\)/);
  assert.match(appJavaScript, /switchMode\(mode[\s\S]*ensurePresetProblemBankMode\(mode\)/);
});

test('도둑 잡기 입력도 이동 가능한 8방향만 제공한다', () => {
  assert.doesNotMatch(indexHtml, /id=["']wait-cmd-btn["']/);
  assert.match(indexHtml, /<button id=["']keypad-center["'][^>]+type=["']button["']/);
  assert.match(appJavaScript, /centerBtn\.setAttribute\('aria-hidden', 'true'\)/);
  assert.doesNotMatch(appJavaScript, /Numpad5|KeyP/);
});

test('미사일 활동에 최단 경로 여러 풀이 찾기를 제공한다', () => {
  assert.match(indexHtml, /<option value="multisolution">🧭 여러 풀이 찾기<\/option>/);
  assert.match(indexHtml, /id="multi-solution-panel"/);
  assert.match(indexHtml, /id="multi-solution-list"/);
  assert.match(appJavaScript, /getSupportedChallengeTypesForMode/);
  assert.match(appJavaScript, /getActiveMissileSolutionRule/);
  assert.match(appJavaScript, /recordMultiSolutionAttempt/);
  assert.match(appJavaScript, /formatCommandCombination/);
  assert.match(appJavaScript, /command-compact-editor/);
  assert.match(appJavaScript, /getMultiSolutionGoalCount/);
  assert.match(appJavaScript, /어떤 풀이를 입력해도 판정합니다/);
});

test('빠른 활동 전환에도 한붓그리기가 포함된다', () => {
  assert.match(indexHtml, /id="activity-tab-single-stroke"/);
  assert.match(indexHtml, /data-mode="single_stroke"/);
  assert.match(appJavaScript, /LEARNING_MODE_GROUPS/);
});

test('미사일 활동은 최단 이동과 최소 명령 풀이 기준을 제공한다', () => {
  assert.match(indexHtml, /id="missile-solution-rule-select"/);
  assert.match(indexHtml, /<option value="shortest" selected>📏 최단 이동<\/option>/);
  assert.match(indexHtml, /<option value="minimum_commands">🧩 최소 명령<\/option>/);
  assert.match(appJavaScript, /analyzeMinimumCommands/);
  assert.match(appJavaScript, /최소 명령 모드입니다/);
});

test('명령 조합은 번호와 연결 화살표로 순차구조를 보여 준다', () => {
  assert.match(indexHtml, /1번부터 차례대로 실행됩니다.*손잡이를 드래그하거나 방향키로 순서를 바꿀 수 있어요/);
  assert.match(appJavaScript, /orderHint\.textContent = [\s\S]*1번부터 화살표를 따라 차례대로 실행됩니다\./);
  assert.match(appJavaScript, /command-sequence-item/);
  assert.match(appJavaScript, /command-order-badge/);
  assert.match(appJavaScript, /command-sequence-connector/);
  assert.match(appJavaScript, /command-drag-handle/);
  assert.match(appJavaScript, /delete-glyph/);
  assert.match(styleSheet, /\.command-chip \.delete-glyph\s*\{[\s\S]*font-size: 13px;/);
});

test('기존 미사일 활동 안에 일곱 단계 개념 교육과 명령 블록 편집기를 제공한다', () => {
  assert.match(indexHtml, /id="missile-education-start-btn"/);
  assert.match(indexHtml, /id="missile-education-resume-btn"/);
  assert.match(indexHtml, /id="missile-education-start-btn"[^>]*>처음부터 시작<\/button>/);
  assert.match(indexHtml, /id="experience-kind-switch"/);
  assert.match(indexHtml, /id="education-kind-btn"/);
  assert.match(indexHtml, /id="challenge-kind-btn"/);
  assert.doesNotMatch(indexHtml, /<option value="education">/);
  assert.doesNotMatch(indexHtml, /<option value="infinite">/);
  assert.match(indexHtml, /<option value="stage" selected>🎲 자유 도전<\/option>/);
  assert.equal((indexHtml.match(/data-education-group="missile"/g) || []).length, 7);
  assert.match(indexHtml, /data-education-lesson="sequence"/);
  assert.match(indexHtml, /data-education-lesson="block_one"/);
  assert.match(indexHtml, /data-education-lesson="block_two"/);
  assert.match(indexHtml, /id="command-block-workspace"/);
  assert.match(indexHtml, /id="education-tool-policy"/);
  assert.match(indexHtml, /data-command-target="A"/);
  assert.match(indexHtml, /data-command-target="B"/);
  assert.match(appJavaScript, /evaluateEducationResult/);
  assert.match(appJavaScript, /assessOrderedFuelStops/);
  assert.match(appJavaScript, /canUseEducationDirection/);
  assert.match(appJavaScript, /allowDistanceEditing/);
  assert.match(styleSheet, /\.education-lesson-list/);
  assert.match(styleSheet, /\.command-block-workspace/);
  assert.match(styleSheet, /\.dir-btn\.education-locked/);
});

test('그림 활동 안에 세 단계 개념 교육과 전용 과제 안내를 제공한다', () => {
  assert.match(indexHtml, /id="drawing-education-start-btn"/);
  assert.match(indexHtml, /id="drawing-education-resume-btn"/);
  assert.match(indexHtml, /id="drawing-education-start-btn"[^>]*>처음부터 시작<\/button>/);
  assert.equal((indexHtml.match(/data-education-group="drawing"/g) || []).length, 3);
  assert.match(indexHtml, /data-education-lesson="draw_sequence"/);
  assert.match(indexHtml, /data-education-lesson="draw_methods"/);
  assert.match(indexHtml, /data-education-lesson="draw_minimum_commands"/);
  assert.match(indexHtml, /id="drawing-education-task-panel"/);
  assert.match(indexHtml, /id="drawing-education-reference"/);
  assert.match(indexHtml, /id="drawing-education-source-commands"/);
  assert.match(indexHtml, /id="fixed-drawing-actions"/);
  assert.match(indexHtml, /id="fixed-draw-submit-btn"/);
  assert.match(indexHtml, /id="fixed-draw-reset-btn"/);
  assert.match(appJavaScript, /evaluateDrawingEducationResult/);
  assert.match(appJavaScript, /assessDrawingEducationAttempt/);
  assert.match(appJavaScript, /setShowTargetGuide\(!this\.isFixedCommandDrawingMode\(\)\)/);
  assert.match(appJavaScript, /controlCard\.hidden = isFixedDrawing/);
  assert.match(appJavaScript, /document\.createElement\('span'\)/);
  assert.match(styleSheet, /\.drawing-education-task-panel/);
  assert.match(styleSheet, /\.fixed-drawing-actions/);
  assert.match(styleSheet, /\.main-container\.fixed-drawing-workspace/);
});

test('운영체제별 간편 실행 명령을 제공한다', () => {
  assert.equal(packageJson.scripts['start:local'], 'node scripts/start-local.mjs');
  assert.equal(packageJson.scripts.postinstall, 'node scripts/write-platform-stamp.mjs');
});

test('모바일 가로와 태블릿 가로는 모눈종이와 명령 패널을 나란히 배치한다', () => {
  assert.match(
    styleSheet,
    /@media \(orientation: landscape\) and \(min-width: 480px\) and \(max-height: 500px\)/
  );
  assert.match(
    styleSheet,
    /@media \(orientation: landscape\) and \(min-width: 700px\) and \(min-height: 501px\) and \(max-width: 1099px\)/
  );
  assert.match(styleSheet, /\.main-container\s*\{\s*display: grid;/);
  assert.match(styleSheet, /\.quick-mode-toggle\s*\{[\s\S]*?min-height: 44px;/);
  assert.doesNotMatch(styleSheet, /\.mission-banner/);
});

test('모바일 세로·가로에서 안전 영역과 다음 문제 위치를 보존한다', () => {
  assert.match(styleSheet, /min-height: 100dvh;/);
  assert.match(styleSheet, /env\(safe-area-inset-top\)/);
  assert.match(styleSheet, /env\(safe-area-inset-bottom\)/);
  assert.match(styleSheet, /\.grid-card,[\s\S]*scroll-margin-top:/);
  assert.match(appJavaScript, /scrollCurrentProblemIntoView/);
  assert.match(appJavaScript, /this\.isDrawingEducationMode\(\)[\s\S]*drawing-education-task-panel/);
  assert.match(appJavaScript, /document\.querySelector\('\.grid-card'\)/);
  assert.match(appJavaScript, /this\.currentLevel !== previousLevel/);
});

test('긴 팝업은 항상 보이는 닫기 버튼과 바깥 영역 닫기를 제공한다', () => {
  assert.equal((indexHtml.match(/class="modal-dismiss-btn"/g) || []).length, 3);
  assert.match(appJavaScript, /document\.querySelectorAll\('\.modal-backdrop'\)/);
  assert.match(appJavaScript, /event\.target === modal/);
  assert.match(styleSheet, /\.modal-dismiss-btn\s*\{[\s\S]*position: sticky;/);
});

test('도둑 잡기 장애물 안내를 화면에 제공한다', () => {
  assert.match(indexHtml, /id="chase-obstacle-note"/);
  assert.match(appJavaScript, /경찰과 도둑 모두 지나갈 수 없어요/);
});

test('수갑이 있는 도둑 잡기 문제는 선행 획득 규칙을 안내한다', () => {
  assert.match(indexHtml, /id="chase-handcuff-note"/);
  assert.match(appJavaScript, /수갑 칸을 지난 뒤에만 도둑을 체포할 수 있어요/);
  assert.match(appJavaScript, /수갑이 없어서 체포하지 못했어요/);
});

test('도둑 잡기 활동지 문제는 공개 도주 경로를 오류 없이 표시한다', () => {
  const problemCardSource = worksheetJavaScript.slice(
    worksheetJavaScript.indexOf('async createProblemCard('),
    worksheetJavaScript.indexOf('  createAnswerKeyCard(')
  );

  assert.match(problemCardSource, /modeType === 'chase'/);
  assert.match(problemCardSource, /stepTextHTML\s*=/);
  assert.match(problemCardSource, /공개된 복면 도둑 차례 경로/);
  assert.doesNotMatch(problemCardSource, /solutionHTML\s*=/);
});
