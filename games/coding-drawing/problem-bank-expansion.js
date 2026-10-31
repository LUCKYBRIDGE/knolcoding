import {
  ADVANCED_PROBLEM_MODES,
  createAdvancedProblemBank,
  DRAWING_GRID_SIZES,
  DRAWING_MINIMUM_SPANS,
  OBSTACLE_COUNT_LIMITS,
  ROUTING_MAXIMUM_PATH_COUNTS
} from './advanced-problem-bank.js';
import { CommandEngine } from './command.js';

const NEUTRAL_PROBLEM_GUIDES = Object.freeze({
  efficiency: '🧠 긴 명령을 실행 순서대로 살펴보고, 서로 이웃한 같은 방향만 정확히 묶어 보세요.',
  shortest: '🎯 출발점과 목표점을 살펴보고 가장 적은 이동으로 도착해 보세요. 같은 최소 길이의 다른 경로도 모두 정답입니다.',
  routing: '🧱 장애물 배치를 분석해 가장 짧은 안전 경로를 찾아보세요. 같은 최소 길이의 다른 우회로도 모두 정답입니다.',
  debug: '🎨 모눈종이에 제시된 선을 살펴보고 같은 그림을 완성해 보세요. 그린 순서나 진행 방향이 달라도 같은 선을 정확히 완성하면 정답이에요.',
  debug_guide: '📜 빈 모눈종이에서는 어느 방향으로든 자유롭게 그릴 수 있어요. 드래그하거나 다음 칸을 누른 뒤, 제출해서 내 붓질을 제시 명령의 순서와 비교해 보세요. 먼 칸을 한 번 눌러 이동할 때만 한 방향으로 곧게 이어져야 해요.',
  single_stroke: '🖌️ 붓을 단 한 번도 떼지 않고(붓 떼기 없이) 한 번의 연속 붓질로 밑그림의 모든 선을 완성해 보세요!',
  chase: '👮 도둑의 공개된 이동 계획과 장애물을 분석해 가장 이른 체포에 도전하세요. 같은 차례에 체포하는 다른 명령도 모두 정답입니다.'
});

const MODE_TITLE_LABELS = Object.freeze({
  efficiency: '효율 명령 문제',
  shortest: '미사일 문제',
  routing: '장애물 문제',
  debug: '명령어 만들기 문제',
  debug_guide: '그림 그리기 문제',
  single_stroke: '한붓그리기 문제',
  chase: '도둑 잡기 문제'
});

function applyProblemTitlesAndGuides(presetLevels, modes = ADVANCED_PROBLEM_MODES) {
  for (const mode of modes) {
    const label = MODE_TITLE_LABELS[mode];
    if (!label || !Array.isArray(presetLevels[mode])) continue;
    const sizeCounters = new Map();
    presetLevels[mode].forEach(level => {
      const problemNumber = (sizeCounters.get(level.gridSize) || 0) + 1;
      sizeCounters.set(level.gridSize, problemNumber);
      level.title = `${level.gridSize}x${level.gridSize} · ${label} ${problemNumber}`;
      level.guide = NEUTRAL_PROBLEM_GUIDES[mode];
    });
  }
}

