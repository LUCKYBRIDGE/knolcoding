import { CommandEngine, DIRECTIONS } from './command.js';

/**
 * 그림 교육은 일반 그림 활동과 달리 풀이 기준을 단계별로 좁혀 보여 준다.
 * 일반 그림은 완성된 선의 집합만 맞으면 성공이지만, 여기서는 순서·경로·효율을
 * 각각 분리해 익힌다.
 */
export const DRAWING_EDUCATION_LESSONS = Object.freeze([
  Object.freeze({
    id: 'draw_sequence',
    order: 1,
    icon: '①',
    title: '순서대로 그림 그리기',
    concept: '순차구조와 기본 붓질',
    description: '빈 모눈종이에 자유롭게 그린 뒤, 내 붓질을 제시 명령의 순서와 비교해요.',
    sizes: Object.freeze([5, 7, 9])
  }),
  Object.freeze({
    id: 'draw_methods',
    order: 2,
    icon: '②',
    title: '같은 그림, 다른 방법으로 그리기',
    concept: '여러 실행 경로 비교',
    description: '같은 그림을 완성하는 실제 이동 경로를 두 가지 찾아 비교해요.',
    sizes: Object.freeze([5, 7, 9])
  }),
  Object.freeze({
    id: 'draw_minimum_commands',
    order: 3,
    icon: '③',
    title: '가장 적은 명령으로 그림 그리기',
    concept: '명령 묶음과 붓 상태 최적화',
    description: '이동 명령 묶음과 붓 명령까지 모두 세어 가장 적은 명령으로 그림을 완성해요.',
    sizes: Object.freeze([5, 7, 9])
  })
]);

export function getDrawingEducationLesson(lessonId) {
  return DRAWING_EDUCATION_LESSONS.find(lesson => lesson.id === lessonId)
    || DRAWING_EDUCATION_LESSONS[0];
}

export function isDrawingEducationLesson(lessonId) {
  return DRAWING_EDUCATION_LESSONS.some(lesson => lesson.id === lessonId);
}

const ALL_DIRECTIONS = Object.freeze(Object.keys(DIRECTIONS));
const PEN_COMMAND_TYPES = new Set(['PEN_DOWN', 'PEN_UP']);

/**
 * 처음 두 단계는 순서와 실제 경로에 집중하도록 붓 상태를 고정한다. 세 번째
 * 단계에서는 붓을 떼고 누르는 명령도 하나의 코드 블록으로 세어 최적화한다.
 */
export const DRAWING_EDUCATION_TOOL_POLICIES = Object.freeze({
  draw_sequence: Object.freeze({
    allowDistanceEditing: false,
    mergeAdjacent: false,
    allowDirectMainMoves: true,
    allowPenControls: false,
    allowedDirections: ALL_DIRECTIONS,
    toolSummary: '8방향 자유 이동 · 제출 후 순서 비교'
  }),
  draw_methods: Object.freeze({
    allowDistanceEditing: true,
    mergeAdjacent: true,
    allowDirectMainMoves: true,
    allowPenControls: false,
    allowedDirections: ALL_DIRECTIONS,
    toolSummary: '8방향 · 거리 조절 · 서로 다른 그리기 경로'
  }),
  draw_minimum_commands: Object.freeze({
    allowDistanceEditing: true,
    mergeAdjacent: true,
    allowDirectMainMoves: true,
    allowPenControls: true,
    allowedDirections: ALL_DIRECTIONS,
    toolSummary: '8방향 · 거리 조절 · 붓 상태까지 포함한 최소 명령'
  })
});

export function getDrawingEducationToolPolicy(level = {}, lessonId = level.educationLesson) {
  const base = DRAWING_EDUCATION_TOOL_POLICIES[lessonId]
    || DRAWING_EDUCATION_TOOL_POLICIES.draw_sequence;
  const levelPolicy = level.educationLesson === lessonId
    ? (level.educationToolPolicy || {})
    : {};

  return {
    ...base,
    ...levelPolicy,
    // 각 단계의 기본 정책이 붓 상태 사용 가능 여부를 결정한다. 문제 데이터가
    // 별도로 잠그는 경우만 덮어쓴다.
    allowPenControls: levelPolicy.allowPenControls ?? base.allowPenControls,
    allowedDirections: Object.freeze([
      ...(levelPolicy.allowedDirections || base.allowedDirections || ALL_DIRECTIONS)
    ])
  };
}

