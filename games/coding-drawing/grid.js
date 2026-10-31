/**
 * 별빛 탐험대 - 그리드 캔버스 및 별 트레이싱 렌더러
 * Retina 고해상도 지원 HTML5 Canvas 기반의 모눈종이 렌더링 시스템
 */

export function calculateCanvasShellSize({
  viewportHeight,
  cardInnerWidth,
  toolbarHeight = 0,
  contentBeforeHeight = 0,
  cardVerticalPadding = 0,
  shellHorizontalPadding = 0,
  minimumReadableSize = 0,
  safetyMargin = 10,
  maxCanvasSize = 640
}) {
  const values = [
    viewportHeight,
    cardInnerWidth,
    toolbarHeight,
    contentBeforeHeight,
    cardVerticalPadding,
    shellHorizontalPadding,
    minimumReadableSize,
    safetyMargin,
    maxCanvasSize
  ];
  if (values.some(value => !Number.isFinite(value))) return 0;

  const heightLimit = viewportHeight
    - Math.max(0, toolbarHeight)
    - Math.max(0, contentBeforeHeight)
    - Math.max(0, cardVerticalPadding)
    - Math.max(0, safetyMargin);
  const widthLimit = Math.max(0, cardInnerWidth);
  const maximumShellSize = Math.max(0, maxCanvasSize + shellHorizontalPadding);

  // 화면 높이가 짧더라도 모눈을 알아볼 수 없을 만큼 축소하지 않는다. 높이가
  // 부족한 경우에는 페이지가 세로로 스크롤되게 두고, 카드 너비는 항상 지킨다.
  const readableHeightLimit = Math.max(heightLimit, Math.max(0, minimumReadableSize));
  return Math.max(0, Math.floor(Math.min(widthLimit, readableHeightLimit, maximumShellSize)));
}