function validateChaseProblems(levels) {
  for (const level of levels) {
    const obstacles = level.obstacles || [];
    if (obstacles.length > OBSTACLE_COUNT_LIMITS[level.gridSize]) {
      throw new Error(`${level.title}: 장애물이 크기별 상한을 초과했습니다.`);
    }
    const validation = CommandEngine.validateChaseScenario(
      level.starPos,
      level.thiefPos,
      level.thiefCommands,
      level.gridSize,
      level.obstacles || [],
      level.handcuffPos || null
    );
    if (!validation.isValid) {
      throw new Error(`${level.title}: 사용할 수 없는 도둑 잡기 문제 (${validation.reason})`);
    }

    const analysis = CommandEngine.analyzeChaseCapturePlans(
      level.starPos,
      level.thiefPos,
      level.thiefCommands,
      level.gridSize,
      level.obstacles || [],
      level.handcuffPos || null
    );
    if (!analysis || analysis.pathCount < 2) {
      throw new Error(`${level.title}: 서로 다른 최적 체포 명령이 두 개 이상 필요합니다.`);
    }

    for (let obstacleIndex = 0; obstacleIndex < obstacles.length; obstacleIndex++) {
      const reduced = CommandEngine.analyzeChaseCapturePlans(
        level.starPos,
        level.thiefPos,
        level.thiefCommands,
        level.gridSize,
        obstacles.filter((_, index) => index !== obstacleIndex),
        level.handcuffPos || null
      );
      if (
        reduced &&
        reduced.earliestTurn === analysis.earliestTurn &&
        reduced.pathCount === analysis.pathCount
      ) {
        throw new Error(`${level.title}: 체포 판단에 영향을 주지 않는 장애물이 있습니다.`);
      }
    }
    if (level.handcuffPos && level.handcuffDelay < 1) {
      throw new Error(`${level.title}: 수갑이 최적 체포 경로에 의미 있는 순서를 만들지 못했습니다.`);
    }
  }
}

function validateChaseBankDiversity(levels) {
  const tightAnswerLimits = Object.freeze({
    5: 16,
    7: 64,
    9: 256,
    11: 1024
  });

  for (const gridSize of [5, 7, 9, 11]) {
    const sizeLevels = levels.filter(level => level.gridSize === gridSize);
    const combinations = {
      plain: sizeLevels.filter(level => !level.handcuffPos && level.obstacles.length === 0),
      handcuffsOnly: sizeLevels.filter(level => level.handcuffPos && level.obstacles.length === 0),
      obstaclesOnly: sizeLevels.filter(level => !level.handcuffPos && level.obstacles.length > 0),
      both: sizeLevels.filter(level => level.handcuffPos && level.obstacles.length > 0)
    };
    if (
      combinations.plain.length !== 1 ||
      combinations.handcuffsOnly.length !== 1 ||
      combinations.obstaclesOnly.length !== 4 ||
      combinations.both.length !== 4
    ) {
      throw new Error(`${gridSize}x${gridSize}: 추격 요소 네 조합의 문제 수가 균형 기준과 다릅니다.`);
    }

    const routeLengths = sizeLevels.map(level => (
      CommandEngine.expandToStepList(level.thiefCommands).length
    ));
    if (new Set(routeLengths).size < 3) {
      throw new Error(`${gridSize}x${gridSize}: 도둑 경로 길이 변화가 부족합니다.`);
    }
    if (new Set(sizeLevels.map(level => level.earliestCatchTurn)).size < 4) {
      throw new Error(`${gridSize}x${gridSize}: 체포 차례 변화가 부족합니다.`);
    }
    if (new Set(sizeLevels.map(level => level.obstacles.length)).size < 4) {
      throw new Error(`${gridSize}x${gridSize}: 장애물 배치 밀도 변화가 부족합니다.`);
    }

    const lateCaptureCount = sizeLevels.filter((level, index) => (
      level.earliestCatchTurn / routeLengths[index] >= 0.75
    )).length;
    if (lateCaptureCount < 3) {
      throw new Error(`${gridSize}x${gridSize}: 도주 후반까지 추론해야 하는 문제가 부족합니다.`);
    }

    const tightAnswerCount = sizeLevels.filter(level => (
      level.solutionCount <= tightAnswerLimits[gridSize]
    )).length;
    if (tightAnswerCount < 2) {
      throw new Error(`${gridSize}x${gridSize}: 정답 경로가 좁은 전략 문제가 부족합니다.`);
    }

    const strongConstraintCount = sizeLevels.filter(level => (
      level.obstacleDelay + level.handcuffDelay >= 2
    )).length;
    if (strongConstraintCount < 3) {
      throw new Error(`${gridSize}x${gridSize}: 장애물·수갑이 체포 계획을 크게 바꾸는 문제가 부족합니다.`);
    }
  }
}

