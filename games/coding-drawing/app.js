/**
 * 별빛 탐험대 - 메인 애플리케이션 컨트롤러
 */

import { GridRenderer } from './grid.js';
import { CommandEngine, DIRECTIONS, MAX_COMMAND_DISTANCE } from './command.js';
import { Audio } from './audio.js';
import { Encoder } from './encoder.js';
import { expandPresetProblemBank } from './problem-bank-expansion.js';
import { WorksheetGenerator } from './worksheet.js';
import {
  EDUCATION_LESSONS,
  buildEducationProblemBank,
  getEducationLesson,
  getEducationToolPolicy,
  isPatternEducationLesson
} from './education-mode.js';
import {
  DRAWING_EDUCATION_LESSONS,
  assessDrawingEducationAttempt,
  buildDrawingEducationProblemBank,
  getDrawingEducationLesson,
  getDrawingEducationToolPolicy,
  isDrawingEducationLesson
} from './drawing-education-mode.js';
import {
  MAX_PATTERN_DEFINITION_COMMANDS,
  MAX_PATTERN_MAIN_BLOCKS,
  assessCommandBlockUsage,
  assessOrderedFuelStops,
  expandCommandBlockProgram,
  isCommandBlockCall,
  normalizeMainProgram,
  normalizeMoveCommands
} from './pattern-engine.js';

export const ACTIVITY_MODES = Object.freeze([
  'efficiency',
  'shortest',
  'routing',
  'debug',
  'debug_guide',
  'single_stroke',
  'creator',
  'chase'
]);

export const LEARNING_MODE_GROUPS = Object.freeze({
  missile: Object.freeze(['shortest', 'routing']),
  drawing: Object.freeze(['debug', 'debug_guide', 'single_stroke']),
  chase: Object.freeze(['chase']),
  creator: Object.freeze(['creator'])
});

export const CHALLENGE_TYPES = Object.freeze([
  'stage',
  'education',
  'random',
  'timeattack',
  'infinite',
  'multisolution'
]);

const STANDARD_CHALLENGE_TYPES = Object.freeze([
  'stage',
  'random',
  'timeattack',
  'infinite'
]);

const DRAWING_CHALLENGE_TYPES = Object.freeze([
  'stage',
  'education',
  'random',
  'timeattack',
  'infinite'
]);

const SINGLE_STROKE_CHALLENGE_TYPES = Object.freeze([
  'stage',
  'random',
  'timeattack',
  'infinite'
]);

export function getSupportedChallengeTypesForMode(mode) {
  if (['shortest', 'routing'].includes(mode)) return CHALLENGE_TYPES;
  if (['debug', 'debug_guide'].includes(mode)) return DRAWING_CHALLENGE_TYPES;
  if (mode === 'single_stroke') return SINGLE_STROKE_CHALLENGE_TYPES;
  return STANDARD_CHALLENGE_TYPES;
}

const ACTIVITY_LABELS = Object.freeze({
  efficiency: '명령을 효율적으로 쓰기',
  shortest: '미사일 이동',
  routing: '장애물 피하기',
  debug: '그림 보고 명령어 만들기',
  debug_guide: '명령 보고 그림 그리기',
  single_stroke: '한붓그리기',
  creator: '나만의 문제 만들기',
  chase: '도둑 잡기',
  custom: '공유 받은 문제'
});

const LEARNING_MODE_LABELS = Object.freeze({
  missile: '미사일 모드',
  drawing: '그림 모드',
  chase: '도둑 잡기 모드',
  creator: '문제 만들기 모드'
});

const LEARNING_MODE_ICONS = Object.freeze({
  missile: '🚀',
  drawing: '🎨',
  chase: '👮‍♂️',
  creator: '✏️'
});

const ACTIVITY_DISPLAY_LABELS = Object.freeze({
  efficiency: '기초 연습 · 명령을 효율적으로 쓰기',
  shortest: '1. 미사일 이동',
  routing: '2. 장애물 피하기',
  debug: '3. 그림 보고 명령어 만들기',
  debug_guide: '4. 명령 보고 그림 그리기',
  single_stroke: '🎨 한붓그리기',
  creator: '5. 나만의 문제 만들기',
  chase: '6. 도둑 잡기',
  custom: '공유 받은 문제'
});

export function getLearningModeForActivity(activityMode) {
  if (activityMode === 'single_stroke') return 'drawing';
  return Object.entries(LEARNING_MODE_GROUPS)
    .find(([, activities]) => activities.includes(activityMode))?.[0] || null;
}

const CHALLENGE_LABELS = Object.freeze({
  stage: '자유 도전',
  education: '개념 교육',
  random: '10문제 도전',
  timeattack: '60초 도전',
  infinite: '계속 도전',
  multisolution: '여러 풀이 찾기'
});

const EDUCATION_CAPABLE_MODES = Object.freeze(['shortest', 'routing', 'debug', 'debug_guide']);

export function getChallengeModeHint(challengeType, mode = 'shortest', gridSize = 5) {
  if (challengeType === 'education') return '개념을 순서대로 배우거나 완료한 단계를 다시 복습해요.';
  if (challengeType === 'random') {
    return `${getRandomChallengeTargetCount(mode, gridSize)}문제를 중복 없이 풀고 결과를 확인해요.`;
  }
  if (challengeType === 'timeattack') return '실행 애니메이션과 결과 확인 중에는 시간이 멈추는 60초 기록 도전이에요.';
  if (challengeType === 'multisolution') return '같은 문제에서 방향 순서가 다른 최단 풀이 3개를 찾아요.';
  if (challengeType === 'infinite') return '성공 기록을 이어 가며 원하는 만큼 계속 풀어요.';
  return '기록 부담 없이 한 문제씩 자유롭게 풀어요.';
}

export const MISSILE_SOLUTION_RULES = Object.freeze([
  'shortest',
  'minimum_commands'
]);

export function getActiveMissileSolutionRule(challengeType, selectedRule = 'shortest') {
  if (challengeType === 'multisolution') return 'shortest';
  return MISSILE_SOLUTION_RULES.includes(selectedRule)
    ? selectedRule
    : 'shortest';
}

const SUPPORTED_GRID_SIZES = Object.freeze([5, 7, 9, 11]);
const DRAWING_MODE_GRID_SIZES = Object.freeze([5, 7, 9]);
const EDUCATION_PROGRESS_STORAGE_KEY = 'coding-drawing:education-progress:v1';
const EDUCATION_PROGRESS_VERSION = 1;
const EDUCATION_SESSION_PROBLEM_COUNT = 5;
// 여러 풀이 활동은 가능한 모든 정답을 알고 판정하되, 학생에게는
// 충분히 비교할 수 있는 만큼의 서로 다른 풀이만 목표로 제시한다.
export const MULTI_SOLUTION_GOAL_COUNT = 3;

export function getMultiSolutionGoalCount(answerCount = 0) {
  const safeAnswerCount = Math.max(0, Math.trunc(Number(answerCount) || 0));
  return Math.min(MULTI_SOLUTION_GOAL_COUNT, safeAnswerCount);
}

export function chooseEducationSessionProblemKeys(
  problemBank = [],
  count = EDUCATION_SESSION_PROBLEM_COUNT,
  previousKeys = [],
  random = Math.random
) {
  const uniqueLevels = [];
  const seen = new Set();
  for (const level of problemBank) {
    const key = level?.educationProblemKey;
    if (typeof key !== 'string' || seen.has(key)) continue;
    seen.add(key);
    uniqueLevels.push(level);
  }
  const safeCount = Math.min(Math.max(0, count), uniqueLevels.length);
  const previous = new Set(previousKeys.filter(key => seen.has(key)));
  const shuffle = values => {
    const next = [...values];
    for (let index = next.length - 1; index > 0; index--) {
      const draw = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
      [next[index], next[draw]] = [next[draw], next[index]];
    }
    return next;
  };
  const spreadAcrossVariants = values => {
    const buckets = new Map();
    for (const level of shuffle(values)) {
      const group = String(level.educationVariantGroup ?? level.educationProblemKey);
      if (!buckets.has(group)) buckets.set(group, []);
      buckets.get(group).push(level);
    }
    const ordered = [];
    const groups = shuffle([...buckets.keys()]);
    while (ordered.length < values.length) {
      for (const group of groups) {
        const next = buckets.get(group)?.shift();
        if (next) ordered.push(next);
      }
    }
    return ordered;
  };
  const fresh = spreadAcrossVariants(
    uniqueLevels.filter(level => !previous.has(level.educationProblemKey))
  );
  const repeated = spreadAcrossVariants(
    uniqueLevels.filter(level => previous.has(level.educationProblemKey))
  );
  return [...fresh, ...repeated]
    .slice(0, safeCount)
    .map(level => level.educationProblemKey);
}

/**
 * 교육 문제의 순서는 격자 크기가 아니라 실제로 생각해야 하는 구조로 정한다.
 * 저장된 세트의 구성은 그대로 두고, 같은 세트 안에서만 쉬운 구조부터 배열한다.
 */
export function getEducationProblemComplexity(level = {}) {
  const lessonId = level.educationLesson || '';
  const obstacles = Array.isArray(level.obstacles) ? level.obstacles.length : 0;
  const targetLines = Array.isArray(level.targetLines) ? level.targetLines.length : 0;
  const fuelStops = Array.isArray(level.fuelStops) ? level.fuelStops.length : 0;
  const checkpoints = Array.isArray(level.checkpoints) ? level.checkpoints.length : 0;
  const stepCount = Array.isArray(level.targetStepDirections)
    ? level.targetStepDirections.length
    : CommandEngine.expandToStepList(level.referenceCommands || level.sourceCommands || []).length;
  const shortestDistance = Number.isFinite(level.shortestDistance) ? level.shortestDistance : 0;
  const detourDistance = Number.isFinite(level.detourDistance) ? level.detourDistance : 0;
  const minimumCommands = Number.isFinite(level.minimumCommandCount) ? level.minimumCommandCount : 0;
  const shortestRouteCommands = Number.isFinite(level.minimumCommandsOnShortestRoute)
    ? level.minimumCommandsOnShortestRoute
    : minimumCommands;

  if (lessonId === 'sequence') return checkpoints * 4 + stepCount;
  if (lessonId === 'routes') return stepCount || Math.abs((level.goalPos?.x || 0) - (level.starPos?.x || 0))
    + Math.abs((level.goalPos?.y || 0) - (level.starPos?.y || 0));
  if (lessonId === 'compress') return stepCount + (level.optimalCommands?.length || 0) * 3;
  if (lessonId === 'shortest') return shortestDistance + detourDistance * 5 + obstacles * 2;
  if (lessonId === 'minimum') {
    return minimumCommands * 4
      + Math.max(0, shortestRouteCommands - minimumCommands) * 6
      + detourDistance * 3
      + obstacles;
  }
  if (lessonId === 'block_one' || lessonId === 'block_two') {
    return (level.minimumCodeSize || 0) * 5 + fuelStops + obstacles * 2;
  }
  if (lessonId === 'draw_sequence') return stepCount + targetLines;
  if (lessonId === 'draw_methods') return targetLines + (level.minimumDrawingDistance || 0);
  if (lessonId === 'draw_minimum_commands') {
    return (level.minimumCommandCount || 0) * 5
      + (level.minimumDrawingDistance || 0)
      + (level.disconnectedComponentProof ? 12 : 0);
  }
  return stepCount + targetLines + obstacles * 2 + fuelStops;
}

export function compareEducationProblemComplexity(left = {}, right = {}) {
  const scoreDifference = getEducationProblemComplexity(left) - getEducationProblemComplexity(right);
  if (scoreDifference !== 0) return scoreDifference;
  return String(left.educationProblemKey || left.title || '')
    .localeCompare(String(right.educationProblemKey || right.title || ''), 'ko');
}

export function reorderCommandList(commands = [], fromIndex, toIndex) {
  const next = Array.isArray(commands) ? commands.map(command => ({ ...command })) : [];
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= next.length ||
    toIndex >= next.length ||
    fromIndex === toIndex
  ) {
    return next;
  }
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function getSupportedGridSizesForMode(mode) {
  return ['debug', 'debug_guide', 'single_stroke'].includes(mode)
    ? DRAWING_MODE_GRID_SIZES
    : SUPPORTED_GRID_SIZES;
}

export function getEducationAdvancePlan({
  lessons = [],
  lessonId,
  levelIndex = 0,
  poolLength = 0
} = {}) {
  const lessonIndex = lessons.findIndex(lesson => lesson.id === lessonId);
  const safePoolLength = Math.max(0, Number(poolLength) || 0);
  const safeLevelIndex = Math.max(0, Number(levelIndex) || 0);

  if (lessonIndex < 0 || safePoolLength === 0) {
    return { type: 'complete', nextLesson: null, nextLevelIndex: 0 };
  }
  if (safeLevelIndex + 1 < safePoolLength) {
    return {
      type: 'problem',
      nextLesson: lessons[lessonIndex],
      nextLevelIndex: safeLevelIndex + 1
    };
  }

  const nextLesson = lessons[lessonIndex + 1] || null;
  return nextLesson
    ? { type: 'lesson', nextLesson, nextLevelIndex: 0 }
    : { type: 'complete', nextLesson: null, nextLevelIndex: 0 };
}

function makeUnitCommands(groups = []) {
  return groups.flatMap(([dir, count]) => (
    Array.from({ length: count }, () => ({ dir, distance: 1 }))
  ));
}

export function compressAdjacentCommands(commands = []) {
  return CommandEngine.compressStepList(CommandEngine.expandToStepList(commands));
}

export function prepareEfficiencyLevel(level = {}) {
  const sourceCommands = Array.isArray(level.sourceCommands)
    ? level.sourceCommands.map(command => ({ ...command }))
    : [];
  const optimalCommands = compressAdjacentCommands(sourceCommands);
  const simulation = CommandEngine.simulate(
    level.starPos || { x: 0, y: 0 },
    sourceCommands,
    level.gridSize || 5,
    []
  );

  return {
    ...level,
    sourceCommands,
    optimalCommands,
    targetLines: simulation.lines.map(line => ({ ...line })),
    goalPos: { ...simulation.finalPos }
  };
}

export function assessRouteAttempt(level = {}, result = {}) {
  const reachedGoal = Boolean(
    level.goalPos &&
    result.finalPos &&
    result.finalPos.x === level.goalPos.x &&
    result.finalPos.y === level.goalPos.y
  );
  const traveledDistance = Array.isArray(result.lines)
    ? result.lines.length
    : 0;
  const shortestDistance = level.goalPos
    ? CommandEngine.getShortestDistance(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles || []
      )
    : Number.POSITIVE_INFINITY;

  return {
    reachedGoal,
    traveledDistance,
    shortestDistance,
    isShortest: (
      reachedGoal &&
      Number.isFinite(shortestDistance) &&
      traveledDistance === shortestDistance
    ),
    extraDistance: (
      reachedGoal && Number.isFinite(shortestDistance)
        ? Math.max(0, traveledDistance - shortestDistance)
        : 0
    )
  };
}

export function assessMinimumCommandAttempt(level = {}, commands = [], result = {}) {
  const routeAssessment = assessRouteAttempt(level, result);
  const normalizedCommands = compressAdjacentCommands(commands);
  const minimumCommandCount = level.goalPos
    ? CommandEngine.getMinimumCommandCount(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles || []
      )
    : Number.POSITIVE_INFINITY;

  return {
    ...routeAssessment,
    commandCount: normalizedCommands.length,
    minimumCommandCount,
    isMinimumCommand: (
      routeAssessment.reachedGoal &&
      Number.isFinite(minimumCommandCount) &&
      normalizedCommands.length === minimumCommandCount
    ),
    extraCommands: (
      routeAssessment.reachedGoal && Number.isFinite(minimumCommandCount)
        ? Math.max(0, normalizedCommands.length - minimumCommandCount)
        : 0
    )
  };
}

export function classifyMissileOutcome(mode, solutionRule, assessment = {}) {
  if (!assessment.reachedGoal) return 'miss';
  if (!['shortest', 'routing'].includes(mode)) return 'success';
  if (solutionRule === 'minimum_commands') {
    return assessment.isMinimumCommand ? 'success' : 'retry';
  }
  return assessment.isShortest ? 'success' : 'retry';
}

export function classifyChaseCatchOutcome(actualCatchTurn, earliestCatchTurn) {
  const actualTurn = Math.max(0, Math.trunc(Number(actualCatchTurn) || 0));
  const earliestTurn = Math.max(0, Math.trunc(Number(earliestCatchTurn) || 0));
  const hasEarliestBenchmark = earliestTurn > 0;

  return {
    isCaught: actualTurn > 0,
    hasEarliestBenchmark,
    isEarliest: hasEarliestBenchmark && actualTurn === earliestTurn,
    extraTurns: hasEarliestBenchmark && actualTurn > earliestTurn
      ? actualTurn - earliestTurn
      : 0
  };
}

export function getRouteSolutionSignature(commands = []) {
  return CommandEngine.expandToStepList(commands)
    .join('>');
}

export function formatCommandCombination(commands = []) {
  return CommandEngine.compressStepList(CommandEngine.expandToStepList(commands))
    .map(command => {
      const dir = command.dir || command.type || command.action;
      if (dir === 'PEN_DOWN') return '[🖌️ 붓 누르기]';
      if (dir === 'PEN_UP') return '[✋ 붓 떼기]';
      return `[${command.distance}${DIRECTIONS[dir]?.symbol || dir}]`;
    })
    .join(' ');
}

export function classifyDrawingOutcome(requireMinimumOnly, assessment = {}) {
  if (!assessment.isExactMatch) return 'miss';
  if (assessment.isMinimum) return 'perfect';
  return requireMinimumOnly ? 'retry' : 'success';
}

export function getDrawingSuccessResultCopy(
  assessment = {},
  targetCount = 0,
  { showMinimumMetric = true } = {}
) {
  const hasMinimumMetric = showMinimumMetric && Number.isFinite(assessment.minimumDistance);
  return {
    title: hasMinimumMetric && assessment.isMinimum
      ? '✨ 축하합니다! 최소 붓 이동으로 완벽하게 그렸어요!'
      : '✨ 축하합니다! 목표 그림을 완성했어요!',
    description: hasMinimumMetric && assessment.isMinimum
      ? '목표 그림을 만들 수 있는 가장 적은 붓 이동 횟수로 완성했습니다! 다른 최소 풀이도 모두 정답입니다. 🏆✨'
      : (
          hasMinimumMetric
            ? `목표 그림의 모든 선을 완성했습니다. 같은 선을 다시 지나도 올바른 풀이이며, 최소 ${assessment.minimumDistance}칸 기록에도 도전할 수 있어요! ✨`
            : '목표 그림의 모든 선을 완성했습니다. 그린 순서·방향·반복 횟수가 달라도 올바른 풀이입니다! ✨'
        ),
    badge: hasMinimumMetric && assessment.isMinimum
      ? `🏆 최소 기록 ${assessment.actualDistance}칸 · 목표 선 ${targetCount}칸 완성`
      : (
          hasMinimumMetric
            ? `그림 완성 ${assessment.actualDistance}칸 · 최소 ${assessment.minimumDistance}칸`
            : `목표 선 ${targetCount}칸을 100% 완성`
        )
  };
}

function getDirectionKeyForUnitDelta(dx, dy) {
  return Object.entries(DIRECTIONS).find(([, direction]) => (
    direction.dx === dx && direction.dy === dy
  ))?.[0] || null;
}

/**
 * 고정된 그림 명령을 학생이 실제로 수행할 1칸 동작으로 펼칩니다.
 * [3↘]은 하나의 제시 명령이지만 모눈종이에서는 ↘ 동작 세 번으로 확인합니다.
 */
export function buildFixedDrawingActionPlan(commands = []) {
  const plan = [];
  for (const [commandIndex, command] of commands.entries()) {
    if (!command || typeof command !== 'object') continue;
    const dir = command.dir || command.type || command.action;
    if (dir === 'PEN_DOWN' || dir === 'PEN_UP') {
      plan.push({
        type: 'pen',
        dir,
        commandIndex,
        substepIndex: 0,
        commandDistance: 1
      });
      continue;
    }
    if (!DIRECTIONS[dir]) continue;
    const distance = Math.min(
      MAX_COMMAND_DISTANCE,
      Math.max(1, Number.parseInt(command.distance, 10) || 1)
    );
    for (let substepIndex = 0; substepIndex < distance; substepIndex++) {
      plan.push({
        type: 'move',
        dir,
        commandIndex,
        substepIndex,
        commandDistance: distance
      });
    }
  }
  return plan;
}

export function assessFixedDrawingExecution(level = {}, history = [], drawnLines = []) {
  const expectedActions = buildFixedDrawingActionPlan(
    level.initialCommands || level.referenceCommands || []
  );
  const actualActions = [];
  let isValid = true;

  for (const action of Array.isArray(history) ? history : []) {
    if (action?.type === 'pen') {
      actualActions.push({
        type: 'pen',
        dir: action.toPenDown === false ? 'PEN_UP' : 'PEN_DOWN'
      });
      continue;
    }
    if (action?.type !== 'move') {
      isValid = false;
      continue;
    }
    const dx = action.toX - action.fromX;
    const dy = action.toY - action.fromY;
    const dir = getDirectionKeyForUnitDelta(dx, dy);
    if (!dir) {
      isValid = false;
      continue;
    }
    actualActions.push({ type: 'move', dir });
  }

  let matchedActionCount = 0;
  const comparisonLength = Math.min(expectedActions.length, actualActions.length);
  while (
    matchedActionCount < comparisonLength &&
    expectedActions[matchedActionCount].type === actualActions[matchedActionCount].type &&
    expectedActions[matchedActionCount].dir === actualActions[matchedActionCount].dir
  ) {
    matchedActionCount++;
  }

  const figureComparison = CommandEngine.compareLineFigures(
    drawnLines,
    level.targetLines || []
  );
  const isExactOrder = (
    isValid &&
    actualActions.length === expectedActions.length &&
    matchedActionCount === expectedActions.length
  );

  return {
    ...figureComparison,
    isValid,
    isExactOrder,
    isSuccess: isExactOrder && figureComparison.isExactMatch,
    expectedActionCount: expectedActions.length,
    actualActionCount: actualActions.length,
    matchedActionCount,
    remainingActionCount: Math.max(0, expectedActions.length - matchedActionCount)
  };
}

// 사전 내장 단계 데이터셋 (다채로운 8방향 알고리즘 조합 유도)
export const PRESET_LEVELS = {
  efficiency: [
    {
      title: '🌱 효율 명령 문제 1 (5x5)',
      gridSize: 5,
      starPos: { x: 0, y: 2 },
      sourceCommands: makeUnitCommands([['RIGHT', 3]]),
      lesson: '같은 방향의 1칸 명령이 몇 번 반복되는지 세어 보세요.',
      guide: '🧠 오른쪽 1칸을 세 번 움직이는 긴 명령을 더 짧은 명령으로 나타내 보세요.'
    },
    {
      title: '🌱 효율 명령 문제 2 (5x5)',
      gridSize: 5,
      starPos: { x: 2, y: 4 },
      sourceCommands: makeUnitCommands([['UP', 3]]),
      lesson: '같은 방향으로 이어지는 명령은 이동 칸 수를 더해 묶을 수 있어요.',
      guide: '🧠 주어진 긴 명령과 이동 경로가 같도록 더 적은 명령으로 바꾸어 보세요.'
    },
    {
      title: '🌱 효율 명령 문제 3 (5x5)',
      gridSize: 5,
      starPos: { x: 0, y: 4 },
      sourceCommands: makeUnitCommands([['RIGHT', 2], ['UP', 2]]),
      lesson: '방향이 바뀌는 곳에서 명령 묶음도 새로 시작합니다.',
      guide: '🧠 오른쪽 이동과 위쪽 이동을 각각 묶어 짧게 나타내 보세요.'
    },
    {
      title: '🌱 효율 명령 문제 4 (5x5)',
      gridSize: 5,
      starPos: { x: 0, y: 4 },
      sourceCommands: makeUnitCommands([['UP_RIGHT', 3]]),
      lesson: '대각선 방향도 같은 방향이 이어지면 한 명령으로 묶을 수 있어요.',
      guide: '🧠 같은 대각선 방향이 몇 번 반복되는지 세어 효율적으로 나타내 보세요.'
    },
    {
      title: '🌿 효율 명령 문제 5 (7x7)',
      gridSize: 7,
      starPos: { x: 0, y: 6 },
      sourceCommands: makeUnitCommands([['RIGHT', 3], ['UP', 2], ['RIGHT', 2]]),
      lesson: '같은 방향이라도 다른 방향을 사이에 두고 떨어져 있으면 따로 묶어야 해요.',
      guide: '🧠 명령의 순서를 지키면서 서로 이웃한 같은 방향끼리만 묶어 보세요.'
    },
    {
      title: '🌿 효율 명령 문제 6 (7x7)',
      gridSize: 7,
      starPos: { x: 6, y: 0 },
      sourceCommands: makeUnitCommands([['DOWN_LEFT', 3], ['DOWN', 2]]),
      lesson: '대각선과 직선은 서로 다른 방향이므로 각각 묶습니다.',
      guide: '🧠 대각선 이동과 아래 이동을 구분하여 가장 짧은 명령으로 바꾸어 보세요.'
    },
    {
      title: '🌿 효율 명령 문제 7 (7x7)',
      gridSize: 7,
      starPos: { x: 0, y: 5 },
      sourceCommands: makeUnitCommands([['RIGHT', 2], ['UP', 1], ['RIGHT', 2]]),
      lesson: '떨어져 있는 오른쪽 명령을 하나로 합치면 지나가는 경로가 달라져요.',
      guide: '🧠 도착점뿐 아니라 지나가는 순서와 경로까지 같도록 명령을 줄여 보세요.'
    },
    {
      title: '🌿 효율 명령 문제 8 (7x7)',
      gridSize: 7,
      starPos: { x: 1, y: 1 },
      sourceCommands: makeUnitCommands([['RIGHT', 3], ['DOWN', 3], ['LEFT', 3], ['UP', 2]]),
      lesson: '방향이 여러 번 바뀌어도 연속된 같은 방향끼리는 한 묶음이 됩니다.',
      guide: '🧠 긴 이동 순서를 차례대로 살펴보고 방향이 바뀌는 지점마다 묶어 보세요.'
    },
    {
      title: '🔥 효율 명령 문제 9 (9x9)',
      gridSize: 9,
      starPos: { x: 0, y: 8 },
      sourceCommands: makeUnitCommands([['UP_RIGHT', 4], ['RIGHT', 3]]),
      lesson: '긴 대각선 이동도 반복 횟수를 한 번에 나타낼 수 있어요.',
      guide: '🧠 9x9 모눈종이의 긴 이동을 같은 경로의 짧은 명령으로 나타내 보세요.'
    },
    {
      title: '🔥 효율 명령 문제 10 (9x9)',
      gridSize: 9,
      starPos: { x: 8, y: 8 },
      sourceCommands: makeUnitCommands([['UP_LEFT', 3], ['UP', 2], ['LEFT', 2]]),
      lesson: '서로 다른 세 방향의 반복 횟수를 정확하게 세어 보세요.',
      guide: '🧠 대각선과 직선이 섞인 긴 명령을 순서대로 세 묶음으로 줄여 보세요.'
    },
    {
      title: '🔥 효율 명령 문제 11 (9x9)',
      gridSize: 9,
      starPos: { x: 0, y: 4 },
      sourceCommands: makeUnitCommands([['RIGHT', 3], ['LEFT', 2], ['UP', 3]]),
      lesson: '반대 방향 명령은 서로 지우지 않고 실제 이동 순서대로 남겨야 해요.',
      guide: '🧠 오른쪽과 왼쪽 이동을 없애지 말고 실제로 지나가는 경로가 같게 줄여 보세요.'
    },
    {
      title: '🔥 효율 명령 문제 12 (9x9)',
      gridSize: 9,
      starPos: { x: 1, y: 7 },
      sourceCommands: makeUnitCommands([
        ['UP', 2], ['UP_RIGHT', 2], ['RIGHT', 2], ['DOWN_RIGHT', 2], ['DOWN', 2]
      ]),
      lesson: '방향이 다섯 번 이어지는 긴 문제도 한 묶음씩 차례대로 살펴보면 쉬워요.',
      guide: '🧠 여러 방향이 섞인 긴 명령을 경로와 순서를 유지하며 효율적으로 나타내 보세요.'
    },
    {
      title: '🚀 확장 효율 명령 문제 13 (11x11)',
      gridSize: 11,
      starPos: { x: 0, y: 10 },
      sourceCommands: makeUnitCommands([
        ['UP_RIGHT', 5], ['RIGHT', 4], ['DOWN', 2]
      ]),
      lesson: '큰 모눈종이의 긴 반복도 방향이 바뀌는 곳을 기준으로 묶으면 간단해져요.',
      guide: '🧠 11x11 모눈종이의 긴 이동을 경로와 순서를 유지하며 효율적으로 나타내 보세요.'
    }
  ],
  shortest: [
    // 🌱 입문 5x5 단계
    {
      title: '🌱 미사일 문제 1 (5x5)',
      gridSize: 5,
      starPos: { x: 0, y: 4 },
      goalPos: { x: 4, y: 1 },
      obstacles: [],
      guide: '🎯 미션: 대각선(↗) 이동과 직진(→) 이동을 조합하여 가장 적은 이동 명령으로 🎯 목표점에 도착하세요!'
    },
    {
      title: '🌱 미사일 문제 2 (5x5)',
      gridSize: 5,
      starPos: { x: 1, y: 0 },
      goalPos: { x: 4, y: 4 },
      obstacles: [],
      guide: '🎯 미션: 8방향 지름길(↘)과 아래 직진(↓) 명령을 조화롭게 배치하여 🎯 목표점에 도달하세요!'
    },
    // 🌿 표준 7x7 단계
    {
      title: '🌿 미사일 문제 3 (7x7)',
      gridSize: 7,
      starPos: { x: 0, y: 6 },
      goalPos: { x: 6, y: 1 },
      obstacles: [],
      guide: '🎯 미션: 단순한 일직선 대신 (↗)대각선과 (→)오른쪽 이동을 조합하여 가장 짧은 미사일 경로를 만드세요!'
    },
    {
      title: '🌿 미사일 문제 4 (7x7)',
      gridSize: 7,
      starPos: { x: 1, y: 1 },
      goalPos: { x: 5, y: 4 },
      obstacles: [],
      guide: '🎯 미션: (↘)대각선과 (→)직진 명령의 칸 수를 정확히 계산하여 🎯 목표점을 조준하세요!'
    },
    {
      title: '🌿 미사일 문제 5 (7x7)',
      gridSize: 7,
      starPos: { x: 6, y: 5 },
      goalPos: { x: 0, y: 1 },
      obstacles: [],
      guide: '🎯 미션: (↖)왼쪽 위 대각선과 (←)왼쪽 직진 명령을 조합하여 가장 짧은 경로로 목표점에 도착하세요!'
    },
    // 🔥 도전 9x9 단계
    {
      title: '🔥 미사일 문제 6 (9x9)',
      gridSize: 9,
      starPos: { x: 0, y: 8 },
      goalPos: { x: 8, y: 2 },
      obstacles: [],
      guide: '🎯 미션: 9x9 큰 모눈종이에서 대각선과 직진 경로를 종합 계산하여 최고의 효율 코드를 완성하세요!'
    },
    {
      title: '🔥 미사일 문제 7 (9x9)',
      gridSize: 9,
      starPos: { x: 2, y: 0 },
      goalPos: { x: 7, y: 8 },
      obstacles: [],
      guide: '🎯 미션: 수직(↓) 이동과 대각선(↘) 이동을 정밀 조율하여 🎯 목표점을 타격하세요!'
    },
    {
      title: '🚀 확장 미사일 문제 8 (11x11)',
      gridSize: 11,
      starPos: { x: 0, y: 10 },
      goalPos: { x: 10, y: 2 },
      obstacles: [],
      guide: '🎯 미션: 11x11 확장 모눈종이에서 대각선과 직선 이동을 조합해 가장 짧게 목표점에 도착하세요!'
    }
  ],
  routing: [
    // 🌱 입문 5x5 단계
    {
      title: '🌱 장애물 문제 1 (5x5)',
      gridSize: 5,
      starPos: { x: 0, y: 4 },
      goalPos: { x: 4, y: 1 },
      obstacles: [{ x: 2, y: 2 }, { x: 3, y: 2 }],
      guide: '💡 미션: 대각선 직선 길목을 차단한 장애물(🔴)을 우회하여 🎯 목표점에 도착하세요!'
    },
    {
      title: '🌱 장애물 문제 2 (5x5)',
      gridSize: 5,
      starPos: { x: 1, y: 0 },
      goalPos: { x: 3, y: 4 },
      obstacles: [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
      guide: '💡 미션: 세로로 솟아오른 장벽(🔴)을 오른쪽이나 왼쪽으로 돌아가는 코드를 조립하세요!'
    },
    // 🌿 표준 7x7 단계
    {
      title: '🌿 장애물 문제 3 (7x7)',
      gridSize: 7,
      starPos: { x: 1, y: 1 },
      goalPos: { x: 5, y: 5 },
      obstacles: [{ x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }],
      guide: '💡 미션: 대각선 직진 경로가 100% 막혔습니다! 외곽 (→) 및 (↓) 경로로 돌파하세요.'
    },
    {
      title: '🌿 장애물 문제 4 (7x7)',
      gridSize: 7,
      starPos: { x: 0, y: 6 },
      goalPos: { x: 6, y: 0 },
      obstacles: [{ x: 2, y: 4 }, { x: 3, y: 3 }, { x: 4, y: 2 }],
      guide: '💡 미션: 중앙 대각선 방화벽(🔴)을 S자 형태로 슬기롭게 우회하는 알고리즘을 설계하세요!'
    },
    // 🔥 도전 9x9 단계
    {
      title: '🔥 장애물 문제 5 (9x9)',
      gridSize: 9,
      starPos: { x: 0, y: 8 },
      goalPos: { x: 8, y: 1 },
      obstacles: [{ x: 3, y: 5 }, { x: 4, y: 4 }, { x: 5, y: 3 }, { x: 4, y: 5 }, { x: 4, y: 3 }],
      guide: '💡 미션: 요새 형태로 둘러싸인 거대 9x9 방화벽(🔴)을 지혜롭게 우회하세요!'
    },
    {
      title: '🚀 확장 장애물 문제 6 (11x11)',
      gridSize: 11,
      starPos: { x: 0, y: 10 },
      goalPos: { x: 10, y: 1 },
      obstacles: [
        { x: 4, y: 6 }, { x: 5, y: 5 }, { x: 6, y: 4 },
        { x: 5, y: 6 }, { x: 5, y: 4 }, { x: 6, y: 5 }
      ],
      guide: '💡 미션: 11x11 확장 모눈종이의 중앙 장애물 구역을 피해 실제 최단 우회 경로를 찾아보세요!'
    }
  ],
  debug: [
    // 🌱 입문 5x5 단계
    {
      title: '🌱 그림 문제 1 (5x5)',
      gridSize: 5,
      starPos: { x: 1, y: 3 },
      targetLines: [
        { fromX: 1, fromY: 3, toX: 1, toY: 1 },
        { fromX: 1, fromY: 1, toX: 3, toY: 3 },
        { fromX: 3, fromY: 3, toX: 1, toY: 3 }
      ],
      guide: '🎨 [그림 보고 만들기]: 5x5 모눈종이 위 🔺 삼각형 밑그림을 보고 붓을 움직여 똑같이 그려내세요!'
    },
    // 🌿 표준 7x7 단계
    {
      title: '🌿 그림 문제 2 (7x7)',
      gridSize: 7,
      starPos: { x: 1, y: 5 },
      targetLines: [
        { fromX: 1, fromY: 5, toX: 1, toY: 2 },
        { fromX: 1, fromY: 2, toX: 3, toY: 0 },
        { fromX: 3, fromY: 0, toX: 5, toY: 2 },
        { fromX: 5, fromY: 2, toX: 5, toY: 5 },
        { fromX: 5, fromY: 5, toX: 1, toY: 5 }
      ],
      guide: '🎨 [그림 보고 만들기]: 모눈종이에 표시된 집 밑그림(🏠)을 보고 붓(🖌️)을 움직여 똑같이 그려내세요!'
    },
    {
      title: '🌿 그림 문제 3 (7x7)',
      gridSize: 7,
      starPos: { x: 1, y: 5 },
      targetLines: [
        { fromX: 1, fromY: 5, toX: 1, toY: 1 },
        { fromX: 1, fromY: 1, toX: 2, toY: 2 },
        { fromX: 2, fromY: 2, toX: 3, toY: 1 },
        { fromX: 3, fromY: 1, toX: 4, toY: 2 },
        { fromX: 4, fromY: 2, toX: 5, toY: 1 },
        { fromX: 5, fromY: 1, toX: 5, toY: 5 },
        { fromX: 5, fromY: 5, toX: 1, toY: 5 }
      ],
      guide: '🎨 [그림 보고 만들기]: 뾰족한 왕관 컵(👑) 밑그림을 따라 그리도록 이동 명령어를 조립하세요!'
    },
    // 🔥 도전 9x9 단계
    {
      title: '🔥 그림 문제 4 (9x9)',
      gridSize: 9,
      starPos: { x: 4, y: 1 },
      targetLines: [
        { fromX: 4, fromY: 1, toX: 7, toY: 4 },
        { fromX: 7, fromY: 4, toX: 4, toY: 7 },
        { fromX: 4, fromY: 7, toX: 1, toY: 4 },
        { fromX: 1, fromY: 4, toX: 4, toY: 1 }
      ],
      guide: '🎨 [그림 보고 만들기]: 9x9 모눈종이에 그려진 웅장한 다이아몬드 타워(💎)를 완성해 보세요!'
    },
    {
      title: '🚀 확장 그림 문제 5 (11x11)',
      gridSize: 11,
      starPos: { x: 2, y: 8 },
      targetLines: [
        { fromX: 2, fromY: 8, toX: 2, toY: 4 },
        { fromX: 2, fromY: 4, toX: 5, toY: 1 },
        { fromX: 5, fromY: 1, toX: 8, toY: 4 },
        { fromX: 8, fromY: 4, toX: 8, toY: 8 },
        { fromX: 8, fromY: 8, toX: 2, toY: 8 }
      ],
      guide: '🎨 [그림 보고 만들기]: 11x11 확장 모눈종이에 제시된 큰 밑그림의 모든 선을 완성해 보세요!'
    }
  ],
  debug_guide: [
    // 🌱 입문 5x5 단계
    {
      title: '🌱 명령어 읽기 문제 1 (5x5)',
      gridSize: 5,
      starPos: { x: 1, y: 3 },
      targetLines: [
        { fromX: 1, fromY: 3, toX: 1, toY: 1 },
        { fromX: 1, fromY: 1, toX: 3, toY: 3 },
        { fromX: 3, fromY: 3, toX: 1, toY: 3 }
      ],
      initialCommands: [
        { dir: 'UP', distance: 2 },
        { dir: 'DOWN_RIGHT', distance: 2 },
        { dir: 'LEFT', distance: 2 }
      ],
      guide: '📜 [명령어 따라 그리기]: 준비된 삼각형 코딩 순서를 읽고 붓을 잡아 모눈종이에 직접 그려보세요!'
    },
    // 🌿 표준 7x7 단계
    {
      title: '🌿 명령어 읽기 문제 2 (7x7)',
      gridSize: 7,
      starPos: { x: 1, y: 5 },
      targetLines: [
        { fromX: 1, fromY: 5, toX: 1, toY: 2 },
        { fromX: 1, fromY: 2, toX: 3, toY: 0 },
        { fromX: 3, fromY: 0, toX: 5, toY: 2 },
        { fromX: 5, fromY: 2, toX: 5, toY: 5 },
        { fromX: 5, fromY: 5, toX: 1, toY: 5 }
      ],
      initialCommands: [
        { dir: 'UP', distance: 3 },
        { dir: 'UP_RIGHT', distance: 2 },
        { dir: 'DOWN_RIGHT', distance: 2 },
        { dir: 'DOWN', distance: 3 },
        { dir: 'LEFT', distance: 4 }
      ],
      guide: '📜 [명령어 따라 그리기]: 미리 입력된 명령어를 읽고 붓을 잡고 한 칸 한 칸 맞춰 그려내세요!'
    },
    // 🔥 도전 9x9 단계
    {
      title: '🔥 명령어 읽기 문제 3 (9x9)',
      gridSize: 9,
      starPos: { x: 4, y: 1 },
      targetLines: [
        { fromX: 4, fromY: 1, toX: 7, toY: 4 },
        { fromX: 7, fromY: 4, toX: 4, toY: 7 },
        { fromX: 4, fromY: 7, toX: 1, toY: 4 },
        { fromX: 1, fromY: 4, toX: 4, toY: 1 }
      ],
      initialCommands: [
        { dir: 'DOWN_RIGHT', distance: 3 },
        { dir: 'DOWN_LEFT', distance: 3 },
        { dir: 'UP_LEFT', distance: 3 },
        { dir: 'UP_RIGHT', distance: 3 }
      ],
      guide: '📜 [명령어 따라 그리기]: 9x9 대형 모눈종이 코딩 순서를 정확하게 읽고 드래그하여 그려내세요!'
    },
    {
      title: '🚀 확장 명령어 읽기 문제 4 (11x11)',
      gridSize: 11,
      starPos: { x: 2, y: 8 },
      targetLines: [
        { fromX: 2, fromY: 8, toX: 2, toY: 4 },
        { fromX: 2, fromY: 4, toX: 5, toY: 1 },
        { fromX: 5, fromY: 1, toX: 8, toY: 4 },
        { fromX: 8, fromY: 4, toX: 8, toY: 8 },
        { fromX: 8, fromY: 8, toX: 2, toY: 8 }
      ],
      initialCommands: [
        { dir: 'UP', distance: 4 },
        { dir: 'UP_RIGHT', distance: 3 },
        { dir: 'DOWN_RIGHT', distance: 3 },
        { dir: 'DOWN', distance: 4 },
        { dir: 'LEFT', distance: 6 }
      ],
      guide: '📜 [명령어 따라 그리기]: 11x11 확장 모눈종이의 긴 명령을 한 칸씩 정확히 읽고 그림을 완성하세요!'
    }
  ],
  chase: [
    // 5x5 입문
    [
      {
        title: '🌱 도둑 잡기 문제 1 (5x5)',
        gridSize: 5,
        starPos: { x: 0, y: 4 },
        thiefPos: { x: 4, y: 0 },
        thiefCommands: [{ dir: 'LEFT', distance: 2 }, { dir: 'DOWN', distance: 2 }],
        obstacles: [],
        guide: '👮‍♂️ 미션: 5x5 작은 모눈종이에서 도둑의 도주 경로(←2, ↓2)를 파악하고 1:1 체포를 성공시키세요!'
      }
    ],
    // 7x7 표준
    [
      {
        title: '🌿 도둑 잡기 문제 2 (7x7)',
        gridSize: 7,
        starPos: { x: 0, y: 6 },
        thiefPos: { x: 6, y: 0 },
        thiefCommands: [{ dir: 'LEFT', distance: 3 }, { dir: 'DOWN', distance: 3 }],
        obstacles: [],
        guide: '👮‍♂️ 미션: 도둑의 공개된 경로(←3칸, ↓3칸)를 파악하고 한 차례에 1칸씩 이동하는 규칙에 맞춰 도둑을 검거하세요!'
      },
      {
        title: '🌿 도둑 잡기 문제 3 (7x7)',
        gridSize: 7,
        starPos: { x: 6, y: 6 },
        thiefPos: { x: 0, y: 0 },
        thiefCommands: [{ dir: 'RIGHT', distance: 3 }, { dir: 'DOWN', distance: 3 }],
        obstacles: [{ x: 5, y: 5 }, { x: 4, y: 4 }],
        guide: '👮‍♂️ 미션: 대각선 길목의 장애물을 피해 도둑의 이동 경로를 앞질러 체포하세요!'
      }
    ],
    // 9x9 도전
    [
      {
        title: '🔥 도둑 잡기 문제 4 (9x9)',
        gridSize: 9,
        starPos: { x: 0, y: 8 },
        thiefPos: { x: 8, y: 0 },
        thiefCommands: [{ dir: 'LEFT', distance: 4 }, { dir: 'DOWN', distance: 4 }, { dir: 'LEFT', distance: 2 }],
        obstacles: [{ x: 1, y: 7 }, { x: 2, y: 6 }, { x: 3, y: 5 }],
        guide: '👮‍♂️ 미션: 9x9 모눈종이의 장애물을 우회하면서 도둑의 긴 도주 경로를 예측해 길목을 막으세요!'
      }
    ],
    // 11x11 확장
    [
      {
        title: '🚀 확장 도둑 잡기 문제 5 (11x11)',
        gridSize: 11,
        starPos: { x: 0, y: 10 },
        thiefPos: { x: 10, y: 0 },
        thiefCommands: [{ dir: 'LEFT', distance: 5 }, { dir: 'DOWN', distance: 5 }],
        obstacles: [{ x: 1, y: 9 }, { x: 2, y: 8 }, { x: 3, y: 7 }, { x: 4, y: 6 }],
        guide: '👮‍♂️ 미션: 11x11 확장 모눈종이의 장애물 지대를 돌아 도둑보다 먼저 예상 지점에 도착하세요!'
      }
    ]
  ]
};

const expandedProblemModes = new Set();

export function ensurePresetProblemBankMode(mode) {
  if (expandedProblemModes.has(mode)) return false;
  expandPresetProblemBank(PRESET_LEVELS, [mode]);
  if (!Array.isArray(PRESET_LEVELS[mode])) return false;
  expandedProblemModes.add(mode);
  return true;
}

export function getRequiredProblemBankModes(mode, challengeType = 'stage') {
  if (
    challengeType === 'education' &&
    ['debug', 'debug_guide'].includes(mode)
  ) {
    // 그림 교육 1단계는 debug_guide, 2단계는 debug 문제은행을 함께 쓴다.
    // 선택한 현재 활동만 준비하면 1단계 후보가 부족해지는 오류가 발생한다.
    return ['debug', 'debug_guide'];
  }
  if (
    challengeType === 'education' &&
    ['shortest', 'routing', 'efficiency'].includes(mode)
  ) {
    // 미사일 교육은 단계마다 효율(③), 최단(①·②·④), 장애물(④·⑤) 문제은행을
    // 섞어 쓴다. 현재 활동만 준비하면 브라우저에서 단계별 문제가 줄어든다.
    return ['shortest', 'routing', 'efficiency'];
  }
  return [mode];
}

// 자동 검사와 활동지 생성은 전체 문제은행을 즉시 전수 검증한다. 브라우저는
// 첫 화면을 먼저 보여 주고 학생이 고른 활동만 준비해 저사양 기기의 시작
// 지연을 줄인다.
if (typeof window === 'undefined') {
  expandPresetProblemBank(PRESET_LEVELS);
  Object.keys(PRESET_LEVELS).forEach(mode => expandedProblemModes.add(mode));
}

export function getLevelsForGridSize(levelList = [], gridSize) {
  return levelList
    .flatMap(entry => Array.isArray(entry) ? entry : [entry])
    .filter(level => level && level.gridSize === gridSize);
}

export function getRandomChallengeTargetCount(mode, gridSize) {
  const availableProblemCount = getLevelsForGridSize(
    PRESET_LEVELS[mode] || [],
    gridSize
  ).length;
  return availableProblemCount > 0
    ? Math.min(10, availableProblemCount)
    : 10;
}

export function getNextProblemButtonLabel(mode, challengeType = 'stage') {
  const activityLabel = {
    efficiency: '효율 명령 문제',
    shortest: '미사일 문제',
    routing: '장애물 문제',
    debug: '그림 문제',
    debug_guide: '명령 읽기 문제',
    single_stroke: '한붓그리기 문제',
    chase: '추격 문제'
  }[mode] || '문제';

  if (challengeType === 'random') return `다음 도전 ${activityLabel} ➡️`;
  if (challengeType === 'timeattack') return `다음 ${activityLabel} 이어서 도전 ➡️`;
  if (challengeType === 'infinite') return `다음 ${activityLabel} 계속 도전 ➡️`;
  return `다음 ${activityLabel} ➡️`;
}

export function getObstacleMapType(level = {}) {
  return Array.isArray(level.obstacles) && level.obstacles.length > 0
    ? 'obstacle'
    : 'open';
}

export function partitionLevelsByObstacle(levelList = [], gridSize) {
  const levels = getLevelsForGridSize(levelList, gridSize);
  return {
    open: levels.filter(level => getObstacleMapType(level) === 'open'),
    obstacle: levels.filter(level => getObstacleMapType(level) === 'obstacle')
  };
}

function shuffleProblemLevels(levels, random = Math.random) {
  const shuffled = [...levels];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function getLongestObstacleTypeRun(levels = []) {
  let longestRun = 0;
  let currentRun = 0;
  let previousType = '';
  for (const level of levels) {
    const type = getObstacleMapType(level);
    currentRun = type === previousType ? currentRun + 1 : 1;
    previousType = type;
    longestRun = Math.max(longestRun, currentRun);
  }
  return longestRun;
}

export function buildRandomProblemBag(levelList = [], gridSize, random = Math.random) {
  const groups = partitionLevelsByObstacle(levelList, gridSize);
  const pool = [...groups.open, ...groups.obstacle];
  if (pool.length <= 1 || groups.open.length === 0 || groups.obstacle.length === 0) {
    return shuffleProblemLevels(pool, random);
  }

  const majorityCount = Math.max(groups.open.length, groups.obstacle.length);
  const minorityCount = Math.min(groups.open.length, groups.obstacle.length);
  const smallestPossibleRun = Math.ceil(majorityCount / (minorityCount + 1));

  for (let attempt = 0; attempt < 120; attempt++) {
    const candidate = shuffleProblemLevels(pool, random);
    if (getLongestObstacleTypeRun(candidate) <= smallestPossibleRun) {
      return candidate;
    }
  }

  const majority = shuffleProblemLevels(
    groups.open.length >= groups.obstacle.length ? groups.open : groups.obstacle,
    random
  );
  const minority = shuffleProblemLevels(
    groups.open.length >= groups.obstacle.length ? groups.obstacle : groups.open,
    random
  );
  const slots = Array.from({ length: minority.length + 1 }, () => []);
  majority.forEach((level, index) => slots[index % slots.length].push(level));
  return slots.flatMap((slot, index) => (
    index < minority.length ? [...slot, minority[index]] : slot
  ));
}

export { MAX_COMMAND_DISTANCE };
export const MAX_COMMAND_COUNT = 128;

export function appendDirectionCommand(commands = [], dirKey, isChaseMode = false) {
  const nextCommands = commands.map(command => ({ ...command }));
  if (!DIRECTIONS[dirKey]) return nextCommands;

  if (isChaseMode) {
    nextCommands.push({ dir: dirKey, distance: 1 });
    return nextCommands;
  }

  const lastCommand = nextCommands[nextCommands.length - 1];
  if (
    lastCommand &&
    lastCommand.dir === dirKey &&
    lastCommand.distance < MAX_COMMAND_DISTANCE
  ) {
    lastCommand.distance += 1;
  } else {
    nextCommands.push({ dir: dirKey, distance: 1 });
  }

  return nextCommands;
}

export function appendPenCommand(commands = [], dirKey) {
  const nextCommands = commands.map(command => ({ ...command }));
  if (!['PEN_DOWN', 'PEN_UP'].includes(dirKey)) return nextCommands;
  nextCommands.push({ dir: dirKey, distance: 1 });
  return nextCommands;
}

export class App {
  constructor() {
    this.canvas = document.getElementById('grid-canvas');
    this.renderer = new GridRenderer(this.canvas);
    
    this.currentMode = 'shortest';
    this.currentLearningMode = 'missile';
    this.lastActivityByLearningMode = {
      missile: 'shortest',
      drawing: 'debug',
      chase: 'chase',
      creator: 'creator'
    };
    this.creatorType = 'bomb'; // 'bomb' (미사일 문제) 또는 'draw' (그림 문제)
    this.drawSubmode = 'free'; // 'free' (자유 그림 그리기) 또는 'guide' (그림 그리는 방법)
    this.activeCreatorTool = 'obstacle'; // 'obstacle' (🔴 장애물), 'star' (🚀 시작점), 'goal' (🎯 목표점)
    this.levelIndex = 0;
    this.commands = [];
    this.isExecuting = false;
    this.executionId = 0;
    this.currentLevel = null;
    this.hasEnteredPlayScreen = false;
    this.studentDrawnLines = []; // 명령 보고 그림 그리기 모드 전용 학생 직접 드래그 선 목록
    this.studentRedoLines = []; // 되돌린 뒤 '앞으로'로 복원할 수 있는 선 목록
    this.studentDrawHistory = []; // 붓 상태·공중 이동까지 포함한 실제 학생 동작 기록
    this.studentRedoHistory = [];
    this.isGhostTrailActive = false; // 붓 이동 경로 라이브 힌트 예약선 토글 플래그 (기본값 OFF)

    // 챌린지 및 무작위/타임어택/무한/여러 풀이 찾기 데이터
    this.challengeType = 'stage';
    this.lastChallengeType = 'stage';
    this.missileSolutionRule = 'shortest';
    this.requireMinimumDrawing = false;
    this.challengeState = {
      solvedCount: 0,
      streak: 0,
      bestStreak: 0,
      score: 0,
      timeRemaining: 60
    };
    this.timerInterval = null;
    this.creatorGridSize = 7;
    this.selectedGridSize = 5;
    this.problemDrawBags = new Map();
    this.lastDrawnProblemKeys = new Map();
    this.multiSolutionSignatures = new Set();
    this.multiSolutionAnswerSignatures = new Set();
    this.multiSolutionEntries = [];
    this.multiSolutionGoalCount = 0;
    this.multiSolutionTargetCount = 0;
    this.timerPauseReasons = new Set();
    this.selectedEducationLesson = 'sequence';
    this.educationLessonSelections = {
      missile: 'sequence',
      drawing: 'draw_sequence'
    };
    this.educationCompletedLessons = {
      missile: new Set(),
      drawing: new Set()
    };
    this.educationLevelIndex = 0;
    this.educationProblemSelections = {};
    this.educationProblemBankCache = new Map();
    this.educationRouteSignatures = new Set();
    this.educationRouteEntries = [];
    this.commandBlockDefinitions = { A: [], B: [] };
    this.commandBlockEditTarget = 'main';
    this.modalReturnFocus = null;
    this.isRestoringEducationProgress = false;
    const restoredEducationProgress = this.restoreEducationProgress();

    this.initUI();
    if (!this.checkURLPuzzle()) {
      if (restoredEducationProgress?.active) {
        this.resumeEducationProgress(restoredEducationProgress);
      } else {
        this.showModeSelectionScreen({ focusHeading: false, suspendActivity: false });
      }
    }
  }

  getEducationStorage() {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  }

  sanitizeStoredCommands(commands = [], limit = MAX_COMMAND_COUNT) {
    if (!Array.isArray(commands)) return [];
    return commands.slice(0, limit).flatMap(command => {
      if (!command || typeof command !== 'object' || Array.isArray(command)) return [];
      const type = command.dir || command.type;
      if (type === 'PEN_DOWN' || type === 'PEN_UP') {
        return [{ dir: type, distance: 1 }];
      }
      if (Object.hasOwn(DIRECTIONS, type)) {
        const distance = Math.min(
          MAX_COMMAND_DISTANCE,
          Math.max(1, Number.parseInt(command.distance, 10) || 1)
        );
        return [{ dir: type, distance }];
      }
      if (
        command.type === 'block' &&
        ['A', 'B'].includes(command.blockId)
      ) {
        return [{
          type: 'block',
          blockId: command.blockId,
          repeat: Math.min(9, Math.max(1, Number.parseInt(command.repeat, 10) || 1))
        }];
      }
      return [];
    });
  }

  sanitizeStoredStudentDrawHistory(history = [], gridSize = 11) {
    if (!Array.isArray(history)) return [];
    const safeGridSize = Math.min(11, Math.max(5, Number.parseInt(gridSize, 10) || 5));
    const isGridPoint = value => (
      Number.isInteger(value) && value >= 0 && value < safeGridSize
    );

    return history.slice(0, MAX_COMMAND_COUNT * MAX_COMMAND_DISTANCE).flatMap(action => {
      if (!action || typeof action !== 'object' || Array.isArray(action)) return [];
      if (action.type === 'pen') {
        return [{
          type: 'pen',
          fromPenDown: action.fromPenDown !== false,
          toPenDown: action.toPenDown !== false,
          x: isGridPoint(action.x) ? action.x : 0,
          y: isGridPoint(action.y) ? action.y : 0
        }];
      }
      if (
        action.type !== 'move' ||
        ![action.fromX, action.fromY, action.toX, action.toY].every(isGridPoint)
      ) {
        return [];
      }
      const dx = action.toX - action.fromX;
      const dy = action.toY - action.fromY;
      if (!getDirectionKeyForUnitDelta(dx, dy)) return [];
      return [{
        type: 'move',
        fromX: action.fromX,
        fromY: action.fromY,
        toX: action.toX,
        toY: action.toY,
        penDown: action.penDown !== false,
        drewLine: action.drewLine !== false,
        color: typeof action.color === 'string' ? action.color.slice(0, 24) : 'rainbow'
      }];
    });
  }

  restoreEducationProgress() {
    const storage = this.getEducationStorage();
    if (!storage) return null;
    try {
      const parsed = JSON.parse(storage.getItem(EDUCATION_PROGRESS_STORAGE_KEY) || 'null');
      if (!parsed || parsed.version !== EDUCATION_PROGRESS_VERSION) return null;

      const validLessonIds = {
        missile: new Set(EDUCATION_LESSONS.map(lesson => lesson.id)),
        drawing: new Set(DRAWING_EDUCATION_LESSONS.map(lesson => lesson.id))
      };
      for (const learningMode of ['missile', 'drawing']) {
        const completed = Array.isArray(parsed.completedLessons?.[learningMode])
          ? parsed.completedLessons[learningMode].filter(id => validLessonIds[learningMode].has(id))
          : [];
        this.educationCompletedLessons[learningMode] = new Set(completed);
        const selection = parsed.lessonSelections?.[learningMode];
        if (validLessonIds[learningMode].has(selection)) {
          this.educationLessonSelections[learningMode] = selection;
        }
      }

      const storedProblemSelections = parsed.problemSelections;
      if (storedProblemSelections && typeof storedProblemSelections === 'object') {
        for (const [key, values] of Object.entries(storedProblemSelections)) {
          if (typeof key !== 'string' || !Array.isArray(values)) continue;
          const sanitized = [...new Set(values.filter(value => typeof value === 'string'))]
            .slice(0, EDUCATION_SESSION_PROBLEM_COUNT);
          if (sanitized.length > 0) this.educationProblemSelections[key] = sanitized;
        }
      }

      const learningMode = parsed.learningMode === 'drawing' ? 'drawing' : 'missile';
      const validModes = learningMode === 'drawing'
        ? ['debug', 'debug_guide']
        : ['shortest', 'routing'];
      const mode = validModes.includes(parsed.currentMode) ? parsed.currentMode : validModes[0];
      const lessons = learningMode === 'drawing' ? DRAWING_EDUCATION_LESSONS : EDUCATION_LESSONS;
      const selectedLesson = lessons.some(lesson => lesson.id === parsed.selectedLesson)
        ? parsed.selectedLesson
        : this.educationLessonSelections[learningMode];
      const lesson = lessons.find(entry => entry.id === selectedLesson) || lessons[0];
      const selectedGridSize = lesson.sizes.includes(parsed.selectedGridSize)
        ? parsed.selectedGridSize
        : lesson.sizes[0];

      return {
        active: Boolean(parsed.active),
        learningMode,
        currentMode: mode,
        selectedLesson: lesson.id,
        selectedGridSize,
        educationLevelIndex: Math.max(0, Number.parseInt(parsed.educationLevelIndex, 10) || 0),
        commands: this.sanitizeStoredCommands(parsed.commands),
        commandBlockDefinitions: {
          A: this.sanitizeStoredCommands(parsed.commandBlockDefinitions?.A, MAX_PATTERN_DEFINITION_COMMANDS),
          B: this.sanitizeStoredCommands(parsed.commandBlockDefinitions?.B, MAX_PATTERN_DEFINITION_COMMANDS)
        },
        commandBlockEditTarget: ['main', 'A', 'B'].includes(parsed.commandBlockEditTarget)
          ? parsed.commandBlockEditTarget
          : 'main',
        studentDrawHistory: this.sanitizeStoredStudentDrawHistory(
          parsed.studentDrawHistory,
          selectedGridSize
        ),
        routeSignatures: Array.isArray(parsed.routeSignatures)
          ? parsed.routeSignatures.filter(value => typeof value === 'string').slice(0, 8)
          : [],
        routeEntries: Array.isArray(parsed.routeEntries)
          ? parsed.routeEntries.filter(entry => entry && typeof entry === 'object').slice(0, 8)
          : []
      };
    } catch {
      return null;
    }
  }

  saveEducationProgress({ active = this.isEducationMode() } = {}) {
    if (this.isRestoringEducationProgress) return false;
    // 일반 도전 화면을 여는 과정에서 마지막 교육 이어하기 기록을 빈 명령으로
    // 덮어쓰지 않는다. 교육 화면을 나갈 때는 아직 교육 상태인 동안 명시적으로
    // active:false를 저장하므로 안전하게 이어서 불러올 수 있다.
    if (!this.isEducationMode() && !active) return false;
    const storage = this.getEducationStorage();
    if (!storage) return false;
    const learningMode = this.getEducationLearningMode();
    const record = {
      version: EDUCATION_PROGRESS_VERSION,
      active: Boolean(active),
      learningMode,
      currentMode: this.currentMode,
      selectedLesson: this.selectedEducationLesson,
      selectedGridSize: this.selectedGridSize,
      educationLevelIndex: this.educationLevelIndex,
      lessonSelections: { ...this.educationLessonSelections },
      completedLessons: {
        missile: [...this.getCompletedEducationLessons('missile')],
        drawing: [...this.getCompletedEducationLessons('drawing')]
      },
      problemSelections: { ...this.educationProblemSelections },
      commands: this.isEducationMode() ? this.sanitizeStoredCommands(this.commands) : [],
      commandBlockDefinitions: this.isEducationMode()
        ? {
            A: this.sanitizeStoredCommands(this.commandBlockDefinitions?.A, MAX_PATTERN_DEFINITION_COMMANDS),
            B: this.sanitizeStoredCommands(this.commandBlockDefinitions?.B, MAX_PATTERN_DEFINITION_COMMANDS)
          }
        : { A: [], B: [] },
      commandBlockEditTarget: this.commandBlockEditTarget,
      studentDrawHistory: this.isEducationMode() && this.isFixedCommandDrawingMode()
        ? this.sanitizeStoredStudentDrawHistory(this.studentDrawHistory, this.currentLevel?.gridSize)
        : [],
      routeSignatures: this.isEducationMode() ? [...(this.educationRouteSignatures || [])] : [],
      routeEntries: this.isEducationMode() ? (this.educationRouteEntries || []) : []
    };
    try {
      storage.setItem(EDUCATION_PROGRESS_STORAGE_KEY, JSON.stringify(record));
      return true;
    } catch {
      return false;
    }
  }

  resumeEducationProgress(progress) {
    this.isRestoringEducationProgress = true;
    this.currentMode = progress.currentMode;
    this.challengeType = 'education';
    this.selectedEducationLesson = progress.selectedLesson;
    this.educationLessonSelections[progress.learningMode] = progress.selectedLesson;
    this.selectedGridSize = progress.selectedGridSize;
    this.educationLevelIndex = progress.educationLevelIndex;
    this.enterPlayScreen();
    this.syncActivityNavigation(this.currentMode, { scrollTab: false });
    this.setChallengeSettingsVisible(true);
    this.loadLevel();
    const isFixedDrawing = this.isFixedCommandDrawingMode();
    this.commands = isFixedDrawing ? [] : progress.commands;
    this.commandBlockDefinitions = progress.commandBlockDefinitions;
    this.commandBlockEditTarget = progress.commandBlockEditTarget;
    this.educationRouteSignatures = new Set(progress.routeSignatures);
    this.educationRouteEntries = progress.routeEntries;
    if (isFixedDrawing) {
      this.studentDrawHistory = this.getRestorableFixedDrawingHistory(
        progress.studentDrawHistory
      );
      this.studentRedoHistory = [];
      this.syncStudentDrawingFromHistory();
    }
    this.isRestoringEducationProgress = false;
    this.renderCommandQueue();
    this.updateCommandBlockWorkspace();
    this.renderMultiSolutionList();
    this.renderDrawingEducationTask(this.currentLevel);
    this.updateEducationCurriculumUI();
    this.updateModeHierarchySummary();
    this.saveEducationProgress({ active: true });
    this.setStatus(
      isFixedDrawing
        ? '💾 이전에 하던 교육 문제와 그리던 위치를 이어서 불러왔습니다.'
        : '💾 이전에 하던 교육 문제와 명령 조합을 이어서 불러왔습니다.',
      'info'
    );
    return true;
  }

  getStoredEducationResume(learningMode) {
    const progress = this.restoreEducationProgress();
    if (!progress || progress.learningMode !== learningMode) return null;
    return progress;
  }

  updateEducationEntryButtons() {
    for (const learningMode of ['missile', 'drawing']) {
      const resumeButton = document.getElementById(`${learningMode}-education-resume-btn`);
      if (!resumeButton) continue;
      const progress = this.getStoredEducationResume(learningMode);
      resumeButton.disabled = !progress;
      resumeButton.hidden = !progress;
      if (progress) {
        const lessons = learningMode === 'drawing'
          ? DRAWING_EDUCATION_LESSONS
          : EDUCATION_LESSONS;
        const lesson = lessons.find(entry => entry.id === progress.selectedLesson) || lessons[0];
        resumeButton.textContent = `이어하기 · ${lesson.order}단계`;
      }
    }
  }

  startEducationFromBeginning(learningMode) {
    const lessons = learningMode === 'drawing'
      ? DRAWING_EDUCATION_LESSONS
      : EDUCATION_LESSONS;
    const mode = learningMode === 'drawing' ? 'debug' : 'shortest';
    const prefix = `${learningMode}:`;

    this.educationCompletedLessons[learningMode] = new Set();
    this.educationLessonSelections[learningMode] = lessons[0].id;
    this.selectedEducationLesson = lessons[0].id;
    this.educationLevelIndex = 0;
    for (const key of Object.keys(this.educationProblemSelections || {})) {
      if (key.startsWith(prefix)) delete this.educationProblemSelections[key];
    }
    this.resetEducationWorkspace();
    return this.startActivity(mode, {
      challengeType: 'education',
      forceReload: true
    });
  }

  resumeStoredEducation(learningMode) {
    const progress = this.getStoredEducationResume(learningMode);
    if (!progress) return this.startEducationFromBeginning(learningMode);
    return this.resumeEducationProgress(progress);
  }

  initUI() {
    // 0. 챌린지 모드 스위치 버튼 이벤트 (일반, 무작위, 타임어택, 무한 모드)
    // 0.1 챌린지 모드 드롭다운 변경 이벤트
    document.getElementById('challenge-mode-select')?.addEventListener('change', (e) => {
      this.switchChallengeMode(e.target.value);
    });

    document.getElementById('education-kind-btn')?.addEventListener('click', () => {
      if (!EDUCATION_CAPABLE_MODES.includes(this.currentMode)) return;
      this.switchChallengeMode('education');
    });

    document.getElementById('challenge-kind-btn')?.addEventListener('click', () => {
      const supported = getSupportedChallengeTypesForMode(this.currentMode);
      const preferred = supported.includes(this.lastChallengeType)
        && this.lastChallengeType !== 'education'
        ? this.lastChallengeType
        : 'stage';
      this.switchChallengeMode(preferred);
    });

    document.getElementById('missile-education-start-btn')?.addEventListener('click', () => {
      this.startEducationFromBeginning('missile');
    });

    document.getElementById('missile-education-resume-btn')?.addEventListener('click', () => {
      this.resumeStoredEducation('missile');
    });

    document.getElementById('drawing-education-start-btn')?.addEventListener('click', () => {
      this.startEducationFromBeginning('drawing');
    });

    document.getElementById('drawing-education-resume-btn')?.addEventListener('click', () => {
      this.resumeStoredEducation('drawing');
    });

    // 0.2 모든 활동은 선택한 네 가지 모눈 크기 안에서 무작위로 출제한다.
    document.getElementById('challenge-size-select')?.addEventListener('change', (event) => {
      this.switchGridSize(Number.parseInt(event.target.value, 10));
    });

    document.getElementById('missile-solution-rule-select')?.addEventListener('change', (event) => {
      if (this.isExecuting) {
        event.target.value = getActiveMissileSolutionRule(
          this.challengeType,
          this.missileSolutionRule
        );
        return;
      }
      this.setMissileSolutionRule(event.target.value);
    });

    document.querySelectorAll('[data-education-lesson]').forEach(button => {
      button.addEventListener('click', () => this.selectEducationLesson(button.dataset.educationLesson));
    });

    document.getElementById('education-lesson-list')?.addEventListener('keydown', event => {
      if (!event.target.matches('[data-education-lesson]')) return;
      const tabs = Array.from(
        document.querySelectorAll('[data-education-lesson]:not([hidden])')
      );
      const currentIndex = tabs.indexOf(event.target);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      this.selectEducationLesson(tabs[nextIndex].dataset.educationLesson);
      tabs[nextIndex].focus({ preventScroll: true });
    });

    document.querySelectorAll('[data-command-target]').forEach(button => {
      button.addEventListener('click', () => this.setCommandBlockEditTarget(button.dataset.commandTarget));
    });
    document.getElementById('command-block-tabs')?.addEventListener('keydown', event => {
      if (!event.target.matches('[data-command-target]')) return;
      const tabs = Array.from(
        document.querySelectorAll('[data-command-target]:not([hidden])')
      );
      const currentIndex = tabs.indexOf(event.target);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      this.setCommandBlockEditTarget(tabs[nextIndex].dataset.commandTarget);
      tabs[nextIndex].focus({ preventScroll: true });
    });
    document.getElementById('insert-block-a-btn')?.addEventListener('click', () => this.insertCommandBlockCall('A'));
    document.getElementById('insert-block-b-btn')?.addEventListener('click', () => this.insertCommandBlockCall('B'));

    document.getElementById('drawing-minimum-toggle')?.addEventListener('change', (event) => {
      if (this.isExecuting) {
        event.target.checked = this.requireMinimumDrawing;
        return;
      }
      this.setRequireMinimumDrawing(event.target.checked);
    });

    document.getElementById('end-challenge-btn')?.addEventListener('click', () => {
      if (this.challengeType === 'multisolution') {
        this.loadLevel();
      } else {
        this.endChallenge(false);
      }
    });

    // 0.3 종이활동지 모달 버튼 이벤트
    document.getElementById('worksheet-open-btn')?.addEventListener('click', () => {
      this.updateWorksheetSizeControl();
      this.openModal('worksheet-modal', 'worksheet-modal-title');
    });

    document.getElementById('ws-mode-select')?.addEventListener('change', () => {
      this.updateWorksheetSizeControl();
    });

    document.getElementById('ws-close-btn')?.addEventListener('click', () => {
      this.closeModal('worksheet-modal');
    });

    document.getElementById('ws-generate-btn')?.addEventListener('click', () => {
      const mode = document.getElementById('ws-mode-select').value;
      const diff = document.getElementById('ws-diff-select').value;
      const count = parseInt(document.getElementById('ws-count-select').value, 10);
      const title = document.getElementById('ws-title-input').value || '모눈종이 코딩 놀이터 - 8방향 알고리즘 코딩 활동지';
      const includeAnswerKey = document.getElementById('ws-include-answer-key')?.checked ?? true;

      this.closeModal('worksheet-modal');

      // 활동지는 화면에서 아직 열지 않은 활동의 문제도 뽑으므로, 검증된
      // 문제은행을 모두 준비한 뒤 만든다. 준비 전 PRESET_LEVELS에는 옛 문제만 있다.
      Object.keys(PRESET_LEVELS).forEach(bankMode => ensurePresetProblemBankMode(bankMode));
      WorksheetGenerator.generateAndPrint({ mode, diff, count, title, includeAnswerKey }, PRESET_LEVELS);
    });

    // 0.4 나만의 출제 문제 PDF 활동지 버튼 이벤트
    document.getElementById('create-worksheet-btn')?.addEventListener('click', () => {
      const levelData = this.buildCreatorPuzzleData();
      if (!levelData) return;
      WorksheetGenerator.generateCustomAndPrint(levelData, levelData.title);
    });

    // 0.5 모눈종이 맵 크기(난이도) 선택 이벤트
    document.querySelectorAll('.grid-size-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (this.isExecuting) return;
        const size = parseInt(e.currentTarget.dataset.size, 10);
        this.creatorGridSize = size;

        document.querySelectorAll('.grid-size-btn').forEach(b => {
          b.classList.toggle('active-size', parseInt(b.dataset.size, 10) === size);
        });

        this.loadLevel();
        const resetMessage = this.creatorType === 'draw'
          ? `📐 ${size}x${size} 격자에 맞춰 붓 시작점과 그림 경로를 초기화했습니다.`
          : `📐 ${size}x${size} 격자에 맞춰 시작점·목표점·장애물을 초기화했습니다.`;
        this.setStatus(resetMessage, 'info');
      });
    });

    // 1. 첫 화면, 상단 빠른 변경, 4개 상위 모드와 하위 활동 변경 이벤트
    document.querySelectorAll('[data-start-activity]').forEach(btn => {
      btn.addEventListener('click', () => this.startActivity(
        btn.dataset.startActivity,
        { challengeType: 'stage' }
      ));
    });

    document.getElementById('header-mode-change-btn')?.addEventListener('click', () => {
      this.showModeSelectionScreen();
    });

    document.getElementById('quick-mode-toggle')?.addEventListener('click', () => {
      const toggle = document.getElementById('quick-mode-toggle');
      this.setModePickerExpanded(toggle?.getAttribute('aria-expanded') !== 'true');
    });

    document.querySelectorAll('.learning-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const learningMode = btn.dataset.learningMode;
        const switched = this.switchLearningMode(learningMode, { scrollTab: false });
        if (switched && LEARNING_MODE_GROUPS[learningMode]?.length === 1) {
          this.setModePickerExpanded(false, { restoreFocus: true });
        }
      });
    });

    document.querySelector('.learning-mode-tabs')?.addEventListener('keydown', (event) => {
      if (!event.target.matches('.learning-mode-btn')) return;

      const tabs = Array.from(document.querySelectorAll('.learning-mode-btn'));
      const currentIndex = tabs.indexOf(event.target);
      let nextIndex = currentIndex;

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      const nextTab = tabs[nextIndex];
      this.switchLearningMode(nextTab.dataset.learningMode, { scrollTab: false });
      nextTab.focus({ preventScroll: true });
    });

    document.querySelectorAll('.activity-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.switchMode(btn.dataset.mode, { scrollTab: false })) {
          this.setModePickerExpanded(false, { restoreFocus: true });
        }
      });
    });

    document.querySelector('.activity-tabs')?.addEventListener('keydown', (event) => {
      if (!event.target.matches('.activity-tab-btn')) return;

      const tabs = Array.from(document.querySelectorAll('.activity-tab-btn:not([hidden])'));
      const currentIndex = tabs.indexOf(event.target);
      let nextIndex = currentIndex;

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      const nextTab = tabs[nextIndex];
      this.switchMode(nextTab.dataset.mode, { scrollTab: false });
      nextTab.focus({ preventScroll: true });
    });

    document.getElementById('prep-activity-btn')?.addEventListener('click', () => {
      if (this.switchMode('efficiency', { scrollTab: false })) {
        this.setModePickerExpanded(false, { restoreFocus: true });
      }
    });

    // 2. 8방향 방향키 패드 이벤트 (화면 클릭 & 물리 키보드 방향키 연동)
    document.querySelectorAll('.dir-btn[data-dir]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = btn.dataset.dir;
        this.addCommand(dir);
      });
    });

    document.getElementById('keypad-center')?.addEventListener('click', () => {
      if (this.isDrawingModeGroup()) {
        const currentPen = this.getCurrentPenState();
        this.addCommand(currentPen ? 'PEN_UP' : 'PEN_DOWN');
      }
    });

    document.getElementById('pen-down-btn')?.addEventListener('click', () => {
      this.addCommand('PEN_DOWN');
    });

    document.getElementById('pen-up-btn')?.addEventListener('click', () => {
      this.addCommand('PEN_UP');
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        const activeModal = document.querySelector('.modal-backdrop.active');
        if (activeModal) {
          e.preventDefault();
          this.closeModal(activeModal.id);
        } else if (document.getElementById('quick-mode-toggle')?.getAttribute('aria-expanded') === 'true') {
          e.preventDefault();
          this.setModePickerExpanded(false, { restoreFocus: true });
        }
        return;
      }

      const activeModal = document.querySelector('.modal-backdrop.active');
      if (activeModal && e.code === 'Tab') {
        const focusable = Array.from(activeModal.querySelectorAll(
          'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]'
        )).filter(element => {
          const style = getComputedStyle(element);
          return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden';
        });

        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }

      if (activeModal) return;
      if (document.body.dataset.view !== 'play') return;

      if (
        document.activeElement &&
        document.activeElement.matches('input, select, textarea, button, a')
      ) {
        return;
      }

      const keyMap = {
        'ArrowUp': 'UP',
        'ArrowDown': 'DOWN',
        'ArrowLeft': 'LEFT',
        'ArrowRight': 'RIGHT',
        'KeyW': 'UP',
        'KeyS': 'DOWN',
        'KeyA': 'LEFT',
        'KeyD': 'RIGHT',
        'Numpad8': 'UP',
        'Numpad2': 'DOWN',
        'Numpad4': 'LEFT',
        'Numpad6': 'RIGHT',
        'Numpad7': 'UP_LEFT',
        'Numpad9': 'UP_RIGHT',
        'Numpad1': 'DOWN_LEFT',
        'Numpad3': 'DOWN_RIGHT'
      };

      if (keyMap[e.code]) {
        e.preventDefault();
        this.addCommand(keyMap[e.code]);
      } else if (e.code === 'Enter') {
        if (this.isFixedCommandDrawingMode()) return;
        e.preventDefault();
        this.runSimulation();
      }
    });

    // 10. 무지개 붓 팔레트 컬러 피커 이벤트
    document.querySelectorAll('.color-swatch').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeBrushColor = btn.dataset.color || 'rainbow';
      });
    });

    // 11. 그림 그리기 서브 활동 모드 이벤트 (자유 그림 그리기 vs 그림 그리는 방법)
    document.querySelectorAll('.draw-sub-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.draw-sub-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.drawSubmode = btn.dataset.submode || 'free';
        this.levelIndex = 0;
        this.loadLevel();
      });
    });

    // 3. 실행 / 초기화 / 제출 버튼 이벤트
    document.getElementById('run-btn').addEventListener('click', () => this.runSimulation());
    document.getElementById('submit-draw-btn')?.addEventListener('click', () => this.evaluateStudentDrawSubmission());
    document.getElementById('reset-btn').addEventListener('click', () => this.resetLevel());
    document.getElementById('fixed-draw-submit-btn')?.addEventListener('click', () => this.evaluateStudentDrawSubmission());
    document.getElementById('fixed-draw-reset-btn')?.addEventListener('click', () => this.resetLevel());
    document.getElementById('student-undo-btn')?.addEventListener('click', () => this.undoStudentDrawStep());
    document.getElementById('student-redo-btn')?.addEventListener('click', () => this.redoStudentDrawStep());
    document.getElementById('drawing-ghost-toggle')?.addEventListener('click', () => this.toggleDrawingGhostTrail());
    
    // 3.5 마우스·펜·터치 드래그를 하나의 포인터 흐름으로 처리
    const isDragMode = () => this.isStudentDrawMode() && !this.isExecuting;

    let isDragging = false;
    let activePointerId = null;
    let dragGesture = null;
    const startDrag = (e) => {
      if (isDragMode()) {
        isDragging = true;
        activePointerId = e.pointerId ?? null;
        dragGesture = {};
        if (activePointerId !== null && this.canvas.setPointerCapture) {
          try {
            this.canvas.setPointerCapture(activePointerId);
          } catch {
            // 일부 오래된 브라우저에서는 포인터 캡처를 지원하지 않는다.
          }
        }
        if (e.cancelable) e.preventDefault();
        this.handleCanvasDrag(e, { gestureState: dragGesture });
      }
    };

    const moveDrag = (e) => {
      if (isDragging && isDragMode()) {
        if (e.cancelable) e.preventDefault();
        this.handleCanvasDrag(e, {
          interpolateFreePath: true,
          gestureState: dragGesture
        });
      }
    };

    const stopDrag = (e) => {
      if (
        activePointerId !== null &&
        this.canvas.releasePointerCapture &&
        this.canvas.hasPointerCapture?.(activePointerId)
      ) {
        this.canvas.releasePointerCapture(activePointerId);
      }
      isDragging = false;
      activePointerId = null;
      dragGesture = null;
    };

    this.canvas.addEventListener('pointerdown', startDrag);
    this.canvas.addEventListener('pointermove', moveDrag);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    
    // 4. 소리 토글 버튼
    document.getElementById('mute-btn').addEventListener('click', (e) => {
      const isMuted = Audio.toggleMute();
      e.target.textContent = isMuted ? '🔇 소리 끔' : '🔊 소리 켜짐';
    });

    // 5. 창작자 문제 유형 스위치 버튼 (미사일 vs 그림)
    document.getElementById('create-bomb-btn')?.addEventListener('click', () => this.setCreatorType('bomb'));
    document.getElementById('create-draw-btn')?.addEventListener('click', () => this.setCreatorType('draw'));
    document.getElementById('creator-layout-reset-btn')?.addEventListener('click', () => this.resetLevel());
    document.getElementById('draw-start-tool-btn')?.addEventListener('click', () => this.setCreatorTool('star'));

    // 6. 창작자 미사일 요소 편집 도구 탭 (장애물, 시작점, 목표점)
    document.querySelectorAll('.creator-tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tool = e.currentTarget.dataset.tool;
        this.setCreatorTool(tool);
      });
    });

    // 7. 모눈종이 캔버스 직접 클릭/터치 배치 이벤트
    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

    // 8. 공유 모달 버튼
    document.getElementById('share-btn').addEventListener('click', () => this.openShareModal());
    document.getElementById('copy-url-btn').addEventListener('click', () => this.copyShareURL());
    document.getElementById('close-modal-btn').addEventListener('click', () => {
      this.closeModal('share-modal');
    });

    // 9. 결과 모달 닫기 버튼
    document.getElementById('result-close-btn').addEventListener('click', () => {
      this.closeModal('result-modal');
    });

    document.querySelectorAll('[data-close-modal]').forEach(button => {
      button.addEventListener('click', () => {
        this.closeModal(button.dataset.closeModal);
      });
    });

    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', event => {
        if (event.target === modal) {
          this.closeModal(modal.id);
        }
      });
    });

  }

  setModePickerExpanded(expanded, { restoreFocus = false } = {}) {
    const panel = document.getElementById('mode-picker-panel');
    const toggle = document.getElementById('quick-mode-toggle');
    const toggleText = document.getElementById('quick-mode-toggle-text');
    if (!panel || !toggle) return false;

    panel.hidden = !expanded;
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.classList.toggle('active', expanded);
    if (toggleText) {
      toggleText.textContent = expanded
        ? '빠른 모드 변경 접기'
        : '빠른 모드 변경 펼치기';
    }
    if (!expanded && restoreFocus) {
      toggle.focus({ preventScroll: true });
    }
    return true;
  }

  showModeSelectionScreen({ focusHeading = true, suspendActivity = true } = {}) {
    if (suspendActivity) {
      this.executionId += 1;
      this.isExecuting = false;
      this.stopChallengeTimer();
      this.closeAllModals();
      this.saveEducationProgress({ active: false });
    }

    this.setModePickerExpanded(false);
    const selectionScreen = document.getElementById('mode-selection-screen');
    const playScreen = document.getElementById('play-screen');
    const headerModeButton = document.getElementById('header-mode-change-btn');
    if (selectionScreen) selectionScreen.hidden = false;
    if (playScreen) playScreen.hidden = true;
    if (headerModeButton) headerModeButton.hidden = true;
    document.body.dataset.view = 'select';
    this.updateEducationEntryButtons();

    if (focusHeading) {
      const heading = document.getElementById('mode-selection-title');
      requestAnimationFrame(() => heading?.focus({ preventScroll: true }));
    }
  }

  enterPlayScreen() {
    const selectionScreen = document.getElementById('mode-selection-screen');
    const playScreen = document.getElementById('play-screen');
    const headerModeButton = document.getElementById('header-mode-change-btn');
    if (selectionScreen) selectionScreen.hidden = true;
    if (playScreen) playScreen.hidden = false;
    if (headerModeButton) headerModeButton.hidden = false;
    document.body.dataset.view = 'play';
    this.hasEnteredPlayScreen = true;

    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
  }

  startActivity(mode, { challengeType = null, forceReload = false } = {}) {
    if (!ACTIVITY_MODES.includes(mode)) return false;

    const supportedChallengeTypes = getSupportedChallengeTypesForMode(mode);
    const requestedChallengeType = supportedChallengeTypes.includes(challengeType)
      ? challengeType
      : null;
    const challengeChanged = Boolean(
      requestedChallengeType && requestedChallengeType !== this.challengeType
    );
    if (challengeChanged) {
      this.challengeType = requestedChallengeType;
      if (requestedChallengeType !== 'education') {
        this.lastChallengeType = requestedChallengeType;
      }
      this.educationLevelIndex = 0;
      this.resetChallengeProgress();
    }

    this.enterPlayScreen();
    const switched = this.switchMode(mode, {
      scrollTab: false,
      forceReload: forceReload || challengeChanged
    });
    this.setModePickerExpanded(false);

    if (
      switched &&
      this.challengeType === 'timeattack' &&
      mode !== 'creator' &&
      !this.timerInterval
    ) {
      this.startChallengeTimer();
    }
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      const alignGridCard = () => {
        const gridCard = document.querySelector('.grid-card');
        const toolbar = document.querySelector('.workspace-mode-toolbar');
        if (!gridCard) return;

        const toolbarBottom = toolbar?.getBoundingClientRect().bottom || 0;
        const targetScrollY = window.scrollY
          + gridCard.getBoundingClientRect().top
          - toolbarBottom
          - 6;
        window.scrollTo({ top: Math.max(0, targetScrollY), behavior: 'auto' });
      };

      requestAnimationFrame(alignGridCard);
      setTimeout(alignGridCard, 120);
    });
    return switched;
  }

  updateWorkspaceModeToolbar() {
    const modeElement = document.getElementById('workspace-current-mode');
    const activityElement = document.getElementById('workspace-current-activity');
    const learningMode = getLearningModeForActivity(this.currentMode);

    if (modeElement) {
      if (this.currentMode === 'efficiency') {
        modeElement.textContent = '🧠 기초 연습';
      } else if (this.currentMode === 'custom') {
        modeElement.textContent = '🎁 공유 문제';
      } else {
        modeElement.textContent = `${LEARNING_MODE_ICONS[learningMode] || '🧭'} ${LEARNING_MODE_LABELS[learningMode] || '학습 모드'}`;
      }
    }
    if (activityElement) {
      activityElement.textContent = ACTIVITY_DISPLAY_LABELS[this.currentMode] || '학습 활동';
    }
  }

  openModal(modalId, focusTargetId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    this.modalReturnFocus = document.activeElement;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const focusTarget = focusTargetId ? document.getElementById(focusTargetId) : null;
    focusTarget?.focus({ preventScroll: true });
    if (focusTarget) {
      requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
      setTimeout(() => focusTarget.focus({ preventScroll: true }), 50);
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal-backdrop.active')) {
      document.body.classList.remove('modal-open');
    }
    if (this.modalReturnFocus instanceof HTMLElement && this.modalReturnFocus.isConnected) {
      this.modalReturnFocus.focus();
    }
    this.modalReturnFocus = null;
    if (modalId === 'result-modal') {
      this.resumeChallengeTimer('result-modal');
    }
  }

  closeAllModals({ restoreFocus = false } = {}) {
    const returnFocus = this.modalReturnFocus;
    document.querySelectorAll('.modal-backdrop.active').forEach(modal => {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('modal-open');

    if (restoreFocus && returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      returnFocus.focus();
    }
    this.modalReturnFocus = null;
  }

  stopChallengeTimer({ clearPauses = true } = {}) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (clearPauses) {
      this.timerPauseReasons = new Set();
    }
  }

  pauseChallengeTimer(reason = 'interaction') {
    if (this.challengeType !== 'timeattack') return;
    if (!(this.timerPauseReasons instanceof Set)) {
      this.timerPauseReasons = new Set();
    }
    this.timerPauseReasons.add(reason);
    this.stopChallengeTimer({ clearPauses: false });
  }

  resumeChallengeTimer(reason = 'interaction') {
    if (this.challengeType !== 'timeattack') return;
    if (!(this.timerPauseReasons instanceof Set)) return;
    if (!this.timerPauseReasons.has(reason)) return;
    this.timerPauseReasons.delete(reason);
    if (
      this.timerPauseReasons.size === 0 &&
      Number(this.challengeState?.timeRemaining) > 0 &&
      !this.timerInterval
    ) {
      this.startChallengeTimer({ reset: false });
    }
  }

  resetChallengeProgress() {
    this.timerPauseReasons = new Set();
    this.challengeState = {
      solvedCount: 0,
      streak: 0,
      bestStreak: 0,
      score: 0,
      timeRemaining: 60
    };
    this.multiSolutionSignatures = new Set();
    this.multiSolutionAnswerSignatures = new Set();
    this.multiSolutionEntries = [];
    this.multiSolutionGoalCount = 0;
    this.multiSolutionTargetCount = 0;
    const timerEl = document.getElementById('challenge-timer');
    if (timerEl) timerEl.textContent = '60초';
    this.updateChallengeUI();
  }

  resetMultiSolutionProgress(level = null) {
    this.multiSolutionSignatures = new Set();
    this.multiSolutionAnswerSignatures = new Set();
    this.multiSolutionEntries = [];
    this.multiSolutionGoalCount = 0;
    this.multiSolutionTargetCount = 0;
    if (
      this.challengeType === 'multisolution' &&
      level?.starPos &&
      level?.goalPos &&
      ['shortest', 'routing'].includes(this.currentMode)
    ) {
      this.challengeState.solvedCount = 0;
      this.challengeState.streak = 0;
      this.challengeState.bestStreak = 0;
      this.challengeState.score = 0;
      const storedAnswers = Array.isArray(level.shortestSolutionSignatures)
        ? level.shortestSolutionSignatures
        : CommandEngine.enumerateShortestPaths(
            level.starPos,
            level.goalPos,
            level.gridSize,
            level.obstacles || []
          ).pathSignatures;
      this.multiSolutionAnswerSignatures = new Set(storedAnswers);
      this.multiSolutionTargetCount = this.multiSolutionAnswerSignatures.size;
      this.multiSolutionGoalCount = getMultiSolutionGoalCount(
        this.multiSolutionTargetCount
      );
    }
    this.updateChallengeUI();
    this.renderMultiSolutionList();
  }

  recordMultiSolutionAttempt(commands = [], assessment = {}) {
    if (!assessment.reachedGoal) {
      return { accepted: false, reason: 'miss', count: this.multiSolutionSignatures?.size || 0 };
    }
    if (!assessment.isShortest) {
      return { accepted: false, reason: 'not_shortest', count: this.multiSolutionSignatures?.size || 0 };
    }
    if (!(this.multiSolutionSignatures instanceof Set)) {
      this.multiSolutionSignatures = new Set();
    }
    if (!Array.isArray(this.multiSolutionEntries)) {
      this.multiSolutionEntries = [];
    }
    if (!Number.isFinite(this.multiSolutionGoalCount)) {
      this.multiSolutionGoalCount = getMultiSolutionGoalCount(
        this.multiSolutionTargetCount
      );
    }
    const signature = getRouteSolutionSignature(commands);
    if (
      this.multiSolutionAnswerSignatures instanceof Set &&
      this.multiSolutionAnswerSignatures.size > 0 &&
      !this.multiSolutionAnswerSignatures.has(signature)
    ) {
      return { accepted: false, reason: 'not_in_answer_catalog', count: this.multiSolutionSignatures.size };
    }
    if (!signature || this.multiSolutionSignatures.has(signature)) {
      const previousIndex = this.multiSolutionEntries
        .findIndex(entry => entry.signature === signature);
      return {
        accepted: false,
        reason: 'duplicate',
        count: this.multiSolutionSignatures.size,
        previousNumber: previousIndex >= 0 ? previousIndex + 1 : null
      };
    }
    this.multiSolutionSignatures.add(signature);
    const display = formatCommandCombination(commands);
    this.multiSolutionEntries.push({ signature, display });
    this.renderMultiSolutionList();
    return {
      accepted: true,
      reason: 'new',
      signature,
      display,
      count: this.multiSolutionSignatures.size,
      targetCount: this.multiSolutionGoalCount || 0,
      answerCount: this.multiSolutionTargetCount || 0,
      isComplete: (
        this.multiSolutionGoalCount > 0 &&
        this.multiSolutionSignatures.size >= this.multiSolutionGoalCount
      ),
      justCompleted: (
        this.multiSolutionGoalCount > 0 &&
        this.multiSolutionSignatures.size === this.multiSolutionGoalCount
      )
    };
  }

  resetProblemDraws(mode = null) {
    if (!(this.problemDrawBags instanceof Map)) this.problemDrawBags = new Map();
    if (!(this.lastDrawnProblemKeys instanceof Map)) this.lastDrawnProblemKeys = new Map();

    if (!mode) {
      this.problemDrawBags.clear();
      this.lastDrawnProblemKeys.clear();
      return;
    }

    const prefix = `${mode}:`;
    for (const key of this.problemDrawBags.keys()) {
      if (key.startsWith(prefix)) this.problemDrawBags.delete(key);
    }
    for (const key of this.lastDrawnProblemKeys.keys()) {
      if (key.startsWith(prefix)) this.lastDrawnProblemKeys.delete(key);
    }
  }

  drawNextRandomProblem(mode, levelList, gridSize, random = Math.random) {
    if (!(this.problemDrawBags instanceof Map)) this.problemDrawBags = new Map();
    if (!(this.lastDrawnProblemKeys instanceof Map)) this.lastDrawnProblemKeys = new Map();

    const bagKey = `${mode}:${gridSize}`;
    let bag = this.problemDrawBags.get(bagKey) || [];
    if (bag.length === 0) {
      bag = buildRandomProblemBag(levelList, gridSize, random);
      const lastProblemKey = this.lastDrawnProblemKeys.get(bagKey);
      if (bag.length > 1 && lastProblemKey && bag[0]?.title === lastProblemKey) {
        const swapIndex = bag.findIndex(level => level?.title !== lastProblemKey);
        if (swapIndex > 0) [bag[0], bag[swapIndex]] = [bag[swapIndex], bag[0]];
      }
    }

    const picked = bag.shift();
    this.problemDrawBags.set(bagKey, bag);
    if (picked?.title) this.lastDrawnProblemKeys.set(bagKey, picked.title);

    const flattenedLevels = levelList.flatMap(entry => Array.isArray(entry) ? entry : [entry]);
    const sourceIndex = flattenedLevels.indexOf(picked);
    if (sourceIndex >= 0) this.levelIndex = sourceIndex;
    return picked;
  }

  isEducationMode() {
    return (
      this.challengeType === 'education' &&
      ['shortest', 'routing', 'debug', 'debug_guide'].includes(this.currentMode)
    );
  }

  isDrawingEducationMode() {
    return this.isEducationMode() && ['debug', 'debug_guide'].includes(this.currentMode);
  }

  getEducationLearningMode() {
    return getLearningModeForActivity(this.currentMode) === 'drawing'
      ? 'drawing'
      : 'missile';
  }

  getActiveEducationLessons() {
    return this.getEducationLearningMode() === 'drawing'
      ? DRAWING_EDUCATION_LESSONS
      : EDUCATION_LESSONS;
  }

  getActiveEducationLesson() {
    return this.getEducationLearningMode() === 'drawing'
      ? getDrawingEducationLesson(this.selectedEducationLesson)
      : getEducationLesson(this.selectedEducationLesson);
  }

  getCompletedEducationLessons(learningMode = this.getEducationLearningMode()) {
    if (!this.educationCompletedLessons || typeof this.educationCompletedLessons !== 'object') {
      this.educationCompletedLessons = {};
    }
    const existing = this.educationCompletedLessons[learningMode];
    if (existing instanceof Set) return existing;

    const completed = new Set(Array.isArray(existing) ? existing : []);
    this.educationCompletedLessons[learningMode] = completed;
    return completed;
  }

  isEducationLessonUnlocked(lessonId, learningMode = this.getEducationLearningMode()) {
    const lessons = learningMode === 'drawing'
      ? DRAWING_EDUCATION_LESSONS
      : EDUCATION_LESSONS;
    const lessonIndex = lessons.findIndex(lesson => lesson.id === lessonId);
    if (lessonIndex <= 0) return lessonIndex === 0;
    return this.getCompletedEducationLessons(learningMode).has(lessons[lessonIndex - 1].id);
  }

  markEducationLessonComplete(lessonId = this.selectedEducationLesson) {
    if (!lessonId) return;
    this.getCompletedEducationLessons().add(lessonId);
    this.saveEducationProgress({ active: this.isEducationMode() });
  }

  ensureEducationLessonForCurrentMode() {
    if (!this.isEducationMode()) return null;
    const learningMode = this.getEducationLearningMode();
    const lessons = this.getActiveEducationLessons();
    if (!lessons.some(lesson => lesson.id === this.selectedEducationLesson)) {
      const rememberedLesson = this.educationLessonSelections[learningMode];
      this.selectedEducationLesson = lessons.some(lesson => lesson.id === rememberedLesson)
        ? rememberedLesson
        : lessons[0].id;
    }
    this.educationLessonSelections[learningMode] = this.selectedEducationLesson;
    return this.getActiveEducationLesson();
  }

  isPatternEducationActive() {
    return this.isEducationMode() && isPatternEducationLesson(this.selectedEducationLesson);
  }

  getActiveEducationToolPolicy() {
    if (!this.isEducationMode()) return null;
    return this.isDrawingEducationMode()
      ? getDrawingEducationToolPolicy(
          this.currentLevel || {},
          this.selectedEducationLesson
        )
      : getEducationToolPolicy(
      this.currentLevel || {},
      this.selectedEducationLesson
        );
  }

  canUseEducationDirection(direction) {
    const policy = this.getActiveEducationToolPolicy();
    if (!policy) return true;
    // 제시 명령은 비교 기준일 뿐 이동 제한이 아니다. 학생은 틀린 방향도
    // 실제로 움직여 본 뒤 제출 결과를 통해 순서를 확인할 수 있어야 한다.
    if (this.isFixedCommandDrawingMode() && DIRECTIONS[direction]) return true;
    if (
      this.isPatternEducationActive() &&
      this.commandBlockEditTarget === 'main' &&
      policy.allowDirectMainMoves === false
    ) {
      return false;
    }
    return policy.allowedDirections.includes(direction);
  }

  updateEducationToolPolicyUI() {
    const policy = this.getActiveEducationToolPolicy();
    const guide = document.getElementById('education-tool-policy');
    document.querySelectorAll('.dir-btn[data-dir]').forEach(button => {
      const isAllowed = !policy || this.canUseEducationDirection(button.dataset.dir);
      button.disabled = !isAllowed;
      button.classList.toggle('education-locked', !isAllowed);
      button.setAttribute('aria-disabled', isAllowed ? 'false' : 'true');
    });

    if (!guide) return;
    guide.hidden = !policy;
    if (!policy) return;
    const directionSymbols = policy.allowedDirections
      .map(direction => DIRECTIONS[direction]?.symbol)
      .filter(Boolean)
      .join(' ');
    const mainLockText = (
      this.isPatternEducationActive() &&
      this.commandBlockEditTarget === 'main' &&
      policy.allowDirectMainMoves === false
    ) ? ' · 메인 직접 이동 잠김' : '';
    guide.textContent = `이번 단계 도구: ${policy.toolSummary} · 사용 방향 ${directionSymbols}${mainLockText}`;
  }

  resetEducationWorkspace() {
    this.educationRouteSignatures = new Set();
    this.educationRouteEntries = [];
    this.commandBlockDefinitions = { A: [], B: [] };
    this.commandBlockEditTarget = 'main';
    this.commands = [];
    this.renderer?.setCheckpoints?.([]);
    this.renderer?.setVisitedCheckpointCount?.(0);
    this.renderer?.setFuelStops?.([]);
    this.renderer?.setVisitedFuelCount?.(0);
  }

  selectEducationLesson(lessonId) {
    const lesson = this.getActiveEducationLessons().find(entry => entry.id === lessonId);
    if (!lesson || !this.isEducationMode() || this.isExecuting) return false;
    if (!this.isEducationLessonUnlocked(lesson.id)) {
      const previousLesson = this.getActiveEducationLessons()[lesson.order - 2];
      this.setStatus(
        `🔒 ${previousLesson?.order || ''}단계 ${previousLesson?.title || '이전 단계'}의 5문제를 모두 마친 뒤에 열립니다.`,
        'info'
      );
      return false;
    }

    this.executionId += 1;
    this.isExecuting = false;
    this.stopChallengeTimer();
    this.closeAllModals();
    this.selectedEducationLesson = lesson.id;
    this.educationLessonSelections[this.getEducationLearningMode()] = lesson.id;
    this.educationLevelIndex = 0;
    if (!lesson.sizes.includes(this.selectedGridSize)) {
      this.selectedGridSize = lesson.sizes[0];
    }
    this.refreshEducationProblemSelection();
    this.resetChallengeProgress();
    this.resetEducationWorkspace();
    this.resetProblemDraws();
    this.updateEducationCurriculumUI();
    this.updateGridSizeControl();
    this.loadLevel();
    this.updateModeHierarchySummary();
    return true;
  }

  updateEducationCurriculumUI() {
    const panel = document.getElementById('education-curriculum-panel');
    const isVisible = this.isEducationMode();
    if (panel) panel.hidden = !isVisible;
    if (!isVisible) {
      this.updateCommandBlockWorkspace();
      this.updateEducationToolPolicyUI();
      return;
    }

    const lesson = this.ensureEducationLessonForCurrentMode();
    const learningMode = this.getEducationLearningMode();
    const eyebrow = document.getElementById('education-curriculum-eyebrow');
    const title = document.getElementById('education-curriculum-title');
    const intro = document.getElementById('education-curriculum-intro');
    const lessonList = document.getElementById('education-lesson-list');
    if (eyebrow) eyebrow.textContent = learningMode === 'drawing'
      ? 'DRAWING LEARNING PATH'
      : 'MISSILE LEARNING PATH';
    if (title) title.textContent = learningMode === 'drawing'
      ? '🎨 그림 개념 교육'
      : '🚀 미사일 개념 교육';
    if (intro) intro.textContent = learningMode === 'drawing'
      ? '명령 순서부터 여러 그리기 방법과 최소 명령까지 차례대로 익혀요.'
      : '순차구조부터 최소 명령과 나만의 명령 블록까지 차례대로 익혀요.';
    if (lessonList) lessonList.setAttribute(
      'aria-label',
      learningMode === 'drawing' ? '그림 교육 과정' : '미사일 교육 과정'
    );
    document.querySelectorAll('[data-education-lesson]').forEach(button => {
      const belongsToGroup = button.dataset.educationGroup === learningMode;
      button.hidden = !belongsToGroup;
      const isActive = button.dataset.educationLesson === lesson.id;
      const isUnlocked = this.isEducationLessonUnlocked(
        button.dataset.educationLesson,
        learningMode
      );
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.disabled = !isUnlocked;
      button.setAttribute('aria-disabled', isUnlocked ? 'false' : 'true');
      button.title = isUnlocked
        ? ''
        : '이전 단계를 모두 마치면 열립니다.';
      button.tabIndex = isActive && isUnlocked ? 0 : -1;
    });
    const concept = document.getElementById('education-current-concept');
    if (concept) concept.textContent = `${lesson.order}단계 · ${lesson.concept}`;
    const description = document.getElementById('education-lesson-description');
    if (description) description.textContent = lesson.description;
    this.updateCommandBlockWorkspace();
    this.updateEducationToolPolicyUI();
  }

  getEducationProblemBank() {
    const learningMode = this.getEducationLearningMode();
    getRequiredProblemBankModes(this.currentMode, this.challengeType)
      .forEach(mode => ensurePresetProblemBankMode(mode));
    const activityMode = learningMode === 'drawing' ? 'drawing' : this.currentMode;
    const cacheKey = `${learningMode}:${activityMode}:${this.selectedEducationLesson}:${this.selectedGridSize}`;
    if (!(this.educationProblemBankCache instanceof Map)) {
      this.educationProblemBankCache = new Map();
    }
    if (this.educationProblemBankCache.has(cacheKey)) {
      return this.educationProblemBankCache.get(cacheKey);
    }
    const bank = this.isDrawingEducationMode()
      ? buildDrawingEducationProblemBank(
          PRESET_LEVELS,
          this.selectedEducationLesson,
          this.selectedGridSize
        )
      : buildEducationProblemBank(
          PRESET_LEVELS,
          this.currentMode,
          this.selectedEducationLesson,
          this.selectedGridSize
        );
    this.educationProblemBankCache.set(cacheKey, bank);
    return bank;
  }

  getEducationProblemSelectionKey() {
    const learningMode = this.getEducationLearningMode();
    const activityMode = learningMode === 'drawing' ? 'drawing' : this.currentMode;
    return `${learningMode}:${activityMode}:${this.selectedEducationLesson}:${this.selectedGridSize}`;
  }

  refreshEducationProblemSelection() {
    const bank = this.getEducationProblemBank();
    const selectionKey = this.getEducationProblemSelectionKey();
    const previous = this.educationProblemSelections[selectionKey] || [];
    const next = chooseEducationSessionProblemKeys(
      bank,
      EDUCATION_SESSION_PROBLEM_COUNT,
      previous
    );
    this.educationProblemSelections[selectionKey] = next;
    return next;
  }

  getEducationLevelPool() {
    const bank = this.getEducationProblemBank();
    const selectionKey = this.getEducationProblemSelectionKey();
    const availableKeys = new Set(bank.map(level => level.educationProblemKey));
    let selectedKeys = (this.educationProblemSelections[selectionKey] || [])
      .filter(key => availableKeys.has(key));
    if (selectedKeys.length !== Math.min(EDUCATION_SESSION_PROBLEM_COUNT, bank.length)) {
      selectedKeys = chooseEducationSessionProblemKeys(
        bank,
        EDUCATION_SESSION_PROBLEM_COUNT,
        selectedKeys
      );
      this.educationProblemSelections[selectionKey] = selectedKeys;
    }
    const byKey = new Map(bank.map(level => [level.educationProblemKey, level]));
    return selectedKeys
      .map(key => byKey.get(key))
      .filter(Boolean)
      .sort(compareEducationProblemComplexity);
  }

  getEducationLevel() {
    const levels = this.getEducationLevelPool();
    if (levels.length === 0) return null;
    const safeIndex = ((this.educationLevelIndex % levels.length) + levels.length) % levels.length;
    return JSON.parse(JSON.stringify(levels[safeIndex]));
  }

  getEducationAdvancePlan() {
    return getEducationAdvancePlan({
      lessons: this.getActiveEducationLessons(),
      lessonId: this.selectedEducationLesson,
      levelIndex: this.educationLevelIndex,
      poolLength: this.getEducationLevelPool().length
    });
  }

  getEducationAdvanceButtonText() {
    const plan = this.getEducationAdvancePlan();
    if (plan.type === 'lesson') return `${plan.nextLesson.order}단계로 넘어가기`;
    if (plan.type === 'complete') return '교육 과정 마치기';
    return '다음 문제로';
  }

  advanceEducationProblem() {
    const plan = this.getEducationAdvancePlan();
    if (plan.type === 'complete') {
      this.markEducationLessonComplete();
      this.updateEducationCurriculumUI();
      this.setStatus('🏆 현재 교육 과정을 모두 마쳤어요. 원하는 단계를 다시 선택해 복습할 수 있습니다.', 'success');
      return plan;
    }

    this.educationLevelIndex = plan.nextLevelIndex;
    if (plan.type === 'lesson') {
      this.markEducationLessonComplete();
      this.selectedEducationLesson = plan.nextLesson.id;
      this.educationLessonSelections[this.getEducationLearningMode()] = plan.nextLesson.id;
      if (!plan.nextLesson.sizes.includes(this.selectedGridSize)) {
        this.selectedGridSize = plan.nextLesson.sizes[0];
      }
      this.updateGridSizeControl();
      this.updateEducationCurriculumUI();
      this.updateModeHierarchySummary();
      this.setStatus(`📚 ${plan.nextLesson.order}단계 ${plan.nextLesson.title}를 시작합니다.`, 'info');
    }
    this.resetEducationWorkspace();
    this.loadLevel();
    this.scrollCurrentProblemIntoView();
    return plan;
  }

  scrollCurrentProblemIntoView({ focusHeading = true } = {}) {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      document.body?.dataset?.view !== 'play' ||
      !window.matchMedia?.('(max-width: 900px), (orientation: portrait)').matches
    ) {
      return false;
    }

    const drawingTask = this.isDrawingEducationMode()
      ? document.getElementById('drawing-education-task-panel')
      : null;
    const target = drawingTask && !drawingTask.hidden
      ? drawingTask
      : document.querySelector('.grid-card');
    if (!target || typeof target.scrollIntoView !== 'function') return false;

    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (focusHeading) {
        const heading = drawingTask && !drawingTask.hidden
          ? document.getElementById('drawing-education-task-title')
          : document.getElementById('mode-title-text');
        heading?.focus?.({ preventScroll: true });
      }
    });
    return true;
  }

  // 이전 이름을 사용하는 내부·저장된 호출과의 호환을 유지한다.
  scrollEducationTaskIntoView() {
    return this.scrollCurrentProblemIntoView();
  }

  switchGridSize(gridSize) {
    if (
      !(this.isEducationMode()
        ? this.getActiveEducationLesson().sizes
        : getSupportedGridSizesForMode(this.currentMode)).includes(gridSize) ||
      this.currentMode === 'custom'
    ) {
      return false;
    }
    if (this.isExecuting) return false;

    this.executionId += 1;
    this.isExecuting = false;
    this.stopChallengeTimer();
    this.closeAllModals();
    this.selectedGridSize = gridSize;
    this.resetChallengeProgress();

    const sizeSelect = document.getElementById('challenge-size-select');
    if (sizeSelect) sizeSelect.value = String(gridSize);

    if (this.currentMode !== 'creator') this.loadLevel();
    if (this.challengeType === 'timeattack' && this.currentMode !== 'creator') {
      this.startChallengeTimer();
    }
    this.updateModeHierarchySummary();
    return true;
  }

  setChallengeSettingsVisible(isVisible) {
    const settingsShell = document.getElementById('challenge-settings-shell');
    if (settingsShell) settingsShell.hidden = !isVisible;
  }

  updateGridSizeControl() {
    const supportedSizes = this.isEducationMode()
      ? this.getActiveEducationLesson().sizes
      : getSupportedGridSizesForMode(this.currentMode);
    const sizeSelect = document.getElementById('challenge-size-select');
    if (!supportedSizes.includes(this.selectedGridSize)) {
      this.selectedGridSize = supportedSizes.at(-1) || 5;
      this.resetProblemDraws(this.currentMode);
    }
    if (!sizeSelect) return;

    for (const option of sizeSelect.options) {
      const gridSize = Number.parseInt(option.value, 10);
      const isSupported = supportedSizes.includes(gridSize);
      option.disabled = !isSupported;
      option.hidden = !isSupported;
    }
    sizeSelect.value = String(this.selectedGridSize);
  }

  updateWorksheetSizeControl() {
    const modeSelect = document.getElementById('ws-mode-select');
    const sizeSelect = document.getElementById('ws-diff-select');
    if (!modeSelect || !sizeSelect) return;

    const supportedSizes = getSupportedGridSizesForMode(modeSelect.value);
    for (const option of sizeSelect.options) {
      const gridSize = Number.parseInt(option.value, 10);
      const isSupported = supportedSizes.includes(gridSize);
      option.disabled = !isSupported;
      option.hidden = !isSupported;
    }
    if (!supportedSizes.includes(Number.parseInt(sizeSelect.value, 10))) {
      sizeSelect.value = String(supportedSizes.at(-1) || 5);
    }
  }

  updateMissileSolutionRuleControl() {
    const control = document.getElementById('missile-solution-rule-control');
    const select = document.getElementById('missile-solution-rule-select');
    const supportsMissileRule = ['shortest', 'routing'].includes(this.currentMode);
    const hint = document.getElementById('missile-solution-rule-hint');
    const activeRule = getActiveMissileSolutionRule(
      this.challengeType,
      this.missileSolutionRule
    );
    if (control) control.hidden = !supportsMissileRule || this.isEducationMode();
    if (select) {
      select.value = activeRule;
      select.disabled = this.challengeType === 'multisolution';
    }
    if (hint) {
      hint.textContent = this.challengeType === 'multisolution'
        ? '여러 풀이 찾기는 서로 다른 최단 이동 경로를 찾습니다.'
        : (
            activeRule === 'minimum_commands'
              ? '이동 칸 수와 관계없이 안전하게 도착하는 명령 묶음 수가 가장 적어야 성공'
              : '실제로 이동하는 칸 수가 가장 적어야 성공'
          );
    }
  }

  updateChallengeModeControl() {
    const modeSelect = document.getElementById('challenge-mode-select');
    const supportedTypes = getSupportedChallengeTypesForMode(this.currentMode);
    if (!supportedTypes.includes(this.challengeType)) {
      this.stopChallengeTimer();
      this.challengeType = 'stage';
      this.resetChallengeProgress();
    }
    if (modeSelect) {
      for (const option of modeSelect.options) {
        const isSupported = supportedTypes.includes(option.value);
        option.disabled = !isSupported;
        option.hidden = !isSupported;
        if (option.value === 'random') {
          option.textContent = `🎯 ${getRandomChallengeTargetCount(
            this.currentMode,
            this.selectedGridSize
          )}문제 도전`;
        }
      }
      modeSelect.value = this.challengeType;
    }
    const supportsEducation = EDUCATION_CAPABLE_MODES.includes(this.currentMode);
    const isEducation = this.challengeType === 'education';
    const educationButton = document.getElementById('education-kind-btn');
    const challengeButton = document.getElementById('challenge-kind-btn');
    const experienceSwitch = document.getElementById('experience-kind-switch');
    const challengeModeGroup = document.getElementById('challenge-mode-group');
    const challengeHint = document.getElementById('challenge-mode-hint');
    if (experienceSwitch) {
      experienceSwitch.hidden = !supportsEducation
        || this.currentMode === 'creator'
        || this.currentMode === 'custom';
    }
    if (educationButton) {
      educationButton.hidden = !supportsEducation;
      educationButton.classList.toggle('active', isEducation);
      educationButton.setAttribute('aria-pressed', isEducation ? 'true' : 'false');
    }
    if (challengeButton) {
      challengeButton.classList.toggle('active', !isEducation);
      challengeButton.setAttribute('aria-pressed', isEducation ? 'false' : 'true');
    }
    if (challengeModeGroup) challengeModeGroup.hidden = isEducation;
    if (challengeHint) {
      challengeHint.textContent = getChallengeModeHint(
        this.challengeType,
        this.currentMode,
        this.selectedGridSize
      );
    }
    this.updateChallengeTypeUI();
  }

  updateChallengeTypeUI() {
    const statusBar = document.getElementById('challenge-status-bar');
    const timerMetric = document.getElementById('timer-metric');
    const sizeGroup = document.getElementById('challenge-size-group');
    if (sizeGroup) sizeGroup.style.display = 'flex';
    if (statusBar) statusBar.style.display = ['stage', 'education'].includes(this.challengeType) ? 'none' : 'flex';
    if (timerMetric) {
      timerMetric.style.display = this.challengeType === 'timeattack' ? 'flex' : 'none';
    }
    this.updateChallengeUI();
    this.renderMultiSolutionList();
    this.updateEducationCurriculumUI();
  }

  renderMultiSolutionList() {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById('multi-solution-panel');
    const list = document.getElementById('multi-solution-list');
    const count = document.getElementById('multi-solution-list-count');
    if (!panel || !list) return;

    const isEducationRoutes = (
      this.isEducationMode() &&
      this.selectedEducationLesson === 'routes' &&
      ['shortest', 'routing'].includes(this.currentMode)
    );
    const isDrawingMethods = (
      this.isDrawingEducationMode() &&
      this.selectedEducationLesson === 'draw_methods'
    );
    const isVisible = (
      (this.challengeType === 'multisolution' && ['shortest', 'routing'].includes(this.currentMode)) ||
      isEducationRoutes ||
      isDrawingMethods
    );
    panel.hidden = !isVisible;
    if (!isVisible) return;

    const entries = (isEducationRoutes || isDrawingMethods)
      ? (this.educationRouteEntries || [])
      : (Array.isArray(this.multiSolutionEntries) ? this.multiSolutionEntries : []);
    const title = document.getElementById('multi-solution-title');
    if (title) title.textContent = isDrawingMethods
      ? '🎨 내가 찾은 서로 다른 그리기 방법'
      : (isEducationRoutes ? '🧭 내가 찾은 서로 다른 길' : '🧭 찾은 최단 풀이 목록');
    const targetCount = isDrawingMethods
      ? (this.currentLevel?.drawingTargetSolutionCount || 2)
      : (isEducationRoutes
          ? (this.currentLevel?.educationTargetRouteCount || 2)
          : (this.multiSolutionGoalCount || 0));
    if (count) {
      count.textContent = `${entries.length} / ${targetCount}`;
    }
    if (entries.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'multi-solution-empty';
      empty.textContent = isDrawingMethods
        ? '아직 저장한 그리기 방법이 없습니다. 목표 그림을 완성하는 첫 번째 명령 조합을 만들어 보세요.'
        : (isEducationRoutes
            ? '아직 저장한 길이 없습니다. 목표점에 도착하는 첫 번째 길을 만들어 보세요.'
            : '아직 찾은 풀이가 없습니다. 첫 번째 최단 명령 조합을 만들어 보세요.');
      list.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    entries.forEach((entry, index) => {
      const item = document.createElement('li');
      const label = document.createElement('strong');
      const commands = document.createElement('span');
      label.textContent = `풀이 ${index + 1}:`;
      commands.textContent = (isEducationRoutes || isDrawingMethods)
        ? `${entry.display} · 이동 ${entry.distance}칸 · 명령 ${entry.commandCount}개`
        : entry.display;
      item.append(label, commands);
      fragment.appendChild(item);
    });
    list.replaceChildren(fragment);
  }

  updateDrawingRuleControl() {
    if (typeof document === 'undefined') return;
    const control = document.getElementById('drawing-minimum-rule-control');
    const toggle = document.getElementById('drawing-minimum-toggle');
    const supportsMinimumRule = this.currentMode === 'debug';
    const isDrawingEducation = (
      this.challengeType === 'education' &&
      ['debug', 'debug_guide'].includes(this.currentMode)
    );
    if (control) control.hidden = !supportsMinimumRule || isDrawingEducation;
    if (toggle) toggle.checked = this.requireMinimumDrawing;
  }

  setMissileSolutionRule(rule) {
    if (!['shortest', 'routing'].includes(this.currentMode)) return false;
    if (!MISSILE_SOLUTION_RULES.includes(rule)) return false;
    if (this.challengeType === 'multisolution' && rule !== 'shortest') return false;

    this.executionId += 1;
    this.isExecuting = false;
    this.stopChallengeTimer();
    this.closeAllModals();
    this.missileSolutionRule = rule;
    this.resetChallengeProgress();
    this.updateMissileSolutionRuleControl();
    this.loadLevel();
    if (this.challengeType === 'timeattack') this.startChallengeTimer();
    this.updateModeHierarchySummary();
    this.setStatus(
      rule === 'minimum_commands'
        ? '🧩 최소 명령 모드입니다. 안전하게 도착하는 명령 묶음 수를 가장 적게 만들어 보세요.'
        : '📏 최단 이동 모드입니다. 실제 이동하는 칸 수가 가장 적어야 성공합니다.',
      'info'
    );
    return true;
  }

  setRequireMinimumDrawing(enabled) {
    if (
      this.currentMode !== 'debug' ||
      this.isDrawingEducationMode()
    ) return false;

    this.executionId += 1;
    this.isExecuting = false;
    this.stopChallengeTimer();
    this.closeAllModals();
    this.requireMinimumDrawing = Boolean(enabled);
    this.resetChallengeProgress();
    this.updateDrawingRuleControl();
    this.loadLevel();
    if (this.challengeType === 'timeattack') this.startChallengeTimer();
    this.updateModeHierarchySummary();
    this.setStatus(
      this.requireMinimumDrawing
        ? '🖌️ 최소 붓 이동 횟수로 그림을 완성해야 성공합니다.'
        : '🎨 그림을 완성하면 성공입니다. 최소 붓 이동으로 완성하면 완전 성공입니다.',
      'info'
    );
    return true;
  }

  switchLearningMode(learningMode, { scrollTab = true } = {}) {
    const activities = LEARNING_MODE_GROUPS[learningMode];
    if (!activities) return false;

    this.currentLearningMode = learningMode;
    const rememberedActivity = this.lastActivityByLearningMode[learningMode];
    const nextActivity = activities.includes(rememberedActivity)
      ? rememberedActivity
      : activities[0];
    return this.switchMode(nextActivity, { scrollTab });
  }

  syncActivityNavigation(mode, { scrollTab = true } = {}) {
    const mappedLearningMode = getLearningModeForActivity(mode);
    if (mappedLearningMode) {
      this.currentLearningMode = mappedLearningMode;
      this.lastActivityByLearningMode[mappedLearningMode] = mode;
    } else if (mode === 'custom' && this.customPuzzleData) {
      this.currentLearningMode = (
        this.customPuzzleData.puzzleType === 'draw' ||
        this.customPuzzleData.playerType === 'brush'
      ) ? 'drawing' : 'missile';
    }

    const learningMode = this.currentLearningMode || 'missile';
    const isPrepActive = mode === 'efficiency';
    let activeLearningModeTab = null;
    document.querySelectorAll('.learning-mode-btn').forEach(tab => {
      const isCurrentLearningMode = tab.dataset.learningMode === learningMode;
      const isActive = !isPrepActive && isCurrentLearningMode;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.tabIndex = isCurrentLearningMode ? 0 : -1;
      if (isActive) activeLearningModeTab = tab;
    });

    const activityTabs = Array.from(document.querySelectorAll('.activity-tab-btn'));
    const visibleActivityTabs = [];
    let activeActivityTab = null;

    activityTabs.forEach(tab => {
      const belongsToLearningMode = !isPrepActive && tab.dataset.learningMode === learningMode;
      tab.hidden = !belongsToLearningMode;
      const isActive = tab.dataset.mode === mode;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.tabIndex = isActive ? 0 : -1;
      if (belongsToLearningMode) visibleActivityTabs.push(tab);
      if (isActive) activeActivityTab = tab;
    });

    if (!activeActivityTab && visibleActivityTabs[0]) {
      visibleActivityTabs[0].tabIndex = 0;
    }

    const activityTabList = document.querySelector('.activity-tabs');
    if (activityTabList) activityTabList.hidden = isPrepActive;
    activityTabList?.classList.toggle('single-activity', visibleActivityTabs.length === 1);

    const description = document.getElementById('activity-nav-description');
    if (description) {
      description.textContent = isPrepActive
        ? '기초 연습 중입니다. 본활동은 위의 네 모드에서 고르세요.'
        : `${LEARNING_MODE_LABELS[learningMode]}에서 연습할 활동을 고르세요.`;
    }

    const prepButton = document.getElementById('prep-activity-btn');
    prepButton?.classList.toggle('active', isPrepActive);
    prepButton?.setAttribute('aria-pressed', isPrepActive ? 'true' : 'false');

    const workspace = document.getElementById('learning-workspace');
    if (workspace) {
      if (activeActivityTab?.id) {
        workspace.setAttribute('aria-labelledby', activeActivityTab.id);
        workspace.removeAttribute('aria-label');
      } else if (isPrepActive && prepButton?.id) {
        workspace.setAttribute('aria-labelledby', prepButton.id);
        workspace.removeAttribute('aria-label');
      } else if (this.currentMode === 'single_stroke') {
        workspace.removeAttribute('aria-labelledby');
        workspace.setAttribute('aria-label', '한붓그리기 활동');
      } else {
        workspace.removeAttribute('aria-labelledby');
        workspace.setAttribute('aria-label', '공유 받은 문제 풀기');
      }
    }

    const scrollTarget = activeActivityTab || (isPrepActive ? prepButton : activeLearningModeTab);
    this.updateChallengeModeControl();
    this.updateGridSizeControl();
    this.updateWorkspaceModeToolbar();
    this.updateMissileSolutionRuleControl();
    this.updateDrawingRuleControl();
    if (scrollTab && scrollTarget) {
      scrollTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  updateModeHierarchySummary() {
    const summary = document.getElementById('active-mode-summary');
    if (!summary) return;

    const learningMode = getLearningModeForActivity(this.currentMode);
    const isEducation = this.isEducationMode();
    const activityLabel = isEducation
      ? `${LEARNING_MODE_LABELS[learningMode] || '학습'} 교육`
      : (ACTIVITY_LABELS[this.currentMode] || '학습 활동');
    const learningModeLabel = learningMode && !isEducation
      ? `${LEARNING_MODE_LABELS[learningMode]} · `
      : '';
    const challengeLabel = this.challengeType === 'random'
      ? `${getRandomChallengeTargetCount(this.currentMode, this.selectedGridSize)}문제 도전`
      : (CHALLENGE_LABELS[this.challengeType] || '자유 도전');
    const gridSizeText = `${this.selectedGridSize || 5}x${this.selectedGridSize || 5}`;
    const educationText = isEducation
      ? ` · ${this.getActiveEducationLesson().title}`
      : '';
    const missileRuleText = ['shortest', 'routing'].includes(this.currentMode) && !this.isEducationMode()
      ? ` · ${getActiveMissileSolutionRule(this.challengeType, this.missileSolutionRule) === 'minimum_commands'
          ? '최소 명령'
          : '최단 이동'}`
      : '';
    const drawingRuleText = (
      this.currentMode === 'debug' &&
      !this.isDrawingEducationMode() &&
      this.requireMinimumDrawing
    ) ? ' · 최소 붓 이동만 인정' : '';
    summary.textContent = `현재: ${learningModeLabel}${activityLabel} · ${gridSizeText} · ${challengeLabel}${educationText}${missileRuleText}${drawingRuleText}`;
  }

  switchChallengeMode(type) {
    if (
      !getSupportedChallengeTypesForMode(this.currentMode).includes(type) ||
      this.currentMode === 'creator' ||
      this.currentMode === 'custom'
    ) {
      return false;
    }

    if (this.isEducationMode() && type !== 'education') {
      this.saveEducationProgress({ active: false });
    }
    this.executionId += 1;
    this.isExecuting = false;
    this.stopChallengeTimer();
    this.challengeType = type;
    if (type !== 'education') this.lastChallengeType = type;
    // 교육으로 전환하는 순간 일반 그림의 최소 붓 이동 토글을 먼저 숨긴다.
    // loadLevel에서도 한 번 더 갱신해 단계 전환·복습 때도 화면 상태가 남지 않는다.
    this.updateDrawingRuleControl();
    this.resetChallengeProgress();
    this.resetProblemDraws();
    this.resetEducationWorkspace();

    const modeSelect = document.getElementById('challenge-mode-select');
    if (modeSelect) modeSelect.value = type;

    this.updateChallengeModeControl();
    if (type === 'multisolution') this.missileSolutionRule = 'shortest';
    if (type === 'education') {
      const lesson = this.ensureEducationLessonForCurrentMode();
      if (!lesson.sizes.includes(this.selectedGridSize)) {
        this.selectedGridSize = lesson.sizes[0];
      }
      this.educationLevelIndex = 0;
    }
    this.updateGridSizeControl();
    this.updateMissileSolutionRuleControl();

    if (type === 'stage') {
      this.loadLevel();
      this.updateModeHierarchySummary();
      return true;
    }

    this.loadLevel();
    if (type === 'timeattack') this.startChallengeTimer();
    this.updateModeHierarchySummary();
    if (type === 'multisolution') {
      this.setStatus(
        `🧭 서로 다른 최단 방향 순서 ${this.multiSolutionGoalCount}개를 찾아보세요. 가능한 최단 풀이는 모두 ${this.multiSolutionTargetCount}개이며, 어떤 풀이를 입력해도 판정합니다.`,
        'info'
      );
    } else if (type === 'education') {
      const lesson = this.getActiveEducationLesson();
      this.setStatus(`📚 ${lesson.title}: ${lesson.description}`, 'info');
    }
    return true;
  }

  startChallengeTimer({ reset = true } = {}) {
    if (this.timerInterval) clearInterval(this.timerInterval);

    if (reset) {
      this.challengeState.timeRemaining = 60;
      this.timerPauseReasons = new Set();
    }
    const timerEl = document.getElementById('challenge-timer');
    if (timerEl) timerEl.textContent = `${this.challengeState.timeRemaining}초`;

    if (this.timerPauseReasons instanceof Set && this.timerPauseReasons.size > 0) {
      return;
    }

    this.timerInterval = setInterval(() => {
      this.challengeState.timeRemaining--;
      const seconds = this.challengeState.timeRemaining;
      const el = document.getElementById('challenge-timer');
      if (el) el.textContent = `${seconds}초`;

      if (seconds <= 0) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.endChallenge(true);
      }
    }, 1000);
  }

  updateChallengeUI() {
    const solvedEl = document.getElementById('challenge-solved-count');
    const solvedLabel = document.getElementById('challenge-solved-label');
    const streakEl = document.getElementById('challenge-streak');
    const scoreEl = document.getElementById('challenge-score');
    const streakMetric = document.getElementById('streak-metric');
    const scoreMetric = document.getElementById('score-metric');
    const endButton = document.getElementById('end-challenge-btn');
    const isMultiSolution = this.challengeType === 'multisolution';

    if (solvedLabel) {
      solvedLabel.textContent = isMultiSolution ? '🧭 찾은 최단 풀이:' : '🏆 성공 문제:';
    }
    if (solvedEl) {
      solvedEl.textContent = isMultiSolution && this.multiSolutionGoalCount > 0
        ? `${this.challengeState.solvedCount}개 / ${this.multiSolutionGoalCount}개`
        : `${this.challengeState.solvedCount}개`;
    }
    if (streakEl) streakEl.textContent = `${this.challengeState.streak}`;
    if (scoreEl) scoreEl.textContent = `${this.challengeState.score}점`;
    if (streakMetric) streakMetric.style.display = isMultiSolution ? 'none' : 'flex';
    if (scoreMetric) scoreMetric.style.display = isMultiSolution ? 'none' : 'flex';
    if (endButton) {
      endButton.textContent = isMultiSolution
        ? '🔀 다른 문제로 바꾸기'
        : '🛑 도전 종료 및 결과 보기';
    }
    if (isMultiSolution) {
      const levelIndicator = document.getElementById('level-indicator');
      if (levelIndicator && /최단 풀이 \d+\/(?:\d+|\?)개/.test(levelIndicator.textContent)) {
        levelIndicator.textContent = levelIndicator.textContent.replace(
          /최단 풀이 \d+\/(?:\d+|\?)개/,
          `최단 풀이 ${this.challengeState.solvedCount}/${this.multiSolutionGoalCount || '?'}개`
        );
      }
    }
  }

  onChallengeSuccess() {
    if (this.challengeType === 'stage') return;

    this.challengeState.solvedCount++;
    this.challengeState.streak++;
    this.challengeState.bestStreak = Math.max(
      this.challengeState.bestStreak,
      this.challengeState.streak
    );
    const points = 100 * Math.min(5, this.challengeState.streak);
    this.challengeState.score += points;

    if (this.challengeType === 'timeattack') {
      this.challengeState.timeRemaining += 5;
      this.setStatus(`🔥 +5초 연장! 연속 ${this.challengeState.solvedCount}문제 성공! (+${points}점)`, 'success');
    }

    this.updateChallengeUI();
    const targetCount = getRandomChallengeTargetCount(
      this.currentMode,
      this.currentLevel?.gridSize || this.selectedGridSize
    );
    return (
      this.challengeType === 'random' &&
      targetCount > 0 &&
      this.challengeState.solvedCount >= targetCount
    );
  }

  onChallengeFailure() {
    if (this.challengeType === 'stage') return;
    this.challengeState.streak = 0;
    this.updateChallengeUI();
  }

  endChallenge(isTimeUp = false) {
    this.executionId += 1;
    this.isExecuting = false;
    this.stopChallengeTimer();

    const { solvedCount, bestStreak, score } = this.challengeState;

    const activityLabel = ACTIVITY_LABELS[this.currentMode] || '코딩 활동';
    const targetCount = this.challengeType === 'random'
      ? getRandomChallengeTargetCount(this.currentMode, this.selectedGridSize)
      : null;
    const recordTitle = isTimeUp
      ? `⏱️ ${activityLabel} 60초 기록`
      : (targetCount && solvedCount >= targetCount
          ? `🏆 ${activityLabel} ${targetCount}문제 완주`
          : `📊 ${activityLabel} 도전 기록`);

    Audio.playPoliceFanfare();

    this.showResultModal({
      isSuccess: true,
      icon: isTimeUp ? '⏱️ ⏳ 🏆' : '🛑 📊 🏆',
      title: recordTitle,
      desc: `서로 걸리는 시간이 다른 활동을 같은 칭호로 비교하지 않고, 이번 도전의 내 기록을 보여 줍니다.<br><br>
             🏆 <b>성공한 문제 수</b>: <b>${solvedCount}문제</b><br>
             🔥 <b>가장 긴 연속 성공</b>: <b>${bestStreak}문제</b><br>
             💯 <b>최종 누적 점수</b>: <b style="color:#38bdf8;">${score}점</b><br>`,
      badge: `도전 성적표: ${solvedCount}문제 성공`,
      primaryBtnText: '🔄 새 도전 시작하기',
      onPrimary: () => {
        this.switchChallengeMode(this.challengeType);
      }
    });
  }

  getActiveCommandBlockList() {
    if (!this.isPatternEducationActive() || this.commandBlockEditTarget === 'main') {
      return this.commands;
    }
    return this.commandBlockDefinitions[this.commandBlockEditTarget] || [];
  }

  setActiveCommandBlockList(commands) {
    if (!this.isPatternEducationActive() || this.commandBlockEditTarget === 'main') {
      this.commands = this.isPatternEducationActive()
        ? normalizeMainProgram(commands)
        : commands;
    } else {
      this.commandBlockDefinitions[this.commandBlockEditTarget] = normalizeMoveCommands(commands);
    }
    this.saveEducationProgress({ active: this.isEducationMode() });
  }

  /**
   * 명령 칩의 방향을 바꾼 뒤 같은 방향을 다시 묶는다. 명령 블록 교육의 메인
   * 프로그램만 블록 호출을 보존하는 정규화를 쓰고, 일반 그림(특히 최소 명령)
   * 에서는 PEN_UP/PEN_DOWN도 실제 큐 항목으로 보존한다.
   */
  normalizeEditedCommandQueue(commands, { mergeAdjacent = true } = {}) {
    if (!mergeAdjacent) return commands;
    if (this.isPatternEducationActive() && this.commandBlockEditTarget === 'main') {
      return normalizeMainProgram(commands);
    }
    if (this.commandBlockEditTarget === 'main' || !this.isPatternEducationActive()) {
      return compressAdjacentCommands(commands);
    }
    return normalizeMoveCommands(commands);
  }

  setCommandBlockEditTarget(target) {
    if (!this.isPatternEducationActive() || this.isExecuting) return false;
    const availableBlocks = this.currentLevel?.patternPolicy?.availableBlocks || (
      this.selectedEducationLesson === 'block_two' ? 2 : 1
    );
    if (!['main', 'A', 'B'].includes(target)) return false;
    if (target === 'B' && availableBlocks < 2) return false;
    this.commandBlockEditTarget = target;
    this.updateCommandBlockWorkspace();
    this.updateCreatorInterface();
    this.updateEducationToolPolicyUI();
    this.renderCommandQueue();
    return true;
  }

  insertCommandBlockCall(blockId) {
    if (!this.isPatternEducationActive() || this.isExecuting) return false;
    const availableBlocks = this.currentLevel?.patternPolicy?.availableBlocks || 1;
    if (blockId === 'B' && availableBlocks < 2) return false;
    const definition = normalizeMoveCommands(this.commandBlockDefinitions[blockId] || []);
    if (definition.length === 0) {
      this.setStatus(`🧱 먼저 명령 블록 ${blockId} 탭에서 반복할 명령을 만들어 주세요.`, 'error');
      this.setCommandBlockEditTarget(blockId);
      return false;
    }
    this.commandBlockEditTarget = 'main';
    const nextMain = normalizeMainProgram([
      ...this.commands,
      { type: 'block', blockId, repeat: 2 }
    ]);
    if (nextMain.length > MAX_PATTERN_MAIN_BLOCKS) {
      this.setStatus(`🧱 메인 실행에는 최대 ${MAX_PATTERN_MAIN_BLOCKS}개 블록을 넣을 수 있습니다. 반복 횟수를 활용해 주세요.`, 'error');
      return false;
    }
    this.commands = nextMain;
    Audio.playAddCommand();
    this.updateCommandBlockWorkspace();
    this.updateCreatorInterface();
    this.renderCommandQueue({ scrollToEnd: true });
    this.updateStepCounter();
    return true;
  }

  updateCommandBlockWorkspace() {
    const workspace = document.getElementById('command-block-workspace');
    const isVisible = this.isPatternEducationActive();
    if (workspace) workspace.hidden = !isVisible;
    if (!isVisible) return;

    const availableBlocks = this.currentLevel?.patternPolicy?.availableBlocks || (
      this.selectedEducationLesson === 'block_two' ? 2 : 1
    );
    if (availableBlocks < 2 && this.commandBlockEditTarget === 'B') {
      this.commandBlockEditTarget = 'main';
    }
    document.querySelectorAll('[data-command-target]').forEach(button => {
      const target = button.dataset.commandTarget;
      const isAvailable = target !== 'B' || availableBlocks >= 2;
      button.hidden = !isAvailable;
      const isActive = isAvailable && target === this.commandBlockEditTarget;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.tabIndex = isActive ? 0 : -1;
    });

    const definitions = {
      A: normalizeMoveCommands(this.commandBlockDefinitions.A || []),
      B: normalizeMoveCommands(this.commandBlockDefinitions.B || [])
    };
    const analysis = expandCommandBlockProgram({
      main: this.commands,
      definitions,
      availableBlocks
    });
    const score = document.getElementById('command-block-score');
    if (score) {
      score.textContent = `전체 코드 ${analysis.authoredCodeSize}개 = 정의 ${analysis.definedBlockCount} + 메인 ${analysis.mainBlockCount}`;
    }
    for (const blockId of ['A', 'B']) {
      const summary = document.getElementById(`command-block-summary-${blockId.toLowerCase()}`);
      if (!summary) continue;
      summary.hidden = blockId === 'B' && availableBlocks < 2;
      summary.replaceChildren();
      const label = document.createElement('strong');
      label.textContent = blockId;
      const value = document.createTextNode(
        definitions[blockId].length > 0
          ? ` = ${formatCommandCombination(definitions[blockId])}`
          : ' = 비어 있음'
      );
      summary.append(label, value);
    }

    const insertControls = document.getElementById('command-block-insert-controls');
    if (insertControls) insertControls.hidden = this.commandBlockEditTarget !== 'main';
    const insertB = document.getElementById('insert-block-b-btn');
    if (insertB) insertB.hidden = availableBlocks < 2;
    const guide = document.getElementById('command-block-editor-guide');
    if (guide) {
      guide.textContent = this.commandBlockEditTarget === 'main'
        ? '메인 실행 순서를 만들고, 완성한 명령 블록을 반복 호출하세요.'
        : `명령 블록 ${this.commandBlockEditTarget} 안에 반복해서 사용할 방향 명령을 만드세요.`;
    }
  }

  setCreatorType(type) {
    if (this.isExecuting) return;
    if (!['bomb', 'draw'].includes(type)) return;

    this.creatorType = type;
    const bombBtn = document.getElementById('create-bomb-btn');
    const drawBtn = document.getElementById('create-draw-btn');
    if (bombBtn && drawBtn) {
      bombBtn.classList.toggle('active-type', type === 'bomb');
      drawBtn.classList.toggle('active-type', type === 'draw');
    }

    if (type === 'draw') {
      this.activeCreatorTool = 'star';
    } else {
      this.activeCreatorTool = 'obstacle';
    }

    this.loadLevel();
  }

  updateCreatorInterface() {
    const isCreator = this.currentMode === 'creator';
    const isBombCreator = isCreator && this.creatorType === 'bomb';
    const isDrawCreator = isCreator && this.creatorType === 'draw';
    const isEfficiency = this.currentMode === 'efficiency' || (
      this.isEducationMode() && this.selectedEducationLesson === 'compress'
    );
    const isPatternEducation = this.isPatternEducationActive();
    const isFixedDrawing = this.isFixedCommandDrawingMode();

    const commandTitle = document.getElementById('command-panel-title');
    const stepCounter = document.getElementById('step-counter');
    const keypad = document.getElementById('command-keypad');
    const queueSection = document.getElementById('command-queue-section');
    const actionControls = document.getElementById('command-action-controls');
    const bombTools = document.getElementById('bomb-creator-tools');
    const drawTools = document.getElementById('draw-creator-tools');
    const purposeGuide = document.getElementById('creator-purpose-guide');
    const orderLabel = document.querySelector('.command-order-label');
    const runBtn = document.getElementById('run-btn');
    const resetBtn = document.getElementById('reset-btn');
    const controlCard = document.querySelector('.control-card');
    const workspace = document.getElementById('learning-workspace');
    const fixedDrawingActions = document.getElementById('fixed-drawing-actions');

    if (commandTitle) {
      if (isEfficiency) {
        commandTitle.textContent = '🧠 [내 답] 같은 움직임을 더 짧게 나타내기';
      } else if (isPatternEducation) {
        commandTitle.textContent = '🧱 [내 코드] 명령 블록을 만들고 반복해서 사용하기';
      } else if (isFixedDrawing) {
        commandTitle.textContent = '📜 [주어진 순서] 명령을 읽고 붓으로 따라 그리기';
      } else {
        commandTitle.textContent = isBombCreator
          ? '🧩 [문제 출제] 시작점·목표점·장애물 배치'
          : (isDrawCreator
            ? '🎨 [정답 경로] 방향 명령어로 그림 만들기'
            : '📥 [입력 & 명령어] 8방향 알고리즘 조립');
      }
    }

    if (controlCard) controlCard.hidden = isFixedDrawing;
    workspace?.classList.toggle('fixed-drawing-workspace', isFixedDrawing);
    if (fixedDrawingActions) fixedDrawingActions.hidden = !isFixedDrawing;
    if (stepCounter) stepCounter.style.display = (isBombCreator || isFixedDrawing) ? 'none' : 'inline';
    if (keypad) {
      keypad.style.display = (isBombCreator || isFixedDrawing) ? 'none' : 'grid';
      keypad.setAttribute('aria-hidden', (isBombCreator || isFixedDrawing) ? 'true' : 'false');
    }
    if (queueSection) queueSection.style.display = (isBombCreator || isFixedDrawing) ? 'none' : 'block';
    if (actionControls) actionControls.style.display = (isBombCreator || isFixedDrawing) ? 'none' : 'flex';
    if (bombTools) bombTools.style.display = isBombCreator ? 'flex' : 'none';
    if (drawTools) drawTools.style.display = isDrawCreator ? 'flex' : 'none';
    if (orderLabel) {
      let orderTitle = orderLabel.querySelector('strong');
      let orderHint = orderLabel.querySelector('span');
      if (!orderTitle || !orderHint) {
        orderTitle = document.createElement('strong');
        orderHint = document.createElement('span');
        orderLabel.replaceChildren(orderTitle, orderHint);
      }
      orderTitle.textContent = isEfficiency
        ? '✍️ 내가 줄여 쓴 명령'
        : (isFixedDrawing
          ? '📜 주어진 명령어 실행 순서'
          : (isPatternEducation
            ? `📋 ${this.commandBlockEditTarget === 'main' ? '메인 실행' : `명령 블록 ${this.commandBlockEditTarget}`} 순서`
            : '📋 명령어 실행 순서'));
      orderHint.textContent = isPatternEducation && this.commandBlockEditTarget !== 'main'
        ? '여기서 만든 명령 묶음을 메인에서 반복 호출합니다.'
        : (isFixedDrawing
          ? '현재 강조된 명령부터 순서대로 붓을 움직이세요.'
          : '1번부터 화살표를 따라 차례대로 실행됩니다.');
    }
    if (runBtn) {
      runBtn.textContent = isEfficiency
        ? '✅ 효율 확인하기'
        : '⚙️ [처리] 실행하기';
    }
    if (resetBtn) {
      resetBtn.textContent = isEfficiency
        ? '🧹 다시 만들기'
        : '🧹 처음부터';
    }

    if (purposeGuide) {
      const title = purposeGuide.querySelector('strong');
      const text = purposeGuide.querySelector('span');
      if (isBombCreator) {
        if (title) title.textContent = '🚀 미사일 문제 출제';
        if (text) text.textContent = '명령어를 미리 만들 필요가 없습니다. 학생이 풀 문제의 시작점·목표점·장애물만 배치하세요.';
      } else if (isDrawCreator) {
        if (title) title.textContent = '🖌️ 그림 문제 출제';
        if (text) text.textContent = '그림 문제는 방향 명령어가 곧 정답 경로입니다. 붓 시작점과 이동 순서를 직접 만드세요.';
      }
      purposeGuide.style.display = isCreator ? 'flex' : 'none';
    }

    document.querySelectorAll('#bomb-creator-tools .creator-tool-btn').forEach(button => {
      button.classList.toggle('active-tool', isBombCreator && button.dataset.tool === this.activeCreatorTool);
    });
    document.getElementById('draw-start-tool-btn')?.classList.toggle('active-tool', isDrawCreator);
    this.updateCommandBlockWorkspace();
    this.updateEducationToolPolicyUI();
  }

  renderEfficiencyTask(level = this.currentLevel) {
    const panel = document.getElementById('efficiency-task-panel');
    if (!panel) return;

    const isEfficiency = (
      this.currentMode === 'efficiency' ||
      (this.isEducationMode() && this.selectedEducationLesson === 'compress')
    ) && level;
    panel.hidden = !isEfficiency;
    if (!isEfficiency) return;

    const sourceCommands = level.sourceCommands || [];
    const optimalCommands = level.optimalCommands || compressAdjacentCommands(sourceCommands);
    const sourceList = document.getElementById('efficiency-source-commands');
    const lesson = document.getElementById('efficiency-lesson');
    const goalBadge = document.getElementById('efficiency-goal-badge');

    if (lesson) {
      lesson.textContent = level.lesson || '서로 이웃한 같은 방향 명령끼리 묶어 보세요.';
    }
    if (goalBadge) {
      goalBadge.textContent = `목표 ${optimalCommands.length}개 명령`;
    }

    if (sourceList) {
      const fragment = document.createDocumentFragment();
      sourceCommands.forEach((command, index) => {
        if (index > 0) {
          const connector = document.createElement('span');
          connector.className = 'efficiency-command-connector';
          connector.setAttribute('aria-hidden', 'true');
          connector.textContent = '→';
          fragment.appendChild(connector);
        }

        const item = document.createElement('span');
        item.className = 'efficiency-source-command';
        item.setAttribute(
          'aria-label',
          `${index + 1}번째, ${DIRECTIONS[command.dir]?.label || command.dir} ${command.distance}칸`
        );
        const order = document.createElement('span');
        order.className = 'efficiency-source-order';
        order.textContent = String(index + 1);
        order.setAttribute('aria-hidden', 'true');
        const value = document.createElement('span');
        value.className = 'efficiency-source-value';
        value.textContent = formatCommandCombination([command]);
        item.append(order, value);
        fragment.appendChild(item);
      });
      sourceList.replaceChildren(fragment);
    }

    this.updateEfficiencyStats();
  }

  /**
   * 그림 교육의 최소 명령 단계는 화면에 보이는 명령 큐 블록 하나를 정확히 한
   * 명령으로 센다. 거리 묶음과 PEN_UP/PEN_DOWN도 각각 큐의 한 블록이므로,
   * 채점·상태 표시·결과 안내가 모두 이 값을 공유한다.
   */
  getDrawingEducationCommandMetrics(commands = this.commands, level = this.currentLevel) {
    const queue = Array.isArray(commands) ? commands : [];
    const safeQueue = queue.filter(command => command && typeof command === 'object');
    const physicalDistance = CommandEngine.expandToStepList(safeQueue)
      .reduce((total, step) => total + (DIRECTIONS[step] ? 1 : 0), 0);
    const minimumCommandCount = Number.isFinite(level?.minimumCommandCount)
      ? level.minimumCommandCount
      : null;

    return {
      commandCount: queue.length,
      physicalDistance,
      minimumCommandCount
    };
  }

  renderDrawingEducationTask(level = this.currentLevel) {
    const panel = document.getElementById('drawing-education-task-panel');
    if (!panel) return;

    const isEducationTask = this.isDrawingEducationMode() && level;
    const isFixedDrawing = this.isFixedCommandDrawingMode();
    const isVisible = Boolean(isEducationTask || (isFixedDrawing && level));
    panel.hidden = !isVisible;
    if (!isVisible) return;

    const lesson = isEducationTask
      ? this.getActiveEducationLesson()
      : {
          icon: '📜',
          title: '명령 보고 그림 그리기',
          description: '제시 명령을 왼쪽부터 읽고 빈 모눈종이에 직접 그려 보세요.'
        };
    const heading = document.getElementById('drawing-education-task-title');
    const badge = document.getElementById('drawing-education-goal-badge');
    const guide = document.getElementById('drawing-education-task-guide');
    const reference = document.getElementById('drawing-education-reference');
    const sourceList = document.getElementById('drawing-education-source-commands');
    const referenceCommands = (
      isFixedDrawing ? this.getFixedDrawingCommands(level) : (level.referenceCommands || [])
    ).filter(command => (
      command.dir !== 'PEN_DOWN' &&
      command.dir !== 'PEN_UP' &&
      command.type !== 'PEN_DOWN' &&
      command.type !== 'PEN_UP'
    ));
    const showReference = (
      (isFixedDrawing || this.selectedEducationLesson === 'draw_sequence') &&
      referenceCommands.length > 0
    );

    if (heading) heading.textContent = `${lesson.icon} ${lesson.title}`;
    if (guide) guide.textContent = level.guide || lesson.description;
    if (reference) reference.hidden = !showReference;
    if (showReference && sourceList) {
      const fragment = document.createDocumentFragment();
      referenceCommands.forEach((command, index) => {
        const item = document.createElement('span');
        item.className = 'drawing-education-source-command';
        item.textContent = `${index + 1}. ${formatCommandCombination([command])}`;
        item.dataset.referenceIndex = String(index);
        item.setAttribute(
          'aria-label',
          `${index + 1}번째 제시 명령 ${formatCommandCombination([command])}`
        );
        fragment.appendChild(item);
      });
      sourceList.replaceChildren(fragment);
      this.updateDrawingReferenceCommandButtons();
    }
    if (badge) {
      if (isFixedDrawing) {
        const progress = this.getFixedDrawingProgress();
        badge.textContent = progress.hasMismatch
          ? `내 동작 ${progress.actualActionCount}회`
          : `진행 ${progress.completedCommandCount}/${progress.commands.length}`;
      } else if (this.selectedEducationLesson === 'draw_methods') {
        badge.textContent = `서로 다른 풀이 ${level.drawingTargetSolutionCount || 2}개 (${this.educationRouteSignatures.size}/${level.drawingTargetSolutionCount || 2})`;
      } else {
        badge.textContent = `최소 명령 ${level.minimumCommandCount ?? '?'}개`;
      }
    }

    const submittedPanel = document.getElementById('drawing-submitted-routes-panel');
    const submittedList = document.getElementById('drawing-submitted-routes-list');
    if (submittedPanel && submittedList) {
      const showSubmitted = this.selectedEducationLesson === 'draw_methods' && this.educationRouteSignatures.size > 0;
      submittedPanel.hidden = !showSubmitted;
      if (showSubmitted) {
        const entries = Array.isArray(this.educationRouteEntries)
          ? this.educationRouteEntries
          : [];
        const chips = entries.map((entry, i) => {
          const chip = document.createElement('span');
          chip.className = 'drawing-submitted-chip';
          chip.textContent = `풀이 ${i + 1}: ${entry.display}`;
          return chip;
        });
        if (chips.length === 0) {
          for (const [index, signature] of Array.from(this.educationRouteSignatures).entries()) {
            const chip = document.createElement('span');
            chip.className = 'drawing-submitted-chip';
            chip.textContent = `풀이 ${index + 1}: ${this.formatSignatureWithArrows(signature)}`;
            chips.push(chip);
          }
        }
        submittedList.replaceChildren(...chips);
      }
    }

    this.updatePenStateUI();
    this.updateDrawingGhostTrail();
    this.updateDrawingLiveStepCounter();
  }

  updateDrawingReferenceCommandButtons() {
    if (typeof document === 'undefined') return;
    const buttons = document.querySelectorAll('[data-reference-index]');
    if (buttons.length === 0) return;
    if (this.isFixedCommandDrawingMode()) {
      this.updateFixedDrawingProgressUI();
      return;
    }
    const nextIndex = this.getActiveCommandBlockList().filter(command => (
      !['PEN_DOWN', 'PEN_UP'].includes(command?.dir || command?.type)
    )).length;
    buttons.forEach((button, index) => {
      const isComplete = index < nextIndex;
      const isNext = index === nextIndex;
      button.classList.toggle('completed', isComplete);
      button.classList.toggle('next-command', isNext);
      button.disabled = this.isExecuting || !isNext;
      button.setAttribute('aria-current', isNext ? 'step' : 'false');
    });
  }

  addDrawingReferenceCommand(command, index) {
    if (
      this.isExecuting ||
      !this.isDrawingEducationMode() ||
      this.selectedEducationLesson !== 'draw_sequence'
    ) {
      return false;
    }

    const activeCommands = this.getActiveCommandBlockList();
    const enteredMovementCount = activeCommands.filter(command => (
      !['PEN_DOWN', 'PEN_UP'].includes(command?.dir || command?.type)
    )).length;
    if (index !== enteredMovementCount) {
      Audio.playError();
      this.setStatus(`📚 ${enteredMovementCount + 1}번째 제시 명령부터 차례대로 눌러 주세요.`, 'error');
      return false;
    }

    const referenceCommand = this.currentLevel?.referenceCommands?.[index];
    if (!referenceCommand) return false;
    const nextCommands = [
      ...activeCommands,
      JSON.parse(JSON.stringify(referenceCommand || command))
    ];
    Audio.playAddCommand();
    this.setActiveCommandBlockList(nextCommands);
    this.updateCommandBlockWorkspace();
    this.renderCommandQueue({ scrollToEnd: true });
    this.updateStepCounter();
    this.updateDrawingReferenceCommandButtons();
    this.setStatus(
      enteredMovementCount + 1 === this.currentLevel.referenceCommands.length
        ? '✅ 제시 명령을 모두 넣었습니다. 이제 실행해 그림을 확인해 보세요.'
        : `📚 ${enteredMovementCount + 1}번째 이동 명령을 넣었습니다. 다음 제시 명령을 눌러 보세요.`,
      'info'
    );
    return true;
  }

  toggleDrawingGhostTrail() {
    this.isGhostTrailActive = !this.isGhostTrailActive;
    Audio.playClick();
    this.updateDrawingGhostTrail();
  }

  updateDrawingGhostTrail() {
    const toggleBtn = document.getElementById('drawing-ghost-toggle');
    const isDrawingActivity = this.isDrawingModeGroup() && !this.isStudentDrawMode();

    if (toggleBtn) {
      toggleBtn.hidden = !isDrawingActivity;
      toggleBtn.setAttribute('aria-pressed', String(this.isGhostTrailActive));
      const label = toggleBtn.querySelector('.ghost-label');
      if (label) {
        label.textContent = `붓 경로 힌트: ${this.isGhostTrailActive ? 'ON' : 'OFF'}`;
      }
    }

    if (!isDrawingActivity || !this.renderer) {
      if (this.renderer) this.renderer.setShowGhostTrail(false);
      return;
    }

    const starPos = this.currentLevel?.starPos || this.currentLevel?.startPos || { x: 0, y: 0 };
    const gridSize = this.currentLevel?.gridSize || this.renderer.gridSize || 5;
    const sim = CommandEngine.simulate(starPos, this.commands, gridSize);

    this.renderer.setGhostPathLines(sim.lines || []);
    this.renderer.setShowGhostTrail(this.isGhostTrailActive);
  }

  updateDrawingLiveStepCounter() {
    const counterEl = document.getElementById('drawing-live-step-counter');
    if (!counterEl) return;

    const isMinimumCommandLesson = (
      this.isDrawingEducationMode() &&
      this.selectedEducationLesson === 'draw_minimum_commands'
    );
    counterEl.hidden = !isMinimumCommandLesson;
    if (!isMinimumCommandLesson) return;

    const metrics = this.getDrawingEducationCommandMetrics();
    const targetCount = metrics.minimumCommandCount;

    const currentSpan = document.getElementById('drawing-current-steps');
    const targetSpan = document.getElementById('drawing-target-steps');
    const physicalSpan = document.getElementById('drawing-physical-steps');
    if (currentSpan) currentSpan.textContent = `${metrics.commandCount}개`;
    if (targetSpan) targetSpan.textContent = `${targetCount ?? '?'}개`;
    if (physicalSpan) physicalSpan.textContent = `${metrics.physicalDistance}칸`;
    counterEl.setAttribute(
      'aria-label',
      `내 명령 ${metrics.commandCount}개, 목표 최소 ${targetCount ?? '?'}개, 실제 붓 이동 ${metrics.physicalDistance}칸`
    );

    counterEl.classList.remove('optimal', 'exceeded');
    if (Number.isFinite(targetCount) && metrics.commandCount === targetCount) {
      counterEl.classList.add('optimal');
    } else if (Number.isFinite(targetCount) && metrics.commandCount > targetCount) {
      counterEl.classList.add('exceeded');
    }
  }

  formatSignatureWithArrows(sig = '') {
    const dirMap = {
      'UP': '↑', 'UP_RIGHT': '↗', 'RIGHT': '→', 'DOWN_RIGHT': '↘',
      'DOWN': '↓', 'DOWN_LEFT': '↙', 'LEFT': '←', 'UP_LEFT': '↖',
      'PEN_DOWN': '✏️누름', 'PEN_UP': '✋떼기'
    };
    return sig.split('>').map(part => {
      const [dir, dist] = part.split(':');
      const arrow = dirMap[dir] || dir;
      return dist ? `${dist}${arrow}` : arrow;
    }).join(' ');
  }

  getCurrentPenState() {
    let isPenDown = !this.usesExplicitPenStartCommand();
    if (this.commands && this.commands.length > 0) {
      for (const cmd of this.commands) {
        if (cmd.type === 'PEN_UP' || cmd.dir === 'PEN_UP') isPenDown = false;
        else if (cmd.type === 'PEN_DOWN' || cmd.dir === 'PEN_DOWN') isPenDown = true;
      }
    }
    return isPenDown;
  }

  updatePenStateUI() {
    const isPenDown = this.getCurrentPenState();
    this.isPenDown = isPenDown;

    const indicator = document.getElementById('pen-state-indicator');
    const isDrawingActivity = this.isDrawingModeGroup();
    const fixedDrawingNeedsPenState = !this.isFixedCommandDrawingMode() || this
      .getFixedDrawingCommands()
      .some(command => ['PEN_DOWN', 'PEN_UP'].includes(command?.dir || command?.type));
    const showIndicator = isDrawingActivity && fixedDrawingNeedsPenState;

    if (indicator) {
      indicator.hidden = !showIndicator;
      if (showIndicator) {
        if (isPenDown) {
          indicator.className = 'pen-state-indicator pen-down';
          indicator.innerHTML = '<span class="pen-state-icon">✏️</span><span class="pen-state-text">현재 붓 상태: <strong>누름 (선을 그리는 중)</strong></span>';
        } else {
          indicator.className = 'pen-state-indicator pen-up';
          indicator.innerHTML = '<span class="pen-state-icon">✋</span><span class="pen-state-text">현재 붓 상태: <strong>뗌 (선 없이 위치 이동 중)</strong></span>';
        }
      }
    }

    if (this.renderer) {
      this.renderer.isPenDown = isPenDown;
    }

    this.updatePenControlUI(isPenDown);
  }

  updateEfficiencyStats() {
    if (!(
      this.currentMode === 'efficiency' ||
      (this.isEducationMode() && this.selectedEducationLesson === 'compress')
    )) return;
    const sourceCount = document.getElementById('efficiency-source-count');
    const answerCount = document.getElementById('efficiency-answer-count');
    if (sourceCount) {
      sourceCount.textContent = `${this.currentLevel?.sourceCommands?.length || 0}개`;
    }
    if (answerCount) {
      answerCount.textContent = `${this.commands.length}개`;
    }
  }

  setCreatorTool(tool) {
    if (this.isExecuting) return;
    if (this.creatorType === 'draw' && (tool === 'obstacle' || tool === 'goal')) return;

    this.activeCreatorTool = tool;
    document.querySelectorAll('.creator-tool-btn').forEach(b => {
      b.classList.toggle('active-tool', b.dataset.tool === tool);
    });
  }

  getFixedDrawingCommands(level = this.currentLevel || {}) {
    if (
      this.isDrawingEducationMode() &&
      this.selectedEducationLesson === 'draw_sequence'
    ) {
      return Array.isArray(level.referenceCommands) ? level.referenceCommands : [];
    }
    return Array.isArray(level.initialCommands) ? level.initialCommands : [];
  }

  isStudentDrawMode() {
    const level = this.currentLevel || {};
    const isCustomDragQuiz = (
      this.currentMode === 'custom' &&
      (level.puzzleType === 'draw' || level.playerType === 'brush') &&
      Array.isArray(level.initialCommands) &&
      level.initialCommands.length > 0
    );

    return this.isFixedCommandDrawingMode() || (
      (!this.isDrawingEducationMode() && this.currentMode === 'debug_guide') ||
      (!this.isDrawingEducationMode() && this.currentMode === 'debug' && this.drawSubmode === 'guide') ||
      isCustomDragQuiz
    );
  }

  isFixedCommandDrawingMode() {
    const level = this.currentLevel || {};
    const hasPresentedCommands = this.getFixedDrawingCommands(level).length > 0;
    return (
      (
        this.isDrawingEducationMode() &&
        this.selectedEducationLesson === 'draw_sequence' &&
        hasPresentedCommands
      ) ||
      (
        !this.isDrawingEducationMode() &&
        this.currentMode === 'debug_guide' &&
        hasPresentedCommands
      ) ||
      (
        this.currentMode === 'custom' &&
        (level.puzzleType === 'draw' || level.playerType === 'brush') &&
        hasPresentedCommands
      )
    );
  }

  ensureStudentDrawHistory() {
    if (!Array.isArray(this.studentDrawHistory)) {
      this.studentDrawHistory = (this.studentDrawnLines || []).map(line => ({
        type: 'move',
        fromX: line.fromX,
        fromY: line.fromY,
        toX: line.toX,
        toY: line.toY,
        penDown: true,
        drewLine: true,
        color: line.color || 'rainbow'
      }));
    }
    if (!Array.isArray(this.studentRedoHistory)) {
      this.studentRedoHistory = (this.studentRedoLines || []).map(line => ({
        type: 'move',
        fromX: line.fromX,
        fromY: line.fromY,
        toX: line.toX,
        toY: line.toY,
        penDown: true,
        drewLine: true,
        color: line.color || 'rainbow'
      }));
    }
    if (!Array.isArray(this.studentRedoLines)) this.studentRedoLines = [];
  }

  getFixedDrawingProgress() {
    const commands = this.getFixedDrawingCommands();
    const expectedActions = buildFixedDrawingActionPlan(commands);
    this.ensureStudentDrawHistory();
    const actualActions = this.studentDrawHistory.flatMap(action => {
      if (action?.type === 'pen') {
        return [{
          type: 'pen',
          dir: action.toPenDown === false ? 'PEN_UP' : 'PEN_DOWN'
        }];
      }
      if (action?.type !== 'move') return [];
      const dir = getDirectionKeyForUnitDelta(
        action.toX - action.fromX,
        action.toY - action.fromY
      );
      return dir ? [{ type: 'move', dir }] : [];
    });
    let matchedActionCount = 0;
    while (
      matchedActionCount < expectedActions.length &&
      matchedActionCount < actualActions.length &&
      expectedActions[matchedActionCount].type === actualActions[matchedActionCount].type &&
      expectedActions[matchedActionCount].dir === actualActions[matchedActionCount].dir
    ) {
      matchedActionCount++;
    }
    const completedActionCount = matchedActionCount;
    const actualActionCount = actualActions.length;
    const hasMismatch = matchedActionCount < actualActionCount;
    const nextAction = expectedActions[matchedActionCount] || null;
    const currentCommandIndex = nextAction?.commandIndex ?? commands.length;
    const completedCommandCount = commands.reduce((count, _command, commandIndex) => {
      const commandActions = expectedActions.filter(action => action.commandIndex === commandIndex);
      if (commandActions.length === 0) return count;
      const lastActionIndex = expectedActions.indexOf(commandActions.at(-1));
      return count + (lastActionIndex < completedActionCount ? 1 : 0);
    }, 0);

    return {
      commands,
      expectedActions,
      actualActions,
      actualActionCount,
      matchedActionCount,
      hasMismatch,
      completedActionCount,
      completedCommandCount,
      currentCommandIndex,
      nextAction,
      isComplete: (
        expectedActions.length > 0 &&
        actualActionCount === expectedActions.length &&
        matchedActionCount === expectedActions.length
      )
    };
  }

  getRestorableFixedDrawingHistory(history = []) {
    if (!this.isFixedCommandDrawingMode()) return [];
    const gridSize = this.currentLevel?.gridSize || 5;
    const restored = [];
    let position = { ...(this.currentLevel?.starPos || { x: 0, y: 0 }) };
    let penDown = true;

    for (const action of this.sanitizeStoredStudentDrawHistory(history, gridSize)) {
      if (action.type === 'pen') {
        const nextPenDown = action.toPenDown !== false;
        restored.push({ ...action, fromPenDown: penDown, toPenDown: nextPenDown });
        penDown = nextPenDown;
        continue;
      }
      if (action.type !== 'move' || action.fromX !== position.x || action.fromY !== position.y) break;
      const dir = getDirectionKeyForUnitDelta(
        action.toX - action.fromX,
        action.toY - action.fromY
      );
      if (!dir) break;
      restored.push({ ...action, penDown, drewLine: penDown });
      position = { x: action.toX, y: action.toY };
    }
    return restored;
  }

  updateFixedDrawingProgressUI() {
    if (typeof document === 'undefined' || !this.isFixedCommandDrawingMode()) return;
    const progress = this.getFixedDrawingProgress();
    const chips = document.querySelectorAll(
      '#command-queue .command-chip[data-index], .drawing-education-source-command[data-reference-index]'
    );

    chips.forEach(chip => {
      const index = Number.parseInt(chip.dataset.index ?? chip.dataset.referenceIndex, 10);
      const isComplete = index < progress.currentCommandIndex || progress.isComplete;
      const isCurrent = (
        !progress.hasMismatch &&
        !progress.isComplete &&
        index === progress.currentCommandIndex
      );
      chip.classList.toggle('completed-step', isComplete);
      chip.classList.toggle('active-step', isCurrent);
      chip.setAttribute('aria-current', isCurrent ? 'step' : 'false');
      chip.querySelector('.chip-substep-badge')?.remove();

      if (isCurrent && progress.nextAction?.type === 'move') {
        const badge = document.createElement('span');
        badge.className = 'chip-substep-badge';
        badge.textContent = `${progress.nextAction.substepIndex + 1}/${progress.nextAction.commandDistance}칸`;
        chip.appendChild(badge);
      }
    });

    const goalBadge = document.getElementById('drawing-education-goal-badge');
    if (goalBadge) {
      goalBadge.textContent = progress.hasMismatch
        ? `내 동작 ${progress.actualActionCount}회`
        : `진행 ${progress.completedCommandCount}/${progress.commands.length}`;
    }
  }

  getStudentDrawingMovementDistance() {
    this.ensureStudentDrawHistory();
    if (this.studentDrawHistory.length > 0) {
      return this.studentDrawHistory.reduce((total, action) => (
        action.type === 'move'
          ? total + Math.max(
            Math.abs((action.toX || 0) - (action.fromX || 0)),
            Math.abs((action.toY || 0) - (action.fromY || 0))
          )
          : total
      ), 0);
    }
    return (this.studentDrawnLines || []).length;
  }

  recordStudentPenState(isPenDown) {
    this.ensureStudentDrawHistory();
    const previousPenDown = this.isPenDown !== false;
    const isFixedDrawing = this.isFixedCommandDrawingMode();
    if (previousPenDown === isPenDown && !isFixedDrawing) return false;

    this.studentRedoHistory = [];
    this.studentRedoLines = [];
    this.studentDrawHistory.push({
      type: 'pen',
      fromPenDown: previousPenDown,
      toPenDown: isPenDown,
      x: this.renderer?.starPos?.x,
      y: this.renderer?.starPos?.y
    });
    this.isPenDown = isPenDown;
    this.renderer?.setPenDown?.(isPenDown);
    if (typeof document !== 'undefined') this.updatePenControlUI(isPenDown);
    this.updateStudentHistoryControls();
    this.updateStepCounter();
    this.updateFixedDrawingProgressUI();
    this.saveEducationProgress({ active: this.isEducationMode() });
    return true;
  }

  recordStudentMove(toX, toY) {
    const curPos = this.renderer.starPos;
    if (!curPos) return false;

    const dx = toX - curPos.x;
    const dy = toY - curPos.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) {
      return false;
    }

    const gridSize = this.currentLevel?.gridSize || this.renderer.gridSize || 7;
    if (toX < 0 || toX >= gridSize || toY < 0 || toY >= gridSize) {
      Audio.playError();
      this.setStatus('🧱 모눈종이 밖으로는 이동할 수 없습니다. 다른 방향을 선택해 보세요.', 'error');
      return false;
    }

    const dir = getDirectionKeyForUnitDelta(dx, dy);
    if (!dir) return false;

    this.ensureStudentDrawHistory();
    const fromX = curPos.x;
    const fromY = curPos.y;
    const color = this.activeBrushColor || 'rainbow';
    const penDown = this.isPenDown !== false;
    const action = {
      type: 'move',
      fromX,
      fromY,
      toX,
      toY,
      penDown,
      drewLine: penDown,
      color
    };
    this.studentRedoHistory = [];
    this.studentRedoLines = [];
    this.studentDrawHistory.push(action);
    Audio.playStep();
    if (penDown) {
      this.renderer.addDrawnLine(fromX, fromY, toX, toY, color);
      this.studentDrawnLines.push({ fromX, fromY, toX, toY, color });
    }
    this.renderer.setStarPos(toX, toY);
    this.updateStudentHistoryControls();
    this.updateStepCounter();
    this.updateFixedDrawingProgressUI();
    this.saveEducationProgress({ active: this.isEducationMode() });
    return true;
  }

  syncStudentDrawingFromHistory() {
    this.ensureStudentDrawHistory();
    const startPos = this.currentLevel?.starPos || { x: 1, y: 5 };
    const drawnLines = [];
    let nextPos = { ...startPos };
    let isPenDown = true;

    for (const action of this.studentDrawHistory) {
      if (action.type === 'pen') {
        isPenDown = action.toPenDown !== false;
      } else if (action.type === 'move') {
        nextPos = { x: action.toX, y: action.toY };
        if (action.drewLine) {
          drawnLines.push({
            fromX: action.fromX,
            fromY: action.fromY,
            toX: action.toX,
            toY: action.toY,
            color: action.color || 'rainbow'
          });
        }
      }
    }

    this.studentDrawnLines = drawnLines;
    this.studentRedoLines = this.studentRedoHistory
      .filter(action => action.type === 'move' && action.drewLine)
      .map(action => ({
        fromX: action.fromX,
        fromY: action.fromY,
        toX: action.toX,
        toY: action.toY,
        color: action.color || 'rainbow'
      }));
    this.isPenDown = isPenDown;
    this.renderer.setDrawnLines(drawnLines);
    this.renderer.setPenDown?.(isPenDown);
    this.renderer.starAngle = 0;
    this.renderer.setStarPos(nextPos.x, nextPos.y);
    if (typeof document !== 'undefined') this.updatePenControlUI(isPenDown);
    this.updateStudentHistoryControls();
    this.updateStepCounter();
    this.updateFixedDrawingProgressUI();
    this.saveEducationProgress({ active: this.isEducationMode() });
  }

  undoStudentDrawStep() {
    this.ensureStudentDrawHistory();
    if (!this.isStudentDrawMode() || this.isExecuting || this.studentDrawHistory.length === 0) {
      return false;
    }

    const undoneAction = this.studentDrawHistory.pop();
    this.studentRedoHistory.push(undoneAction);
    this.syncStudentDrawingFromHistory();
    this.setStatus('↩️ 방금 한 붓 동작을 되돌렸습니다.', 'info');
    return true;
  }

  redoStudentDrawStep() {
    this.ensureStudentDrawHistory();
    if (!this.isStudentDrawMode() || this.isExecuting || this.studentRedoHistory.length === 0) {
      return false;
    }

    const restoredAction = this.studentRedoHistory.pop();
    this.studentDrawHistory.push(restoredAction);
    this.syncStudentDrawingFromHistory();
    this.setStatus('↪️ 되돌린 붓 동작을 다시 실행했습니다.', 'info');
    return true;
  }

  updateStudentHistoryControls() {
    if (typeof document === 'undefined') return;
    this.ensureStudentDrawHistory();
    const controls = document.getElementById('student-history-controls');
    const undoBtn = document.getElementById('student-undo-btn');
    const redoBtn = document.getElementById('student-redo-btn');
    const isStudentHistoryVisible = this.isStudentDrawMode();
    const isGhostControlVisible = this.isDrawingModeGroup() && !isStudentHistoryVisible;

    if (controls) {
      controls.style.display = (isStudentHistoryVisible || isGhostControlVisible) ? 'grid' : 'none';
    }
    if (undoBtn) {
      undoBtn.hidden = !isStudentHistoryVisible;
      undoBtn.disabled = !isStudentHistoryVisible || this.isExecuting || this.studentDrawHistory.length === 0;
    }
    if (redoBtn) {
      redoBtn.hidden = !isStudentHistoryVisible;
      redoBtn.disabled = !isStudentHistoryVisible || this.isExecuting || this.studentRedoHistory.length === 0;
    }
  }

  recordStudentPathTo(toX, toY, { interpolateFreePath = false } = {}) {
    const curPos = this.renderer.starPos;
    if (!curPos) return false;

    const dx = toX - curPos.x;
    const dy = toY - curPos.y;
    if (dx === 0 && dy === 0) return false;
    const isStraightEightDirection = (
      dx === 0 ||
      dy === 0 ||
      Math.abs(dx) === Math.abs(dy)
    );
    if (!isStraightEightDirection && !interpolateFreePath) {
      Audio.playError();
      this.setStatus('📐 먼 칸은 가로·세로·대각선 일직선 위에 있을 때만 한 번에 이동할 수 있어요.', 'error');
      return false;
    }

    let x = curPos.x;
    let y = curPos.y;
    let moved = false;
    if (isStraightEightDirection) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      for (let step = 0; step < distance; step++) {
        x += Math.sign(dx);
        y += Math.sign(dy);
        if (!this.recordStudentMove(x, y)) break;
        moved = true;
      }
      return moved;
    }

    const targetX = toX;
    const targetY = toY;
    const deltaX = Math.abs(targetX - x);
    const deltaY = -Math.abs(targetY - y);
    const stepX = x < targetX ? 1 : -1;
    const stepY = y < targetY ? 1 : -1;
    let error = deltaX + deltaY;
    while (x !== targetX || y !== targetY) {
      const twiceError = 2 * error;
      if (twiceError >= deltaY) {
        error += deltaY;
        x += stepX;
      }
      if (twiceError <= deltaX) {
        error += deltaX;
        y += stepY;
      }
      if (!this.recordStudentMove(x, y)) break;
      moved = true;
    }

    return moved;
  }

  recordStudentDragGesture(pixelX, pixelY, gestureState = {}) {
    const cellSize = Number(this.renderer?.cellSize) || 0;
    if (cellSize <= 0) return false;

    if (!Number.isFinite(gestureState.anchorX) || !Number.isFinite(gestureState.anchorY)) {
      gestureState.anchorX = pixelX;
      gestureState.anchorY = pixelY;
      gestureState.lastDx = 0;
      gestureState.lastDy = 0;
      return false;
    }

    let moved = false;
    for (let guard = 0; guard < 32; guard++) {
      const pointerDx = pixelX - gestureState.anchorX;
      const pointerDy = pixelY - gestureState.anchorY;
      if (pointerDx === 0 && pointerDy === 0) break;

      const sector = Math.round(Math.atan2(pointerDy, pointerDx) / (Math.PI / 4));
      const eightDirectionDeltas = [
        { dx: 1, dy: 0 },
        { dx: 1, dy: 1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: -1, dy: -1 },
        { dx: 0, dy: -1 },
        { dx: 1, dy: -1 }
      ];
      const delta = eightDirectionDeltas[(sector + 8) % 8];
      const directionLength = Math.hypot(delta.dx, delta.dy);
      const unitX = delta.dx / directionLength;
      const unitY = delta.dy / directionLength;
      const projectedDistance = pointerDx * unitX + pointerDy * unitY;
      const gridStepDistance = cellSize * directionLength;
      const isReversing = (
        gestureState.lastDx * delta.dx + gestureState.lastDy * delta.dy < 0
      );
      const movementThreshold = gridStepDistance * (isReversing ? 0.85 : 0.45);
      if (projectedDistance < movementThreshold) break;

      const currentPos = this.renderer?.starPos;
      if (!currentPos || !this.recordStudentMove(
        currentPos.x + delta.dx,
        currentPos.y + delta.dy
      )) break;

      gestureState.anchorX += delta.dx * cellSize;
      gestureState.anchorY += delta.dy * cellSize;
      gestureState.lastDx = delta.dx;
      gestureState.lastDy = delta.dy;
      moved = true;
    }

    return moved;
  }

  drawStudentStep(dirKey) {
    if (!this.isStudentDrawMode() || this.isExecuting) return false;
    if (dirKey === 'PEN_DOWN' || dirKey === 'PEN_UP') {
      Audio.playAddCommand();
      return this.recordStudentPenState(dirKey === 'PEN_DOWN');
    }
    const direction = DIRECTIONS[dirKey];
    if (!direction) return false;

    const curPos = this.renderer.starPos;
    if (!curPos) return false;
    return this.recordStudentMove(curPos.x + direction.dx, curPos.y + direction.dy);
  }

  handleCanvasDrag(e, options = {}) {
    if (this.isExecuting) return;
    const rect = this.canvas.getBoundingClientRect();
    const touch = (e.touches && e.touches.length > 0) ? e.touches[0] : (e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0] : null);
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;

    if (clientX === undefined || clientY === undefined) return;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const gestureState = options.gestureState;
    if (gestureState && !Number.isFinite(gestureState.anchorX)) {
      gestureState.anchorX = x;
      gestureState.anchorY = y;
      gestureState.lastDx = 0;
      gestureState.lastDy = 0;
    }

    if (options.interpolateFreePath && gestureState) {
      this.recordStudentDragGesture(x, y, gestureState);
      return;
    }

    const targetGrid = this.renderer.pixelToGrid(x, y);
    if (!targetGrid) return;

    this.recordStudentPathTo(targetGrid.x, targetGrid.y, options);
  }

  handleCanvasClick(e) {
    if (this.isExecuting) return;
    if (this.currentMode !== 'creator') return;

    const rect = this.canvas.getBoundingClientRect();
    const touch = (e.touches && e.touches.length > 0) ? e.touches[0] : (e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0] : null);
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;

    if (clientX === undefined || clientY === undefined) return;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const grid = this.renderer.pixelToGrid(x, y);
    if (!grid) return;

    Audio.playStep();

    if (this.creatorType === 'draw') {
      // 🖌️ 그림 모드: 시작 붓 위치 변경
      this.renderer.setStarPos(grid.x, grid.y);
      if (this.customPuzzleData) this.customPuzzleData.starPos = { x: grid.x, y: grid.y };
    } else {
      // 🚀 미사일 모드: 편집 도구(장애물, 시작점, 목표점) 변경
      if (this.activeCreatorTool === 'star') {
        const isObstacle = (this.renderer.obstacles || []).some(
          obstacle => obstacle.x === grid.x && obstacle.y === grid.y
        );
        const isGoal = this.renderer.goalPos &&
          this.renderer.goalPos.x === grid.x &&
          this.renderer.goalPos.y === grid.y;
        if (isGoal || isObstacle) {
          this.setStatus('🚀 시작점은 목표점이나 장애물과 같은 칸에 놓을 수 없습니다.', 'error');
          return;
        }
        this.renderer.setStarPos(grid.x, grid.y);
      } else if (this.activeCreatorTool === 'goal') {
        const isObstacle = (this.renderer.obstacles || []).some(
          obstacle => obstacle.x === grid.x && obstacle.y === grid.y
        );
        const isStar = this.renderer.starPos &&
          this.renderer.starPos.x === grid.x &&
          this.renderer.starPos.y === grid.y;
        if (isStar || isObstacle) {
          this.setStatus('🎯 목표점은 시작점이나 장애물과 같은 칸에 놓을 수 없습니다.', 'error');
          return;
        }
        this.renderer.setGoalPos(grid.x, grid.y);
      } else {
        // 'obstacle' 도구: 장애물 토글 (있으면 제거, 없으면 추가)
        const obs = [...(this.renderer.obstacles || [])];
        const existingIdx = obs.findIndex(o => o.x === grid.x && o.y === grid.y);

        if (existingIdx >= 0) {
          obs.splice(existingIdx, 1);
        } else {
          const isStar = this.renderer.starPos && (this.renderer.starPos.x === grid.x && this.renderer.starPos.y === grid.y);
          const isGoal = this.renderer.goalPos && (this.renderer.goalPos.x === grid.x && this.renderer.goalPos.y === grid.y);
          if (!isStar && !isGoal) {
            obs.push({ x: grid.x, y: grid.y });
          }
        }
        this.renderer.setObstacles(obs);
      }
    }
  }

  async evaluateStudentDrawSubmission() {
    if (this.isExecuting) return;

    const levelList = PRESET_LEVELS.debug_guide || [];
    const currentLevel = this.currentLevel || levelList[this.levelIndex] || levelList[0];
    const targetLines = currentLevel.targetLines || [];

    if (this.isFixedCommandDrawingMode()) {
      this.ensureStudentDrawHistory();
      const isEducationFixedDrawing = (
        this.isDrawingEducationMode() &&
        this.selectedEducationLesson === 'draw_sequence'
      );
      const assessment = assessFixedDrawingExecution(
        {
          ...currentLevel,
          initialCommands: this.getFixedDrawingCommands(currentLevel)
        },
        this.studentDrawHistory,
        this.studentDrawnLines
      );

      if (assessment.isSuccess) {
        const completedRandomChallenge = !isEducationFixedDrawing && this.challengeType !== 'stage'
          ? this.onChallengeSuccess()
          : false;
        const submitExecId = ++this.executionId;
        this.isExecuting = true;
        this.pauseChallengeTimer('simulation');
        this.updateStudentHistoryControls();
        Audio.playArtisticChime();
        try {
          await this.renderer.triggerRainbowCelebration(
            this.renderer.starPos.x,
            this.renderer.starPos.y
          );
        } finally {
          if (this.executionId === submitExecId) {
            this.isExecuting = false;
            this.updateStudentHistoryControls();
            this.resumeChallengeTimer('simulation');
          }
        }
        if (this.executionId !== submitExecId) return;
        if (completedRandomChallenge) {
          this.endChallenge(false);
          return;
        }

        this.setStatus('✅ 제시된 명령을 순서대로 모두 수행해 그림을 완성했습니다!', 'success');
        this.showResultModal({
          isSuccess: true,
          icon: '📜 🖌️ ✨',
          title: '✨ 명령 순서대로 그림 완성!',
          desc: '제시된 방향과 거리를 앞에서부터 정확히 실행해 같은 그림을 완성했습니다.',
          badge: `명령 동작 ${assessment.actualActionCount}/${assessment.expectedActionCount}칸 · 그림 완성`,
          primaryBtnText: isEducationFixedDrawing
            ? this.getEducationAdvanceButtonText()
            : getNextProblemButtonLabel('debug_guide', this.challengeType),
          onPrimary: isEducationFixedDrawing
            ? () => this.advanceEducationProblem()
            : () => this.loadLevel()
        });
        return;
      }

      if (!isEducationFixedDrawing) this.onChallengeFailure();
      Audio.playError();
      const progress = this.getFixedDrawingProgress();
      const nextCommand = progress.commands[progress.currentCommandIndex];
      const hasWrongOrder = assessment.matchedActionCount < assessment.actualActionCount;
      const isIncomplete = (
        !hasWrongOrder &&
        assessment.actualActionCount < assessment.expectedActionCount
      );
      this.setStatus(
        isIncomplete
          ? `📜 아직 ${assessment.expectedActionCount - assessment.actualActionCount}칸이 남았습니다. 다음 ${formatCommandCombination([nextCommand])} 명령을 이어서 수행하세요.`
          : '📜 자유롭게 그린 결과를 제시 명령의 순서와 비교해 보세요. 되돌리기나 처음부터로 다시 시도할 수 있습니다.',
        'error'
      );
      this.showResultModal({
        isSuccess: false,
        icon: '📜 🖌️ 🔎',
        title: isIncomplete ? '아직 명령이 남아 있어요' : '명령 순서를 다시 확인해 보세요',
        desc: isIncomplete
          ? `제시된 동작 ${assessment.expectedActionCount}칸 중 <b>${assessment.actualActionCount}칸</b>을 수행했습니다. 현재 강조된 명령부터 이어서 그려 보세요.`
          : '그리는 동안에는 어느 방향으로든 자유롭게 움직일 수 있습니다. 제출 결과를 제시 명령과 비교한 뒤 되돌리기나 처음부터로 수정해 보세요.',
        badge: `내 동작 ${assessment.actualActionCount}회 · 일치 ${assessment.matchedActionCount}/${assessment.expectedActionCount}`,
        primaryBtnText: '계속 그리기',
        onPrimary: () => {}
      });
      return;
    }

    if (this.studentDrawnLines.length === 0) {
      this.onChallengeFailure();
      Audio.playError();
      this.setStatus('🎨 붓(🖌️)을 잡아 모눈종이 위를 한 칸씩 드래그하여 그림을 먼저 그려보세요!', 'error');
      return;
    }

    const comparison = CommandEngine.assessDrawingAttempt(
      currentLevel.starPos,
      this.studentDrawnLines,
      targetLines
    );
    const physicalDistance = this.getStudentDrawingMovementDistance();
    if (Number.isFinite(comparison.minimumDistance)) {
      comparison.actualDistance = physicalDistance;
      comparison.isMinimum = (
        comparison.isExactMatch &&
        physicalDistance === comparison.minimumDistance
      );
      comparison.extraDistance = comparison.isExactMatch
        ? Math.max(0, physicalDistance - comparison.minimumDistance)
        : 0;
    }
    const matchedCount = comparison.matchedCount;
    const targetCount = comparison.targetCount;
    const isSuccess = comparison.isExactMatch;
    const drawingOutcome = classifyDrawingOutcome(
      this.requireMinimumDrawing,
      comparison
    );

    if (drawingOutcome === 'retry') {
      this.onChallengeFailure();
      Audio.playError();
      this.setStatus(
        `🖌️ 그림은 완성했습니다! 최소 붓 이동보다 ${comparison.extraDistance}칸 더 그렸습니다.`,
        'error'
      );
      this.showResultModal({
        isSuccess: false,
        icon: '🎨 🖌️ 🔎',
        title: '🖌️ 같은 그림을 더 적은 움직임으로 그려 보세요!',
        desc: `그림의 모든 선은 정확합니다.<br>현재 <b>${comparison.actualDistance}칸</b>에서 되짚는 움직임을 줄여 최소 <b>${comparison.minimumDistance}칸</b>에 도전해 보세요.`,
        badge: `현재 ${comparison.actualDistance}칸 · 최소 ${comparison.minimumDistance}칸 · ${comparison.extraDistance}칸 줄이기`,
        primaryBtnText: '🔄 최소 횟수로 다시 그리기',
        onPrimary: () => this.resetLevel()
      });
      return;
    }

    if (isSuccess) {
      const completedRandomChallenge = this.challengeType !== 'stage'
        ? this.onChallengeSuccess()
        : false;

      const submitExecId = ++this.executionId;
      this.isExecuting = true;
      this.pauseChallengeTimer('simulation');
      this.updateStudentHistoryControls();
      Audio.playArtisticChime();
      try {
        await this.renderer.triggerRainbowCelebration(this.renderer.starPos.x, this.renderer.starPos.y);
      } finally {
        if (this.executionId === submitExecId) {
          this.isExecuting = false;
          this.updateStudentHistoryControls();
          this.resumeChallengeTimer('simulation');
        }
      }
      if (this.executionId !== submitExecId) return;
      if (completedRandomChallenge) {
        this.endChallenge(false);
        return;
      }

      const successMessage = comparison.isMinimum
        ? `🏆 최소 붓 이동 ${comparison.actualDistance}칸으로 목표 그림을 완성했습니다! 🎉🎨`
        : '✨ 그린 순서와 방향에 관계없이 목표 그림을 완성했습니다! 🎉🎨';
      const resultCopy = getDrawingSuccessResultCopy(
        comparison,
        targetCount,
        { showMinimumMetric: this.requireMinimumDrawing }
      );
      this.setStatus(successMessage, 'success');

      this.showResultModal({
        isSuccess: true,
        icon: '🎉 🖌️ ✨ 🌈',
        title: resultCopy.title,
        desc: resultCopy.description,
        badge: resultCopy.badge,
        primaryBtnText: getNextProblemButtonLabel('debug', this.challengeType),
        onPrimary: () => this.loadLevel()
      });
    } else {
      this.onChallengeFailure();
      Audio.playError();
      const drawingDifference = [
        comparison.missingCount > 0 ? `빠진 선 ${comparison.missingCount}칸` : '',
        comparison.extraCount > 0 ? `추가된 선 ${comparison.extraCount}칸` : ''
      ].filter(Boolean).join(' · ');
      this.setStatus(`🎨 목표 그림을 조금 더 확인해 보세요. ${drawingDifference}`, 'error');

      this.showResultModal({
        isSuccess: false,
        icon: '🖌️ 🧐 🎨',
        title: '🎨 목표 그림의 선을 다시 확인해 보세요!',
        desc: `목표 선 ${targetCount}칸 중 <b>${matchedCount}칸</b>이 같은 위치에 있습니다.<br>그리는 순서·방향·겹쳐 그은 횟수는 채점하지 않으니 빠진 선이나 새로 추가된 선만 확인해 보세요!`,
        badge: `${drawingDifference || '그림 선 구성을 확인해 주세요'}`,
        primaryBtnText: '🔄 다시 그리기',
        onPrimary: () => {
          this.resetLevel();
        }
      });
    }
  }

  checkURLPuzzle() {
    const puzzleCode = Encoder.getPuzzleCodeFromLocation(window.location);
    const puzzleData = Encoder.loadFromURL();
    if (puzzleData) {
      this.enterPlayScreen();
      this.executionId += 1;
      this.isExecuting = false;
      this.stopChallengeTimer();
      this.resetChallengeProgress();
      this.customPuzzleData = puzzleData;
      this.currentMode = 'custom';
      this.syncActivityNavigation('custom', { scrollTab: false });
      this.setChallengeSettingsVisible(false);
      this.loadLevel();
      const solveGuide = this.currentLevel?.guide || '방향 명령을 조립한 뒤 실행해 보세요.';
      this.setStatus(`🎁 친구가 만든 공유 문제를 불러왔습니다. ${solveGuide}`, 'info');
      return true;
    } else if (puzzleCode) {
      this.startActivity('shortest');
      this.setStatus('⚠️ 공유 문제가 손상되었거나 풀 수 없는 배치여서 기본 문제로 열었습니다.', 'error');
      return true;
    }
    return false;
  }

  switchMode(mode, { scrollTab = true, forceReload = false } = {}) {
    if (!ACTIVITY_MODES.includes(mode)) {
      return false;
    }

    ensurePresetProblemBankMode(mode);

    if (mode === this.currentMode && !forceReload) {
      this.syncActivityNavigation(mode, { scrollTab });
      this.setChallengeSettingsVisible(mode !== 'creator');
      if (!this.currentLevel) {
        this.loadLevel();
      }
      this.updateModeHierarchySummary();
      return true;
    }

    // 진행 중인 모든 애니메이션/루프 즉시 강제 중단 및 실행 잠금 해제
    this.executionId += 1;
    this.isExecuting = false;
    this.stopChallengeTimer();
    this.closeAllModals();
    this.currentMode = mode;
    if (this.challengeType === 'education') {
      const learningMode = getLearningModeForActivity(mode);
      if (['missile', 'drawing'].includes(learningMode)) {
        this.selectedEducationLesson = this.educationLessonSelections[learningMode];
      }
    }
    this.levelIndex = 0;
    this.customPuzzleData = null;
    this.resetChallengeProgress();
    this.resetProblemDraws(mode);

    // 캔버스 드로잉 및 이펙트 완전 초기화
    this.studentDrawnLines = [];
    this.studentRedoLines = [];
    this.studentDrawHistory = [];
    this.studentRedoHistory = [];
    if (this.renderer) {
      this.renderer.clearDrawnLines();
    }

    // 상위 활동 탭과 하위 도전 설정의 선택 상태를 한 번에 맞춘다.
    this.syncActivityNavigation(mode, { scrollTab });
    this.setChallengeSettingsVisible(mode !== 'creator');

    this.loadLevel();
    if (this.challengeType === 'timeattack' && mode !== 'creator') {
      this.startChallengeTimer();
    }
    this.updateModeHierarchySummary();
    return true;
  }

  loadLevel() {
    getRequiredProblemBankModes(this.currentMode, this.challengeType)
      .forEach(mode => ensurePresetProblemBankMode(mode));
    this.executionId = (this.executionId || 0) + 1;
    this.isExecuting = false;
    this.commands = [];
    this.updateDrawingRuleControl();
    if (this.isEducationMode()) {
      this.educationRouteSignatures = new Set();
      this.educationRouteEntries = [];
      this.commandBlockDefinitions = { A: [], B: [] };
      this.commandBlockEditTarget = 'main';
    }
    this.studentDrawnLines = [];
    this.studentRedoLines = [];
    this.studentDrawHistory = [];
    this.studentRedoHistory = [];
    this.renderCommandQueue();

    if (this.renderer) {
      this.renderer.clearDrawnLines();
    }

    let level;
    let playerType = 'missile';

    if (this.currentMode === 'custom' && this.customPuzzleData) {
      level = this.customPuzzleData;
      playerType = (level.puzzleType === 'draw' || level.playerType === 'brush') ? 'brush' : 'missile';
      if (Array.isArray(level.initialCommands) && level.initialCommands.length > 0) {
        this.commands = JSON.parse(JSON.stringify(level.initialCommands));
      }
      document.getElementById('mode-title-text').textContent = `🎁 친구의 문제: ${level.title || '공유 문제'}`;
      document.getElementById('level-indicator').textContent = playerType === 'brush' ? '그림 공유 문제' : '미사일 공유 문제';
    } else if (this.currentMode === 'creator') {
      playerType = this.creatorType === 'draw' ? 'brush' : 'missile';
      const creatorSize = this.creatorGridSize || 7;

      if (this.creatorType === 'draw') {
        level = {
          title: '나만의 그림 출제하기',
          gridSize: creatorSize,
          starPos: { x: 1, y: Math.max(1, creatorSize - 2) },
          obstacles: [],
          guide: '🖌️ 방향 버튼으로 나만의 그림 경로를 만든 후 [🔗 공유하기]를 누르면 친구에게 그림 퀴즈가 전송됩니다!'
        };
        document.getElementById('mode-title-text').textContent = '🖌️ 활동 5: 그림 문제 만들기';
      } else {
        level = {
          title: '나만의 미사일 문제 만들기',
          gridSize: creatorSize,
          starPos: { x: 0, y: creatorSize - 1 },
          goalPos: { x: creatorSize - 1, y: 0 },
          obstacles: [],
          guide: '🚀 모눈종이에서 시작점·목표점·장애물을 배치한 후 [🔗 공유하기]로 친구에게 미사일 문제를 보내세요!'
        };
        document.getElementById('mode-title-text').textContent = '🚀 활동 5: 미사일 문제 만들기';
      }
      document.getElementById('level-indicator').textContent = '문제 만들기';
    } else if (this.isEducationMode()) {
      level = this.getEducationLevel();
      if (!level) {
        this.challengeType = 'stage';
        this.updateChallengeModeControl();
        return this.loadLevel();
      }
      if (this.selectedEducationLesson === 'compress') {
        level = prepareEfficiencyLevel(level);
      }
      playerType = this.isDrawingEducationMode() ? 'brush' : 'missile';
      const lesson = this.getActiveEducationLesson();
      document.getElementById('mode-title-text').textContent = `📚 ${lesson.order}단계: ${lesson.title}`;
      const conditionLabel = this.isDrawingEducationMode()
        ? '그림 교육'
        : ((level.obstacles || []).length > 0 ? '장애물 있음' : '장애물 없음');
      const pool = this.getEducationLevelPool();
      const bankSize = this.getEducationProblemBank().length;
      document.getElementById('level-indicator').textContent = [
        `${level.gridSize}x${level.gridSize}`,
        conditionLabel,
        `교육 ${this.educationLevelIndex % Math.max(1, pool.length) + 1}/${Math.max(1, pool.length)}`,
        `문제은행 ${bankSize}개`
      ].join(' · ');
    } else {
      const modeKey = this.currentMode;
      const levelList = PRESET_LEVELS[modeKey] || [];
      const supportedSizes = getSupportedGridSizesForMode(this.currentMode);
      const targetGridSize = supportedSizes.includes(this.selectedGridSize)
        ? this.selectedGridSize
        : supportedSizes[0];
      const picked = this.drawNextRandomProblem(modeKey, levelList, targetGridSize);
      const fallback = getLevelsForGridSize(levelList, targetGridSize)[0]
        || levelList.flatMap(entry => Array.isArray(entry) ? entry : [entry])[0];
      level = JSON.parse(JSON.stringify(picked || fallback));

      if (this.currentMode === 'efficiency') {
        level = prepareEfficiencyLevel(level);
      }

      if (this.currentMode === 'chase') {
        playerType = 'cop';
      } else if (['debug', 'debug_guide', 'single_stroke'].includes(this.currentMode)) {
        playerType = 'brush';
      } else {
        playerType = 'missile';
      }

      if (this.currentMode === 'debug_guide') {
        this.drawSubmode = 'guide';
      } else if (this.currentMode === 'debug') {
        this.drawSubmode = 'free';
      }

      const modeNames = {
        efficiency: '🧠 준비 활동: 명령을 효율적으로 쓰기',
        shortest: '🎯 활동 1: 미사일 이동',
        routing: '🧭 활동 2: 장애물 피하기',
        debug: '🎨 활동 3: 그림 보고 명령어 만들기',
        debug_guide: '📜 활동 4: 명령 보고 그림 그리기',
        single_stroke: '🖌️ 한붓그리기',
        creator: '✏️ 활동 5: 나만의 문제 만들기',
        chase: '👮‍♂️ 활동 6: 도둑 잡기'
      };

      document.getElementById('mode-title-text').textContent = level.title || modeNames[this.currentMode] || '';

      const titleMap = {
        stage: '🎲 자유 도전',
        random: `🎯 ${getRandomChallengeTargetCount(this.currentMode, level.gridSize)}문제 도전`,
        timeattack: '⏱️ 60초 도전',
        infinite: '♾️ 계속 도전',
        multisolution: '🧭 여러 풀이 찾기'
      };
      const obstacleLabel = ['shortest', 'routing', 'chase'].includes(this.currentMode)
        ? (getObstacleMapType(level) === 'obstacle' ? '장애물 있음' : '장애물 없음')
        : '';
      const challengeProgress = this.challengeType === 'stage'
        ? ''
        : (
            this.challengeType === 'multisolution'
              ? ` · 최단 풀이 0/${getMultiSolutionGoalCount(level.solutionCount)}개`
              : ` · 성공 ${this.challengeState.solvedCount}개`
          );
      const indicatorText = [
        `${level.gridSize}x${level.gridSize}`,
        obstacleLabel,
        titleMap[this.challengeType]
      ].filter(Boolean).join(' · ') + challengeProgress;
      document.getElementById('level-indicator').textContent = indicatorText;

      if (level.initialCommands) {
        this.commands = JSON.parse(JSON.stringify(level.initialCommands));
        this.renderCommandQueue();
      }
    }

    if (
      ['shortest', 'routing'].includes(this.currentMode) &&
      level?.starPos &&
      level?.goalPos
    ) {
      const minimumCommandAnalysis = CommandEngine.analyzeMinimumCommands(
        level.starPos,
        level.goalPos,
        level.gridSize,
        level.obstacles || []
      );
      level.minimumCommandCount = minimumCommandAnalysis.commandCount;
      level.minimumCommandSolution = minimumCommandAnalysis.commands;
    }

    this.currentLevel = level;
    if (this.isFixedCommandDrawingMode()) {
      this.commands = [];
    } else if (this.commands.length === 0 && this.usesExplicitPenStartCommand()) {
      this.commands = this.getDefaultDrawingCommands();
    }
    this.resetMultiSolutionProgress(level);
    if (
      this.currentMode === 'custom' &&
      Array.isArray(level.initialCommands) &&
      level.initialCommands.length > 0
    ) {
      this.renderCommandQueue();
    }
    this.renderCommandQueue();
    this.renderEfficiencyTask(level);
    this.renderDrawingEducationTask(level);
    this.renderThiefPlanPanel(level);
    this.canvas?.setAttribute(
      'aria-label',
      this.isFixedCommandDrawingMode()
        ? '빈 모눈종이. 어느 방향으로든 붓을 자유롭게 드래그하거나 다음 교차점을 눌러 그린 뒤 제시 명령과 비교합니다.'
        : '좌표와 게임 요소가 표시되는 모눈종이. 방향 버튼, 키보드 또는 드래그로 조작합니다.'
    );

    // 🎨 붓 색상 팔레트 피커 토글 (붓 아이콘 모드일 때만 표시)
    const colorPicker = document.getElementById('brush-color-picker');
    if (colorPicker) {
      colorPicker.style.display = (playerType === 'brush' && !this.isFixedCommandDrawingMode()) ? 'flex' : 'none';
    }

    // ✏️ 창작 모드 및 출제 유형별 전용 도구 토글
    const creatorControls = document.getElementById('creator-controls');
    if (creatorControls) {
      creatorControls.style.display = (this.currentMode === 'creator') ? 'flex' : 'none';
    }
    const creatorOutputActions = document.getElementById('creator-output-actions');
    if (creatorOutputActions) {
      creatorOutputActions.style.display = (this.currentMode === 'creator') ? 'flex' : 'none';
    }
    this.updateCreatorInterface();

    // 모눈종이 렌더러 설정 업데이트
    this.renderer.setGridSize(level.gridSize || 7);
    this.renderer.setPlayerType(playerType);
    this.renderer.setStarPos(level.starPos.x, level.starPos.y);
    this.renderer.setGoalPos(level.goalPos ? level.goalPos.x : null, level.goalPos ? level.goalPos.y : null);
    this.renderer.setThiefPos(level.thiefPos ? level.thiefPos.x : null, level.thiefPos ? level.thiefPos.y : null);
    this.renderer.setHandcuffPos(level.handcuffPos ? level.handcuffPos.x : null, level.handcuffPos ? level.handcuffPos.y : null);
    this.renderer.setObstacles(level.obstacles || []);
    this.renderer.setCheckpoints?.(level.checkpoints || []);
    this.renderer.setVisitedCheckpointCount?.(0);
    this.renderer.setFuelStops?.(level.fuelStops || []);
    this.renderer.setVisitedFuelCount?.(0);
    this.renderer.setTargetLines(level.targetLines || []);
    // 제시 명령을 읽고 직접 그리는 활동의 문제 화면은 빈 모눈종이여야 한다.
    this.renderer.setShowTargetGuide(!this.isFixedCommandDrawingMode());
    this.renderer.clearDrawnLines();
    this.renderer.setPenDown(this.getCurrentPenState());
    this.renderer.starAngle = 0;

    const runBtn = document.getElementById('run-btn');
    const submitBtn = document.getElementById('submit-draw-btn');
    const isCustomDragQuiz = (this.currentMode === 'custom' && playerType === 'brush' && level.initialCommands && level.initialCommands.length > 0);
    const isStudentDragMode = this.isStudentDrawMode();
    const isBombCreator = this.currentMode === 'creator' && this.creatorType === 'bomb';

    if (isStudentDragMode) {
      if (runBtn) runBtn.style.display = 'none';
      if (submitBtn) submitBtn.style.display = 'none';
      this.setStatus(level.guide || '📜 빈 모눈종이에서 어느 방향으로든 자유롭게 그려 보세요. 제출하면 내 붓질을 제시 명령과 비교합니다.', 'info');
    } else if (this.isEducationMode()) {
      if (runBtn) runBtn.style.display = 'inline-flex';
      if (submitBtn) submitBtn.style.display = 'none';
      this.setStatus(level.guide || this.getActiveEducationLesson().description, 'info');
    } else if (isBombCreator) {
      if (runBtn) runBtn.style.display = 'none';
      if (submitBtn) submitBtn.style.display = 'none';
      this.setStatus(level.guide, 'info');
    } else {
      if (runBtn) runBtn.style.display = 'inline-flex';
      if (submitBtn) submitBtn.style.display = 'none';
      const activeMissileRule = getActiveMissileSolutionRule(
        this.challengeType,
        this.missileSolutionRule
      );
      this.setStatus(
        this.challengeType === 'multisolution'
          ? `🧭 최단 ${level.shortestDistance}칸으로 도착하는 서로 다른 방향 순서 ${this.multiSolutionGoalCount}개를 찾아보세요. 가능한 모든 최단 풀이는 ${this.multiSolutionTargetCount}개입니다.`
          : (
              ['shortest', 'routing'].includes(this.currentMode) &&
              activeMissileRule === 'minimum_commands'
                ? `🧩 안전하게 목표까지 도착하는 명령을 최소 ${level.minimumCommandCount}개로 만들어 보세요. 이동 칸 수는 정답 기준이 아닙니다.`
                : (level.guide || '이동 명령어를 조립한 뒤 ▶️ 실행하기 버튼을 누르세요.')
            ),
        'info'
      );
    }
    this.updateStudentHistoryControls();
    this.updateStepCounter();
    this.updatePenStateUI();
    this.saveEducationProgress({ active: this.isEducationMode() });
  }

  renderThiefPlanPanel(level) {
    const panel = document.getElementById('thief-plan-panel');
    const container = document.getElementById('thief-steps-list');
    const obstacleNote = document.getElementById('chase-obstacle-note');
    const handcuffNote = document.getElementById('chase-handcuff-note');

    if (this.currentMode === 'chase' && level && level.thiefCommands) {
      panel.style.display = 'flex';
      const obstacleCount = Array.isArray(level.obstacles) ? level.obstacles.length : 0;
      if (obstacleNote) {
        obstacleNote.hidden = obstacleCount === 0;
        obstacleNote.textContent = obstacleCount > 0
          ? `🧱 장애물 ${obstacleCount}개: 경찰과 도둑 모두 지나갈 수 없어요.`
          : '';
      }
      if (handcuffNote) {
        handcuffNote.hidden = !level.handcuffPos;
        handcuffNote.textContent = level.handcuffPos
          ? '⛓ 수갑을 먼저 찾으세요: 수갑 칸을 지난 뒤에만 도둑을 체포할 수 있어요.'
          : '';
      }
      const steps = CommandEngine.expandToStepList(level.thiefCommands);
      let html = '';
      steps.forEach((dirKey, idx) => {
        const info = DIRECTIONS[dirKey];
        html += `
          <div class="thief-arrow-chip" id="thief-step-${idx}" title="${idx + 1}차례: ${info.label}">
            <span class="thief-arrow-symbol">[1${info.symbol}]</span>
            <span class="thief-arrow-sub">${idx + 1}차례</span>
          </div>
        `;
        if (idx < steps.length - 1) {
          html += `<span class="thief-arrow-sep">➔</span>`;
        }
      });
      container.innerHTML = html;
    } else {
      panel.style.display = 'none';
      if (obstacleNote) obstacleNote.hidden = true;
      if (handcuffNote) handcuffNote.hidden = true;
    }
  }

  isDrawingModeGroup() {
    return (
      ['debug', 'debug_guide', 'single_stroke'].includes(this.currentMode) ||
      (this.currentMode === 'creator' && this.creatorType === 'draw') ||
      (this.currentMode === 'custom' && (this.currentLevel?.type === 'draw' || this.currentLevel?.playerType === 'brush'))
    );
  }

  usesExplicitPenStartCommand() {
    return Boolean(
      this.isDrawingModeGroup() &&
      !this.isStudentDrawMode() &&
      !this.isFixedCommandDrawingMode()
    );
  }

  getDefaultDrawingCommands() {
    return this.usesExplicitPenStartCommand()
      ? [{ dir: 'PEN_DOWN', distance: 1 }]
      : [];
  }

  updatePenControlUI(isPenDown) {
    this.isPenDown = isPenDown !== false;
    this.renderer?.setPenDown(this.isPenDown);

    const penDownBtn = document.getElementById('pen-down-btn');
    const penUpBtn = document.getElementById('pen-up-btn');
    if (penDownBtn) {
      penDownBtn.classList.toggle('active', this.isPenDown);
      penDownBtn.setAttribute('aria-pressed', String(this.isPenDown));
    }
    if (penUpBtn) {
      penUpBtn.classList.toggle('active', !this.isPenDown);
      penUpBtn.setAttribute('aria-pressed', String(!this.isPenDown));
    }

    const centerBtn = document.getElementById('keypad-center');
    const centerIcon = document.getElementById('keypad-center-icon');
    const centerSubtext = document.getElementById('keypad-center-subtext');
    const isBrushMode = this.isDrawingModeGroup();
    const educationPolicy = this.getActiveEducationToolPolicy();
    const fixedDrawingHasPenCommands = !this.isFixedCommandDrawingMode() || this
      .getFixedDrawingCommands()
      .some(command => ['PEN_DOWN', 'PEN_UP'].includes(command?.dir || command?.type));
    const hasInitialPenDown = (
      (this.getActiveCommandBlockList?.() || [])[0]?.dir === 'PEN_DOWN' ||
      (this.getActiveCommandBlockList?.() || [])[0]?.type === 'PEN_DOWN'
    );
    const canRestoreRequiredPenDown = Boolean(
      isBrushMode &&
      this.usesExplicitPenStartCommand() &&
      (educationPolicy?.allowPenControls === false || this.currentMode === 'single_stroke') &&
      !hasInitialPenDown
    );
    const canUsePenControls = (
      isBrushMode &&
      (this.currentMode !== 'single_stroke' || canRestoreRequiredPenDown) &&
      fixedDrawingHasPenCommands &&
      ((!educationPolicy || educationPolicy.allowPenControls !== false) || canRestoreRequiredPenDown)
    );

    if (penDownBtn) penDownBtn.hidden = canUsePenControls ? false : true;
    if (penUpBtn) penUpBtn.hidden = !canUsePenControls || canRestoreRequiredPenDown;

    if (centerBtn) {
      if (canUsePenControls) {
        centerBtn.classList.add('center-btn');
        centerBtn.classList.remove('center-dummy');
        centerBtn.removeAttribute('aria-hidden');
        centerBtn.disabled = false;
        centerBtn.tabIndex = 0;
        // isPenDown(현재 붓 누름 상태): 🖌️ 붓 그림 & '붓 누름' 표기
        // !isPenDown(현재 붓 뗌 상태): ✋ 빈 손 그림 & '붓 뗌' 표기
        if (centerIcon) centerIcon.textContent = this.isPenDown ? '🖌️' : '✋';
        if (centerSubtext) {
          centerSubtext.style.display = 'block';
          centerSubtext.textContent = this.isPenDown ? '붓 누름' : '붓 뗌';
        }
        centerBtn.classList.toggle('pen-up-active', !this.isPenDown);
        centerBtn.title = this.isPenDown ? '클릭 시 붓 떼기 (선 안 그리고 공중 이동)' : '클릭 시 붓 누르기 (선을 그리며 이동)';
        centerBtn.setAttribute(
          'aria-label',
          this.isPenDown ? '붓 떼기: 선 없이 이동하기' : '붓 누르기: 선을 그리며 이동하기'
        );
      } else {
        centerBtn.classList.remove('center-btn', 'pen-up-active');
        centerBtn.classList.add('center-dummy');
        centerBtn.setAttribute('aria-hidden', 'true');
        centerBtn.disabled = true;
        centerBtn.tabIndex = -1;
        if (centerIcon) {
          if (this.currentMode === 'chase') centerIcon.textContent = '👮‍♂️';
          else centerIcon.textContent = '🚀';
        }
        if (centerSubtext) centerSubtext.style.display = 'none';
        centerBtn.title = '이동 키패드';
        centerBtn.removeAttribute('aria-label');
      }
    }

    const penControls = document.getElementById('brush-pen-controls');
    if (penControls) {
      penControls.style.display = canUsePenControls ? 'flex' : 'none';
    }
  }

  addCommand(dirKey) {
    if (this.isExecuting) return;

    if (this.isStudentDrawMode()) {
      this.drawStudentStep(dirKey);
      return;
    }

    if (this.isFixedCommandDrawingMode()) return;

    const isPenCmd = dirKey === 'PEN_DOWN' || dirKey === 'PEN_UP';
    if (!isPenCmd && !DIRECTIONS[dirKey]) return;

    if (
      isPenCmd &&
      this.currentMode === 'single_stroke' &&
      !(
        dirKey === 'PEN_DOWN' &&
        (this.getActiveCommandBlockList()[0]?.dir || this.getActiveCommandBlockList()[0]?.type) !== 'PEN_DOWN'
      )
    ) {
      Audio.playError();
      this.setStatus('🖌️ 한붓그리기에서는 붓을 떼지 않고 한 번에 이어 그려요.', 'error');
      return;
    }
    const educationPolicy = this.getActiveEducationToolPolicy();
    if (isPenCmd && educationPolicy?.allowPenControls === false) {
      const activeCommands = this.getActiveCommandBlockList();
      const canRestoreInitialPenDown = (
        dirKey === 'PEN_DOWN' &&
        this.usesExplicitPenStartCommand() &&
        (activeCommands[0]?.dir || activeCommands[0]?.type) !== 'PEN_DOWN'
      );
      if (!canRestoreInitialPenDown) {
        Audio.playError();
        this.setStatus(
          '🔒 이번 단계에서는 붓을 계속 누른 채로 그려야 합니다. 방향 명령의 순서와 경로에 집중해 보세요.',
          'error'
        );
        return;
      }
    }

    if (isPenCmd) {
      Audio.playAddCommand();
      const activeCommands = this.getActiveCommandBlockList();
      const nextCommands = appendPenCommand(activeCommands, dirKey);
      this.setActiveCommandBlockList(nextCommands);
      this.updateCommandBlockWorkspace();
      this.updateCreatorInterface();
      this.renderCommandQueue({ scrollToEnd: true });
      this.updateStepCounter();
      this.updatePenControlUI(dirKey === 'PEN_DOWN');
      return;
    }
    if (!this.canUseEducationDirection(dirKey)) {
      Audio.playError();
      const policy = this.getActiveEducationToolPolicy();
      this.setStatus(
        policy?.allowDirectMainMoves === false && this.commandBlockEditTarget === 'main'
          ? '🧱 이번 단계의 메인 실행에는 직접 이동 명령을 넣지 않습니다. 명령 블록 A를 먼저 만든 뒤 반복 호출하세요.'
          : '🔒 이번 문제에서는 지도와 학습 개념에 필요한 방향만 사용할 수 있습니다.',
        'error'
      );
      return;
    }
    const isChaseMode = this.currentMode === 'chase' && !this.isPatternEducationActive();
    const activeCommands = this.getActiveCommandBlockList();
    const shouldMergeAdjacent = !isChaseMode && (educationPolicy?.mergeAdjacent ?? true);
    const nextCommands = shouldMergeAdjacent
      ? appendDirectionCommand(activeCommands, dirKey, false)
      : [...activeCommands, { dir: dirKey, distance: 1 }];
    let commandLimit = this.isPatternEducationActive()
      ? (this.commandBlockEditTarget === 'main'
          ? MAX_PATTERN_MAIN_BLOCKS
          : MAX_PATTERN_DEFINITION_COMMANDS)
      : MAX_COMMAND_COUNT;
    if (
      this.isEducationMode() &&
      this.commandBlockEditTarget === 'main' &&
      Number.isInteger(educationPolicy?.maxMainCommands)
    ) {
      commandLimit = Math.min(commandLimit, educationPolicy.maxMainCommands);
    }
    if (nextCommands.length > commandLimit) {
      Audio.playError();
      this.setStatus(
        this.isPatternEducationActive()
          ? `명령 블록 ${this.commandBlockEditTarget === 'main' ? '메인' : this.commandBlockEditTarget}에는 최대 ${commandLimit}개까지 넣을 수 있습니다. 반복과 거리 묶기를 활용해 주세요.`
          : (this.isEducationMode()
              ? `이번 문제에서는 1칸 명령을 최대 ${commandLimit}개까지 사용할 수 있습니다. 지도에 필요한 순서를 다시 살펴보세요.`
              : `명령은 최대 ${MAX_COMMAND_COUNT}개까지 넣을 수 있습니다. 필요 없는 명령을 지우거나 같은 방향의 칸 수를 늘려 보세요.`),
        'error'
      );
      return;
    }

    Audio.playAddCommand();
    this.setActiveCommandBlockList(nextCommands);
    this.updateCommandBlockWorkspace();
    this.updateCreatorInterface();
    this.renderCommandQueue({ scrollToEnd: true });
    this.updateStepCounter();
  }

  moveCommand(fromIndex, toIndex) {
    if (this.isExecuting || this.isFixedCommandDrawingMode()) return false;
    const activeCommands = this.getActiveCommandBlockList();
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= activeCommands.length ||
      toIndex >= activeCommands.length ||
      fromIndex === toIndex
    ) return false;
    const reordered = reorderCommandList(activeCommands, fromIndex, toIndex);
    if (reordered.length !== activeCommands.length || !reordered[toIndex]) return false;
    this.setActiveCommandBlockList(reordered);
    Audio.playAddCommand();
    this.updateCommandBlockWorkspace();
    this.renderCommandQueue();
    this.updateStepCounter();
    this.setStatus(`${fromIndex + 1}번째 명령을 ${toIndex + 1}번째 순서로 옮겼습니다.`, 'info');
    return true;
  }

  removeCommand(index) {
    if (this.isExecuting || this.isFixedCommandDrawingMode()) return;
    Audio.playRemoveCommand();
    const activeCommands = [...this.getActiveCommandBlockList()];
    activeCommands.splice(index, 1);
    this.setActiveCommandBlockList(activeCommands);
    this.updateCommandBlockWorkspace();
    this.renderCommandQueue();
    this.updateStepCounter();
  }

  renderCommandQueue({ scrollToEnd = false } = {}) {
    const queueEl = document.getElementById('command-queue');
    const previousScrollTop = queueEl.scrollTop;
    const displayedCommands = this.getActiveCommandBlockList();

    if (displayedCommands.length === 0) {
      const emptyMessage = document.createElement('span');
      emptyMessage.className = 'brand-sub';
      emptyMessage.style.cssText = 'font-size: 13px; margin: auto;';
      emptyMessage.textContent = this.isPatternEducationActive() && this.commandBlockEditTarget === 'main'
        ? '방향 명령을 넣거나 완성한 명령 블록을 호출하세요'
        : '방향 버튼을 눌러 명령을 추가하세요';
      queueEl.replaceChildren(emptyMessage);
      this.updateEfficiencyStats();
      this.updateDrawingReferenceCommandButtons();
      return;
    }

    const isChaseMode = this.currentMode === 'chase';
    const isFixedDrawing = this.isFixedCommandDrawingMode();
    const educationPolicy = this.getActiveEducationToolPolicy();
    const allowDistanceEditing = (
      !isChaseMode &&
      (educationPolicy?.allowDistanceEditing ?? true)
    );
    const allowedDirectionKeys = educationPolicy?.allowedDirections || Object.keys(DIRECTIONS);
    const fragment = document.createDocumentFragment();

    displayedCommands.forEach((cmd, idx) => {
      const sequenceItem = document.createElement('div');
      sequenceItem.className = 'command-sequence-item';
      sequenceItem.dataset.commandIndex = String(idx);

      const chip = document.createElement('div');
      chip.className = 'command-chip';
      chip.dataset.index = idx;

      const orderBadge = document.createElement('span');
      orderBadge.className = 'command-order-badge';
      orderBadge.textContent = String(idx + 1);
      orderBadge.setAttribute('aria-hidden', 'true');
      chip.appendChild(orderBadge);

      if (!isFixedDrawing && displayedCommands.length > 1) {
        const dragHandle = document.createElement('button');
        dragHandle.type = 'button';
        dragHandle.className = 'command-drag-handle';
        dragHandle.textContent = '⠿';
        dragHandle.title = '드래그해서 명령 순서 바꾸기';
        dragHandle.setAttribute('aria-label', `${idx + 1}번째 명령 순서 바꾸기`);
        dragHandle.draggable = true;
        dragHandle.addEventListener('dragstart', event => {
          this.commandDragIndex = idx;
          sequenceItem.classList.add('dragging');
          event.dataTransfer?.setData('text/plain', String(idx));
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        });
        dragHandle.addEventListener('dragend', () => {
          this.commandDragIndex = null;
          document.querySelectorAll('.command-sequence-item').forEach(item => {
            item.classList.remove('dragging', 'drag-over');
          });
        });
        dragHandle.addEventListener('keydown', event => {
          const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? -1
            : (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0);
          if (delta === 0) return;
          event.preventDefault();
          const nextIndex = Math.min(displayedCommands.length - 1, Math.max(0, idx + delta));
          if (this.moveCommand(idx, nextIndex)) {
            requestAnimationFrame(() => {
              document.querySelector(
                `.command-sequence-item[data-command-index="${nextIndex}"] .command-drag-handle`
              )?.focus();
            });
          }
        });
        dragHandle.addEventListener('pointerdown', event => {
          if (event.pointerType === 'mouse') return;
          this.commandPointerDrag = { pointerId: event.pointerId, fromIndex: idx, toIndex: idx };
          dragHandle.setPointerCapture?.(event.pointerId);
          sequenceItem.classList.add('dragging');
          if (event.cancelable) event.preventDefault();
        });
        dragHandle.addEventListener('pointermove', event => {
          if (!this.commandPointerDrag || this.commandPointerDrag.pointerId !== event.pointerId) return;
          const target = document.elementFromPoint(event.clientX, event.clientY)
            ?.closest?.('.command-sequence-item');
          const targetIndex = Number.parseInt(target?.dataset.commandIndex, 10);
          if (!Number.isInteger(targetIndex)) return;
          this.commandPointerDrag.toIndex = targetIndex;
          document.querySelectorAll('.command-sequence-item').forEach(item => {
            item.classList.toggle('drag-over', item === target);
          });
          if (event.cancelable) event.preventDefault();
        });
        const finishPointerDrag = event => {
          if (!this.commandPointerDrag || this.commandPointerDrag.pointerId !== event.pointerId) return;
          const { fromIndex, toIndex } = this.commandPointerDrag;
          this.commandPointerDrag = null;
          if (dragHandle.hasPointerCapture?.(event.pointerId)) {
            dragHandle.releasePointerCapture(event.pointerId);
          }
          document.querySelectorAll('.command-sequence-item').forEach(item => {
            item.classList.remove('dragging', 'drag-over');
          });
          this.moveCommand(fromIndex, toIndex);
        };
        dragHandle.addEventListener('pointerup', finishPointerDrag);
        dragHandle.addEventListener('pointercancel', finishPointerDrag);
        chip.appendChild(dragHandle);
        sequenceItem.addEventListener('dragover', event => {
          if (!Number.isInteger(this.commandDragIndex)) return;
          event.preventDefault();
          sequenceItem.classList.add('drag-over');
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        });
        sequenceItem.addEventListener('dragleave', () => sequenceItem.classList.remove('drag-over'));
        sequenceItem.addEventListener('drop', event => {
          event.preventDefault();
          const fromIndex = Number.isInteger(this.commandDragIndex)
            ? this.commandDragIndex
            : Number.parseInt(event.dataTransfer?.getData('text/plain'), 10);
          this.commandDragIndex = null;
          this.moveCommand(fromIndex, idx);
        });
      }

      if (isCommandBlockCall(cmd)) {
        chip.classList.add('command-block-call-chip', `block-${cmd.blockId.toLowerCase()}`);
        const commandCore = document.createElement('span');
        commandCore.className = 'command-compact-editor command-block-call-editor';
        const openBracket = document.createElement('span');
        openBracket.className = 'command-bracket';
        openBracket.textContent = '[';
        const blockName = document.createElement('strong');
        blockName.textContent = cmd.blockId;
        const repeatMark = document.createElement('span');
        repeatMark.textContent = '×';
        const repeatInput = document.createElement('input');
        repeatInput.type = 'number';
        repeatInput.className = 'chip-select block-repeat-input';
        repeatInput.min = '1';
        repeatInput.max = '9';
        repeatInput.step = '1';
        repeatInput.value = String(cmd.repeat);
        repeatInput.setAttribute('aria-label', `${idx + 1}번째 명령 블록 ${cmd.blockId} 반복 횟수`);
        repeatInput.addEventListener('change', event => {
          if (this.isExecuting) return;
          const repeat = Math.min(9, Math.max(1, Number.parseInt(event.target.value, 10) || 1));
          event.target.value = String(repeat);
          this.commands[idx].repeat = repeat;
          this.updateCommandBlockWorkspace();
          this.updateStepCounter();
          this.saveEducationProgress({ active: this.isEducationMode() });
        });
        const closeBracket = document.createElement('span');
        closeBracket.className = 'command-bracket';
        closeBracket.textContent = ']';
        commandCore.append(openBracket, blockName, repeatMark, repeatInput, closeBracket);
        chip.appendChild(commandCore);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.title = '삭제';
        delBtn.setAttribute('aria-label', `${idx + 1}번째 명령 블록 호출 삭제`);
        const deleteGlyph = document.createElement('span');
        deleteGlyph.className = 'delete-glyph';
        deleteGlyph.setAttribute('aria-hidden', 'true');
        deleteGlyph.textContent = '×';
        delBtn.appendChild(deleteGlyph);
        delBtn.addEventListener('click', event => {
          event.stopPropagation();
          this.removeCommand(idx);
        });
        chip.appendChild(delBtn);
        sequenceItem.appendChild(chip);
        if (idx < displayedCommands.length - 1) {
          const connector = document.createElement('span');
          connector.className = 'command-sequence-connector';
          connector.setAttribute('aria-hidden', 'true');
          connector.textContent = '→';
          sequenceItem.appendChild(connector);
        }
        fragment.appendChild(sequenceItem);
        return;
      }

      const isPenCmd = cmd.dir === 'PEN_DOWN' || cmd.dir === 'PEN_UP' || cmd.type === 'PEN_DOWN' || cmd.type === 'PEN_UP';
      if (isPenCmd) {
        const isPenDown = (cmd.dir === 'PEN_DOWN' || cmd.type === 'PEN_DOWN');
        chip.classList.add(isPenDown ? 'pen-down' : 'pen-up');
        const commandCore = document.createElement('span');
        commandCore.className = 'command-compact-editor';
        const labelSpan = document.createElement('strong');
        labelSpan.style.padding = '0 4px';
        labelSpan.textContent = isPenDown ? '[🖌️ 붓 누르기]' : '[✋ 붓 떼기]';
        commandCore.appendChild(labelSpan);
        chip.appendChild(commandCore);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.title = '삭제';
        delBtn.setAttribute('aria-label', `${idx + 1}번째 ${isPenDown ? '붓 누르기' : '붓 떼기'} 명령 삭제`);
        const deleteGlyph = document.createElement('span');
        deleteGlyph.className = 'delete-glyph';
        deleteGlyph.setAttribute('aria-hidden', 'true');
        deleteGlyph.textContent = '×';
        delBtn.appendChild(deleteGlyph);
        delBtn.addEventListener('click', event => {
          event.stopPropagation();
          this.removeCommand(idx);
        });
        chip.appendChild(delBtn);
        sequenceItem.appendChild(chip);
        if (idx < displayedCommands.length - 1) {
          const connector = document.createElement('span');
          connector.className = 'command-sequence-connector';
          connector.setAttribute('aria-hidden', 'true');
          connector.textContent = '→';
          sequenceItem.appendChild(connector);
        }
        fragment.appendChild(sequenceItem);
        return;
      }

      if (isChaseMode) {
        const turnLabel = document.createElement('span');
        turnLabel.className = 'command-turn-label';
        turnLabel.textContent = '차례';
        chip.appendChild(turnLabel);
      }

      if (isFixedDrawing) {
        const fixedCommand = document.createElement('span');
        fixedCommand.className = 'command-fixed-label';
        fixedCommand.setAttribute(
          'aria-label',
          `${idx + 1}번째 명령: ${DIRECTIONS[cmd.dir]?.label || cmd.dir} ${cmd.distance}칸`
        );

        fixedCommand.textContent = formatCommandCombination([cmd]);
        chip.appendChild(fixedCommand);
        sequenceItem.appendChild(chip);
        if (idx < displayedCommands.length - 1) {
          const connector = document.createElement('span');
          connector.className = 'command-sequence-connector';
          connector.setAttribute('aria-hidden', 'true');
          connector.textContent = '→';
          sequenceItem.appendChild(connector);
        }
        fragment.appendChild(sequenceItem);
        return;
      }

      const commandCore = document.createElement('span');
      commandCore.className = 'command-compact-editor';
      const openBracket = document.createElement('span');
      openBracket.className = 'command-bracket';
      openBracket.textContent = '[';
      commandCore.appendChild(openBracket);

      if (allowDistanceEditing) {
        const distInput = document.createElement('input');
        distInput.type = 'number';
        distInput.className = 'chip-select chip-dist-select';
        distInput.title = `이동 칸 수 변경 (1~${MAX_COMMAND_DISTANCE}칸)`;
        distInput.setAttribute('aria-label', `${idx + 1}번째 명령의 이동 칸 수`);
        distInput.setAttribute('inputmode', 'numeric');
        distInput.min = '1';
        distInput.max = String(MAX_COMMAND_DISTANCE);
        distInput.step = '1';
        distInput.value = String(cmd.distance);

        distInput.addEventListener('input', (e) => {
          if (this.isExecuting) return;
          const parsedDistance = Number.parseInt(e.target.value, 10);
          if (
            Number.isInteger(parsedDistance) &&
            parsedDistance >= 1 &&
            parsedDistance <= MAX_COMMAND_DISTANCE
          ) {
            const nextCommands = [...this.getActiveCommandBlockList()];
            nextCommands[idx] = { ...nextCommands[idx], distance: parsedDistance };
            this.setActiveCommandBlockList(nextCommands);
            this.updateCommandBlockWorkspace();
            this.updateStepCounter();
          }
        });

        distInput.addEventListener('change', (e) => {
          if (this.isExecuting) return;
          const parsedDistance = Number.parseInt(e.target.value, 10);
          const safeDistance = Number.isFinite(parsedDistance)
            ? Math.min(MAX_COMMAND_DISTANCE, Math.max(1, parsedDistance))
            : 1;
          e.target.value = String(safeDistance);
          Audio.playAddCommand();
          const nextCommands = [...this.getActiveCommandBlockList()];
          nextCommands[idx] = { ...nextCommands[idx], distance: safeDistance };
          this.setActiveCommandBlockList(nextCommands);
          this.updateCommandBlockWorkspace();
          this.updateStepCounter();
        });
        commandCore.appendChild(distInput);
      } else {
        const fixedDistance = document.createElement('span');
        fixedDistance.className = 'command-fixed-distance';
        fixedDistance.textContent = String(cmd.distance || 1);
        commandCore.appendChild(fixedDistance);
      }

      const dirSelect = document.createElement('select');
      dirSelect.className = 'chip-select chip-dir-select';
      dirSelect.title = '이동 방향 변경';
      dirSelect.setAttribute('aria-label', `${idx + 1}번째 명령의 이동 방향`);

      for (const dirKey of allowedDirectionKeys) {
        const opt = document.createElement('option');
        opt.value = dirKey;
        opt.textContent = DIRECTIONS[dirKey].symbol;
        opt.title = DIRECTIONS[dirKey].label;
        if (dirKey === cmd.dir) opt.selected = true;
        dirSelect.appendChild(opt);
      }

      dirSelect.addEventListener('change', (e) => {
        if (this.isExecuting) return;
        Audio.playAddCommand();
        const nextCommands = [...this.getActiveCommandBlockList()];
        nextCommands[idx] = { ...nextCommands[idx], dir: e.target.value };
        this.setActiveCommandBlockList(this.normalizeEditedCommandQueue(
          nextCommands,
          { mergeAdjacent: educationPolicy?.mergeAdjacent !== false }
        ));
        this.updateCommandBlockWorkspace();
        this.renderCommandQueue();
        this.updateStepCounter();
      });

      commandCore.appendChild(dirSelect);
      const closeBracket = document.createElement('span');
      closeBracket.className = 'command-bracket';
      closeBracket.textContent = ']';
      commandCore.appendChild(closeBracket);
      chip.appendChild(commandCore);

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.title = '삭제';
      delBtn.setAttribute('aria-label', `${idx + 1}번째 명령 삭제`);
      const deleteGlyph = document.createElement('span');
      deleteGlyph.className = 'delete-glyph';
      deleteGlyph.setAttribute('aria-hidden', 'true');
      deleteGlyph.textContent = '×';
      delBtn.appendChild(deleteGlyph);
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeCommand(idx);
      });

      chip.appendChild(delBtn);
      sequenceItem.appendChild(chip);
      if (idx < displayedCommands.length - 1) {
        const connector = document.createElement('span');
        connector.className = 'command-sequence-connector';
        connector.setAttribute('aria-hidden', 'true');
        connector.textContent = '→';
        sequenceItem.appendChild(connector);
      }
      fragment.appendChild(sequenceItem);
    });

    queueEl.replaceChildren(fragment);
    this.updateFixedDrawingProgressUI();
    this.updateEfficiencyStats();
    this.updatePenStateUI();
    this.updateDrawingGhostTrail();
    this.updateDrawingLiveStepCounter();
    requestAnimationFrame(() => {
      queueEl.scrollTop = scrollToEnd
        ? queueEl.scrollHeight
        : Math.min(previousScrollTop, queueEl.scrollHeight);
    });
    this.updateDrawingReferenceCommandButtons();
  }

  updateStepCounter() {
    if (this.isPatternEducationActive()) {
      const availableBlocks = this.currentLevel?.patternPolicy?.availableBlocks || 1;
      const analysis = expandCommandBlockProgram({
        main: this.commands,
        definitions: this.commandBlockDefinitions,
        availableBlocks
      });
      if (typeof document === 'undefined') return;
      const counter = document.getElementById('step-counter');
      if (counter) {
        counter.textContent = `전체 코드 ${analysis.authoredCodeSize}개 · 실행 이동 ${analysis.expandedStepCount}칸 · 목표 최소 ${this.currentLevel?.minimumCodeSize ?? '?'}개`;
      }
      this.updateCommandBlockWorkspace();
      return;
    }
    const commands = Array.isArray(this.commands) ? this.commands : [];
    const safeCommands = commands.filter(command => command && typeof command === 'object');
    // PEN_UP/PEN_DOWN는 큐의 명령이지만 모눈에서 움직인 칸은 아니다. distance가
    // 없는 펜 명령도 안전하게 처리하고, 실행 엔진과 같은 1칸 전개 기준을 쓴다.
    const totalDist = CommandEngine.expandToStepList(safeCommands)
      .reduce((total, step) => total + (DIRECTIONS[step] ? 1 : 0), 0);
    const educationPolicy = this.getActiveEducationToolPolicy();
    const commandCount = educationPolicy?.mergeAdjacent === false
      ? commands.length
      : compressAdjacentCommands(safeCommands).length;
    if (typeof document === 'undefined') return;
    const counter = document.getElementById('step-counter');
    const level = this.currentLevel || {};
    const isDrawing = (
      ['debug', 'debug_guide', 'single_stroke'].includes(this.currentMode) ||
      level.puzzleType === 'draw' ||
      level.playerType === 'brush'
    );
    if (isDrawing && Array.isArray(level.targetLines)) {
      const isDrawingEducation = this.isDrawingEducationMode();
      const isMinimumCommandLesson = (
        isDrawingEducation &&
        this.selectedEducationLesson === 'draw_minimum_commands'
      );
      if (isMinimumCommandLesson) {
        const metrics = this.getDrawingEducationCommandMetrics(commands, level);
        counter.textContent = Number.isFinite(metrics.minimumCommandCount)
          ? `내 명령 ${metrics.commandCount}개 · 최소 ${metrics.minimumCommandCount}개 · 실제 붓 이동 ${metrics.physicalDistance}칸`
          : `내 명령 ${metrics.commandCount}개 · 실제 붓 이동 ${metrics.physicalDistance}칸`;
        this.updateEfficiencyStats();
        return;
      }
      if (this.isFixedCommandDrawingMode()) {
        const progress = this.getFixedDrawingProgress();
        if (progress.isComplete) {
          counter.textContent = `명령 ${progress.commands.length}/${progress.commands.length}개 완료 · 그림을 제출해 확인하세요`;
        } else if (progress.hasMismatch) {
          counter.textContent = `내 동작 ${progress.actualActionCount}회 · 제출하면 제시 명령과 비교합니다`;
        } else {
          const command = progress.commands[progress.currentCommandIndex];
          const substepText = progress.nextAction?.type === 'move'
            ? ` · ${progress.nextAction.substepIndex}/${progress.nextAction.commandDistance}칸 수행`
            : '';
          counter.textContent = `명령 ${progress.completedCommandCount}/${progress.commands.length}개 · 현재 ${formatCommandCombination([command])}${substepText}`;
        }
        this.updateFixedDrawingProgressUI();
        this.updateEfficiencyStats();
        return;
      }
      const drawingDistance = this.isStudentDrawMode()
        ? this.getStudentDrawingMovementDistance()
        : totalDist;
      if (isDrawingEducation) {
        counter.textContent = this.selectedEducationLesson === 'draw_sequence'
          ? `제시 명령 ${commands.length}/${level.referenceCommands?.length || '?'}개 · 실제 붓 이동 ${drawingDistance}칸`
          : `현재 명령 ${commandCount}개 · 실제 붓 이동 ${drawingDistance}칸`;
        this.updateEfficiencyStats();
        return;
      }
      const minimumDistance = Number.isFinite(level.minimumDrawingDistance)
        ? level.minimumDrawingDistance
        : CommandEngine.getMinimumDrawingDistance(level.starPos, level.targetLines);
      counter.textContent = this.requireMinimumDrawing && Number.isFinite(minimumDistance)
        ? `내 붓 이동: ${drawingDistance}칸 · 최소 ${minimumDistance}칸`
        : `내 붓 이동: ${drawingDistance}칸`;
    } else {
      if (this.currentMode === 'efficiency') {
        counter.textContent = `내 이동: ${totalDist}칸 · 명령 ${commandCount}개`;
      } else if (['shortest', 'routing'].includes(this.currentMode)) {
        const activeRule = getActiveMissileSolutionRule(
          this.challengeType,
          this.missileSolutionRule
        );
        counter.textContent = activeRule === 'minimum_commands'
          ? `명령 ${commandCount}개 · 이동 ${totalDist}칸 · 최소 ${level.minimumCommandCount ?? '?'}개`
          : `이동 ${totalDist}칸 · 명령 ${commandCount}개`;
      } else {
        counter.textContent = `이동 횟수: ${totalDist}칸`;
      }
    }
    this.updateEfficiencyStats();
  }

  waitForCanvasView(execId) {
    const target = this.canvas.closest('.canvas-wrapper') || this.canvas;
    if (!target || typeof target.scrollIntoView !== 'function') {
      return Promise.resolve(this.executionId === execId);
    }

    return new Promise(resolve => {
      let finished = false;
      let settleTimer = null;
      let maximumTimer = null;

      const cleanup = () => {
        window.removeEventListener('scroll', scheduleFinish);
        clearTimeout(settleTimer);
        clearTimeout(maximumTimer);
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        cleanup();

        const resolveAfterPaint = () => {
          requestAnimationFrame(() => {
            resolve(this.executionId === execId);
          });
        };
        requestAnimationFrame(resolveAfterPaint);
      };

      const scheduleFinish = () => {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(finish, 160);
      };

      window.addEventListener('scroll', scheduleFinish, { passive: true });
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      scheduleFinish();
      maximumTimer = setTimeout(finish, 1500);
    });
  }

  async runSimulation() {
    if (this.isExecuting || this.commands.length === 0 || this.isFixedCommandDrawingMode()) return;

    let patternProgramAnalysis = null;
    if (this.isPatternEducationActive()) {
      patternProgramAnalysis = expandCommandBlockProgram({
        main: this.commands,
        definitions: this.commandBlockDefinitions,
        availableBlocks: this.currentLevel?.patternPolicy?.availableBlocks || 1
      });
      const usage = assessCommandBlockUsage(
        patternProgramAnalysis,
        this.currentLevel?.patternPolicy || {}
      );
      if (!patternProgramAnalysis.isValid || !usage.hasEnoughRepeatedBlocks) {
        Audio.playError();
        let message = `명령 블록을 메인에서 적어도 ${usage.minimumInvocations}번 반복해서 사용해 주세요.`;
        if (patternProgramAnalysis.errors.includes('unused_definition')) {
          message = '만들어 둔 명령 블록은 메인에서 모두 사용해 주세요.';
        } else if (patternProgramAnalysis.errors.some(error => error.endsWith('_definition_empty'))) {
          message = '메인에서 호출한 명령 블록의 내용을 먼저 만들어 주세요.';
        } else if (patternProgramAnalysis.errors.some(error => error.endsWith('_definition_too_long'))) {
          message = `명령 블록 정의는 ${MAX_PATTERN_DEFINITION_COMMANDS}개 이내로 줄여 주세요.`;
        } else if (patternProgramAnalysis.errors.includes('main_too_long')) {
          message = `메인 실행은 ${MAX_PATTERN_MAIN_BLOCKS}개 이내로 줄여 주세요.`;
        }
        this.setStatus(`🧱 ${message}`, 'error');
        return;
      }
      this.commandBlockEditTarget = 'main';
      this.updateCommandBlockWorkspace();
      this.updateCreatorInterface();
      this.renderCommandQueue();
    }

    const execId = ++this.executionId;
    this.isExecuting = true;
    this.pauseChallengeTimer('simulation');
    this.setStatus('👀 모눈종이 화면으로 이동한 뒤 명령을 실행합니다.', 'info');

    try {
      const canvasIsReady = await this.waitForCanvasView(execId);
      if (!canvasIsReady) return;
      this.setStatus('▶️ 화면 이동 완료. 명령을 순서대로 실행합니다.', 'info');

      this.renderer.clearDrawnLines();
      this.renderer.setVisitedCheckpointCount?.(0);
      this.renderer.setVisitedFuelCount?.(0);
      const currentLevel = (this.currentMode === 'custom' && this.customPuzzleData)
        ? this.customPuzzleData
        : (this.currentLevel || (Array.isArray(PRESET_LEVELS[this.currentMode]?.[this.levelIndex]) ? PRESET_LEVELS[this.currentMode][this.levelIndex][0] : PRESET_LEVELS[this.currentMode]?.[this.levelIndex]));

      if (this.currentMode === 'chase') {
        return await this.runChaseSimulation(currentLevel, execId);
      }

      const isBrushMode = (
        this.isDrawingModeGroup() ||
        currentLevel.puzzleType === 'draw' ||
        currentLevel.playerType === 'brush'
      );
      const obstaclesToPass = isBrushMode ? [] : (currentLevel.obstacles || []);

      this.renderer.setStarPos(currentLevel.starPos.x, currentLevel.starPos.y);

      const commandsToRun = patternProgramAnalysis?.commands || this.commands;
      const result = CommandEngine.simulate(
        currentLevel.starPos,
        commandsToRun,
        currentLevel.gridSize || 7,
        obstaclesToPass,
        isBrushMode && this.usesExplicitPenStartCommand() ? false : true
      );
      result.programAnalysis = patternProgramAnalysis;
      const stepDelay = result.lines.length > 50
        ? 90
        : (result.lines.length > 24 ? 140 : 240);

      // 스텝 바이 스텝 애니메이션
      if (isBrushMode) {
        this.renderer.setPenDown(this.usesExplicitPenStartCommand() ? false : true);
      }

      for (let i = 1; i < result.pathSteps.length; i++) {
        if (this.executionId !== execId) return;

        const step = result.pathSteps[i];
        const prevStep = result.pathSteps[i - 1];
        Audio.playStep();

        if (step.penDown !== undefined) {
          this.renderer.setPenDown(step.penDown);
          this.updatePenControlUI(step.penDown);
          const indicator = document.getElementById('pen-state-indicator');
          if (indicator) {
            if (step.penDown) {
              indicator.className = 'pen-state-indicator pen-down';
              indicator.innerHTML = '<span class="pen-state-icon">✏️</span><span class="pen-state-text">현재 붓 상태: <strong>누름 (선을 그리는 중)</strong></span>';
            } else {
              indicator.className = 'pen-state-indicator pen-up';
              indicator.innerHTML = '<span class="pen-state-icon">✋</span><span class="pen-state-text">현재 붓 상태: <strong>뗌 (선 없이 위치 이동 중)</strong></span>';
            }
          }
        }

        const source = patternProgramAnalysis?.sourceMap?.[step.cmdIdx];
        document.querySelectorAll('.command-chip').forEach((chip, cIdx) => {
          const isActive = cIdx === (source?.mainIndex ?? step.cmdIdx);
          chip.classList.toggle('active-step', isActive);
        });

        if (step.isPenToggle) {
          await new Promise(r => setTimeout(r, stepDelay));
          continue;
        }

        if (isBrushMode && step.penDown !== false && (prevStep.x !== step.x || prevStep.y !== step.y)) {
          this.renderer.addDrawnLine(prevStep.x, prevStep.y, step.x, step.y, this.activeBrushColor || 'rainbow');
        }
        this.renderer.setStarPos(step.x, step.y);

        if (Array.isArray(currentLevel.checkpoints) && currentLevel.checkpoints.length > 0) {
          const partialCheckpoints = assessOrderedFuelStops(
            result.pathSteps.slice(0, i + 2),
            currentLevel.checkpoints
          );
          this.renderer.setVisitedCheckpointCount?.(partialCheckpoints.reachedCount);
        }

        if (Array.isArray(currentLevel.fuelStops) && currentLevel.fuelStops.length > 0) {
          const partialFuel = assessOrderedFuelStops(
            result.pathSteps.slice(0, i + 2),
            currentLevel.fuelStops
          );
          this.renderer.setVisitedFuelCount?.(partialFuel.reachedCount);
        }

        await new Promise(res => setTimeout(res, stepDelay));
        if (this.executionId !== execId) return;
      }

      // 하이라이트 및 서브 배지 해제
      document.querySelectorAll('.command-chip').forEach(c => {
        c.classList.remove('active-step');
        c.querySelector('.chip-substep-badge')?.remove();
      });

      if (this.executionId === execId) {
        // 결과 채점 및 판정
        await this.evaluateResult(result, currentLevel, execId);
      }
    } finally {
      if (this.executionId === execId) {
        this.isExecuting = false;
        this.resumeChallengeTimer('simulation');
      }
    }
  }

  async evaluateDrawingEducationResult(result, level, execId = this.executionId) {
    const lessonId = this.selectedEducationLesson;
    const lesson = this.getActiveEducationLesson();
    const executedCommands = result.programAnalysis?.commands || this.commands;
    const attempt = assessDrawingEducationAttempt(
      level,
      executedCommands,
      result
    );
    const targetCount = attempt.targetCount;
    const commandMetrics = this.getDrawingEducationCommandMetrics(executedCommands, level);
    const physicalDistance = Number.isFinite(attempt.physicalDistance)
      ? attempt.physicalDistance
      : commandMetrics.physicalDistance;
    const attemptedCommandCount = Number.isFinite(attempt.commandCount)
      ? attempt.commandCount
      : commandMetrics.commandCount;
    const minimumCommandCount = Number.isFinite(attempt.minimumCommandCount)
      ? attempt.minimumCommandCount
      : (Number.isFinite(level?.minimumCommandCount)
          ? level.minimumCommandCount
          : commandMetrics.minimumCommandCount);
    let isSuccess = attempt.meetsLessonRule;
    let title = '';
    let description = '';
    let badge = '';
    let isComplete = isSuccess;

    if (lessonId === 'draw_sequence') {
      title = isSuccess ? '① 순서대로 그림 그리기 성공!' : '① 명령 순서를 다시 확인해 보세요';
      description = !attempt.hasRequiredInitialPenDown
        ? '첫 번째 [🖌️ 붓 누르기] 명령을 다시 넣은 뒤, 제시된 이동 명령을 순서대로 이어 보세요.'
        : attempt.hasForbiddenPenControl
        ? '이번 단계에서는 붓을 떼지 않습니다. 제시된 이동 명령을 왼쪽부터 순서대로 실행해 보세요.'
        : (!attempt.isExactMatch
        ? `목표 그림과 비교해 빠진 선 ${attempt.missingCount}칸, 추가된 선 ${attempt.extraCount}칸이 있습니다.`
        : (attempt.reason === 'different_order'
            ? '그림은 같지만 이번 단계에서는 제시된 명령이 실행되는 순서를 그대로 익혀야 합니다.'
            : '제시된 명령을 왼쪽부터 차례대로 실행해 목표 그림을 정확히 완성했습니다.'));
      badge = `내 붓 이동 ${physicalDistance}칸 · 목표 선 ${targetCount}칸`;
    } else if (lessonId === 'draw_methods') {
      const targetSolutionCount = level.drawingTargetSolutionCount || 2;
      // 거리 묶기/나누기와 PEN_UP·PEN_DOWN 토글은 같은 풀이로 본다. 교육
      // 판정기가 제공하는 '목표 선을 처음 덮은 순서'를 사용해, 완성 뒤 단순
      // 왕복을 덧붙인 풀이도 앞선 방법과 같게 처리한다.
      const signatureKey = (
        attempt.figureTraversalSignature ||
        attempt.normalizedRouteSignature ||
        attempt.solutionSignature ||
        attempt.signature
      );
      if (!(this.educationRouteSignatures instanceof Set)) {
        this.educationRouteSignatures = new Set();
      }

      if (signatureKey && this.educationRouteSignatures.has(signatureKey)) {
        isSuccess = false;
        title = '② 전에 찾은 방법과 같아요';
        description = '같은 이동을 묶거나 나누거나, 이미 그린 선을 잠깐 왕복한 것은 같은 방법입니다. 목표선을 처음 그리는 순서가 다른 방법을 찾아보세요.';
        badge = `제출된 풀이 ${this.educationRouteSignatures.size}/${targetSolutionCount}개 완료 · 다른 경로 필요`;
      } else if (!attempt.meetsLessonRule || !signatureKey) {
        isSuccess = false;
        title = '② 같은 그림, 다른 방법을 찾아보세요';
        description = !attempt.hasRequiredInitialPenDown
          ? '첫 번째 [🖌️ 붓 누르기] 명령이 필요합니다. 붓을 누른 뒤 목표 그림을 완성해 보세요.'
          : attempt.hasForbiddenPenControl
          ? '이번 단계에서는 붓 상태를 바꾸지 않습니다. 목표선을 지나는 실제 이동 경로가 다른 방법을 찾아보세요.'
          : (!attempt.isExactMatch
            ? `목표 그림과 비교해 빠진 선 ${attempt.missingCount}칸, 추가된 선 ${attempt.extraCount}칸이 있습니다.`
            : '그림은 맞지만, 이 단계의 조건을 다시 확인해 보세요. 같은 그림을 만드는 실제 이동 경로가 필요합니다.');
        badge = `제출된 풀이 ${this.educationRouteSignatures.size}/${targetSolutionCount}개 완료`;
      } else {
        this.educationRouteSignatures.add(signatureKey);
        if (!Array.isArray(this.educationRouteEntries)) this.educationRouteEntries = [];
        this.educationRouteEntries.push({
          signature: signatureKey,
          display: formatCommandCombination(executedCommands),
          distance: physicalDistance,
          commandCount: commandMetrics.commandCount
        });
        this.saveEducationProgress({ active: true });
        this.renderMultiSolutionList();
        this.renderDrawingEducationTask(level);
        const submittedCount = this.educationRouteSignatures.size;
        isSuccess = true;
        isComplete = submittedCount >= targetSolutionCount;

        if (submittedCount === 1) {
          title = `② 첫 번째 방법 찾기 성공! (1/${targetSolutionCount})`;
          description = '🎉 첫 번째 방법을 찾았습니다. 같은 그림을 완성하지만 실제 이동 순서나 경로가 다른 두 번째 방법을 찾아보세요.';
          badge = `풀이 완성: 1/${targetSolutionCount}개 · 한 번 더 다른 경로로 도전하세요!`;
        } else {
          title = `🎉 같은 그림, 다른 방법 모두 성공! (${submittedCount}/${targetSolutionCount})`;
          description = `✨ 서로 다른 ${targetSolutionCount}가지 경로로 같은 그림을 완성했습니다! 다음 문제로 넘어가거나, 또 다른 방법을 계속 찾아볼 수 있습니다.`;
          badge = `서로 다른 풀이 ${submittedCount}개 완성 · 성공!`;
        }
      }
    } else {
      // 이 단계의 최적화 기준은 실제 이동 칸이 아니라 명령 큐 블록 수다.
      // PEN_UP/PEN_DOWN도 큐에 보이는 명령이므로 반드시 한 개씩 포함한다.
      // 승인 기준은 교육 판정기의 단일 결과를 사용해 화면과 채점이 어긋나지
      // 않도록 한다.
      isSuccess = Boolean(attempt.meetsLessonRule);
      isComplete = isSuccess;
      title = isSuccess ? '③ 최소 명령으로 그림 완성!' : '③ 명령을 더 효율적으로 묶어 보세요';
      description = !attempt.hasRequiredInitialPenDown
        ? '첫 번째 [🖌️ 붓 누르기]도 명령 1개입니다. 이 명령부터 시작해 그림을 완성해 보세요.'
        : !attempt.isExactMatch
        ? `그림부터 정확히 완성해 보세요. 빠진 선 ${attempt.missingCount}칸, 추가된 선 ${attempt.extraCount}칸이 있습니다.`
        : (!Number.isFinite(minimumCommandCount)
          ? '이 문제의 최소 명령 기준을 준비하는 중입니다. 다른 문제를 선택해 다시 시도해 보세요.'
          : (isSuccess
            ? `목표 그림을 완성하면서 명령 큐를 최소 ${minimumCommandCount}개로 만들었습니다. 실제 붓 이동은 ${physicalDistance}칸입니다.`
            : `그림은 완성했습니다. 현재 명령 ${attemptedCommandCount}개를 목표 ${minimumCommandCount}개까지 줄여 보세요. 붓을 떼고 누르는 명령도 각각 한 개로 셉니다.`));
      badge = `내 명령 ${attemptedCommandCount}개 · 목표 최소 ${minimumCommandCount ?? '?'}개 · 실제 붓 이동 ${physicalDistance}칸`;
    }

    if (isSuccess) {
      Audio.playArtisticChime();
      await this.renderer.triggerRainbowCelebration(this.renderer.starPos.x, this.renderer.starPos.y);
      if (this.executionId !== execId) return;
    } else {
      Audio.playError();
    }

    let primaryBtnText = '';
    let onPrimary = null;
    let secondaryBtnText = '';
    let onSecondary = null;

    if (lessonId === 'draw_methods' && isSuccess) {
      const submittedCount = this.educationRouteSignatures.size;
      if (submittedCount === 1) {
        primaryBtnText = '두 번째 풀이 도전하기';
        onPrimary = () => this.resetLevel();
      } else {
        primaryBtnText = this.getEducationAdvanceButtonText();
        onPrimary = () => this.advanceEducationProblem();
        secondaryBtnText = '새 명령 조합 더 만들기';
        onSecondary = () => this.resetLevel();
      }
    } else {
      primaryBtnText = isSuccess && isComplete
        ? this.getEducationAdvanceButtonText()
        : '명령 다시 만들기';
      onPrimary = () => {
        if (isSuccess && isComplete) this.advanceEducationProblem();
        else this.resetLevel();
      };
    }

    this.setStatus(`${isSuccess ? '✅' : '🔎'} ${title}`, isSuccess ? 'success' : 'error');
    this.showResultModal({
      isSuccess,
      icon: isSuccess ? '📚 🎨 ✨' : '📚 🎨 🔎',
      title,
      desc: description,
      badge,
      primaryBtnText,
      onPrimary,
      secondaryBtnText,
      onSecondary
    });
  }

  async evaluateEducationResult(result, level, execId = this.executionId) {
    if (this.isDrawingEducationMode()) {
      await this.evaluateDrawingEducationResult(result, level, execId);
      return;
    }
    const lessonId = this.selectedEducationLesson;
    const routeAssessment = assessMinimumCommandAttempt(
      level,
      result.programAnalysis?.commands || this.commands,
      result
    );
    const reachedGoal = routeAssessment.reachedGoal;
    let isSuccess = false;
    let title = '';
    let description = '';
    let badge = '';

    if (lessonId === 'sequence') {
      const checkpoints = assessOrderedFuelStops(result.pathSteps, level.checkpoints || []);
      const directionVariety = new Set(
        CommandEngine.expandToStepList(this.commands)
      ).size;
      isSuccess = reachedGoal && checkpoints.isComplete && directionVariety >= 2;
      title = isSuccess ? '① 순차구조 성공!' : '① 명령 순서를 다시 살펴보세요';
      description = isSuccess
        ? '1칸 명령이 앞에서부터 차례대로 실행되어 모든 번호 지점을 순서대로 지나 목표점에 도착했습니다.'
        : (!checkpoints.isComplete
          ? `번호 지점을 1번부터 차례대로 지나야 합니다. 현재 ${checkpoints.reachedCount}/${checkpoints.targetCount}곳을 통과했습니다.`
          : (reachedGoal
            ? '목표에는 도착했지만, 서로 다른 방향을 두 가지 이상 차례대로 사용해 보세요.'
            : '각 명령이 끝난 위치에서 다음 명령이 시작됩니다. 번호 순서를 따라 목표점을 다시 찾아보세요.'));
      badge = `번호 지점 ${checkpoints.reachedCount}/${checkpoints.targetCount} · 1칸 명령 ${this.commands.length}개`;
    } else if (lessonId === 'routes') {
      const signature = getRouteSolutionSignature(this.commands);
      const isNew = reachedGoal && signature && !this.educationRouteSignatures.has(signature);
      if (isNew) {
        this.educationRouteSignatures.add(signature);
        this.educationRouteEntries.push({
          signature,
          display: formatCommandCombination(this.commands),
          distance: routeAssessment.traveledDistance,
          commandCount: this.commands.length
        });
        this.saveEducationProgress({ active: true });
      }
      const targetCount = level.educationTargetRouteCount || 2;
      isSuccess = isNew;
      const isComplete = this.educationRouteSignatures.size >= targetCount;
      title = !reachedGoal
        ? '② 목표점에 도착하지 못했어요'
        : (!isNew ? '② 전에 찾은 길과 같아요' : (isComplete ? '② 서로 다른 길을 모두 찾았어요!' : '② 새로운 길을 찾았어요!'));
      description = !reachedGoal
        ? '먼저 목표점에 정확히 도착하는 길을 만들어 보세요.'
        : (!isNew
          ? '명령을 묶은 모양이 아니라 한 칸씩 지나온 방향 순서가 다른 길을 찾아보세요.'
          : (isComplete
            ? '같은 목표점에 도착하지만 중간 과정이 다른 명령 순서를 비교할 수 있습니다.'
            : '미사일을 출발점으로 되돌린 뒤, 중간 경로가 다른 명령 순서를 하나 더 찾아보세요.'));
      badge = `찾은 서로 다른 길 ${this.educationRouteSignatures.size}/${targetCount}`;
      this.renderMultiSolutionList();
      this.showResultModal({
        isSuccess,
        icon: isSuccess ? '🧭 🚀' : '🔁 🧭',
        title,
        desc: description,
        badge,
        primaryBtnText: isComplete
          ? this.getEducationAdvanceButtonText()
          : '다른 길 만들기',
        onPrimary: () => {
          if (isComplete) this.advanceEducationProblem();
          else this.resetLevel();
        }
      });
      if (isSuccess) Audio.playSuccess();
      else Audio.playError();
      this.setStatus(`${isSuccess ? '✅' : '🔎'} ${title}`, isSuccess ? 'success' : 'error');
      return;
    } else if (lessonId === 'compress') {
      const pathComparison = CommandEngine.compareLinePaths(result.lines, level.targetLines || []);
      const optimalCount = level.optimalCommands?.length || 0;
      isSuccess = pathComparison.isExactMatch && routeAssessment.commandCount === optimalCount;
      title = isSuccess ? '③ 같은 방향 명령 묶기 성공!' : '③ 같은 움직임을 더 짧게 나타내 보세요';
      description = !pathComparison.isExactMatch
        ? '주어진 한 칸 명령과 지나온 길이 달라졌습니다. 명령 순서는 바꾸지 말고 이웃한 같은 방향만 묶어 보세요.'
        : `움직임은 같습니다. 현재 ${routeAssessment.commandCount}개 명령을 목표 ${optimalCount}개까지 줄여 보세요.`;
      badge = `현재 ${routeAssessment.commandCount}개 · 목표 ${optimalCount}개`;
    } else if (lessonId === 'shortest') {
      isSuccess = routeAssessment.isShortest;
      title = isSuccess ? '④ 가장 짧은 길 성공!' : '④ 더 짧은 길이 있어요';
      description = reachedGoal
        ? `현재 ${routeAssessment.traveledDistance}칸, 가장 짧은 길은 ${routeAssessment.shortestDistance}칸입니다.`
        : '장애물과 벽을 피하면서 목표점에 정확히 도착해 보세요.';
      badge = `이동 ${routeAssessment.traveledDistance}칸 · 최단 ${routeAssessment.shortestDistance}칸`;
    } else if (lessonId === 'minimum') {
      isSuccess = routeAssessment.isMinimumCommand;
      title = isSuccess ? '⑤ 최소 명령 성공!' : '⑤ 명령을 더 줄일 수 있어요';
      description = reachedGoal
        ? `현재 ${routeAssessment.commandCount}개 명령입니다. 이 문제는 최소 ${routeAssessment.minimumCommandCount}개로 해결할 수 있습니다. 가장 짧은 길만 고집하면 최소 ${level.minimumCommandsOnShortestRoute}개 명령이 필요합니다.`
        : '이동 칸 수보다 방향·거리 명령 블록의 수를 줄이면서 목표점에 도착해 보세요.';
      badge = `내 명령 ${routeAssessment.commandCount}개 · 목표 ${routeAssessment.minimumCommandCount}개 · 최단길 기준 ${level.minimumCommandsOnShortestRoute}개`;
    } else if (isPatternEducationLesson(lessonId)) {
      const program = result.programAnalysis;
      const usage = assessCommandBlockUsage(program, level.patternPolicy || {});
      const fuel = assessOrderedFuelStops(result.pathSteps, level.fuelStops || []);
      const actualStepDirections = CommandEngine.expandToStepList(program?.commands || []);
      const followsTargetRoute = (
        actualStepDirections.length === (level.targetStepDirections || []).length &&
        actualStepDirections.every(
          (direction, index) => direction === level.targetStepDirections[index]
        )
      );
      isSuccess = Boolean(
        reachedGoal &&
        fuel.isComplete &&
        followsTargetRoute &&
        program?.isValid &&
        usage.hasEnoughRepeatedBlocks &&
        program.codeSize === level.minimumCodeSize
      );
      const lessonNumber = lessonId === 'block_one' ? '⑥' : '⑦';
      title = isSuccess
        ? `${lessonNumber} 최소 코드로 명령 블록 사용 성공!`
        : `${lessonNumber} 명령 블록과 실행 순서를 다시 살펴보세요`;
      if (!fuel.isComplete) {
        description = `연료 보급소를 번호 순서대로 모두 지나야 합니다. 현재 ${fuel.reachedCount}/${fuel.targetCount}곳을 보급했습니다.`;
      } else if (!reachedGoal) {
        description = '연료 보급은 마쳤지만 목표점에 정확히 멈추지 못했습니다.';
      } else if (!followsTargetRoute) {
        description = '모든 연료 지점을 지났지만 표시된 순서 사이에서 다른 길로 움직였습니다. 제시된 이동 순서를 정확히 따라가세요.';
      } else if (!usage.hasEnoughRepeatedBlocks) {
        description = '만든 명령 블록을 메인에서 두 번 이상 반복해서 사용해 보세요.';
      } else {
        description = `경로는 정확합니다. 현재 전체 코드 ${program.codeSize}개를 최소 ${level.minimumCodeSize}개까지 줄여 보세요.`;
      }
      badge = `전체 코드 ${program?.codeSize ?? 0}개 · 최소 ${level.minimumCodeSize}개 · 연료 ${fuel.reachedCount}/${fuel.targetCount}`;
    }

    if (isSuccess) {
      Audio.playSuccess();
      await this.renderer.triggerMissileExplosion(level.goalPos.x, level.goalPos.y, () => Audio.playExplosion());
      if (this.executionId !== execId) return;
    } else {
      Audio.playError();
    }
    this.setStatus(`${isSuccess ? '✅' : '🔎'} ${title}`, isSuccess ? 'success' : 'error');
    this.showResultModal({
      isSuccess,
      icon: isSuccess ? '📚 🚀 ✨' : '📚 🔎',
      title,
      desc: description,
      badge,
      primaryBtnText: isSuccess
        ? this.getEducationAdvanceButtonText()
        : '명령 다시 만들기',
      onPrimary: () => {
        if (isSuccess) this.advanceEducationProblem();
      }
    });
  }

  async evaluateResult(result, level, execId = this.executionId) {
    let totalDist = result?.lines?.length || 0;

    if (this.currentMode === 'efficiency') {
      await this.evaluateEfficiencyResult(result, level, execId);
      return;
    }

    const isBrushMode = (
      this.isDrawingModeGroup() ||
      level.puzzleType === 'draw' ||
      level.playerType === 'brush'
    );

    if (result.hitWall) {
      this.onChallengeFailure();
      Audio.playError();
      if (!isBrushMode) {
        await this.renderer.triggerMissileExplosion(result.finalPos.x, result.finalPos.y, () => {
          Audio.playExplosion();
        });
        if (this.executionId !== execId) return;
        this.setStatus('💥 앗! 모눈종이 벽에 부딪혀 미사일이 공중 폭발했습니다!', 'error');
        this.showResultModal({
          isSuccess: false,
          icon: '🧱 💥',
          title: '💥 미사일 벽 충돌 공중 폭발!',
          desc: '목적지에 도착하기도 전에 미사일이 모눈종이 외곽 벽에 부딪혀 콰광! 공중 폭발해 버렸습니다! 😱<br>이동 방향 명령을 다시 점검해 보세요.',
          badge: `이동 기록: ${totalDist}칸 중 충돌`,
          primaryBtnText: '🔄 다시 도전하기',
          onPrimary: () => this.resetLevel()
        });
      } else {
        this.setStatus('🎨 앗! 붓이 모눈종이 경계를 벗어나 그림 그리기가 잠시 멈췄습니다.', 'error');
        this.showResultModal({
          isSuccess: false,
          icon: '🎨 🖌️ 🛑',
          title: '🎨 모눈종이 경계에 닿았어요!',
          desc: '붓(🖌️)이 모눈종이 바깥으로 나가 그림 그리기가 멈췄습니다. 모눈종이 안에서 그림을 완성할 수 있도록 방향 명령을 고쳐 보세요.',
          badge: `그림 그리기 일시 정지`,
          primaryBtnText: '🔄 경로 수정하기',
          onPrimary: () => this.resetLevel()
        });
      }
      return;
    }

    if (result.hitObstacle) {
      this.onChallengeFailure();
      Audio.playError();
      if (!isBrushMode) {
        await this.renderer.triggerMissileExplosion(result.finalPos.x, result.finalPos.y, () => {
          Audio.playExplosion();
        });
        if (this.executionId !== execId) return;
        this.setStatus('💥 장애물과 충돌하여 목적지 도착 전 폭발해버렸어요!', 'error');
        this.showResultModal({
          isSuccess: false,
          icon: '🔴 💥',
          title: '💥 장애물 충돌! 미사일 자폭!',
          desc: '앗! 목적지에 도착하기도 전에 미사일이 장애물(X)과 부딪혀 콰광! 폭발해버렸어요! 🚀💥<br>장애물을 요리조리 우회하는 새로운 경로를 설계해 보세요.',
          badge: `장애물 지점 (${result.finalPos.x + 1}, ${result.finalPos.y + 1}) 충돌`,
          primaryBtnText: '🔄 우회 경로 다시 짜기',
          onPrimary: () => this.resetLevel()
        });
      } else {
        this.setStatus('🎨 앗! 장애물에 닿아 그림 그리기가 잠시 멈췄습니다.', 'error');
        this.showResultModal({
          isSuccess: false,
          icon: '🔴 🎨 🛑',
          title: '🎨 장애물을 만났어요! (그림 그리기 정지)',
          desc: '붓(🖌️)이 장애물과 만나 그림 그리기가 잠시 멈추었습니다. 장애물을 피해서 밑그림을 완성할 수 있도록 명령어를 수정해 보세요.',
          badge: `장애물 지점 우회 필요`,
          primaryBtnText: '🔄 우회 경로 다시 짜기',
          onPrimary: () => this.resetLevel()
        });
      }
      return;
    }

    if (this.isEducationMode()) {
      await this.evaluateEducationResult(result, level, execId);
      return;
    }

    // 🎨 붓 모드 (Mode 3: debug, debug_guide, single_stroke 또는 그림 커스텀) 결과 평가
    if (isBrushMode) {
      const targetLines = level.targetLines || [];

      if (this.currentMode === 'single_stroke') {
        const singleStrokeEval = CommandEngine.assessSingleStrokeDrawing(
          level.starPos,
          result.lines,
          targetLines,
          this.commands
        );
        const isSuccess = singleStrokeEval.isSuccess;
        const randomChallengeTarget = getRandomChallengeTargetCount(
          this.currentMode,
          level.gridSize
        );

        if (isSuccess) {
          const completedRandomChallenge = this.challengeType !== 'stage'
            ? this.onChallengeSuccess()
            : false;

          Audio.playArtisticChime();
          await this.renderer.triggerRainbowCelebration(this.renderer.starPos.x, this.renderer.starPos.y);
          this.setStatus('🎨 ✨ 한붓그리로 완벽 성공!', 'success');
          this.showResultModal({
            isSuccess: true,
            icon: '🎨 🖌️ ✨',
            title: '✨ 한붓그리기 완벽 성공!',
            desc: completedRandomChallenge
              ? `🎉 ${randomChallengeTarget}문제 한붓그리기 도전을 모두 성공하셨습니다!`
              : `붓을 단 한 번도 떼지 않고 한 번의 연속 붓질로 모든 도안을 완성했습니다!`,
            badge: `한붓그리기 성공 · 총 ${singleStrokeEval.targetCount}선`,
            primaryBtnText: completedRandomChallenge
              ? '🏆 무작위 도전 완료'
              : getNextProblemButtonLabel('single_stroke', this.challengeType),
            onPrimary: () => {
              if (completedRandomChallenge) this.exitToTitle();
              else this.nextLevel();
            }
          });
        } else {
          this.onChallengeFailure();
          Audio.playError();
          this.setStatus(`❌ ${singleStrokeEval.reason}`, 'error');
          this.showResultModal({
            isSuccess: false,
            icon: '🎨 ✋ ❌',
            title: '한붓그리기 실패!',
            desc: singleStrokeEval.reason,
            badge: singleStrokeEval.hasPenUpCommand ? '✋ 붓 떼기 사용됨' : '그림 미완성',
            primaryBtnText: '🧩 붓 떼지 않고 다시 도전',
            onPrimary: () => {}
          });
        }
        return;
      }

      const comparison = CommandEngine.assessDrawingAttempt(
        level.starPos,
        result.lines,
        targetLines,
        result.programAnalysis?.commands || this.commands
      );
      const matchedCount = comparison.matchedCount;
      const targetCount = comparison.targetCount;
      const isSuccess = comparison.isExactMatch;
      const drawingOutcome = classifyDrawingOutcome(
        this.requireMinimumDrawing,
        comparison
      );

      if (drawingOutcome === 'retry') {
        this.onChallengeFailure();
        Audio.playError();
        this.setStatus(
          `🖌️ 그림은 완성했습니다! 최소 붓 이동보다 ${comparison.extraDistance}칸 더 그렸습니다.`,
          'error'
        );
        this.showResultModal({
          isSuccess: false,
          icon: '🎨 🖌️ 🔎',
          title: '🖌️ 같은 그림을 더 적은 움직임으로 그려 보세요!',
          desc: `그림의 모든 선은 정확합니다.<br>현재 <b>${comparison.actualDistance}칸</b>에서 되짚는 움직임을 줄여 최소 <b>${comparison.minimumDistance}칸</b>에 도전해 보세요.`,
          badge: `현재 ${comparison.actualDistance}칸 · 최소 ${comparison.minimumDistance}칸 · ${comparison.extraDistance}칸 줄이기`,
          primaryBtnText: '🧩 명령어 줄이기',
          onPrimary: () => {}
        });
        return;
      }

      if (isSuccess) {
        const completedRandomChallenge = this.challengeType !== 'stage'
          ? this.onChallengeSuccess()
          : false;

        Audio.playArtisticChime();
        await this.renderer.triggerRainbowCelebration(this.renderer.starPos.x, this.renderer.starPos.y);
        if (this.executionId !== execId) return;
        if (completedRandomChallenge) {
          this.endChallenge(false);
          return;
        }

        this.setStatus(
          this.requireMinimumDrawing && comparison.isMinimum
            ? `🏆 최소 붓 이동 ${comparison.actualDistance}칸으로 그림 코딩에 성공했습니다! 🎉🎨`
            : '✨ 주어진 그림을 완성하는 코딩에 성공했습니다! 🎉🎨',
          'success'
        );

        this.showResultModal({
          isSuccess: true,
          icon: '🎉 🎨 ✨ 🌈',
          title: '✨ 축하합니다! 그림 완성 성공!',
          desc: this.requireMinimumDrawing && comparison.isMinimum
            ? '목표 그림을 만드는 가능한 가장 적은 붓 이동(최단 동선)으로 완성했습니다! 🏆🎨'
            : '목표 그림의 모든 선을 완성했습니다. 그린 순서·방향·같은 선을 지난 횟수가 달라도 올바른 그림입니다! 🎨',
          badge: this.requireMinimumDrawing && comparison.isMinimum
            ? `🏆 최소 기록 ${comparison.actualDistance}칸 · 목표 선 ${targetCount}칸 완성`
            : `목표 선 ${targetCount}칸을 100% 완성`,
        primaryBtnText: getNextProblemButtonLabel('debug', this.challengeType),
          onPrimary: () => this.loadLevel()
        });
      } else {
        this.onChallengeFailure();
        Audio.playError();
        const drawingDifference = [
          comparison.missingCount > 0 ? `빠진 선 ${comparison.missingCount}칸` : '',
          comparison.extraCount > 0 ? `추가된 선 ${comparison.extraCount}칸` : ''
        ].filter(Boolean).join(' · ');
        this.setStatus(`🎨 조립한 명령의 그림을 조금 더 확인해 보세요. ${drawingDifference}`, 'error');

        this.showResultModal({
          isSuccess: false,
          icon: '🎨 🧐 🧩',
          title: '🎨 목표 그림의 선을 다시 점검해 보세요!',
          desc: `목표 선 ${targetCount}칸 중 <b>${matchedCount}칸</b>이 같은 위치에 있습니다.<br>그리는 순서·방향·겹쳐 그은 횟수는 채점하지 않으니 빠진 선이나 새로 추가된 선만 확인해 보세요!`,
          badge: `${drawingDifference || '그림 선 구성을 확인해 주세요'}`,
          primaryBtnText: '🧩 명령어 수정하기',
          onPrimary: () => {}
        });
      }
      return;
    }

    // 도달, 최단 이동, 최소 명령 기준을 서로 독립적으로 판정
    const routeAssessment = assessMinimumCommandAttempt(level, this.commands, result);
    const reachedGoal = routeAssessment.reachedGoal;
    const supportsMissileRule = ['shortest', 'routing'].includes(this.currentMode);
    const activeMissileRule = getActiveMissileSolutionRule(
      this.challengeType,
      this.missileSolutionRule
    );
    const routeOutcome = classifyMissileOutcome(
      this.currentMode,
      activeMissileRule,
      routeAssessment
    );

    if (reachedGoal && !isBrushMode) {
      const {
        traveledDistance,
        shortestDistance: minOptimal,
        isShortest,
        extraDistance,
        commandCount,
        minimumCommandCount,
        isMinimumCommand,
        extraCommands
      } = routeAssessment;

      if (routeOutcome === 'retry') {
        this.onChallengeFailure();
        Audio.playError();
        if (activeMissileRule === 'minimum_commands') {
          this.setStatus(
            `🧩 목표점에는 도착했지만 최소 명령보다 ${extraCommands}개 더 사용했습니다.`,
            'error'
          );
          this.showResultModal({
            isSuccess: false,
            icon: '🧩 🚀 🔎',
            title: '🧩 더 적은 명령으로 도착할 수 있어요!',
            desc: `안전하게 목표점에는 도착했습니다. 하지만 이 문제는 최소 <b>${minimumCommandCount}개 명령</b>으로 해결할 수 있습니다.<br>현재 ${commandCount}개 명령의 방향과 이동 칸 수를 다시 묶어 보세요.`,
            badge: `현재 ${commandCount}개 · 최소 ${minimumCommandCount}개 · ${extraCommands}개 줄이기`,
            primaryBtnText: '🧩 명령 다시 설계하기',
            onPrimary: () => {}
          });
        } else {
          this.setStatus(
            `🎯 목표점에는 도착했지만 최단 안전 경로보다 ${extraDistance}칸 더 이동했습니다.`,
            'error'
          );
          this.showResultModal({
            isSuccess: false,
            icon: '🎯 🧭 🔎',
            title: this.currentMode === 'routing'
              ? '🧱 더 짧은 장애물 우회 경로가 있어요!'
              : '🎯 더 짧은 이동 경로가 있어요!',
            desc: this.currentMode === 'routing'
              ? `장애물을 피해서 목표점에는 도착했습니다. 하지만 실제 최단 안전 경로는 <b>${minOptimal}칸</b>입니다.<br>현재 경로의 ${traveledDistance}칸 중 불필요한 이동 ${extraDistance}칸을 줄여 보세요.`
              : `목표점에는 도착했습니다. 하지만 실제 최단 경로는 <b>${minOptimal}칸</b>입니다.<br>현재 경로의 ${traveledDistance}칸 중 불필요한 이동 ${extraDistance}칸을 줄여 보세요.`,
            badge: `현재 ${traveledDistance}칸 · 최단 ${minOptimal}칸 · ${extraDistance}칸 줄이기`,
            primaryBtnText: '🧩 경로 다시 설계하기',
            onPrimary: () => {}
          });
        }
        return;
      }

      if (this.challengeType === 'multisolution') {
        const multiSolutionResult = this.recordMultiSolutionAttempt(
          this.commands,
          routeAssessment
        );
        if (!multiSolutionResult.accepted) {
          Audio.playError();
          this.setStatus(
            `🔁 ${multiSolutionResult.previousNumber ? `풀이 ${multiSolutionResult.previousNumber}과` : '전에 찾은 풀이와'} 똑같습니다. 방향 순서가 다른 최단 명령 조합을 만들어 보세요. (${multiSolutionResult.count}/${this.multiSolutionGoalCount})`,
            'info'
          );
          this.showResultModal({
            isSuccess: false,
            icon: '🔁 🧭',
            title: multiSolutionResult.previousNumber
              ? `전에 했던 풀이 ${multiSolutionResult.previousNumber}과 똑같아요`
              : '전에 했던 풀이와 똑같아요',
            desc: '명령어를 묶는 방법만 다르게 입력한 것은 같은 풀이입니다.<br>한 칸씩 이동하는 <b>방향 순서</b>가 다른 최단 명령 조합을 다시 만들어 보세요.',
            badge: `찾은 최단 풀이 ${multiSolutionResult.count}개 / 목표 ${this.multiSolutionGoalCount}개`,
            primaryBtnText: '🧩 다른 최단 경로 만들기',
            onPrimary: () => this.resetLevel()
          });
          return;
        }

        this.onChallengeSuccess();
        await this.renderer.triggerMissileExplosion(level.goalPos.x, level.goalPos.y, () => {
          Audio.playExplosion();
        });
        if (this.executionId !== execId) return;
        Audio.playSuccess();

        const {
          count,
          targetCount,
          answerCount,
          isComplete,
          justCompleted
        } = multiSolutionResult;
        this.setStatus(
          justCompleted
            ? `🏆 서로 다른 최단 풀이 ${targetCount}개 찾기 목표를 달성했어요!`
            : (isComplete
                ? `🧭 목표 뒤에도 새로운 최단 풀이를 더 찾았어요. (${count}개)`
                : `🧭 ${count}번째 최단 풀이를 찾았습니다. 같은 문제에서 다른 방향 순서를 만들어 보세요. (${count}/${targetCount})`),
          'success'
        );
        this.showResultModal({
          isSuccess: true,
          icon: justCompleted ? '🏆 🧭 🎯' : '🧭 🚀 ✨',
          title: justCompleted
            ? `서로 다른 최단 풀이 ${targetCount}개를 찾았어요!`
            : `${count}번째 최단 풀이 발견!`,
          desc: justCompleted
            ? `이 문제에는 가능한 최단 방향 순서가 모두 <b>${answerCount}개</b> 있습니다.<br>목표 ${targetCount}개를 달성했으며, 계속 더 찾아도 모든 유효한 최단 풀이를 인정합니다.`
            : `이 경로는 새로운 최단 풀이입니다.<br>미사일을 출발점으로 되돌리고, 아직 쓰지 않은 다른 최단 방향 순서를 찾아보세요.`,
          badge: `찾은 최단 풀이 ${count}개 / 목표 ${targetCount}개`,
          primaryBtnText: '➕ 다른 풀이 계속 찾기',
          onPrimary: () => {
            this.resetLevel();
          },
          secondaryBtnText: justCompleted ? '🔀 새 문제 도전하기' : undefined,
          onSecondary: justCompleted ? () => this.loadLevel() : undefined
        });
        return;
      }

      const completedRandomChallenge = this.challengeType !== 'stage'
        ? this.onChallengeSuccess()
        : false;

      await this.renderer.triggerMissileExplosion(level.goalPos.x, level.goalPos.y, () => {
        Audio.playExplosion();
      });
      if (this.executionId !== execId) return;

      Audio.playSuccess();
      if (completedRandomChallenge) {
        this.endChallenge(false);
        return;
      }

      if (supportsMissileRule && activeMissileRule === 'minimum_commands') {
        const isObstacleRoute = this.currentMode === 'routing';
        this.setStatus(
          `🧩 최소 ${commandCount}개 명령으로 목표점에 안전하게 도착했습니다!`,
          'success'
        );
        this.showResultModal({
          isSuccess: true,
          icon: isObstacleRoute ? '🧩 🧱 🚀 🎯' : '🧩 🚀 🎯',
          title: isObstacleRoute
            ? '🧩 최소 명령으로 장애물 통과 성공!'
            : '🧩 최소 명령 미사일 이동 성공!',
          desc: isObstacleRoute
            ? `장애물을 안전하게 피하면서 가능한 가장 적은 <b>${minimumCommandCount}개 명령</b>으로 목표점에 도착했습니다.`
            : `이동 칸 수와 관계없이 가능한 가장 적은 <b>${minimumCommandCount}개 명령</b>으로 목표점에 도착했습니다.`,
          badge: `최소 명령 ${commandCount}개 · 실제 이동 ${traveledDistance}칸`,
          primaryBtnText: getNextProblemButtonLabel(this.currentMode, this.challengeType),
          onPrimary: () => this.loadLevel()
        });
      } else if (supportsMissileRule && isShortest) {
        const isObstacleRoute = this.currentMode === 'routing';
        this.setStatus(
          isObstacleRoute
            ? `🧱 장애물을 피해 최단 안전 경로 ${traveledDistance}칸으로 도착했습니다! 🏆`
            : `🚀 미사일이 최단 횟수(${traveledDistance}칸)로 목표점에 도착했습니다! 🏆`,
          'success'
        );
        this.showResultModal({
          isSuccess: true,
          icon: isObstacleRoute ? '🧱 🚀 🎯 🏆' : '🚀 🎯 🏆',
          title: isObstacleRoute
            ? '🧱 최단 안전 경로로 장애물 통과 성공!'
            : '🎯 최단 경로 미사일 이동 성공!',
          desc: isObstacleRoute
            ? '모든 장애물을 피하면서 가능한 가장 짧은 경로로 목표점에 정확히 도착했습니다! 🎉'
            : '축하합니다! 완벽한 알고리즘 순서로 미사일이 목표점을 정확히 맞혔습니다! 🎉',
          badge: `🏆 최단 기록 달성: ${traveledDistance}칸 (최소 ${minOptimal}칸)`,
          primaryBtnText: getNextProblemButtonLabel(this.currentMode, this.challengeType),
          onPrimary: () => this.loadLevel()
        });
      } else {
        this.setStatus('🚀 정답입니다! 여러 정답 길 중 하나로 🎯 목표점에 안전하게 도착했습니다! 🎉', 'success');
        this.showResultModal({
          isSuccess: true,
          icon: '🎉 🚀 🎯 ✨',
          title: '🎯 정답입니다! 멋진 경로로 도착 성공!',
          desc: '여러 가지 가능한 정답 길 중 하나를 성공적으로 잘 찾아냈습니다! 🎉<br>미사일 코딩에는 다양한 정답 경로가 존재합니다. 원한다면 더 짧은 최단 경로에도 도전해 보세요!',
          badge: `훌륭한 성공! · 이동 ${traveledDistance}칸 · 명령 ${commandCount}개`,
          primaryBtnText: getNextProblemButtonLabel(this.currentMode, this.challengeType),
          onPrimary: () => this.loadLevel()
        });
      }
    } else if (level.goalPos && !isBrushMode) {
      this.onChallengeFailure();
      const passedGoalIndex = result.pathSteps.findIndex(
        (step, idx) => idx < result.pathSteps.length - 1 && step.x === level.goalPos.x && step.y === level.goalPos.y
      );

      Audio.playError();
      await this.renderer.triggerMissileExplosion(result.finalPos.x, result.finalPos.y, () => {
        Audio.playExplosion();
      });
      if (this.executionId !== execId) return;

      if (passedGoalIndex >= 0) {
        const extraSteps = (result.pathSteps.length - 1) - passedGoalIndex;
        this.setStatus(`🎯 앗! 목표지점(🎯)을 멈추지 않고 ${extraSteps}칸 그냥 지나쳐버렸습니다!`, 'error');

        this.showResultModal({
          isSuccess: false,
          icon: '🎯 💨 🛑',
          title: '🎯 앗! 목표지점을 그냥 지나쳐버렸어요!',
          desc: `이동 중에 목표지점(🎯)을 정확히 지나갔지만, 정지하지 않고 <b>${extraSteps}칸을 더 지나쳐버렸습니다!</b> 🚀💨<br>목표칸에 딱 멈출 수 있도록 명령어의 <b>이동 거리(칸 수)를 알맞게 줄여보세요!</b>`,
          badge: `목표지점 통과 후 +${extraSteps}칸 지나침`,
          primaryBtnText: '🧩 이동 칸 수 줄이기',
          onPrimary: () => {}
        });
      } else {
        this.setStatus('💥 미사일이 목적지에 도착하기도 전에 폭발해버렸어요!', 'error');

        this.showResultModal({
          isSuccess: false,
          icon: '⛽ 💥',
          title: '💥 목적지 도달 전 미사일 폭발!',
          desc: '연료가 부족하거나 명령어가 모자라 미사일이 목표점(🎯)에 도달하기 전에 중간에서 폭발해버렸어요! 🚀💥<br>방향 명령어를 조금 더 추가해 보세요.',
          badge: `이동 횟수: ${totalDist}칸 (목적지 미달)`,
          primaryBtnText: '🧩 명령어 더 추가하기',
          onPrimary: () => {}
        });
      }
    } else {
      // 🎨 무지개 그림 그리기 모드 전용 완성 연출 (폭발 및 자폭 소리 일절 없음!)
      Audio.playArtisticChime();
      await this.renderer.triggerRainbowCelebration(result.finalPos.x, result.finalPos.y);
      if (this.executionId !== execId) return;

      const levelList = PRESET_LEVELS[this.currentMode] || [];
      const hasNextLevel = this.levelIndex < levelList.length - 1;

      this.setStatus('✨ 짠! 붓 선으로 나만의 그림 작품이 완성되었습니다! 🎨', 'success');
      this.showResultModal({
        isSuccess: true,
        icon: '🎨 🖌️ ✨',
        title: '✨ 그림 작품 완성!',
        desc: '아름다운 붓터치로 그림 작품이 멋지게 완성되었습니다! 🖌️✨',
        badge: `총 붓터치 거리: ${totalDist}칸 그림 완성`,
        primaryBtnText: hasNextLevel ? '다음 그림 작품 그리기 ➡️' : '🔗 친구에게 그림 문제 공유하기',
        onPrimary: () => {
          if (hasNextLevel) {
            this.levelIndex++;
            this.loadLevel();
          } else {
            this.openShareModal();
          }
        }
      });
    }
  }

  async evaluateEfficiencyResult(result, level, execId = this.executionId) {
    const sourceCommands = level.sourceCommands || [];
    const optimalCommands = level.optimalCommands || compressAdjacentCommands(sourceCommands);
    const comparison = CommandEngine.compareLinePaths(result.lines, level.targetLines || []);
    const hasSameEfficientCommands = (
      this.commands.length === optimalCommands.length &&
      this.commands.every((command, index) => (
        command.dir === optimalCommands[index].dir &&
        command.distance === optimalCommands[index].distance
      ))
    );
    const isSuccess = (
      !result.hitWall &&
      !result.hitObstacle &&
      comparison.isExactMatch &&
      hasSameEfficientCommands
    );

    if (isSuccess) {
      const completedRandomChallenge = this.challengeType !== 'stage'
        ? this.onChallengeSuccess()
        : false;

      Audio.playSuccess();
      await this.renderer.triggerRainbowCelebration(result.finalPos.x, result.finalPos.y);
      if (this.executionId !== execId) return;
      if (completedRandomChallenge) {
        this.endChallenge(false);
        return;
      }

      this.setStatus(
        `✅ 이동 경로는 그대로이고, 명령을 ${sourceCommands.length}개에서 ${optimalCommands.length}개로 줄였습니다!`,
        'success'
      );

      this.showResultModal({
        isSuccess: true,
        icon: '🧠 ✨ ✅',
        title: '명령을 효율적으로 나타냈어요!',
        desc: `주어진 긴 명령과 <b>이동 순서와 경로가 모두 같습니다.</b><br>명령 ${sourceCommands.length}개를 ${optimalCommands.length}개로 정확하게 묶었습니다.`,
        badge: `${sourceCommands.length}개 → ${optimalCommands.length}개 명령`,
        primaryBtnText: getNextProblemButtonLabel('efficiency', this.challengeType),
        onPrimary: () => this.loadLevel()
      });
      return;
    }

    this.onChallengeFailure();
    Audio.playError();

    let statusMessage;
    let resultDescription;
    let resultBadge;

    if (result.hitWall) {
      statusMessage = '🧱 명령이 모눈종이 밖으로 나갔습니다. 이동 칸 수를 다시 확인해 보세요.';
      resultDescription = '주어진 긴 명령은 모눈종이 안에서 움직입니다. 방향과 이동 칸 수를 다시 확인해 주세요.';
      resultBadge = '모눈종이 경계 벗어남';
    } else if (comparison.isExactMatch && !hasSameEfficientCommands) {
      statusMessage = `💡 이동 경로는 같습니다! 명령 ${this.commands.length}개를 ${optimalCommands.length}개까지 더 줄여 보세요.`;
      resultDescription = `지나간 경로는 정확합니다. 서로 이웃한 같은 방향을 찾아 <b>${optimalCommands.length}개 명령</b>으로 더 짧게 나타내 보세요.`;
      resultBadge = `현재 ${this.commands.length}개 · 목표 ${optimalCommands.length}개`;
    } else {
      statusMessage = '🔎 방향이나 이동 순서가 주어진 긴 명령과 다릅니다. 처음부터 차례대로 비교해 보세요.';
      resultDescription = `목표 이동 ${comparison.targetCount}칸 중 <b>${comparison.matchedCount}칸</b>이 같은 순서로 일치합니다. 도착점뿐 아니라 지나가는 경로도 같아야 합니다.`;
      resultBadge = `경로 일치 ${comparison.matchedCount} / ${comparison.targetCount}칸`;
    }

    this.setStatus(statusMessage, 'error');
    this.showResultModal({
      isSuccess: false,
      icon: '🧠 🔎 ✍️',
      title: '명령을 다시 묶어 볼까요?',
      desc: resultDescription,
      badge: resultBadge,
      primaryBtnText: '🧩 내 명령 고치기',
      onPrimary: () => {}
    });
  }

  async runChaseSimulation(currentLevel, execId) {
    if (!currentLevel || !currentLevel.starPos || !currentLevel.thiefPos) {
      return;
    }

    const chaseResult = CommandEngine.simulateChase(
      currentLevel.starPos,
      this.commands,
      currentLevel.thiefPos,
      currentLevel.thiefCommands || [],
      currentLevel.gridSize || 7,
      currentLevel.obstacles || [],
      currentLevel.handcuffPos || null
    );

    if (chaseResult.invalidThiefRoute) {
      this.onChallengeFailure();
      Audio.playError();
      this.setStatus('⚠️ 이 문제의 도둑 이동 계획이 장애물 또는 경계와 충돌하여 추격을 시작할 수 없습니다.', 'error');
      this.showResultModal({
        isSuccess: false,
        icon: '⚠️ 🥷 🧱',
        title: '도둑 이동 계획을 점검해야 해요',
        desc: '도둑이 장애물이나 모눈종이 경계로 이동하도록 설정된 잘못된 문제입니다. 다른 문제로 이동해 주세요.',
        badge: `문제 경로 오류: ${chaseResult.thiefRouteError}`,
        primaryBtnText: '다른 문제 보기',
        onPrimary: () => this.loadLevel()
      });
      return;
    }

    let copPos = { ...currentLevel.starPos };
    let thiefPos = { ...currentLevel.thiefPos };

    this.renderer.setStarPos(copPos.x, copPos.y);
    this.renderer.setThiefPos(thiefPos.x, thiefPos.y);

    const thiefSteps = CommandEngine.expandToStepList(currentLevel.thiefCommands || []);
    const copSteps = CommandEngine.expandToStepList(this.commands);

    const maxTurns = thiefSteps.length;
    const turnDelay = maxTurns > 30 ? 100 : (maxTurns > 12 ? 180 : 300);

    let catchLocation = null;
    let actualCatchTurn = 0;
    let hitWall = false;
    let hitObstacle = false;
    let hasHandcuffs = !currentLevel.handcuffPos;

    for (let t = 0; t < maxTurns; t++) {
      if (this.executionId !== execId) return;

      const turnNum = t + 1;

      // 1. 도둑이 1칸 먼저 이동
      if (t < thiefSteps.length) {
        const dirInfo = DIRECTIONS[thiefSteps[t]];
        if (dirInfo) {
          const nx = thiefPos.x + dirInfo.dx;
          const ny = thiefPos.y + dirInfo.dy;
          const isObstacle = (currentLevel.obstacles || []).some(o => o.x === nx && o.y === ny);
          if (nx >= 0 && nx < (currentLevel.gridSize || 7) && ny >= 0 && ny < (currentLevel.gridSize || 7) && !isObstacle) {
            thiefPos = { x: nx, y: ny };
            this.renderer.setThiefPos(thiefPos.x, thiefPos.y);
            Audio.playStep();
          }
        }
      }

      // 도둑 칩 하이라이트
      document.querySelectorAll('.thief-arrow-chip').forEach((chip, idx) => {
        chip.classList.toggle('active-turn', idx === t);
      });

      await new Promise(res => setTimeout(res, turnDelay));
      if (this.executionId !== execId) return;

      // 도둑 이동 직후 체포 판정 (도둑이 경찰 좌표로 자진 진입)
      if (hasHandcuffs && copPos.x === thiefPos.x && copPos.y === thiefPos.y) {
        catchLocation = { x: copPos.x, y: copPos.y };
        actualCatchTurn = turnNum;
        Audio.playSiren();
        break;
      }

      // 2. 경찰이 그 다음 1칸 이동
      if (t < copSteps.length) {
        const dirInfo = DIRECTIONS[copSteps[t]];
        if (dirInfo) {
          const nx = copPos.x + dirInfo.dx;
          const ny = copPos.y + dirInfo.dy;

          if (nx < 0 || nx >= (currentLevel.gridSize || 7) || ny < 0 || ny >= (currentLevel.gridSize || 7)) {
            hitWall = true;
            Audio.playError();
            break;
          }

          const isObstacle = (currentLevel.obstacles || []).some(o => o.x === nx && o.y === ny);
          if (isObstacle) {
            hitObstacle = true;
            Audio.playError();
            break;
          }

          this.renderer.addDrawnLine(copPos.x, copPos.y, nx, ny, '#a855f7');
          copPos = { x: nx, y: ny };
          this.renderer.setStarPos(copPos.x, copPos.y);
          Audio.playStep();
          if (
            !hasHandcuffs &&
            currentLevel.handcuffPos &&
            copPos.x === currentLevel.handcuffPos.x &&
            copPos.y === currentLevel.handcuffPos.y
          ) {
            hasHandcuffs = true;
            this.renderer.setHandcuffPos(null, null);
            this.setStatus('⛓ 수갑을 찾았어요! 이제 도둑과 같은 칸에 도착하면 체포할 수 있어요.', 'success');
          }
        }
      }

      await new Promise(res => setTimeout(res, turnDelay));
      if (this.executionId !== execId) return;

      // 경찰 이동 직후 체포 판정 (경찰이 도둑 좌표로 진입)
      if (hasHandcuffs && copPos.x === thiefPos.x && copPos.y === thiefPos.y) {
        catchLocation = { x: copPos.x, y: copPos.y };
        actualCatchTurn = turnNum;
        Audio.playSiren();
        break;
      }
    }

    if (this.executionId === execId) {
      await this.evaluateChaseResult(
        chaseResult,
        currentLevel,
        catchLocation,
        actualCatchTurn,
        hitWall,
        hitObstacle,
        execId
      );

      document.querySelectorAll('.command-chip').forEach(c => c.classList.remove('active-step'));
      document.querySelectorAll('.thief-arrow-chip').forEach(c => c.classList.remove('active-turn'));
    }
  }

  async evaluateChaseResult(
    result,
    level,
    catchLocation = null,
    actualCatchTurn = 0,
    hitWall = false,
    hitObstacle = false,
    execId = this.executionId
  ) {
    const isCaught = Boolean(catchLocation) || result.caught;
    const arrestX = catchLocation ? catchLocation.x : (result.finalCopPos ? result.finalCopPos.x : level.starPos.x);
    const arrestY = catchLocation ? catchLocation.y : (result.finalCopPos ? result.finalCopPos.y : level.starPos.y);
    const turnCount = actualCatchTurn || result.caughtTurn || (result.turnLog ? result.turnLog.length : 1);

    if (isCaught) {
      const catchOutcome = classifyChaseCatchOutcome(
        turnCount,
        level.earliestCatchTurn
      );
      const completedRandomChallenge = this.challengeType !== 'stage'
        ? this.onChallengeSuccess()
        : false;

      Audio.playPoliceFanfare();
      await this.renderer.triggerPoliceArrestCelebration(arrestX, arrestY);
      if (this.executionId !== execId) return;
      if (completedRandomChallenge) {
        this.endChallenge(false);
        return;
      }

      this.setStatus(
        catchOutcome.isEarliest
          ? `🚨 👮‍♂️ ⚖️ 가장 빠른 체포 성공! ${turnCount}차례 만에 도둑을 검거했습니다. 🏆`
          : `🚨 👮‍♂️ ⚖️ 체포 성공! ${turnCount}차례 만에 도둑을 검거했습니다.`,
        'success'
      );

      this.showResultModal({
        isSuccess: true,
        icon: catchOutcome.isEarliest ? '🚨 👮‍♂️ ⚖️ 🥷 🏆' : '🚨 👮‍♂️ ⚖️ 🥷 🔐',
        title: catchOutcome.isEarliest
          ? '🚨 가장 빠른 체포 성공!'
          : '🚨 도둑 체포 성공!',
        desc: catchOutcome.isEarliest
          ? `도둑의 도주 경로를 예측해 <b>가장 이른 ${turnCount}번째 차례</b>에 체포했습니다! 같은 가장 빠른 차례로 잡는 다른 길도 모두 좋은 풀이입니다.`
          : (catchOutcome.hasEarliestBenchmark
              ? `도둑을 <b>${turnCount}번째 차례</b>에 체포했습니다! 이 문제의 가장 빠른 체포는 ${level.earliestCatchTurn}차례이므로, 다음에는 ${catchOutcome.extraTurns}차례를 더 줄여 보는 도전도 할 수 있어요.`
              : `도둑의 도주 경로를 예측해 <b>${turnCount}번째 차례</b>에 체포했습니다!`),
        badge: catchOutcome.isEarliest
          ? `🏆 가장 빠른 체포 · ${turnCount}차례`
          : `체포 성공 · ${turnCount}차례`,
        primaryBtnText: getNextProblemButtonLabel('chase', this.challengeType),
        onPrimary: () => this.loadLevel()
      });
    } else if (hitObstacle || result.hitObstacle) {
      this.onChallengeFailure();
      Audio.playError();
      this.setStatus('🧱 장애물 충돌! 경찰은 장애물을 통과할 수 없습니다.', 'error');

      this.showResultModal({
        isSuccess: false,
        icon: '👮‍♂️ 🧱 🛑',
        title: '🧱 장애물에 길이 막혔어요!',
        desc: '경찰과 도둑은 장애물이 놓인 교차점을 지나갈 수 없습니다. 장애물을 피해 다른 길목으로 이동해 보세요.',
        badge: '장애물 충돌 (추격 중단)',
        primaryBtnText: '🧩 우회 경로 만들기',
        onPrimary: () => this.resetLevel()
      });
    } else if (hitWall || result.hitWall) {
      this.onChallengeFailure();
      Audio.playError();
      this.setStatus('💥 모눈종이 경계 충돌! 순찰차가 바깥 벽에 부딪혀 추격이 중단되었습니다.', 'error');

      this.showResultModal({
        isSuccess: false,
        icon: '🚨 💥 🛑',
        title: '💥 모눈종이 경계 충돌!',
        desc: '경찰 순찰차가 모눈종이 바깥 벽과 충돌하여 추격이 멈췄습니다! 모눈종이 안에서 길목을 잡도록 이동 명령을 고쳐 보세요.',
        badge: '외곽 경계 충돌 (추격 중단)',
        primaryBtnText: '🔄 경로 수정 재추격',
        onPrimary: () => this.resetLevel()
      });
    } else if (result.missedCaptureWithoutHandcuffs && !result.handcuffsCollected) {
      this.onChallengeFailure();
      Audio.playError();
      this.setStatus('⛓ 도둑을 만났지만 수갑이 없어서 체포하지 못했어요. 수갑부터 찾으세요!', 'error');

      this.showResultModal({
        isSuccess: false,
        icon: '👮‍♂️ ⛓ 🥷',
        title: '수갑이 먼저 필요해요!',
        desc: '경찰이 도둑과 같은 칸에 도착했지만 수갑을 두고 와서 체포하지 못했습니다. <b>수갑 칸을 먼저 지난 뒤</b> 도둑의 길목으로 이동해 보세요.',
        badge: '수갑 미획득 (체포 실패)',
        primaryBtnText: '⛓ 수갑부터 찾기',
        onPrimary: () => this.resetLevel()
      });
    } else {
      this.onChallengeFailure();
      Audio.playError();
      const totalThiefTurns = level.thiefCommands ? CommandEngine.expandToStepList(level.thiefCommands).length : 0;
      this.setStatus('💨 🥷 복면 도둑이 모든 경로를 지나 유유히 탈출해버렸습니다!', 'error');

      this.showResultModal({
        isSuccess: false,
        icon: '🏃‍♂️ 🥷 💨',
        title: '💨 🥷 복면 도둑 도주 성공! (체포 실패)',
        desc: `아쉽습니다! 🥷 복면 도둑이 총 <b>${totalThiefTurns}차례</b>의 도주 경로를 모두 마치는 동안 도둑을 잡지 못해 탈출했습니다! 🥷💨<br>도둑의 차례 경로를 다시 읽고 더 빠른 이동 조종으로 길목을 차단해 보세요!`,
        badge: '복면 도둑 탈출 성공 (체포 실패)',
        primaryBtnText: '🧩 경로 수정 재추격',
        onPrimary: () => this.resetLevel()
      });
    }
  }

  showResultModal({ isSuccess, icon, title, desc, badge, primaryBtnText, onPrimary, secondaryBtnText, onSecondary }) {
    if (this.challengeType === 'timeattack') {
      this.pauseChallengeTimer('result-modal');
    }
    const card = document.getElementById('result-card');
    const iconEl = document.getElementById('result-icon');
    const titleEl = document.getElementById('result-title');
    const descEl = document.getElementById('result-desc');
    const badgeEl = document.getElementById('result-badge');
    const primaryBtn = document.getElementById('result-primary-btn');
    const secondaryBtn = document.getElementById('result-secondary-btn');

    card.className = `modal-card result-modal-card ${isSuccess ? 'success-theme' : 'error-theme'}`;
    iconEl.textContent = icon;
    titleEl.textContent = title;
    descEl.innerHTML = desc;
    badgeEl.textContent = badge;
    primaryBtn.textContent = primaryBtnText;

    const handlePrimary = () => {
      const previousLevel = this.currentLevel;
      this.closeModal('result-modal');
      if (typeof onPrimary === 'function') onPrimary();
      if (this.currentLevel !== previousLevel) {
        this.scrollCurrentProblemIntoView();
      }
    };
    primaryBtn.onclick = handlePrimary;

    if (secondaryBtn) {
      if (secondaryBtnText) {
        secondaryBtn.textContent = secondaryBtnText;
        secondaryBtn.hidden = false;
        secondaryBtn.onclick = () => {
          this.closeModal('result-modal');
          if (typeof onSecondary === 'function') onSecondary();
        };
      } else {
        secondaryBtn.hidden = true;
        secondaryBtn.onclick = null;
      }
    }

    this.openModal('result-modal', 'result-title');
  }

  resetLevel() {
    this.executionId = (this.executionId || 0) + 1;
    this.isExecuting = false;
    this.renderer.cancelEffects?.();
    this.resumeChallengeTimer('simulation');
    const level = this.currentLevel || {};
    const starPos = level.starPos || { x: 1, y: 5 };

    this.studentDrawnLines = [];
    this.studentRedoLines = [];
    this.studentDrawHistory = [];
    this.studentRedoHistory = [];
    this.isPenDown = !this.usesExplicitPenStartCommand();
    this.renderer.clearDrawnLines();
    this.renderer.setPenDown(this.isPenDown);
    this.renderer.starAngle = 0;
    this.renderer.setStarPos(starPos.x, starPos.y);
    this.renderer.setGoalPos(
      level.goalPos ? level.goalPos.x : null,
      level.goalPos ? level.goalPos.y : null
    );
    this.renderer.setObstacles(level.obstacles || []);
    this.renderer.setCheckpoints?.(level.checkpoints || []);
    this.renderer.setVisitedCheckpointCount?.(0);
    this.renderer.setFuelStops?.(level.fuelStops || []);
    this.renderer.setVisitedFuelCount?.(0);
    this.renderer.setHandcuffPos(
      level.handcuffPos ? level.handcuffPos.x : null,
      level.handcuffPos ? level.handcuffPos.y : null
    );

    if (this.currentMode === 'chase' && level.thiefPos) {
      this.renderer.setThiefPos(level.thiefPos.x, level.thiefPos.y);
    } else if (this.currentMode !== 'chase') {
      this.renderer.setThiefPos(null, null);
    }

    if (this.isPatternEducationActive()) {
      this.commandBlockDefinitions = { A: [], B: [] };
      this.commandBlockEditTarget = 'main';
      this.commands = [];
    } else if (this.isFixedCommandDrawingMode()) {
      this.commands = [];
    } else if (level.initialCommands) {
      this.commands = JSON.parse(JSON.stringify(level.initialCommands));
    } else {
      this.commands = this.getDefaultDrawingCommands();
    }

    this.renderCommandQueue();
    this.updateCommandBlockWorkspace();
    this.updateCreatorInterface();
    this.renderThiefPlanPanel(level);
    this.updateStudentHistoryControls();
    this.updateStepCounter();
    this.updatePenStateUI();
    this.saveEducationProgress({ active: this.isEducationMode() });
    document.querySelectorAll('.command-chip.active-step, .thief-arrow-chip.active-turn').forEach(element => {
      element.classList.remove('active-step', 'active-turn');
      element.querySelector('.chip-substep-badge')?.remove();
    });
    const activeMissileRule = getActiveMissileSolutionRule(
      this.challengeType,
      this.missileSolutionRule
    );
    this.setStatus(
      this.isEducationMode()
        ? (level.guide || this.getActiveEducationLesson().description)
        : (['shortest', 'routing'].includes(this.currentMode) &&
      activeMissileRule === 'minimum_commands'
        ? `🧩 안전하게 목표까지 도착하는 명령을 최소 ${level.minimumCommandCount}개로 만들어 보세요. 이동 칸 수는 정답 기준이 아닙니다.`
        : (level.guide || '🧹 처음 상태로 돌아왔습니다. 새로운 명령을 내려보세요.')),
      'info'
    );
  }

  setStatus(msg, type = 'info') {
    const banner = document.getElementById('status-banner');
    banner.className = `status-banner ${type}`;
    const message = document.createElement('span');
    message.textContent = String(msg);
    banner.replaceChildren(message);
  }

  buildCreatorPuzzleData() {
    const size = this.creatorGridSize || 7;

    if (this.creatorType === 'draw') {
      if (this.commands.length === 0) {
        this.setStatus('🎨 공유하거나 인쇄할 그림 명령어를 먼저 하나 이상 입력해 주세요.', 'error');
        return null;
      }

      const startPos = this.renderer.starPos || { x: 1, y: Math.floor(size * 0.7) };
      // 그림 명령 조립 활동과 똑같이, 명시적인 [붓 누르기] 전에는 선을 만들지 않는다.
      const simResult = CommandEngine.simulate(startPos, this.commands, size, [], false);
      if (simResult.hitWall || simResult.lines.length === 0) {
        this.setStatus(
          simResult.hitWall
            ? '🎨 그림 경로가 모눈종이 밖으로 나갑니다. 명령어를 수정해 주세요.'
            : '🎨 [붓 누르기] 뒤에 그릴 이동 명령을 넣어 주세요.',
          'error'
        );
        return null;
      }
      if (simResult.lines.length > 128) {
        this.setStatus('🎨 공유할 그림 경로가 너무 깁니다. 128칸 이내로 줄여 주세요.', 'error');
        return null;
      }

      const levelData = Encoder.validatePuzzleData({
        title: `🎨 친구의 그림 문제 (${size}x${size})`,
        puzzleType: 'draw',
        playerType: 'brush',
        gridSize: size,
        starPos: startPos,
        targetLines: simResult.lines,
        guide: '🖌️ 제시된 무지개 그림 안내를 따라 똑같이 이동 명령을 조립해 보세요!'
      });
      if (!levelData) {
        this.setStatus('🎨 그림 경로를 공유 문제로 만들 수 없습니다. 시작점과 이동 순서를 확인해 주세요.', 'error');
        return null;
      }
      return levelData;
    }

    const levelData = Encoder.validatePuzzleData({
      title: `🚀 친구의 미사일 문제 (${size}x${size})`,
      puzzleType: 'bomb',
      playerType: 'missile',
      gridSize: size,
      starPos: this.renderer.starPos,
      goalPos: this.renderer.goalPos,
      obstacles: this.renderer.obstacles || [],
      guide: '🚀 미사일을 조종하여 장애물(🔴)을 피하고 🎯 목표점에 도착하세요!'
    });

    if (!levelData) {
      this.setStatus('🚀 시작점과 목표점을 서로 다른 유효한 칸에 놓고 장애물 배치를 확인해 주세요.', 'error');
      return null;
    }

    const solution = CommandEngine.findShortestPath(
      levelData.starPos,
      levelData.goalPos,
      levelData.gridSize,
      levelData.obstacles
    );
    if (solution.length === 0) {
      this.setStatus('🚧 현재 장애물 배치로는 목표점에 도달할 수 없습니다. 통로를 하나 이상 열어 주세요.', 'error');
      return null;
    }

    return levelData;
  }

  openShareModal() {
    const levelData = this.buildCreatorPuzzleData();
    if (!levelData) return;

    const shareUrl = Encoder.getShareableLink(levelData);
    if (!shareUrl) {
      this.setStatus('🔗 공유 링크를 만들 수 없습니다. 문제 배치를 다시 확인해 주세요.', 'error');
      return;
    }

    const restoredPuzzle = Encoder.loadFromLocation(new URL(shareUrl));
    const sourceCode = Encoder.encode(levelData);
    const restoredCode = restoredPuzzle ? Encoder.encode(restoredPuzzle) : '';
    if (!restoredPuzzle || !sourceCode || restoredCode !== sourceCode) {
      this.setStatus('🔗 생성된 링크가 원래 문제와 정확히 일치하지 않습니다. 문제를 초기화한 뒤 다시 시도해 주세요.', 'error');
      return;
    }

    const qrUrl = Encoder.getQRCodeUrl(shareUrl);

    const shareInput = document.getElementById('share-url-input');
    const qrStatus = document.getElementById('share-qr-status');
    const copyStatus = document.getElementById('share-copy-status');
    const environmentNote = document.getElementById('share-environment-note');
    if (shareInput) shareInput.value = shareUrl;
    if (copyStatus) copyStatus.textContent = '';

    if (environmentNote) {
      const isLocalAddress = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
      environmentNote.hidden = !isLocalAddress;
      environmentNote.textContent = isLocalAddress
        ? '⚠️ 현재는 이 컴퓨터에서만 열리는 로컬 테스트 링크입니다. 실제 pinky-ne.com에서 만든 링크를 친구에게 보내세요.'
        : '';
    }

    const qrImg = document.getElementById('share-qr-img');
    if (qrImg) {
      if (qrStatus) qrStatus.textContent = 'QR 코드를 준비하고 있습니다…';
      qrImg.onload = () => {
        if (qrStatus) qrStatus.textContent = '✅ QR 코드 준비 완료';
      };
      qrImg.onerror = () => {
        if (qrStatus) qrStatus.textContent = '⚠️ QR을 불러오지 못했습니다. 아래 문제 링크를 복사해 공유해 주세요.';
      };
      qrImg.src = qrUrl;
    }

    this.openModal('share-modal', 'share-modal-title');
  }

  async copyShareURL() {
    const input = document.getElementById('share-url-input');
    const copyStatus = document.getElementById('share-copy-status');
    if (!input?.value) {
      if (copyStatus) copyStatus.textContent = '복사할 문제 링크가 없습니다.';
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(input.value);
      } else {
        input.focus();
        input.select();
        const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
        if (!copied) throw new Error('Copy command unavailable');
      }
      Audio.playSuccess();
      if (copyStatus) copyStatus.textContent = '✅ 문제 링크를 복사했습니다. 카카오톡이나 패들렛에 붙여넣으세요.';
    } catch (error) {
      input.focus();
      input.select();
      if (copyStatus) copyStatus.textContent = '⚠️ 자동 복사가 허용되지 않았습니다. 선택된 링크를 직접 복사해 주세요.';
    }
  }
}

// 앱 실행
if (typeof window !== 'undefined') {
  const initializeApp = () => new App();

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeApp, { once: true });
  } else {
    initializeApp();
  }
}
