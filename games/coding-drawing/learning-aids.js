/**
 * 미사일 이동·장애물 피하기의 학습 보조 기능
 * - 🐞 틀린 명령 고치기: 정답 명령 하나만 바꾼 '틀린 프로그램'을 만든다.
 * - 🔮 실행 전에 예측하기: 예측 칸과 실제 멈춘 칸을 화면 좌표 라벨로 비교한다.
 * 화면(DOM)과 무관한 순수 함수만 둔다.
 */

import { CommandEngine, DIRECTIONS, MAX_COMMAND_DISTANCE } from './command.js';

export const PREDICT_BEFORE_RUN_STORAGE_KEY = 'coding-drawing:predict-before-run:v1';

const LEARNING_AID_MODES = Object.freeze(['shortest', 'routing']);

// 시계 방향 8방향 순서. 이웃한 두 방향은 45° 차이다.
const DIRECTION_RING = Object.freeze([
  'UP', 'UP_RIGHT', 'RIGHT', 'DOWN_RIGHT', 'DOWN', 'DOWN_LEFT', 'LEFT', 'UP_LEFT'
]);

export function getAdjacentDirections(dir) {
  const index = DIRECTION_RING.indexOf(dir);
  if (index < 0) return [];
  return [
    DIRECTION_RING[(index + 7) % 8],
    DIRECTION_RING[(index + 1) % 8]
  ];
}

export function isDebugProgramAvailable(mode, challengeType) {
  return (
    LEARNING_AID_MODES.includes(mode) &&
    challengeType !== 'education' &&
    challengeType !== 'multisolution'
  );
}

export function isPredictBeforeRunAvailable(mode, challengeType) {
  return (
    LEARNING_AID_MODES.includes(mode) &&
    challengeType !== 'education' &&
    challengeType !== 'timeattack'
  );
}

/** 저장된 토글 값은 'true'/'false' 문자열 또는 JSON 불리언만 인정하고 나머지는 꺼짐으로 본다. */
export function parsePredictBeforeRunSetting(raw) {
  if (typeof raw !== 'string') return false;
  try {
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

export function serializePredictBeforeRunSetting(enabled) {
  return JSON.stringify(enabled === true);
}

function isMissileProgramSolved(level, commands) {
  const result = CommandEngine.simulate(
    level.starPos,
    commands,
    level.gridSize,
    level.obstacles || []
  );
  return (
    !result.hitWall &&
    !result.hitObstacle &&
    result.finalPos.x === level.goalPos.x &&
    result.finalPos.y === level.goalPos.y
  );
}

/**
 * 현재 풀이 기준에서 성공하는 예시 정답을 고른다.
 * 최단 이동 기준은 최단 경로 중 명령 묶음이 가장 적은 경로, 최소 명령 기준은 최소 명령 경로를 쓴다.
 */
export function getMissileReferenceSolution(level = {}, solutionRule = 'shortest') {
  if (!level?.starPos || !level?.goalPos || !Number.isInteger(level.gridSize)) return null;
  const comparison = CommandEngine.compareRouteRules(
    level.starPos,
    level.goalPos,
    level.gridSize,
    level.obstacles || []
  );
  if (!comparison) return null;
  const route = solutionRule === 'minimum_commands'
    ? comparison.minimumCommandRoute
    : comparison.shortestRouteCommands;
  if (!Array.isArray(route) || route.length === 0) return null;
  return route.map(command => ({ dir: command.dir, distance: command.distance }));
}

/**
 * 정답 명령 하나만 바꾼 틀린 프로그램을 만든다.
 * 바꾸는 방법은 이동 칸 수 ±1(1칸 이상 유지) 또는 이웃 방향(45°)으로 돌리기다.
 * 실행했을 때 목표 칸에 정확히 멈추지 않거나 벽·장애물에 부딪히는 후보만 쓴다.
 * 바꾼 방향이 앞뒤 명령과 같아지면 한 묶음으로 합쳐져 보이므로 후보에서 뺀다.
 * @returns {{ commands: Array, bugIndex: number, solution: Array } | null}
 */
export function createBuggyMissileProgram(level, random = Math.random, { solutionRule = 'shortest' } = {}) {
  const solution = getMissileReferenceSolution(level, solutionRule);
  if (!solution || !isMissileProgramSolved(level, solution)) return null;

  const candidates = [];
  solution.forEach((command, index) => {
    const replacements = [];
    if (command.distance > 1) replacements.push({ dir: command.dir, distance: command.distance - 1 });
    if (command.distance < MAX_COMMAND_DISTANCE) replacements.push({ dir: command.dir, distance: command.distance + 1 });
    const neighbours = [solution[index - 1]?.dir, solution[index + 1]?.dir];
    getAdjacentDirections(command.dir)
      .filter(dir => DIRECTIONS[dir] && !neighbours.includes(dir))
      .forEach(dir => replacements.push({ dir, distance: command.distance }));

    replacements.forEach(replacement => {
      const commands = solution.map((item, itemIndex) => (
        itemIndex === index ? replacement : { ...item }
      ));
      if (!isMissileProgramSolved(level, commands)) {
        candidates.push({ commands, bugIndex: index });
      }
    });
  });

  if (candidates.length === 0) return null;
  const value = Number(random());
  const pick = Number.isFinite(value)
    ? Math.min(candidates.length - 1, Math.max(0, Math.floor(value * candidates.length)))
    : 0;
  return { ...candidates[pick], solution };
}

/** 모눈종이에 표시된 좌표 라벨과 같은 형식 (가운데가 0, 오른쪽·위가 +). */
export function formatGridCoordinateLabel(pos, gridSize) {
  const mid = Math.floor(gridSize / 2);
  const sign = value => (value > 0 ? `+${value}` : `${value}`);
  return `(${sign(pos.x - mid)}, ${sign(mid - pos.y)})`;
}

export function formatPredictionResultLine(predicted, actual, gridSize) {
  const isMatch = predicted.x === actual.x && predicted.y === actual.y;
  return `🔮 예측: ${formatGridCoordinateLabel(predicted, gridSize)} → 실제: ${formatGridCoordinateLabel(actual, gridSize)} — ${
    isMatch ? '맞혔어요!' : '다르게 멈췄어요. 어느 명령에서 달라졌는지 살펴보세요.'
  }`;
}