function validateRouteProblems(presetLevels, modes = ['shortest', 'routing']) {
  for (const mode of ['shortest', 'routing'].filter(entry => modes.includes(entry))) {
    for (const level of presetLevels[mode]) {
      const obstacles = level.obstacles || [];
      if (obstacles.length > OBSTACLE_COUNT_LIMITS[level.gridSize]) {
        throw new Error(`${level.title}: 장애물이 크기별 상한을 초과했습니다.`);
      }
      const validation = CommandEngine.validateRouteScenario(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles || []
      );
      if (!validation.isValid) {
        throw new Error(`${level.title}: 사용할 수 없는 경로 문제 (${validation.reason})`);
      }

      const analysis = CommandEngine.analyzeShortestPaths(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles || []
      );
      if (analysis.pathCount < 2) {
        throw new Error(`${level.title}: 서로 다른 최단 경로가 두 개 이상 필요합니다.`);
      }
      const answerCatalog = CommandEngine.enumerateShortestPaths(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles || []
      );
      if (
        !answerCatalog.isComplete ||
        answerCatalog.pathSignatures.length !== analysis.pathCount ||
        new Set(answerCatalog.pathSignatures).size !== analysis.pathCount
      ) {
        throw new Error(`${level.title}: 모든 최단 방향 순서를 정답 목록으로 확보하지 못했습니다.`);
      }
      level.shortestSolutionSignatures = answerCatalog.pathSignatures;

      for (let obstacleIndex = 0; obstacleIndex < obstacles.length; obstacleIndex++) {
        const reduced = CommandEngine.analyzeShortestPaths(
          level.starPos,
          level.goalPos,
          level.gridSize,
          obstacles.filter((_, index) => index !== obstacleIndex)
        );
        if (
          reduced.distance === analysis.distance &&
          reduced.pathCount === analysis.pathCount
        ) {
          throw new Error(`${level.title}: 최단 경로 판단에 영향을 주지 않는 장애물이 있습니다.`);
        }
      }
    }
  }

  if (!modes.includes('routing')) return;
  for (const gridSize of [5, 7, 9, 11]) {
    const levels = presetLevels.routing.filter(level => level.gridSize === gridSize);
    if (levels.filter(level => level.detourDistance >= 2).length < 5) {
      throw new Error(`${gridSize}x${gridSize}: 두 칸 이상 우회하는 장애물 문제가 부족합니다.`);
    }
    if (
      gridSize >= 7 &&
      levels.filter(level => level.detourDistance >= 3).length < 2
    ) {
      throw new Error(`${gridSize}x${gridSize}: 세 칸 이상 우회하는 장애물 문제가 부족합니다.`);
    }
    if (levels.some(level => (
      level.solutionCount > ROUTING_MAXIMUM_PATH_COUNTS[gridSize]
    ))) {
      throw new Error(`${gridSize}x${gridSize}: 최단 우회 경로가 지나치게 많은 문제가 있습니다.`);
    }
  }
}

function drawingPointKey(point) {
  return `${point.x},${point.y}`;
}

function drawingEdgeKey(from, to) {
  return [drawingPointKey(from), drawingPointKey(to)].sort().join('|');
}