const DIRECTION_BY_VECTOR = new Map(
  Object.entries(DIRECTIONS).map(([key, value]) => [`${value.dx},${value.dy}`, key])
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isCommandRecord(command) {
  return Boolean(command && typeof command === 'object' && !Array.isArray(command));
}

function getCommandType(command) {
  const safeCommand = isCommandRecord(command) ? command : {};
  return safeCommand.dir || safeCommand.type || safeCommand.action || '';
}

function isPenControlCommand(command = {}) {
  return PEN_COMMAND_TYPES.has(getCommandType(command));
}

function getSafeCommands(commands) {
  return Array.isArray(commands) ? commands : [];
}

function commandsToMovementSteps(commands = []) {
  return CommandEngine.expandToStepList(
    getSafeCommands(commands).filter(isCommandRecord)
  )
    .filter(step => Object.hasOwn(DIRECTIONS, step));
}

function stepsToCommands(steps = []) {
  return CommandEngine.compressStepList(steps);
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

function pointFromKey(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function canonicalSegmentKey(line) {
  const from = `${line.fromX},${line.fromY}`;
  const to = `${line.toX},${line.toY}`;
  return from < to ? `${from}|${to}` : `${to}|${from}`;
}

/**
 * 명령을 한 칸 방향열로 펼친 의미상의 경로 서명이다.
 * 거리를 합치거나 나누는 표현 차이와 붓 상태 토글은 포함하지 않는다.
 */
export function getDrawingRouteSignature(commands = []) {
  return commandsToMovementSteps(commands).join('>');
}

export function getDrawingRawSignature(commands = []) {
  return getSafeCommands(commands)
    .map(command => `${getCommandType(command) || 'UNKNOWN'}:${command?.distance || 1}`)
    .join('>');
}

/**
 * 2단계에서 "같은 명령"인지 비교할 때 쓰는 한 칸 방향 멀티셋이다.
 */
export function getDrawingCommandMultisetSignature(commands = []) {
  return [...commandsToMovementSteps(commands)].sort().join('|');
}

/**
 * 완성 그림에서 각 목표 선분을 처음 덮은 순서를 기록한다. 이는 출제 증인 두 개가
 * 실제로 다른 그리기 경로인지 검증하는 보조 지표다.
 */
export function getDrawingFigureTraversalSignature(lines = []) {
  const unitLines = CommandEngine.expandLinesToUnitSteps(lines) || [];
  const seen = new Set();
  const firstCoveredSegments = [];

  for (const line of unitLines) {
    const key = canonicalSegmentKey(line);
    if (seen.has(key)) continue;
    seen.add(key);
    firstCoveredSegments.push(key);
  }
  return firstCoveredSegments.join('>');
}

function getPhysicalMovementDistance(commands = []) {
  return commandsToMovementSteps(commands)
    .filter(direction => Object.hasOwn(DIRECTIONS, direction))
    .length;
}

function hasPenControlCommands(commands = []) {
  return getSafeCommands(commands).some(isPenControlCommand);
}

function hasUnknownCommands(commands = []) {
  return getSafeCommands(commands).some(command => {
    if (!isCommandRecord(command)) return true;
    const type = getCommandType(command);
    return !PEN_COMMAND_TYPES.has(type) && !Object.hasOwn(DIRECTIONS, type);
  });
}

/**
 * 교육 단계에서 사용할 채점 결과다. 일반 그림의 `actualDistance`는 화면에 남은
 * 선 길이이고, 여기의 `physicalDistance`는 붓 상태와 무관하게 실제 이동한 칸 수다.
 */
export function assessDrawingEducationAttempt(level = {}, commands = [], result = {}) {
  const assessment = CommandEngine.assessDrawingAttempt(
    level.starPos,
    result.lines || [],
    level.targetLines || []
  );
  const signature = getDrawingRouteSignature(commands);
  const rawSignature = getDrawingRawSignature(commands);
  const multisetSignature = getDrawingCommandMultisetSignature(commands);
  // 교육의 중복 판정은 프로젝트 규칙대로 1칸 방향열을 사용한다. 따라서 거리
  // 묶기/나누기와 PEN_UP·PEN_DOWN 토글만 다른 명령은 같은 풀이로 정규화된다.
  const solutionSignature = signature;
  const figureTraversalSignature = getDrawingFigureTraversalSignature(result.lines || []);
  const physicalDistance = getPhysicalMovementDistance(commands);
  const lessonId = level.educationLesson;
  const policy = getDrawingEducationToolPolicy(level, lessonId);
  const commandCount = getSafeCommands(commands).length;
  const minimumCommandCount = Number.isFinite(level.minimumCommandCount)
    ? level.minimumCommandCount
    : Number.POSITIVE_INFINITY;
  const firstCommandType = getCommandType(getSafeCommands(commands)[0]);
  const requiresInitialPenDown = level.requiresInitialPenDown === true;
  const hasRequiredInitialPenDown = !requiresInitialPenDown || firstCommandType === 'PEN_DOWN';
  const penControlIndexes = getSafeCommands(commands)
    .map((command, index) => isPenControlCommand(command) ? index : -1)
    .filter(index => index >= 0);
  const hasForbiddenPenControl = (
    policy.allowPenControls === false &&
    penControlIndexes.some(index => index !== 0 || firstCommandType !== 'PEN_DOWN')
  );
  const hasInvalidCommand = hasUnknownCommands(commands);
  const hasUnsafeExecution = Boolean(result.hitWall || result.hitObstacle);
  let meetsLessonRule = false;
  let reason = 'different_figure';

  if (!hasRequiredInitialPenDown) {
    reason = 'missing_initial_pen_down';
  } else if (hasInvalidCommand) {
    reason = 'invalid_command';
  } else if (hasUnsafeExecution) {
    reason = result.hitWall ? 'hit_wall' : 'hit_obstacle';
  } else if (assessment.isExactMatch) {
    if (hasForbiddenPenControl) {
      reason = 'pen_controls_not_allowed';
    } else if (lessonId === 'draw_sequence') {
      const referenceSignature = getDrawingRouteSignature(level.referenceCommands || []);
      meetsLessonRule = signature === referenceSignature;
      reason = meetsLessonRule ? 'success' : 'different_order';
    } else if (lessonId === 'draw_methods') {
      // 이 단계는 효율 경쟁이 아니라 같은 그림을 완성하는 순서 비교가 목표다.
      // 첫 번째로 덮은 목표 선분의 순서가 있으면 유효한 풀이로 보고, 앱에서는
      // 이 서명을 앞선 제출과 비교해 단순 왕복·묶기 차이를 같은 방법으로 거른다.
      meetsLessonRule = Boolean(figureTraversalSignature);
      reason = meetsLessonRule ? 'success' : 'empty_traversal';
    } else if (lessonId === 'draw_minimum_commands') {
      meetsLessonRule = commandCount === minimumCommandCount;
      reason = meetsLessonRule ? 'success' : 'not_minimum_commands';
    }
  }

  return {
    ...assessment,
    signature,
    rawSignature,
    multisetSignature,
    normalizedRouteSignature: solutionSignature,
    solutionSignature,
    figureTraversalSignature,
    physicalDistance,
    commandCount,
    minimumCommandCount,
    hasForbiddenPenControl,
    hasRequiredInitialPenDown,
    hasInvalidCommand,
    hasUnsafeExecution,
    meetsLessonRule,
    reason
  };
}

function edgePriority(entry, variant) {
  const reverseId = 10000 - entry.id;
  const [toX, toY] = entry.toKey.split(',').map(Number);
  const numericPriority = [
    entry.id,
    reverseId,
    (entry.id * 7) % 97,
    (entry.id * 13 + 5) % 101,
    toX * 17 + toY * 7,
    toY * 17 + toX * 7,
    (entry.id * 29 + toX * 3 + toY) % 103,
    (entry.id * 31 + toY * 3 + toX) % 107
  ][variant % 8];
  return `${String(numericPriority).padStart(5, '0')}|${entry.toKey}|${String(entry.id).padStart(5, '0')}`;
}

/**
 * 이미 검증된 목표 순회선(targetLines)의 간선 인스턴스로 오일러 순회를 다시 만든다.
 * 필요한 되짚기 간선도 인스턴스로 보존하므로, 가지가 있는 그림도 끊지 않고
 * 분기점에서 다른 선택을 하는 실제 그리기 경로 증인을 얻는다.
 */
function makeEulerRouteSteps(targetLines, starPos, variant) {
  const unitLines = CommandEngine.expandLinesToUnitSteps(targetLines);
  if (!unitLines || unitLines.length === 0 || !starPos) return null;

  const adjacency = new Map();
  const addIncident = (fromKey, entry) => {
    if (!adjacency.has(fromKey)) adjacency.set(fromKey, []);
    adjacency.get(fromKey).push(entry);
  };

  for (const [id, line] of unitLines.entries()) {
    const fromKey = `${line.fromX},${line.fromY}`;
    const toKey = `${line.toX},${line.toY}`;
    addIncident(fromKey, { id, toKey });
    addIncident(toKey, { id, toKey: fromKey });
  }

  const startKey = pointKey(starPos);
  if (!adjacency.has(startKey)) return null;
  const orderedAdjacency = new Map(
    [...adjacency.entries()].map(([key, entries]) => [
      key,
      [...entries].sort((first, second) => (
        edgePriority(first, variant).localeCompare(edgePriority(second, variant))
      ))
    ])
  );

  const usedEdges = new Set();
  const stack = [startKey];
  const walk = [];
  while (stack.length > 0) {
    const current = stack.at(-1);
    const candidates = orderedAdjacency.get(current) || [];
    while (candidates.length > 0 && usedEdges.has(candidates.at(-1).id)) {
      candidates.pop();
    }

    if (candidates.length === 0) {
      walk.push(stack.pop());
      continue;
    }

    const edge = candidates.pop();
    usedEdges.add(edge.id);
    stack.push(edge.toKey);
  }

  const route = walk.reverse();
  if (usedEdges.size !== unitLines.length || route.length !== unitLines.length + 1 || route[0] !== startKey) {
    return null;
  }

  const steps = [];
  for (let index = 1; index < route.length; index++) {
    const from = pointFromKey(route[index - 1]);
    const to = pointFromKey(route[index]);
    const direction = DIRECTION_BY_VECTOR.get(`${to.x - from.x},${to.y - from.y}`);
    if (!direction) return null;
    steps.push(direction);
  }
  return steps;
}

function buildVariationWitnesses(level) {
  const candidates = [];
  const seenRouteSignatures = new Set();

  for (let variant = 0; variant < 24; variant++) {
    const steps = makeEulerRouteSteps(level.targetLines, level.starPos, variant);
    if (!steps) continue;
    const commands = stepsToCommands(steps);
    const routeSignature = getDrawingRouteSignature(commands);
    if (seenRouteSignatures.has(routeSignature)) continue;

    const result = CommandEngine.simulate(level.starPos, commands, level.gridSize, []);
    const assessment = CommandEngine.assessDrawingAttempt(
      level.starPos,
      result.lines,
      level.targetLines
    );
    if (result.hitWall || result.hitObstacle || !assessment.isExactMatch) {
      continue;
    }

    seenRouteSignatures.add(routeSignature);
    candidates.push({
      commands,
      routeSignature,
      multisetSignature: getDrawingCommandMultisetSignature(commands),
      traversalSignature: getDrawingFigureTraversalSignature(result.lines),
      physicalDistance: getPhysicalMovementDistance(commands)
    });
  }

  for (let firstIndex = 0; firstIndex < candidates.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex++) {
      const first = candidates[firstIndex];
      const second = candidates[secondIndex];
      // 같은 그림을 다른 방법으로 그린다는 개념이 분명하도록, 방향 명령의
      // 멀티셋과 처음 덮은 선의 순서가 모두 다른 두 경로만 채택한다.
      if (
        first.multisetSignature !== second.multisetSignature &&
        first.traversalSignature !== second.traversalSignature
      ) {
        return [first, second];
      }
    }
  }
  return null;
}

function prepareSequenceLevel(level, index, gridSize) {
  const referenceCommands = clone(level.initialCommands || level.witnessCommands || []);
  const referenceSteps = commandsToMovementSteps(referenceCommands);

  if (
    referenceCommands.length === 0 ||
    hasPenControlCommands(referenceCommands) ||
    referenceSteps.length === 0
  ) {
    throw new Error(`Invalid drawing sequence level ${gridSize}/${index + 1}`);
  }

  return {
    ...clone(level),
    title: `${gridSize}x${gridSize} 순서대로 그림 그리기 ${index + 1}`,
    guide: '① 빈 모눈종이에서는 어느 방향으로든 자유롭게 움직일 수 있어요. 붓을 드래그하거나 다음 칸을 누른 뒤, 제출해서 제시 명령의 순서와 비교해 보세요.',
    educationLesson: 'draw_sequence',
    requiresInitialPenDown: true,
    referenceCommands,
    referenceSignature: getDrawingRouteSignature(referenceCommands),
    educationToolPolicy: {
      allowedDirections: [...ALL_DIRECTIONS]
    },
    initialCommands: clone(referenceCommands)
  };
}

function prepareMethodsLevel(level, index, gridSize) {
  const witnesses = buildVariationWitnesses(level);
  if (!witnesses) return null;

  const [referenceSource, alternateSource] = witnesses;
  const withInitialPenDown = witness => ({
    ...witness,
    commands: [{ dir: 'PEN_DOWN', distance: 1 }, ...witness.commands]
  });
  const reference = withInitialPenDown(referenceSource);
  const alternate = withInitialPenDown(alternateSource);
  // 이 단계는 최솟값을 맞히는 단계가 아니다. 다만 불필요한 왕복을 덧붙여
  // 무한히 많은 "다른 풀이"를 만들 수 없도록, 검증된 두 경로보다 네 칸만
  // 더 긴 경로까지만 새 풀이로 인정한다.
  const maximumDistance = Math.max(
    reference.physicalDistance,
    alternate.physicalDistance,
    (level.minimumDrawingDistance || 0) + 4
  );
  return {
    ...clone(level),
    title: `${gridSize}x${gridSize} 같은 그림, 다른 방법 ${index + 1}`,
    guide: '② 목표 그림을 완성하는 서로 다른 실제 이동 경로를 두 가지 찾아보세요. 같은 이동을 잘게 나누거나 붓 상태만 바꾼 것은 같은 방법이에요.',
    educationLesson: 'draw_methods',
    requiresInitialPenDown: true,
    referenceCommands: reference.commands,
    alternateCommands: alternate.commands,
    referenceSignature: reference.routeSignature,
    referenceMultisetSignature: reference.multisetSignature,
    referenceTraversalSignature: reference.traversalSignature,
    drawingTargetSolutionCount: 2,
    drawingMaximumDistance: maximumDistance,
    witnesses: [reference.commands, alternate.commands],
    educationToolPolicy: {
      allowedDirections: [...ALL_DIRECTIONS]
    },
    initialCommands: undefined
  };
}

/**
 * 세 번째 단계는 분기·되짚기가 없는 열린 선 경로만 사용한다. 시작점은 한쪽
 * 끝점이고 모든 방향 전환은 서로 다른 최대 직선 구간을 만든다. 따라서 각
 * 직선 구간마다 적어도 한 개의 이동 명령이 필요하고, 붓 상태 명령은 그 수를
 * 줄일 수 없으므로 `lowerBound`가 최소 명령 수의 엄격한 하한이 된다.
 */
export function analyzeMinimumDrawingCommands(level = {}) {
  const witnessCommands = clone(
    level.minimumCommandWitness || level.witnessCommands || []
  );
  const starPos = level.starPos;
  const gridSize = level.gridSize;
  const targetLines = level.targetLines || [];
  const movementCommands = witnessCommands.filter(command => (
    Object.hasOwn(DIRECTIONS, getCommandType(command))
  ));
  const penCommands = witnessCommands.filter(isPenControlCommand);
  const hasKnownCommandsOnly = witnessCommands.length === movementCommands.length + penCommands.length;
  const hasInitialPenDown = getCommandType(witnessCommands[0]) === 'PEN_DOWN';
  const result = CommandEngine.simulate(starPos, witnessCommands, gridSize, level.obstacles || [], false);
  const assessment = CommandEngine.assessDrawingAttempt(starPos, result.lines, targetLines);
  const unitLines = CommandEngine.expandLinesToUnitSteps(targetLines) || [];
  const vertexDegrees = new Map();
  const seenSegments = new Set();
  const addDegree = (x, y) => {
    const key = `${x},${y}`;
    vertexDegrees.set(key, (vertexDegrees.get(key) || 0) + 1);
  };
  for (const line of unitLines) {
    const key = canonicalSegmentKey(line);
    if (seenSegments.has(key)) {
      return { isValid: false, lowerBound: Number.POSITIVE_INFINITY, witnessCommands, reason: 'repeated_segment' };
    }
    seenSegments.add(key);
    addDegree(line.fromX, line.fromY);
    addDegree(line.toX, line.toY);
  }

  const positions = result.pathSteps
    .filter(step => !step.isPenToggle)
    .map(step => `${step.x},${step.y}`);
  const startKey = starPos ? pointKey(starPos) : '';
  const endKey = positions.at(-1) || '';
  const endpointKeys = [...vertexDegrees.entries()]
    .filter(([, degree]) => degree === 1)
    .map(([key]) => key);
  const hasSimpleOpenPath = (
    unitLines.length > 0 &&
    endpointKeys.length === 2 &&
    endpointKeys.includes(startKey) &&
    endpointKeys.includes(endKey) &&
    [...vertexDegrees.entries()].every(([key, degree]) => (
      endpointKeys.includes(key) ? degree === 1 : degree === 2
    )) &&
    new Set(positions).size === positions.length &&
    positions.length === unitLines.length + 1
  );
  const hasSeparateRuns = movementCommands.every((command, index) => (
    index === 0 || getCommandType(command) !== getCommandType(movementCommands[index - 1])
  ));
  const componentProof = level.disconnectedComponentProof;
  const adjacency = new Map();
  const connect = (from, to) => {
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from).add(to);
  };
  for (const line of unitLines) {
    const from = `${line.fromX},${line.fromY}`;
    const to = `${line.toX},${line.toY}`;
    connect(from, to);
    connect(to, from);
  }
  let componentCount = 0;
  const visitedVertices = new Set();
  for (const vertex of adjacency.keys()) {
    if (visitedVertices.has(vertex)) continue;
    componentCount++;
    const stack = [vertex];
    visitedVertices.add(vertex);
    while (stack.length > 0) {
      for (const next of adjacency.get(stack.pop()) || []) {
        if (visitedVertices.has(next)) continue;
        visitedVertices.add(next);
        stack.push(next);
      }
    }
  }
  const hasValidDisconnectedProof = Boolean(
    componentProof &&
    componentCount === componentProof.componentSegmentLowerBounds?.length &&
    componentProof.componentSegmentLowerBounds.every(value => Number.isInteger(value) && value > 0) &&
    penCommands.some(command => getCommandType(command) === 'PEN_UP') &&
    penCommands.filter(command => getCommandType(command) === 'PEN_DOWN').length >= componentCount
  );
  const lowerBound = hasSimpleOpenPath && hasSeparateRuns
    ? movementCommands.length + 1
    : (hasValidDisconnectedProof
        ? 1 + componentProof.componentSegmentLowerBounds.reduce((sum, value) => sum + value, 0) + ((componentCount - 1) * 3)
        : Number.POSITIVE_INFINITY);
  const isValid = Boolean(
    hasKnownCommandsOnly &&
    hasInitialPenDown &&
    ((hasSimpleOpenPath && hasSeparateRuns) || hasValidDisconnectedProof) &&
    !result.hitWall &&
    !result.hitObstacle &&
    assessment.isExactMatch &&
    Number.isFinite(lowerBound)
  );

  return {
    isValid,
    lowerBound,
    witnessCommands,
    physicalDistance: getPhysicalMovementDistance(witnessCommands),
    result,
    reason: isValid ? 'success' : 'invalid_minimum_command_template'
  };
}

const MINIMUM_COMMAND_TEMPLATES = Object.freeze({
  5: Object.freeze([
    // 번개, 계단, 세로 지그재그, 뱀길, 작은 나선. 단순 확대가 아니라
    // 서로 다른 방향 전환 구조를 보여 주되, 모두 가로·세로 4칸 이상 쓴다.
    Object.freeze({ start: [0, 0], commands: [['RIGHT', 4], ['DOWN', 1], ['LEFT', 3], ['DOWN', 2], ['RIGHT', 3], ['DOWN', 1]] }),
    Object.freeze({ start: [0, 4], commands: [['UP', 1], ['RIGHT', 1], ['UP', 1], ['RIGHT', 1], ['UP', 1], ['RIGHT', 1], ['UP', 1], ['RIGHT', 1]] }),
    Object.freeze({ start: [0, 4], commands: [['UP', 4], ['RIGHT', 1], ['DOWN', 3], ['RIGHT', 1], ['UP', 3], ['RIGHT', 1], ['DOWN', 3], ['RIGHT', 1], ['UP', 3]] }),
    Object.freeze({ start: [0, 0], commands: [['RIGHT', 4], ['DOWN', 1], ['LEFT', 3], ['DOWN', 1], ['RIGHT', 3], ['DOWN', 1], ['LEFT', 3], ['DOWN', 1], ['RIGHT', 3]] }),
    Object.freeze({
      start: [0, 0],
      commands: [['PEN_DOWN', 1], ['RIGHT', 1], ['DOWN', 1], ['LEFT', 1], ['UP', 1], ['PEN_UP', 1], ['DOWN_RIGHT', 3], ['PEN_DOWN', 1], ['RIGHT', 1], ['DOWN', 1], ['LEFT', 1], ['UP', 1]],
      disconnectedComponentProof: { componentSegmentLowerBounds: [4, 4] }
    }),
    Object.freeze({ motifId: 'open-house', start: [0, 4], commands: [['UP', 2], ['UP_RIGHT', 2], ['DOWN_RIGHT', 2], ['DOWN', 2], ['LEFT', 3]] }),
    Object.freeze({ motifId: 'lightning', start: [0, 0], commands: [['RIGHT', 3], ['DOWN_LEFT', 2], ['RIGHT', 3], ['DOWN_LEFT', 2]] }),
    Object.freeze({ motifId: 'flag-fold', start: [0, 4], commands: [['UP', 4], ['DOWN_RIGHT', 2], ['RIGHT', 2], ['DOWN_LEFT', 2], ['RIGHT', 2]] }),
    Object.freeze({ motifId: 'ribbon', start: [0, 0], commands: [['DOWN', 4], ['UP_RIGHT', 2], ['UP', 2], ['DOWN_RIGHT', 2]] }),
    Object.freeze({
      motifId: 'parallel-lines',
      start: [0, 0],
      commands: [['PEN_DOWN', 1], ['DOWN', 4], ['PEN_UP', 1], ['UP_RIGHT', 4], ['PEN_DOWN', 1], ['DOWN', 4]],
      disconnectedComponentProof: { componentSegmentLowerBounds: [1, 1] }
    })
  ]),
  7: Object.freeze([
    Object.freeze({ start: [0, 6], commands: [['UP', 6], ['RIGHT', 5], ['DOWN', 5], ['LEFT', 4], ['UP', 4], ['RIGHT', 3], ['DOWN', 3], ['LEFT', 2], ['UP', 2], ['RIGHT', 1]] }),
    Object.freeze({ start: [0, 0], commands: [['RIGHT', 6], ['DOWN', 2], ['LEFT', 4], ['DOWN', 2], ['RIGHT', 4], ['DOWN', 2]] }),
    Object.freeze({ start: [0, 6], commands: [['UP', 2], ['RIGHT', 2], ['UP', 2], ['RIGHT', 2], ['UP', 2], ['RIGHT', 2]] }),
    Object.freeze({ start: [0, 6], commands: [['UP', 5], ['RIGHT', 2], ['DOWN', 3], ['RIGHT', 2], ['UP', 3], ['RIGHT', 2]] }),
    Object.freeze({
      start: [0, 0],
      commands: [['PEN_DOWN', 1], ['RIGHT', 2], ['DOWN', 2], ['LEFT', 2], ['UP', 2], ['PEN_UP', 1], ['DOWN_RIGHT', 4], ['PEN_DOWN', 1], ['RIGHT', 2], ['DOWN', 2], ['LEFT', 2], ['UP', 2]],
      disconnectedComponentProof: { componentSegmentLowerBounds: [4, 4] }
    }),
    Object.freeze({ motifId: 'open-house', start: [0, 6], commands: [['UP', 3], ['UP_RIGHT', 3], ['DOWN_RIGHT', 3], ['DOWN', 3], ['LEFT', 5]] }),
    Object.freeze({ motifId: 'lightning', start: [0, 0], commands: [['RIGHT', 4], ['DOWN_LEFT', 3], ['RIGHT', 4], ['DOWN_LEFT', 3]] }),
    Object.freeze({ motifId: 'flag-fold', start: [0, 6], commands: [['UP', 6], ['DOWN_RIGHT', 3], ['RIGHT', 3], ['DOWN_LEFT', 3], ['RIGHT', 3]] }),
    Object.freeze({ motifId: 'ribbon', start: [0, 0], commands: [['DOWN', 6], ['UP_RIGHT', 3], ['UP', 3], ['DOWN_RIGHT', 3], ['DOWN', 3]] }),
    Object.freeze({
      motifId: 'parallel-lines',
      start: [0, 0],
      commands: [['PEN_DOWN', 1], ['DOWN', 6], ['PEN_UP', 1], ['UP_RIGHT', 6], ['PEN_DOWN', 1], ['DOWN', 6]],
      disconnectedComponentProof: { componentSegmentLowerBounds: [1, 1] }
    })
  ]),
  9: Object.freeze([
    Object.freeze({ start: [0, 8], commands: [['UP', 8], ['RIGHT', 6], ['DOWN', 7], ['LEFT', 5], ['UP', 6], ['RIGHT', 4], ['DOWN', 5], ['LEFT', 3], ['UP', 4], ['RIGHT', 2], ['DOWN', 3], ['LEFT', 1]] }),
    Object.freeze({ start: [0, 0], commands: [['RIGHT', 8], ['DOWN', 2], ['LEFT', 6], ['DOWN', 3], ['RIGHT', 6], ['DOWN', 3]] }),
    Object.freeze({ start: [0, 8], commands: [['UP', 2], ['RIGHT', 2], ['UP', 2], ['RIGHT', 2], ['UP', 2], ['RIGHT', 2], ['UP', 2], ['RIGHT', 2]] }),
    Object.freeze({ start: [0, 8], commands: [['UP', 7], ['RIGHT', 2], ['DOWN', 5], ['RIGHT', 2], ['UP', 5], ['RIGHT', 2], ['DOWN', 5], ['RIGHT', 2]] }),
    Object.freeze({
      start: [0, 0],
      commands: [['PEN_DOWN', 1], ['RIGHT', 2], ['DOWN', 2], ['LEFT', 2], ['UP', 2], ['PEN_UP', 1], ['DOWN_RIGHT', 6], ['PEN_DOWN', 1], ['RIGHT', 2], ['DOWN', 2], ['LEFT', 2], ['UP', 2]],
      disconnectedComponentProof: { componentSegmentLowerBounds: [4, 4] }
    }),
    Object.freeze({ motifId: 'open-house', start: [0, 8], commands: [['UP', 4], ['UP_RIGHT', 4], ['DOWN_RIGHT', 4], ['DOWN', 4], ['LEFT', 7]] }),
    Object.freeze({ motifId: 'lightning', start: [0, 0], commands: [['RIGHT', 7], ['DOWN_LEFT', 4], ['RIGHT', 5], ['DOWN_LEFT', 4]] }),
    Object.freeze({ motifId: 'flag-fold', start: [0, 8], commands: [['UP', 8], ['DOWN_RIGHT', 4], ['RIGHT', 4], ['DOWN_LEFT', 4], ['RIGHT', 4]] }),
    Object.freeze({ motifId: 'ribbon', start: [0, 0], commands: [['DOWN', 8], ['UP_RIGHT', 4], ['UP', 4], ['DOWN_RIGHT', 4], ['DOWN', 4]] }),
    Object.freeze({
      motifId: 'parallel-lines',
      start: [0, 0],
      commands: [['PEN_DOWN', 1], ['DOWN', 8], ['PEN_UP', 1], ['UP_RIGHT', 8], ['PEN_DOWN', 1], ['DOWN', 8]],
      disconnectedComponentProof: { componentSegmentLowerBounds: [1, 1] }
    })
  ])
});

function prepareMinimumCommandLevel(template, index, gridSize) {
  const starPos = { x: template.start[0], y: template.start[1] };
  const sourceCommands = template.commands.map(([dir, distance]) => ({ dir, distance }));
  const witnessCommands = getCommandType(sourceCommands[0]) === 'PEN_DOWN'
    ? sourceCommands
    : [{ dir: 'PEN_DOWN', distance: 1 }, ...sourceCommands];
  const simulation = CommandEngine.simulate(starPos, witnessCommands, gridSize, [], false);
  const level = {
    title: `${gridSize}x${gridSize} 최소 명령 그림 ${index + 1}`,
    gridSize,
    starPos,
    obstacles: [],
    targetLines: simulation.lines.map(line => ({ ...line })),
    minimumCommandWitness: witnessCommands,
    witnessCommands,
    educationLesson: 'draw_minimum_commands',
    educationMotifId: template.motifId || `minimum-shape-${index + 1}`,
    requiresInitialPenDown: true,
    disconnectedComponentProof: template.disconnectedComponentProof,
    educationToolPolicy: {
      allowedDirections: [...ALL_DIRECTIONS],
      allowPenControls: true
    }
  };
  const analysis = analyzeMinimumDrawingCommands(level);
  if (!analysis.isValid) {
    throw new Error(`Invalid drawing minimum-command template ${gridSize}/${index + 1}: ${analysis.reason}`);
  }

  return {
    ...level,
    minimumCommandCount: analysis.lowerBound,
    minimumDrawingDistance: analysis.physicalDistance,
    guide: `③ 목표 그림을 정확히 완성하면서 명령을 최소 ${analysis.lowerBound}개로 묶어 보세요. 붓을 떼고 누르는 명령도 각각 한 개로 셉니다.`
  };
}

function getLevelsForGridSize(levels, gridSize) {
  return getSafeCommands(levels).filter(level => level?.gridSize === gridSize);
}

function addDrawingEducationProblemKeys(levels, lessonId, gridSize) {
  return levels.map((level, index) => ({
    ...level,
    educationVariantGroup: level.educationVariantGroup ?? (index % 5),
    educationProblemKey: `drawing:${lessonId}:${gridSize}:${index + 1}`
  }));
}

/** 그림 교육 한 차시의 5문제를 고를 수 있도록 검증된 전체 후보를 반환한다. */
export function buildDrawingEducationProblemBank(presetLevels, lessonId, gridSize) {
  if (![5, 7, 9].includes(gridSize) || !isDrawingEducationLesson(lessonId)) return [];

  if (lessonId === 'draw_sequence') {
    const levels = getLevelsForGridSize(presetLevels?.debug_guide, gridSize)
      .filter(level => Array.isArray(level.initialCommands))
      .map((level, index) => prepareSequenceLevel(level, index, gridSize));
    if (levels.length < 10) {
      throw new Error(`${gridSize}x${gridSize} 순서대로 그림 그리기 후보가 10문제보다 적습니다.`);
    }
    return addDrawingEducationProblemKeys(levels, lessonId, gridSize);
  }

  if (lessonId === 'draw_methods') {
    const levels = [];
    for (const sourceLevel of getLevelsForGridSize(presetLevels?.debug, gridSize)) {
      const level = prepareMethodsLevel(sourceLevel, levels.length, gridSize);
      if (level) levels.push(level);
    }
    if (levels.length < 8) {
      throw new Error(`${gridSize}x${gridSize} 같은 그림, 다른 방법 후보가 8문제보다 적습니다.`);
    }
    return addDrawingEducationProblemKeys(levels, lessonId, gridSize);
  }

  const levels = (MINIMUM_COMMAND_TEMPLATES[gridSize] || [])
    .map((template, index) => prepareMinimumCommandLevel(template, index, gridSize));

  if (levels.length < 10) {
    throw new Error(`${gridSize}x${gridSize} 최소 명령 그림 후보가 10문제보다 적습니다.`);
  }
  return addDrawingEducationProblemKeys(levels, lessonId, gridSize);
}

export function buildDrawingEducationLevelPool(presetLevels, lessonId, gridSize) {
  return buildDrawingEducationProblemBank(presetLevels, lessonId, gridSize).slice(0, 5);
}
