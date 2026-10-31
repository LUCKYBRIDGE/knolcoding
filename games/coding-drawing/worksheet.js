/**
 * 모눈종이 코딩 놀이터 - A4 종이 활동지 인코더 & 인쇄/PDF 생성기
 * 초·중등 학교 현장에서 바로 사용할 수 있는 고화질 A4 종이 활동지 + 정답지(Answer Key) 자동 생성 모듈
 */

import { GridRenderer } from './grid.js';
import { CommandEngine, DIRECTIONS } from './command.js';

function formatCommandCombination(commands = []) {
  return CommandEngine.compressStepList(CommandEngine.expandToStepList(commands))
    .map(command => {
      const dir = command.dir || command.type || command.action;
      if (dir === 'PEN_DOWN') return '[🖌️ 붓 누르기]';
      if (dir === 'PEN_UP') return '[✋ 붓 떼기]';
      return `[${command.distance}${DIRECTIONS[dir]?.symbol || dir}]`;
    })
    .join(' ');
}

export const WorksheetGenerator = {
  escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  },

  /**
   * 지정된 설정에 따라 A4 종이 활동지 및 정답지 HTML을 생성하고 인쇄 창을 호출합니다.
   * @param {Object} options { mode, diff, count, title, includeAnswerKey }
   * @param {Object} PRESET_LEVELS
   */
  async generateAndPrint({ mode = 'mix', diff = '5', count = 4, title = '모눈종이 코딩 놀이터 - 8방향 알고리즘 코딩 활동지', includeAnswerKey = true }, PRESET_LEVELS) {
    let container = document.getElementById('printable-worksheet');
    if (!container) {
      container = document.createElement('div');
      container.id = 'printable-worksheet';
      document.body.appendChild(container);
    }
    container.innerHTML = '';

    const safeTitle = this.escapeHTML(title);

    // 1. 요청된 수만큼 문제 수집
    const problems = this.collectProblems(mode, diff, count, PRESET_LEVELS);

    // 2. A4 페이지 단위 생성 (1페이지당 정확히 2문제)
    const totalProblemPages = Math.ceil(problems.length / 2);
    const totalPages = includeAnswerKey ? totalProblemPages + 1 : totalProblemPages;

    for (let pageIdx = 0; pageIdx < totalProblemPages; pageIdx++) {
      const pageEl = document.createElement('div');
      pageEl.className = 'worksheet-page';

      // 헤더
      const headerEl = document.createElement('div');
      headerEl.className = 'worksheet-header';
      headerEl.innerHTML = `
        <div>
          <h1 class="ws-title">🧭 ${safeTitle}</h1>
          <p class="ws-sub">8방향 컴퓨팅 사고력 알고리즘 (입력 · 명령어 · 처리 · 출력) 연습지 (A4 규격)</p>
        </div>
        <div class="ws-student-box">
          <span>[ ____ 학년 ____ 반 ]</span>
          <span>이름: <strong>____________________</strong></span>
        </div>
      `;
      pageEl.appendChild(headerEl);

      // 페이지당 2개 문제 배치
      const pageProblemsContainer = document.createElement('div');
      pageProblemsContainer.className = 'worksheet-problems-wrapper';

      const p1 = problems[pageIdx * 2];
      const p2 = problems[pageIdx * 2 + 1];

      if (p1) {
        const card1 = await this.createProblemCard(p1, pageIdx * 2 + 1);
        pageProblemsContainer.appendChild(card1);
      }
      if (p2) {
        const card2 = await this.createProblemCard(p2, pageIdx * 2 + 2);
        pageProblemsContainer.appendChild(card2);
      }

      pageEl.appendChild(pageProblemsContainer);

      // 푸터
      const footerEl = document.createElement('div');
      footerEl.className = 'worksheet-footer';
      footerEl.innerHTML = `
        <span>페이지 ${pageIdx + 1} / ${totalPages}</span>
        <span>ⓒ 모눈종이 코딩 놀이터 알고리즘 교육용 활동지</span>
      `;
      pageEl.appendChild(footerEl);

      container.appendChild(pageEl);
    }

    // 3. 선생님용 정답지 (Answer Key) 페이지 자동 생성
    if (includeAnswerKey) {
      const akPageEl = document.createElement('div');
      akPageEl.className = 'worksheet-page answer-key-page';

      const akHeader = document.createElement('div');
      akHeader.className = 'worksheet-header';
      akHeader.innerHTML = `
        <div>
          <h1 class="ws-title">🔑 [선생님용 정답지] ${safeTitle}</h1>
          <p class="ws-sub">모눈종이 코딩 놀이터 모범 답안 및 채점 안내</p>
        </div>
        <div class="ws-student-box" style="background: #fef3c7; border: 1.5px solid #f59e0b;">
          <span style="color: #b45309; font-weight: bold;">교사용 채점 해설지</span>
        </div>
      `;
      akPageEl.appendChild(akHeader);

      const akContainer = document.createElement('div');
      akContainer.className = 'worksheet-problems-wrapper';
      akContainer.style.gap = '10px';

      for (let idx = 0; idx < problems.length; idx++) {
        const prob = problems[idx];
        const akCard = this.createAnswerKeyCard(prob, idx + 1);
        akContainer.appendChild(akCard);
      }

      akPageEl.appendChild(akContainer);

      const akFooter = document.createElement('div');
      akFooter.className = 'worksheet-footer';
      akFooter.innerHTML = `
        <span>페이지 ${totalPages} / ${totalPages} (정답지)</span>
        <span>ⓒ 모눈종이 코딩 놀이터 교사용 정답 해설지</span>
      `;
      akPageEl.appendChild(akFooter);

      container.appendChild(akPageEl);
    }

    // 4. 렌더링 완료 후 브라우저 인쇄 미리보기 실행
    setTimeout(() => {
      window.print();
    }, 350);
  },

  /**
   * 요청 조건에 맞는 문제 목록 추출
   */
  collectProblems(modeKey, diffKey, targetCount, PRESET_LEVELS) {
    const modesList = ['shortest', 'routing', 'debug', 'debug_guide', 'chase'];
    const results = [];
    const problemBags = new Map();
    const requestedSize = Number.parseInt(diffKey, 10);
    const targetSize = [5, 7, 9, 11].includes(requestedSize) ? requestedSize : 5;
    const mixedModes = targetSize === 11
      ? modesList.filter(mode => !['debug', 'debug_guide'].includes(mode))
      : modesList;

    const shuffle = values => {
      const shuffled = [...values];
      for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      return shuffled;
    };

    for (let i = 0; i < targetCount; i++) {
      const currentMode = (modeKey === 'mix')
        ? mixedModes[i % mixedModes.length]
        : modeKey;
      const currentTargetSize = (
        targetSize === 11 && ['debug', 'debug_guide'].includes(currentMode)
      ) ? 9 : targetSize;
      const rawPool = PRESET_LEVELS[currentMode] || PRESET_LEVELS.shortest;

      const flattenedPool = rawPool.flatMap(entry => Array.isArray(entry) ? entry : [entry]);
      const sizeMatchedPool = flattenedPool.filter(problem => problem?.gridSize === currentTargetSize);
      const candidatePool = sizeMatchedPool.length > 0 ? sizeMatchedPool : flattenedPool;
      const bagKey = `${currentMode}:${currentTargetSize}`;
      let bag = problemBags.get(bagKey) || [];
      if (bag.length === 0) bag = shuffle(candidatePool);
      const rawEntry = bag.shift();
      problemBags.set(bagKey, bag);

      const prob = JSON.parse(JSON.stringify(rawEntry));
      prob.modeType = currentMode;

      results.push(prob);
    }

    return results;
  },

  /**
   * 개별 문제 카드 HTML 및 오프스크린 High-DPI 캔버스 PNG 생성
   */
  async createProblemCard(problem, problemNum) {
    const cardEl = document.createElement('div');
    cardEl.className = 'worksheet-problem-card';

    // 1. 오프스크린 High-DPI (Retina 2x) 캔버스 생성하여 선명한 인쇄 이미지 생성
    const dpr = 2;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 400 * dpr;
    offCanvas.height = 400 * dpr;
    offCanvas.style.width = '400px';
    offCanvas.style.height = '400px';

    const renderer = new GridRenderer(offCanvas);
    renderer.setGridSize(problem.gridSize || 7);

    const isBrush = (problem.modeType === 'debug' || problem.modeType === 'debug_guide');
    renderer.setPlayerType(problem.modeType === 'chase' ? 'cop' : (isBrush ? 'brush' : 'missile'));

    if (problem.starPos) renderer.setStarPos(problem.starPos.x, problem.starPos.y);
    if (problem.goalPos) renderer.setGoalPos(problem.goalPos.x, problem.goalPos.y);
    if (problem.thiefPos) renderer.setThiefPos(problem.thiefPos.x, problem.thiefPos.y);
    if (problem.handcuffPos) renderer.setHandcuffPos(problem.handcuffPos.x, problem.handcuffPos.y);
    if (problem.obstacles) renderer.setObstacles(problem.obstacles);

    if (problem.targetLines && problem.modeType === 'debug') {
      renderer.setShowTargetGuide(true);
      renderer.setTargetLines(problem.targetLines);
    } else {
      renderer.setShowTargetGuide(false);
    }

    renderer.render();

    const imgDataUrl = offCanvas.toDataURL('image/png');

    const modeBadgeMap = {
      shortest: '🎯 미사일 이동',
      routing: '🧭 장애물 피하기',
      debug: '🎨 그림 보고 명령어 만들기',
      debug_guide: '📜 명령어 따라 그림 그리기',
      chase: '👮‍♂️ 도둑 잡기'
    };

    let stepTextHTML = '';
    if (problem.modeType === 'debug_guide' && problem.initialCommands) {
      const stepItems = problem.initialCommands.map((c, idx) => {
        return `<span class="ws-cmd-badge">${idx + 1}단계: ${formatCommandCombination([c])}</span>`;
      }).join(' ');
      stepTextHTML = `<div class="ws-step-box">📌 <b>주어진 코딩 순서</b>: ${stepItems}</div>`;
    } else if (problem.modeType === 'chase' && problem.thiefCommands) {
      const expanded = [];
      problem.thiefCommands.forEach(c => {
        const symbol = DIRECTIONS[c.dir]?.symbol || '';
        for (let i = 0; i < c.distance; i++) expanded.push(symbol);
      });
      const stepItems = expanded.map((sym, idx) => `${idx + 1}차례: [1${sym}]`).join(' ➡️ ');
      stepTextHTML = `<div class="ws-step-box">🥷 <b>공개된 복면 도둑 차례 경로</b>: ${stepItems}</div>`;
    }

    const directionGuide = '↖(왼쪽 위) ↑(위) ↗(오른쪽 위) ←(왼쪽) →(오른쪽) ↙(왼쪽 아래) ↓(아래) ↘(오른쪽 아래)';

    cardEl.innerHTML = `
      <div class="ws-card-left">
        <img src="${imgDataUrl}" class="ws-grid-img" alt="모눈종이 문제 그림">
      </div>
      <div class="ws-card-right">
        <div class="ws-problem-header">
          <span class="ws-prob-num">[문제 ${problemNum}]</span>
          <span class="ws-prob-type">${modeBadgeMap[problem.modeType] || '알고리즘 미션'} (${problem.gridSize}x${problem.gridSize})</span>
        </div>
        <p class="ws-guide">${problem.guide || '목적지에 도달하는 코드를 완성하세요!'}</p>
        ${stepTextHTML}
        
        <div class="ws-answer-area">
          <div class="ws-answer-title">
            <span>✏️ [입력] 8방향 순차 알고리즘 명령어 작성란 (총 12단계):</span>
          </div>
          <div class="ws-arrow-legend-bar">
            <span>💡 방향 기호 안내: ${directionGuide}</span>
          </div>
          <div class="ws-answer-grid">
            ${Array(12).fill(0).map((_, i) => `
              <div class="ws-ans-box">
                <span class="ws-box-num">${i + 1}단계</span>
                <div class="ws-box-input"></div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="ws-check-area">
          <span>선생님 확인: ⭐ ⭐ ⭐ ⭐ ⭐</span>
          <span>( _____점 / _____점 )</span>
        </div>
      </div>
    `;

    return cardEl;
  },

  /**
   * 정답지 카드 HTML 생성
   */
  createAnswerKeyCard(problem, problemNum) {
    const card = document.createElement('div');
    card.className = 'worksheet-answer-key-card';

    let solutionHTML = '';

    if (problem.modeType === 'debug_guide' && problem.initialCommands) {
      const steps = problem.initialCommands.map((c, idx) => {
        return `<span class="ws-ak-step">${idx + 1}단계: ${formatCommandCombination([c])}</span>`;
      }).join(' ➡️ ');
      solutionHTML = `<div><b>정답 그림 경로:</b> ${steps} (주어진 명령어대로 모눈종이에 그림을 완성함)</div>`;
    } else if (problem.modeType === 'chase' && problem.thiefCommands) {
      const analysis = CommandEngine.analyzeChaseCapturePlans(
        problem.starPos,
        problem.thiefPos,
        problem.thiefCommands,
        problem.gridSize || 7,
        problem.obstacles || [],
        problem.handcuffPos || null
      );
      const steps = (analysis?.commands || []).map((command, index) => {
        return `<span class="ws-ak-step">${index + 1}차례: ${formatCommandCombination([command])}</span>`;
      }).join(' ➡️ ');
      solutionHTML = analysis
        ? `
          <div><b>가장 이른 체포 모범 답안:</b> ${steps}</div>
          ${problem.handcuffPos ? '<div><b>필수 조건:</b> 수갑 칸을 먼저 지난 뒤 도둑을 체포함</div>' : ''}
          <div><b>체포 차례:</b> ${analysis.earliestTurn}차례 · <b>가능한 최적 명령열:</b> ${analysis.pathCount.toLocaleString('ko-KR')}가지</div>
          <div>※ 위 답은 여러 최적 답안 중 한 예시이며, 같은 차례에 체포하는 다른 명령도 정답입니다.</div>
        `
        : '<div><b>모범 답안 생성 실패:</b> 도둑을 체포할 수 있는 경로를 찾지 못했습니다.</div>';
    } else if (problem.starPos && problem.goalPos) {
      const optCmds = CommandEngine.findShortestPath(
        problem.starPos,
        problem.goalPos,
        problem.gridSize || 7,
        problem.obstacles || []
      );
      const analysis = CommandEngine.analyzeShortestPaths(
        problem.starPos,
        problem.goalPos,
        problem.gridSize || 7,
        problem.obstacles || []
      );
      const steps = optCmds.map((c, idx) => {
        return `<span class="ws-ak-step">${idx + 1}단계: ${formatCommandCombination([c])}</span>`;
      }).join(' ➡️ ');
      solutionHTML = optCmds.length > 0
        ? `
          <div><b>장애물을 피하는 최단 모범 답안:</b> ${steps}</div>
          <div><b>최단 이동:</b> ${analysis.distance}칸 · <b>가능한 최단 명령열:</b> ${analysis.pathCount.toLocaleString('ko-KR')}가지</div>
          <div>※ 위 답은 여러 최단 답안 중 한 예시이며, 같은 길이의 다른 안전 경로도 정답입니다.</div>
        `
        : '<div><b>모범 답안 생성 실패:</b> 현재 배치에서는 목표점까지 이동할 수 없습니다.</div>';
    } else if (problem.targetLines) {
      const minimumDistance = CommandEngine.getMinimumDrawingDistance(
        problem.starPos,
        problem.targetLines
      );
      solutionHTML = `
        <div><b>그림 완성 기준:</b> 제시된 모든 선을 빠짐없이 그리고 목표에 없는 선을 추가하지 않습니다.</div>
        <div><b>최소 붓 이동:</b> ${minimumDistance}칸</div>
        <div>※ 선을 그리는 순서·진행 방향·되짚는 위치가 달라도 최종 그림이 같으면 정답입니다.</div>
      `;
    } else {
      solutionHTML = `<div><b>모범 답안:</b> 주어진 모눈종이 교차점 좌표에 맞춰 순차 알고리즘 코딩 완료.</div>`;
    }

    const modeNames = {
      shortest: '🎯 미사일 이동',
      routing: '🧭 장애물 피하기',
      debug: '🎨 그림 보고 만들기',
      debug_guide: '📜 명령어 따라 그림 그리기',
      chase: '👮‍♂️ 도둑 잡기'
    };

    card.innerHTML = `
      <div class="ws-ak-header">
        [문제 ${problemNum}] ${modeNames[problem.modeType] || '알고리즘 문제'} (${problem.gridSize}x${problem.gridSize})
      </div>
      <div class="ws-ak-solution">
        ${solutionHTML}
      </div>
    `;

    return card;
  },

  /**
   * 출제자가 직접 만든 퍼즐을 A4 종이 활동지로 인쇄/PDF 생성
   */
  async generateCustomAndPrint(puzzleData, title = '내가 직접 만든 알고리즘 코딩 활동지') {
    let container = document.getElementById('printable-worksheet');
    if (!container) {
      container = document.createElement('div');
      container.id = 'printable-worksheet';
      document.body.appendChild(container);
    }
    container.innerHTML = '';

    const pageEl = document.createElement('div');
    pageEl.className = 'worksheet-page';

    const safeTitle = this.escapeHTML(title);

    // 헤더
    const headerEl = document.createElement('div');
    headerEl.className = 'worksheet-header';
    headerEl.innerHTML = `
      <div>
        <h1 class="ws-title">🧭 ${safeTitle}</h1>
        <p class="ws-sub">나만의 8방향 모눈종이 출제 문제 (A4 규격)</p>
      </div>
      <div class="ws-student-box">
        <span>[ ____ 학년 ____ 반 ]</span>
        <span>풀이 학생 이름: <strong>____________________</strong></span>
      </div>
    `;
    pageEl.appendChild(headerEl);

    const pageProblemsContainer = document.createElement('div');
    pageProblemsContainer.className = 'worksheet-problems-wrapper';

    // 1번째 카드: 출제한 문제
    const prob1 = JSON.parse(JSON.stringify(puzzleData));
    prob1.modeType = puzzleData.puzzleType === 'draw' ? 'debug' : 'shortest';
    prob1.title = `[문제 1] ${puzzleData.title || '내가 출제한 문제'}`;

    const card1 = await this.createProblemCard(prob1, 1);
    pageProblemsContainer.appendChild(card1);

    // 2번째 카드: 동일 출제 문제 (친구 풀이용 또는 연습용)
    const prob2 = JSON.parse(JSON.stringify(puzzleData));
    prob2.modeType = puzzleData.puzzleType === 'draw' ? 'debug' : 'routing';
    prob2.title = `[문제 2] ${puzzleData.title || '내가 출제한 문제'} (응용)`;

    const card2 = await this.createProblemCard(prob2, 2);
    pageProblemsContainer.appendChild(card2);

    pageEl.appendChild(pageProblemsContainer);

    // 푸터
    const footerEl = document.createElement('div');
    footerEl.className = 'worksheet-footer';
    footerEl.innerHTML = `
      <span>페이지 1 / 1</span>
      <span>ⓒ 모눈종이 코딩 놀이터 나만의 출제 문제 활동지</span>
    `;
    pageEl.appendChild(footerEl);

    container.appendChild(pageEl);

    setTimeout(() => {
      window.print();
    }, 350);
  }
};