function analyzeDrawingVisualQuality(level) {
  const uniqueEdges = new Map();
  for (const line of CommandEngine.expandLinesToUnitSteps(level.targetLines)) {
    const edge = {
      from: { x: line.fromX, y: line.fromY },
      to: { x: line.toX, y: line.toY }
    };
    uniqueEdges.set(drawingEdgeKey(edge.from, edge.to), edge);
  }
  const edges = [...uniqueEdges.values()];
  const points = edges.flatMap(edge => [edge.from, edge.to]);
  const width = (
    Math.max(...points.map(point => point.x)) -
    Math.min(...points.map(point => point.x)) + 1
  );
  const height = (
    Math.max(...points.map(point => point.y)) -
    Math.min(...points.map(point => point.y)) + 1
  );
  let ambiguousCrossings = 0;
  for (let firstIndex = 0; firstIndex < edges.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < edges.length; secondIndex++) {
      const first = edges[firstIndex];
      const second = edges[secondIndex];
      const firstDiagonal = (
        Math.abs(first.to.x - first.from.x) === 1 &&
        Math.abs(first.to.y - first.from.y) === 1
      );
      const secondDiagonal = (
        Math.abs(second.to.x - second.from.x) === 1 &&
        Math.abs(second.to.y - second.from.y) === 1
      );
      const firstEndpoints = new Set([
        drawingPointKey(first.from),
        drawingPointKey(first.to)
      ]);
      if (
        firstDiagonal &&
        secondDiagonal &&
        !firstEndpoints.has(drawingPointKey(second.from)) &&
        !firstEndpoints.has(drawingPointKey(second.to)) &&
        first.from.x + first.to.x === second.from.x + second.to.x &&
        first.from.y + first.to.y === second.from.y + second.to.y
      ) {
        ambiguousCrossings++;
      }
    }
  }
  return { width, height, ambiguousCrossings };
}

function validateDrawingProblems(presetLevels, modes = ['debug', 'debug_guide']) {
  for (const mode of ['debug', 'debug_guide'].filter(entry => modes.includes(entry))) {
    for (const level of presetLevels[mode]) {
      const minimumDrawingDistance = CommandEngine.getMinimumDrawingDistance(
        level.starPos,
        level.targetLines
      );
      if (!Number.isFinite(minimumDrawingDistance)) {
        throw new Error(`${level.title}: 최소 붓 이동을 계산할 수 없는 그림 문제`);
      }
      if (!level.graphProfile || !level.motifId) {
        throw new Error(`${level.title}: 그림 소재 정보와 그래프 분석값이 필요합니다.`);
      }
      const visualQuality = analyzeDrawingVisualQuality(level);
      const minimumSpan = DRAWING_MINIMUM_SPANS[level.gridSize];
      if (
        visualQuality.width < minimumSpan ||
        visualQuality.height < minimumSpan
      ) {
        throw new Error(`${level.title}: 선택한 모눈종이 크기를 충분히 활용하지 못합니다.`);
      }
      if (visualQuality.ambiguousCrossings > 0) {
        throw new Error(`${level.title}: 격자점이 아닌 곳에서 선이 교차합니다.`);
      }
      level.minimumDrawingDistance = minimumDrawingDistance;
    }

    for (const gridSize of DRAWING_GRID_SIZES) {
      const levels = presetLevels[mode].filter(level => level.gridSize === gridSize);
      if (new Set(levels.map(level => level.motifId)).size !== levels.length) {
        throw new Error(`${mode} ${gridSize}x${gridSize}: 같은 그림 소재가 반복됩니다.`);
      }
      if (levels.filter(level => level.graphProfile.decisionVertices >= 1).length < 12) {
        throw new Error(`${mode} ${gridSize}x${gridSize}: 경로 선택이 필요한 그림이 부족합니다.`);
      }
      if (
        !levels.some(level => level.graphProfile.cycleCount === 0) ||
        !levels.some(level => level.graphProfile.cycleCount >= 2)
      ) {
        throw new Error(`${mode} ${gridSize}x${gridSize}: 열린 선과 여러 고리 그림이 고르게 필요합니다.`);
      }
    }
  }
}

export function expandPresetProblemBank(presetLevels, requestedModes = ADVANCED_PROBLEM_MODES) {
  const modes = [...new Set(requestedModes)].filter(mode => ADVANCED_PROBLEM_MODES.includes(mode));
  for (const mode of modes) {
    presetLevels[mode] = createAdvancedProblemBank(mode);
  }

  applyProblemTitlesAndGuides(presetLevels, modes);
  if (modes.includes('chase')) {
    validateChaseProblems(presetLevels.chase);
    validateChaseBankDiversity(presetLevels.chase);
  }
  validateRouteProblems(presetLevels, modes);
  validateDrawingProblems(presetLevels, modes);
  return presetLevels;
}