export class GridRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} options
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this.gridSize = options.gridSize || 7; // 기본 7x7
    this.starPos = options.starPos || { x: 3, y: 3 }; // 0-indexed (0..6)
    this.goalPos = options.goalPos || { x: 5, y: 5 };
    this.obstacles = options.obstacles || []; // [{x, y}]
    this.checkpoints = options.checkpoints || [];
    this.visitedCheckpointCount = options.visitedCheckpointCount || 0;
    this.fuelStops = options.fuelStops || [];
    this.visitedFuelCount = options.visitedFuelCount || 0;
    
    this.drawnLines = []; // [{fromX, fromY, toX, toY, color}]
    this.targetLines = []; // 그려야 하는 목적지 궤적 (모드 3/4용)
    this.ghostPathLines = []; // 사용자 붓 이동 라이브 예약선
    this.showGhostTrail = false; // 예약선 토글 플래그 (기본값 OFF)
    
    this.cellSize = 0;
    this.padding = 40;
    this.isEditing = false;
    this.activeExplosion = null;
    this.activeCelebration = null;
    this.activeJailBars = null;
    this.effectRunId = 0;
    this.starAngle = 0; // 플레이어 이동 방향 회전각 (라디안)
    this.playerType = options.playerType || 'missile'; // 'missile' (🚀), 'brush' (🖌️), 'cop' (👮‍♂️)
    this.isPenDown = options.isPenDown !== false; // 붓 누름 (true) / 붓 뗌 (false)
    this.thiefPos = options.thiefPos || null; // 도둑 위치 (🦹‍♂️)
    this.handcuffPos = options.handcuffPos || null; // 경찰이 먼저 획득해야 하는 수갑 위치
    this.showTargetGuide = true; // Mode 4 (명령어 따라 그림 그리기)에서는 보조선 숨김
    
    this.setupResizeObserver();
  }

  setPlayerType(type) {
    this.playerType = type;
    this.render();
  }

  setPenDown(isPen) {
    this.isPenDown = isPen !== false;
    this.render();
  }

  setThiefPos(x, y) {
    this.thiefPos = (x !== null && y !== null && x !== undefined && y !== undefined) ? { x, y } : null;
    this.render();
  }

  setHandcuffPos(x, y) {
    this.handcuffPos = (x !== null && y !== null && x !== undefined && y !== undefined)
      ? { x, y }
      : null;
    this.render();
  }

  setupResizeObserver() {
    const wrapper = this.canvas.parentElement;
    const card = wrapper?.closest('.grid-card');

    // 활동지용 오프스크린 캔버스처럼 문서에 붙지 않은 캔버스는
    // 화면 카드 관찰 없이 지정된 CSS 크기와 고해상도 배율로 바로 렌더링한다.
    if (!wrapper || !card) {
      const cssWidth = parseFloat(this.canvas.style.width)
        || this.canvas.clientWidth
        || this.canvas.width
        || 400;
      const cssHeight = parseFloat(this.canvas.style.height)
        || this.canvas.clientHeight
        || this.canvas.height
        || cssWidth;
      const size = Math.min(cssWidth, cssHeight);
      const backingRatio = Math.max(
        1,
        Math.min(this.canvas.width / cssWidth, this.canvas.height / cssHeight)
      );

      this.canvas.width = Math.round(size * backingRatio);
      this.canvas.height = Math.round(size * backingRatio);
      this.canvas.style.width = `${size}px`;
      this.canvas.style.height = `${size}px`;
      this.padding = Math.min(40, size * 0.12);
      this.cellSize = (size - this.padding * 2) / (this.gridSize - 1);
      this.ctx.setTransform(backingRatio, 0, 0, backingRatio, 0, 0);
      this.render();
      return;
    }

    let resizeFrame = 0;
    let lastShellSize = 0;
    let lastOrientation = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';

    const resize = () => {
      if (!wrapper || !card) return;

      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const currentOrientation = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
      const orientationChanged = currentOrientation !== lastOrientation;
      lastOrientation = currentOrientation;
      const cardStyle = window.getComputedStyle(card);
      const wrapperStyle = window.getComputedStyle(wrapper);
      const toolbar = document.querySelector('.workspace-mode-toolbar');
      const toolbarStyle = toolbar ? window.getComputedStyle(toolbar) : null;
      const toolbarIsVisible = toolbar
        && toolbarStyle?.display !== 'none'
        && toolbar.getBoundingClientRect().height > 0;
      const toolbarHeight = toolbarIsVisible
        ? toolbar.getBoundingClientRect().height
          + (parseFloat(toolbarStyle.top) || 0)
          + (parseFloat(toolbarStyle.marginBottom) || 0)
        : 0;

      const cardPaddingLeft = parseFloat(cardStyle.paddingLeft) || 0;
      const cardPaddingRight = parseFloat(cardStyle.paddingRight) || 0;
      const cardVerticalPadding = (parseFloat(cardStyle.paddingTop) || 0)
        + (parseFloat(cardStyle.paddingBottom) || 0);
      const cardInnerWidth = card.clientWidth - cardPaddingLeft - cardPaddingRight;
      const cardGap = parseFloat(cardStyle.rowGap || cardStyle.gap) || 0;
      const wrapperIndex = Array.from(card.children).indexOf(wrapper);
      const visibleElementsBeforeWrapper = Array.from(card.children)
        .slice(0, Math.max(0, wrapperIndex))
        .filter(element => window.getComputedStyle(element).display !== 'none');
      const contentBeforeHeight = visibleElementsBeforeWrapper.reduce(
        (total, element) => total + element.getBoundingClientRect().height,
        0
      ) + cardGap * visibleElementsBeforeWrapper.length;
      const shellHorizontalPadding = (parseFloat(wrapperStyle.paddingLeft) || 0)
        + (parseFloat(wrapperStyle.paddingRight) || 0);
      const minimumReadableCanvasSize = currentOrientation === 'landscape' && viewportHeight <= 500
        ? 180
        : (window.innerWidth <= 480 ? 220 : 280);
      const shellSize = calculateCanvasShellSize({
        viewportHeight,
        cardInnerWidth,
        toolbarHeight,
        contentBeforeHeight,
        cardVerticalPadding,
        shellHorizontalPadding,
        minimumReadableSize: minimumReadableCanvasSize + shellHorizontalPadding
      });
      if (shellSize <= 0) return;

      const contentWidth = shellSize - shellHorizontalPadding;
      const contentHeight = shellSize
        - (parseFloat(wrapperStyle.paddingTop) || 0)
        - (parseFloat(wrapperStyle.paddingBottom) || 0);
      const size = Math.min(contentWidth, contentHeight, 640);
      if (!Number.isFinite(size) || size <= 0) return;

      if (lastShellSize !== shellSize) {
        wrapper.style.width = `${shellSize}px`;
        wrapper.style.height = `${shellSize}px`;
        lastShellSize = shellSize;
      }

      const dpr = window.devicePixelRatio || 1;
      this.padding = Math.min(40, size * 0.12);
      
      this.canvas.width = size * dpr;
      this.canvas.height = size * dpr;
      this.canvas.style.width = `${size}px`;
      this.canvas.style.height = `${size}px`;
      
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cellSize = (size - this.padding * 2) / (this.gridSize - 1);
      
      this.render();

      if (orientationChanged && document.body.dataset.view === 'play') {
        requestAnimationFrame(() => {
          const toolbarBottom = toolbar?.getBoundingClientRect().bottom || 0;
          const targetScrollY = window.scrollY
            + card.getBoundingClientRect().top
            - toolbarBottom
            - 6;
          window.scrollTo({ top: Math.max(0, targetScrollY), behavior: 'auto' });
        });
      }
    };

    const scheduleResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resize);
    };

    window.addEventListener('resize', scheduleResize);
    window.visualViewport?.addEventListener('resize', scheduleResize);

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(scheduleResize);
      [
        card,
        card.querySelector('.card-title'),
        card.querySelector('.status-banner'),
        document.querySelector('.workspace-mode-toolbar')
      ].filter(Boolean).forEach(element => observer.observe(element));
    }

    setTimeout(scheduleResize, 50);
  }

  setGridSize(size) {
    this.gridSize = Math.max(5, Math.min(12, size));
    const sizePx = parseFloat(this.canvas.style.width) || 400;
    this.padding = Math.min(40, sizePx * 0.12);
    this.cellSize = (sizePx - this.padding * 2) / (this.gridSize - 1);
    this.render();
  }

  setStarPos(x, y, dx = 0, dy = 0) {
    this.starPos = { x, y };
    if (dx !== 0 || dy !== 0) {
      this.starAngle = Math.atan2(dy, dx) + Math.PI / 4;
    }
    this.render();
  }

  setGoalPos(x, y) {
    this.goalPos = { x, y };
    this.render();
  }

  setObstacles(obstacles) {
    this.obstacles = obstacles;
    this.render();
  }

  setCheckpoints(checkpoints = []) {
    this.checkpoints = Array.isArray(checkpoints) ? checkpoints.map(point => ({ ...point })) : [];
    this.render();
  }

  setVisitedCheckpointCount(count = 0) {
    this.visitedCheckpointCount = Math.max(
      0,
      Math.min(this.checkpoints.length, Math.trunc(count || 0))
    );
    this.render();
  }

  setFuelStops(fuelStops = []) {
    this.fuelStops = Array.isArray(fuelStops) ? fuelStops.map(stop => ({ ...stop })) : [];
    this.render();
  }

  setVisitedFuelCount(count = 0) {
    this.visitedFuelCount = Math.max(0, Math.min(this.fuelStops.length, Math.trunc(count || 0)));
    this.render();
  }

  setTargetLines(lines) {
    this.targetLines = lines;
    this.render();
  }

  setShowTargetGuide(show) {
    this.showTargetGuide = show;
    this.render();
  }

  setGhostPathLines(lines = []) {
    this.ghostPathLines = lines;
    this.render();
  }

  setShowGhostTrail(show) {
    this.showGhostTrail = show;
    this.render();
  }

  clearDrawnLines() {
    this.drawnLines = [];
    this.isPenDown = true;
    this.starAngle = 0;
    this.cancelEffects();
    this.render();
  }

  setDrawnLines(lines = []) {
    this.drawnLines = lines.map(line => ({ ...line }));
    this.render();
  }

  cancelEffects() {
    this.effectRunId += 1;
    this.activeExplosion = null;
    this.activeCelebration = null;
    this.activeJailBars = null;
    const cardContainer = this.canvas.closest('.glass-card') || this.canvas.parentElement;
    cardContainer?.classList.remove('shake-screen');
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(0); } catch {}
    }
    this.render();
  }

  /**
   * 캔버스 픽셀 좌표 (px, py)를 모눈종이 교차점 격자 좌표 (x, y)로 변환
   * @param {number} px
   * @param {number} py
   * @returns {{x: number, y: number}}
   */
  pixelToGrid(px, py) {
    const gridX = Math.round((px - this.padding) / this.cellSize);
    const gridY = Math.round((py - this.padding) / this.cellSize);

    const clampedX = Math.max(0, Math.min(this.gridSize - 1, gridX));
    const clampedY = Math.max(0, Math.min(this.gridSize - 1, gridY));

    return { x: clampedX, y: clampedY };
  }

  addDrawnLine(fromX, fromY, toX, toY, color = '#38bdf8') {
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (dx !== 0 || dy !== 0) {
      this.starAngle = Math.atan2(dy, dx) + Math.PI / 4;
    }
    this.drawnLines.push({ fromX, fromY, toX, toY, color });
    this.render();
  }

  gridToPixel(x, y) {
    return {
      px: this.padding + x * this.cellSize,
      py: this.padding + y * this.cellSize
    };
  }

  render() {
    const width = parseFloat(this.canvas.style.width) || 400;
    const height = parseFloat(this.canvas.style.height) || 400;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    // 1. 모눈종이 배경 및 Cartesian (0,0) 중앙 중심 격자선 그리기
    const mid = Math.floor(this.gridSize / 2);
    const isBrushActivity = (this.playerType === 'brush');

    ctx.font = '11px "Outfit", "Noto Sans KR", sans-serif';

    // 1-A. 기본 모눈 격자선 렌더링 (고대비 선명화)
    for (let i = 0; i < this.gridSize; i++) {
      const pos = this.padding + i * this.cellSize;
      const isCenterAxis = (i === mid);

      // 격자선 선명도 및 두께 조율
      if (isCenterAxis) {
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      } else {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.52)';
      }

      // 세로선 (X축 격자)
      ctx.beginPath();
      ctx.moveTo(pos, this.padding);
      ctx.lineTo(pos, height - this.padding);
      ctx.stroke();

      // 가로선 (Y축 격자)
      ctx.beginPath();
      ctx.moveTo(this.padding, pos);
      ctx.lineTo(width - this.padding, pos);
      ctx.stroke();

      // Cartesian 좌표 라벨 계산 (중앙 = 0)
      const cx = i - mid;
      const cy = mid - i;

      const labelX = cx > 0 ? `+${cx}` : `${cx}`;
      const labelY = cy > 0 ? `+${cy}` : `${cy}`;

      ctx.fillStyle = isCenterAxis ? '#38bdf8' : 'rgba(148, 163, 184, 0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelX, pos, this.padding - 18);
      ctx.fillText(labelY, this.padding - 20, pos);
    }

    // 1-B. 그림 모드 전용 교차점 닷(Grid Intersection Dots): 선분 작화 시작점/끝점 비계 제공
    if (isBrushActivity) {
      const dotRadius = this.gridSize <= 5 ? 2.5 : 2;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
      for (let ix = 0; ix < this.gridSize; ix++) {
        const px = this.padding + ix * this.cellSize;
        for (let iy = 0; iy < this.gridSize; iy++) {
          const py = this.padding + iy * this.cellSize;
          ctx.beginPath();
          ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 중앙 (0,0) 원점 표식
    const originPx = this.padding + mid * this.cellSize;
    ctx.save();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.95)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('(0,0)', originPx + 4, originPx + 4);
    ctx.restore();

    // 2. 목표 궤적 (Target Lines - 가이드 점선: showTargetGuide가 true일 때만 표시)
    if (this.showTargetGuide && this.targetLines && this.targetLines.length > 0) {
      ctx.save();
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
      ctx.shadowColor = 'rgba(251, 191, 36, 0.6)';
      ctx.shadowBlur = 8;
      ctx.setLineDash([8, 5]);

      for (const line of this.targetLines) {
        const p1 = this.gridToPixel(line.fromX, line.fromY);
        const p2 = this.gridToPixel(line.toX, line.toY);

        ctx.beginPath();
        ctx.moveTo(p1.px, p1.py);
        ctx.lineTo(p2.px, p2.py);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 2.5 붓 이동 라이브 예약선 (Ghost Trail - showGhostTrail이 true일 때만 연한 주황색 점선 표시)
    if (this.showGhostTrail && this.ghostPathLines && this.ghostPathLines.length > 0) {
      ctx.save();
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.85)';
      ctx.shadowColor = 'rgba(249, 115, 22, 0.5)';
      ctx.shadowBlur = 6;
      ctx.setLineDash([6, 4]);

      for (const line of this.ghostPathLines) {
        const p1 = this.gridToPixel(line.fromX, line.fromY);
        const p2 = this.gridToPixel(line.toX, line.toY);

        ctx.beginPath();
        ctx.moveTo(p1.px, p1.py);
        ctx.lineTo(p2.px, p2.py);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 3. 실제 그려진 궤적 (Drawn Lines - 무지개 그라데이션 및 글로우 선)
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const totalLines = this.drawnLines.length;
    for (let idx = 0; idx < totalLines; idx++) {
      const line = this.drawnLines[idx];
      const p1 = this.gridToPixel(line.fromX, line.fromY);
      const p2 = this.gridToPixel(line.toX, line.toY);

      if (!line.color || line.color === 'rainbow') {
        const startHue = Math.floor((idx / Math.max(1, totalLines)) * 360);
        const endHue = Math.floor(((idx + 1) / Math.max(1, totalLines)) * 360);

        const startColor = `hsl(${startHue}, 95%, 65%)`;
        const endColor = `hsl(${endHue}, 95%, 65%)`;

        const grad = ctx.createLinearGradient(p1.px, p1.py, p2.px, p2.py);
        grad.addColorStop(0, startColor);
        grad.addColorStop(1, endColor);

        ctx.shadowColor = startColor;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = grad;
      } else {
        ctx.shadowColor = line.color;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = line.color;
      }

      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
      ctx.stroke();
    }
    ctx.shadowBlur = 0; // 그림자 리셋

    // 4. 장애물 그리기 (미사일·도둑 잡기 모드)
    if (this.playerType !== 'brush') {
      for (const obs of this.obstacles) {
        const { px, py } = this.gridToPixel(obs.x, obs.y);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0, this.cellSize * 0.22), 0, Math.PI * 2);
        ctx.fill();
        
        // X 표시
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        const r = this.cellSize * 0.1;
        ctx.beginPath();
        ctx.moveTo(px - r, py - r);
        ctx.lineTo(px + r, py + r);
        ctx.moveTo(px + r, py - r);
        ctx.lineTo(px - r, py + r);
        ctx.stroke();
      }
    }

    // 4.4 순차구조 교육에서 차례대로 방문하는 번호 지점
    if (this.playerType === 'missile' && this.checkpoints.length > 0) {
      this.checkpoints.forEach((point, index) => {
        const { px, py } = this.gridToPixel(point.x, point.y);
        const isVisited = index < this.visitedCheckpointCount;
        ctx.save();
        ctx.shadowColor = isVisited ? '#22c55e' : '#38bdf8';
        ctx.shadowBlur = 10;
        ctx.fillStyle = isVisited ? 'rgba(34, 197, 94, 0.34)' : 'rgba(14, 165, 233, 0.3)';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(12, this.cellSize * 0.32), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = isVisited ? '#4ade80' : '#7dd3fc';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.font = `800 ${Math.max(11, Math.floor(this.cellSize * 0.28))}px "Noto Sans KR", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isVisited ? `✓${index + 1}` : String(index + 1), px, py);
        ctx.restore();
      });
    }

    // 4.5 번호 순서대로 방문하는 연료 보급소 (패턴 교육 문제 전용)
    if (this.playerType === 'missile' && this.fuelStops.length > 0) {
      const compactFuelMarker = this.fuelStops.length > 8;
      this.fuelStops.forEach((stop, index) => {
        const { px, py } = this.gridToPixel(stop.x, stop.y);
        const isVisited = index < this.visitedFuelCount;
        ctx.save();
        ctx.shadowColor = isVisited ? '#22c55e' : '#fbbf24';
        ctx.shadowBlur = 12;
        ctx.fillStyle = isVisited ? 'rgba(34, 197, 94, 0.32)' : 'rgba(251, 191, 36, 0.3)';
        ctx.beginPath();
        ctx.arc(
          px,
          py,
          Math.max(compactFuelMarker ? 9 : 12, this.cellSize * (compactFuelMarker ? 0.26 : 0.34)),
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = isVisited ? '#4ade80' : '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.font = `700 ${Math.max(9, Math.floor(this.cellSize * (compactFuelMarker ? 0.2 : 0.25)))}px "Noto Sans KR", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          compactFuelMarker
            ? (isVisited ? `✓${index + 1}` : String(index + 1))
            : (isVisited ? `✓${index + 1}` : `⛽${index + 1}`),
          px,
          py
        );
        ctx.restore();
      });
    }

    // 5. 타깃 위치 그리기 (Target 🎯 - 미사일 모드 전용)
    if (this.goalPos && this.playerType !== 'brush' && this.playerType !== 'cop') {
      const { px, py } = this.gridToPixel(this.goalPos.x, this.goalPos.y);
      ctx.save();
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 14;

      // 타깃 원형 조준선 배경
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0, this.cellSize * 0.32), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ef4444';
      ctx.font = `${Math.floor(this.cellSize * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🎯', px, py);
      ctx.restore();
    }

    // 5.4 수갑 위치 그리기 (도둑 잡기 모드 전용)
    if (this.handcuffPos && this.playerType === 'cop') {
      const { px, py } = this.gridToPixel(this.handcuffPos.x, this.handcuffPos.y);
      ctx.save();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(14, 165, 233, 0.24)';
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0, this.cellSize * 0.34), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 ${Math.max(10, Math.floor(this.cellSize * 0.42))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⛓', px, py);
      ctx.restore();
    }

    // 5.5 도둑 위치 그리기 (Thief 🥷 - 모드 5 전용 - 복면 도둑 이모지 렌더링)
    if (this.thiefPos) {
      const { px, py } = this.gridToPixel(this.thiefPos.x, this.thiefPos.y);
      ctx.save();
      ctx.font = `${Math.floor(this.cellSize * 0.65)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🥷', px, py);
      ctx.restore();
    }

    // 6. 시작점/현재 플레이어 위치 그리기 (경찰 👮‍♂️, 미사일 🚀, 붓 🖌️)
    if (this.starPos) {
      const { px, py } = this.gridToPixel(this.starPos.x, this.starPos.y);

      if (this.playerType === 'brush') {
        const iconSize = Math.floor(this.cellSize * 0.75);
        ctx.save();
        ctx.translate(px, py);

        // 이동 방향 각도(starAngle) 적용
        ctx.rotate(this.starAngle || 0);

        ctx.shadowBlur = 0;
        ctx.font = `${iconSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (this.isPenDown !== false) {
          // 붓 누름 상태: 젖은 물감 팁 + 에메랄드 링 + 단일 🖌️ 붓 그림
          const tipColor = this.drawnLines.length > 0 ? (this.drawnLines[this.drawnLines.length - 1].color || '#38bdf8') : '#38bdf8';
          ctx.shadowColor = tipColor === 'rainbow' ? '#f43f5e' : tipColor;
          ctx.shadowBlur = 16;
          ctx.fillStyle = tipColor === 'rainbow' ? '#f43f5e' : tipColor;
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 11, 0, Math.PI * 2);
          ctx.stroke();

          const offsetX = iconSize * 0.28;
          const offsetY = -iconSize * 0.28;
          ctx.shadowBlur = 0;
          ctx.fillText('🖌️', offsetX, offsetY);
        } else {
          // 붓 뗌 상태: 공중 이동 노란 점선 링 + 단일 ✋ 빈 손 그림
          ctx.strokeStyle = '#f59e0b';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 10;
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.shadowBlur = 0;
          ctx.fillText('✋', 0, -iconSize * 0.1);
        }

        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(px, py);

        if (this.playerType !== 'cop') {
          ctx.rotate(this.starAngle || 0);
        }

        let playerIcon = '🚀';
        if (this.playerType === 'cop') playerIcon = '👮‍♂️';

        ctx.font = `${Math.floor(this.cellSize * 0.65)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(playerIcon, 0, 0);

        ctx.restore();
      }
    }

    // 7. 활성화된 미사일 화염 & 듀얼 충격파 파티클 렌더링
    if (this.activeExplosion) {
      const exp = this.activeExplosion;
      const ctx = this.ctx;

      if (exp.phase === 'exploding') {
        ctx.save();

        // A. 팽창하는 중심 화염 구체 (Fireball Core Expansion)
        if (exp.fireballRadius > 0 && exp.fireballAlpha > 0) {
          const grad = ctx.createRadialGradient(
            exp.targetX, exp.targetY, 0,
            exp.targetX, exp.targetY, exp.fireballRadius
          );
          grad.addColorStop(0, `rgba(255, 255, 200, ${exp.fireballAlpha})`);
          grad.addColorStop(0.4, `rgba(249, 115, 22, ${exp.fireballAlpha * 0.8})`);
          grad.addColorStop(1, `rgba(239, 68, 68, 0)`);

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(exp.targetX, exp.targetY, Math.max(0, exp.fireballRadius), 0, Math.PI * 2);
          ctx.fill();
        }

        // B. 듀얼 충격파 링 (Inner Fire Ring + Outer Blast Wave Ring)
        if (exp.shockwave) {
          const sw = exp.shockwave;

          // 외곽 충격파 링 (White Translucent Blast Wave)
          ctx.strokeStyle = `rgba(255, 255, 255, ${sw.alpha * 0.7})`;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(exp.targetX, exp.targetY, Math.max(0, sw.radius * 1.3), 0, Math.PI * 2);
          ctx.stroke();

          // 내부 화염 충격파 링 (Orange Heavy Ring)
          ctx.strokeStyle = `rgba(249, 115, 22, ${sw.alpha})`;
          ctx.lineWidth = 8;
          ctx.shadowColor = '#f97316';
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(exp.targetX, exp.targetY, Math.max(0, sw.radius), 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // C. 파티클 불꽃 조각 및 연기 (Sparks, Embers & Smoke)
        for (const p of exp.particles) {
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, p.alpha);
          if (p.glow) {
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;
          }
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0, p.size), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // D. 캔버스 전체 섬광 (Impact Flash)
        if (exp.flashAlpha > 0) {
          ctx.fillStyle = `rgba(255, 250, 220, ${exp.flashAlpha * 0.4})`;
          ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        ctx.restore();
      }
    }

    // 8. 그림/예술 완성 무지개 반짝이 축하 파티클 (Rainbow Art Celebration)
    if (this.activeCelebration) {
      const cel = this.activeCelebration;
      ctx.save();

      for (const p of cel.particles) {
        ctx.globalAlpha = Math.max(0, p.alpha);
        if (p.emoji) {
          ctx.font = `${Math.floor(p.size * 3)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.emoji, p.x, p.y);
        } else {
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0, p.size), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    // 9. 도둑 검거 철창 감금 애니메이션 (Jail Cell Bars Animation)
    if (this.activeJailBars) {
      const { px, py, progress } = this.activeJailBars;
      const size = this.cellSize * 0.9;
      const left = px - size / 2;
      const top = py - size / 2;

      ctx.save();

      // 철창 내부 짙은 감금 그림자
      ctx.fillStyle = `rgba(15, 23, 42, ${Math.min(0.65, progress * 0.75)})`;
      ctx.fillRect(left - 4, top - 4, size + 8, size + 8);

      // 상/하 세련된 강철 마감 레일 빔 (Steel Beams)
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      const beamHeight = 6;
      ctx.fillRect(left - 4, top - 4, size + 8, beamHeight);
      ctx.strokeRect(left - 4, top - 4, size + 8, beamHeight);

      ctx.fillRect(left - 4, top + size - 2, size + 8, beamHeight);
      ctx.strokeRect(left - 4, top + size - 2, size + 8, beamHeight);

      // 4개의 굵은 쇠창살 (Vertical Metallic Jail Bars) 내려옴
      const numBars = 4;
      const barSpacing = (size + 8) / (numBars + 1);
      const barYEnd = top + size + 2;
      const currentBarY = top - 4 + (barYEnd - (top - 4)) * Math.min(1, progress * 1.3);

      ctx.fillStyle = '#cbd5e1';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;

      for (let i = 1; i <= numBars; i++) {
        const barX = left - 4 + barSpacing * i - 3;
        ctx.fillRect(barX, top - 4, 6, currentBarY - (top - 4));
        ctx.strokeRect(barX, top - 4, 6, currentBarY - (top - 4));
      }

      // 철창 자물쇠 (Padlock 🔐) 스냅 잠금 이펙트
      if (progress > 0.5) {
        const lockScale = Math.min(1, (progress - 0.5) * 2.5);
        ctx.shadowColor = '#eab308';
        ctx.shadowBlur = 15 * lockScale;
        ctx.font = `${Math.floor(this.cellSize * 0.5 * lockScale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔐', px, py);
      }

      ctx.restore();
    }
  }

  /**
   * 미사일이 목적지 타깃에 도달했을 때 폭발 파티클 및 햅틱/화면 진동 애니메이션 수행
   * @param {number} goalX
   * @param {number} goalY
   * @param {Function} onExploded 폭발 순간 실행할 오디오 콜백
   * @returns {Promise<void>}
   */
  triggerMissileExplosion(goalX, goalY, onExploded) {
    return new Promise((resolve) => {
      const effectRunId = ++this.effectRunId;
      const { px: targetX, py: targetY } = this.gridToPixel(goalX, goalY);

      // 1. 모바일/태블릿 기기 햅틱 진동 (Web Vibration API)
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([100, 40, 160, 40, 220]); } catch (e) {}
      }

      // 2. 화면 전체 CSS Shake 진동 효과 적용
      const cardContainer = this.canvas.closest('.glass-card') || this.canvas.parentElement;
      if (cardContainer) {
        cardContainer.classList.remove('shake-screen');
        void cardContainer.offsetWidth; // Force reflow
        cardContainer.classList.add('shake-screen');
        setTimeout(() => {
          if (this.effectRunId === effectRunId) {
            cardContainer.classList.remove('shake-screen');
          }
        }, 480);
      }

      const startTime = performance.now();
      const explodeDuration = 780; // 폭발 연출 780ms

      // 3. 다층 파티클 생성 (스파크 40개, 파이어 파편 25개, 연기 15개)
      const particles = [];
      const sparkColors = ['#ffffff', '#fff3bf', '#ffd43b', '#ff922b'];
      const fireColors = ['#f97316', '#ef4444', '#eab308', '#dc2626', '#fbbf24'];

      // 고속 스파크
      for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 9;
        particles.push({
          x: targetX,
          y: targetY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 2.5 + Math.random() * 4,
          color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
          alpha: 1,
          decay: 0.02 + Math.random() * 0.02,
          glow: true
        });
      }

      // 중력 적용 파이어 파편
      for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 5.5;
        particles.push({
          x: targetX,
          y: targetY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5, // 위쪽 분사 중력
          size: 4 + Math.random() * 6,
          color: fireColors[Math.floor(Math.random() * fireColors.length)],
          alpha: 1,
          decay: 0.014 + Math.random() * 0.015,
          gravity: 0.15,
          glow: true
        });
      }

      // 확산 연기 구름
      for (let i = 0; i < 15; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 3;
        particles.push({
          x: targetX,
          y: targetY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.5,
          size: 6 + Math.random() * 10,
          color: 'rgba(120, 113, 108, 0.4)',
          alpha: 0.6,
          decay: 0.01,
          grow: 0.3,
          glow: false
        });
      }

      this.activeExplosion = {
        phase: 'exploding',
        targetX,
        targetY,
        particles,
        fireballRadius: 5,
        fireballAlpha: 1,
        flashAlpha: 1,
        shockwave: { radius: 6, alpha: 1 }
      };

      if (typeof onExploded === 'function') onExploded();

      const animLoop = (now) => {
        if (this.effectRunId !== effectRunId || !this.activeExplosion) {
          resolve();
          return;
        }
        const elapsed = now - startTime;

        if (elapsed < explodeDuration) {
          const expProgress = elapsed / explodeDuration;

          // 섬광 및 중심 화염 구체 확산/감소
          this.activeExplosion.flashAlpha = Math.max(0, 1 - expProgress * 3);
          this.activeExplosion.fireballRadius = Math.min(this.cellSize * 1.3, expProgress * (this.cellSize * 2.2));
          this.activeExplosion.fireballAlpha = Math.max(0, 1 - expProgress * 1.8);

          // 듀얼 충격파 링 확산
          this.activeExplosion.shockwave.radius = expProgress * (this.cellSize * 2.0);
          this.activeExplosion.shockwave.alpha = Math.max(0, 1 - expProgress);

          // 파티클 위치, 중력, 크기 및 투명도 업데이트
          for (const p of this.activeExplosion.particles) {
            p.x += p.vx;
            p.y += p.vy;
            if (p.gravity) p.vy += p.gravity;
            if (p.grow) p.size += p.grow;
            p.vx *= 0.94;
            p.vy *= 0.94;
            p.alpha = Math.max(0, p.alpha - p.decay);
          }

          this.render();
          requestAnimationFrame(animLoop);
        } else {
          // 애니메이션 종료 및 정리
          this.activeExplosion = null;
          this.render();
          resolve();
        }
      };

      requestAnimationFrame(animLoop);
    });
  }

  /**
   * 그림 완성 시 폭파 없이 알록달록 무지개 별빛/축하 폭죽 연출 수행
   * @param {number} x
   * @param {number} y
   * @returns {Promise<void>}
   */
  triggerRainbowCelebration(x = 3, y = 3) {
    return new Promise((resolve) => {
      const effectRunId = ++this.effectRunId;
      const { px: targetX, py: targetY } = this.gridToPixel(x, y);

      const startTime = performance.now();
      const duration = 950; // 950ms

      const particles = [];
      const colors = ['#fbbf24', '#38bdf8', '#a855f7', '#f43f5e', '#10b981', '#ffffff', '#eab308'];
      const emojis = ['✨', '⭐', '🌈', '🎨', '🎉'];

      for (let i = 0; i < 48; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 6.5;
        particles.push({
          x: targetX,
          y: targetY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          size: 3 + Math.random() * 6,
          color: colors[Math.floor(Math.random() * colors.length)],
          emoji: Math.random() > 0.65 ? emojis[Math.floor(Math.random() * emojis.length)] : null,
          alpha: 1,
          decay: 0.012 + Math.random() * 0.01
        });
      }

      this.activeCelebration = {
        particles
      };

      const animLoop = (now) => {
        if (this.effectRunId !== effectRunId || !this.activeCelebration) {
          resolve();
          return;
        }
        const elapsed = now - startTime;

        if (elapsed < duration) {
          for (const p of this.activeCelebration.particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.alpha = Math.max(0, p.alpha - p.decay);
          }

          this.render();
          requestAnimationFrame(animLoop);
        } else {
          this.activeCelebration = null;
          this.render();
          resolve();
        }
      };

      requestAnimationFrame(animLoop);
    });
  }

  /**
   * 도둑 검거 성공 시 경찰 사이렌 섬광 및 경찰 이모지(🚨, 👮‍♂️, 🚔, ⚖️, 🔐) 축하 연출 수행
   * @param {number} x
   * @param {number} y
   * @returns {Promise<void>}
   */
  triggerPoliceArrestCelebration(x = 3, y = 3) {
    return new Promise((resolve) => {
      const effectRunId = ++this.effectRunId;
      const { px: targetX, py: targetY } = this.gridToPixel(x, y);
      const startTime = performance.now();
      const duration = 1100;

      // 모바일/태블릿 기기 햅틱 진동
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([120, 50, 180, 50, 240]); } catch (e) {}
      }

      // 화면 진동 효과
      const cardContainer = this.canvas.closest('.glass-card') || this.canvas.parentElement;
      if (cardContainer) {
        cardContainer.classList.remove('shake-screen');
        void cardContainer.offsetWidth;
        cardContainer.classList.add('shake-screen');
        setTimeout(() => {
          if (this.effectRunId === effectRunId) {
            cardContainer.classList.remove('shake-screen');
          }
        }, 480);
      }

      const particles = [];
      const colors = ['#ef4444', '#3b82f6', '#a855f7', '#fbbf24', '#ffffff'];
      const emojis = ['🚨', '👮‍♂️', '🚔', '⚖️', '🔐', '⚡', '💥', '🌟'];

      for (let i = 0; i < 52; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 8.0;
        particles.push({
          x: targetX,
          y: targetY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2.0,
          size: 4 + Math.random() * 8,
          color: colors[Math.floor(Math.random() * colors.length)],
          emoji: Math.random() > 0.45 ? emojis[Math.floor(Math.random() * emojis.length)] : null,
          alpha: 1,
          decay: 0.01 + Math.random() * 0.012
        });
      }

      this.activeCelebration = {
        particles
      };
      this.activeJailBars = { px: targetX, py: targetY, progress: 0 };

      const animLoop = (now) => {
        if (
          this.effectRunId !== effectRunId ||
          !this.activeCelebration ||
          !this.activeJailBars
        ) {
          resolve();
          return;
        }
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);

        if (this.activeJailBars) {
          this.activeJailBars.progress = progress;
        }

        if (elapsed < duration) {
          for (const p of this.activeCelebration.particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.95;
            p.vy *= 0.95;
            p.alpha = Math.max(0, p.alpha - p.decay);
          }

          this.render();
          requestAnimationFrame(animLoop);
        } else {
          this.activeCelebration = null;
          this.activeJailBars = null;
          this.render();
          resolve();
        }
      };

      requestAnimationFrame(animLoop);
    });
  }
}
