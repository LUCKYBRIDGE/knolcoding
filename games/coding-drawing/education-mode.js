import { CommandEngine, DIRECTIONS } from './command.js';
import { analyzeMinimumCommandBlockCode } from './pattern-engine.js';

export const EDUCATION_LESSONS = Object.freeze([
  Object.freeze({
    id: 'sequence',
    order: 1,
    icon: '①',
    title: '순서대로 움직이기',
    concept: '순차구조 (Sequence)',
    description: '명령이 앞에서부터 차례대로 실행되는 과정을 익혀요.',
    sizes: Object.freeze([5, 7])
  }),
  Object.freeze({
    id: 'routes',
    order: 2,
    icon: '②',
    title: '여러 길 찾아보기',
    concept: '같은 목표, 다른 과정',
    description: '같은 목표점에 도착하는 서로 다른 방향 순서를 비교해요.',
    sizes: Object.freeze([5, 7])
  }),
  Object.freeze({
    id: 'compress',
    order: 3,
    icon: '③',
    title: '같은 방향 명령 묶기',
    concept: '연속 명령 압축',
    description: '같은 방향의 한 칸 명령을 하나의 거리 명령으로 줄여요.',
    sizes: Object.freeze([5, 7])
  }),
  Object.freeze({
    id: 'shortest',
    order: 4,
    icon: '④',
    title: '가장 짧은 길 찾기',
    concept: '최단 경로 (Shortest Navigation)',
    description: '장애물 조건을 살펴보고 실제 이동 칸 수를 줄여요.',
    sizes: Object.freeze([5, 7])
  }),
  Object.freeze({
    id: 'minimum',
    order: 5,
    icon: '⑤',
    title: '가장 적은 명령으로 가기',
    concept: '최소 명령 최적화',
    description: '이동 거리와 명령 수를 구분하고 명령 블록 수를 줄여요.',
    sizes: Object.freeze([5, 7])
  }),
  Object.freeze({
    id: 'block_one',
    order: 6,
    icon: '⑥',
    title: '나만의 명령 블록 만들기',
    concept: '사용자 정의 블록·반복구조',
    description: '반복되는 명령 묶음에 A라는 이름을 붙여 다시 사용해요.',
    sizes: Object.freeze([9])
  }),
  Object.freeze({
    id: 'block_two',
    order: 7,
    icon: '⑦',
    title: '명령 블록 A·B 조합하기',
    concept: '복합 모듈화 (Block A·B)',
    description: 'A와 B 두 개의 명령 블록을 함께 사용해 대형 지형을 정복해요.',
    sizes: Object.freeze([11])
  })
]);

export function getEducationLesson(lessonId) {
  return EDUCATION_LESSONS.find(lesson => lesson.id === lessonId) || EDUCATION_LESSONS[0];
}

export function isPatternEducationLesson(lessonId) {
  return lessonId === 'block_one' || lessonId === 'block_two';
}

const ALL_DIRECTIONS = Object.freeze(Object.keys(DIRECTIONS));

export const EDUCATION_TOOL_POLICIES = Object.freeze({
  sequence: Object.freeze({
    allowDistanceEditing: false,
    mergeAdjacent: false,
    allowDirectMainMoves: true,
    toolSummary: '1칸 방향 명령 · 번호 순서 확인'
  }),
  routes: Object.freeze({
    allowDistanceEditing: false,
    mergeAdjacent: false,
    allowDirectMainMoves: true,
    toolSummary: '1칸 방향 명령 · 맵에 필요한 두 방향'
  }),
  compress: Object.freeze({
    allowDistanceEditing: true,
    mergeAdjacent: true,
    allowDirectMainMoves: true,
    toolSummary: '거리 조절 열림 · 제시 경로의 방향만 사용'
  }),
  shortest: Object.freeze({
    allowDistanceEditing: true,
    mergeAdjacent: true,
    allowDirectMainMoves: true,
    allowedDirections: ALL_DIRECTIONS,
    toolSummary: '8방향·거리 조절 열림 · 이동 칸 수로 판정'
  }),
  minimum: Object.freeze({
    allowDistanceEditing: true,
    mergeAdjacent: true,
    allowDirectMainMoves: true,
    allowedDirections: ALL_DIRECTIONS,
    toolSummary: '8방향·거리 조절 열림 · 명령 묶음 수로 판정'
  }),
  block_one: Object.freeze({
    allowDistanceEditing: true,
    mergeAdjacent: true,
    allowDirectMainMoves: false,
    toolSummary: '명령 블록 A 정의 · 메인에서는 A만 반복 호출'
  }),
  block_two: Object.freeze({
    allowDistanceEditing: true,
    mergeAdjacent: true,
    allowDirectMainMoves: true,
    toolSummary: '명령 블록 A·B 정의 · 메인에서 두 블록 조합'
  })
});

export function getEducationToolPolicy(level = {}, lessonId = level.educationLesson) {
  const base = EDUCATION_TOOL_POLICIES[lessonId] || EDUCATION_TOOL_POLICIES.sequence;
  const levelPolicy = level.educationLesson === lessonId
    ? (level.educationToolPolicy || {})
    : {};
  return {
    ...base,
    ...levelPolicy,
    allowedDirections: Object.freeze([
      ...(levelPolicy.allowedDirections || base.allowedDirections || ALL_DIRECTIONS)
    ])
  };
}

const SEQUENCE_TEMPLATES = Object.freeze({
  5: Object.freeze([
    { start: [0, 4], steps: ['UP', 'RIGHT', 'UP_RIGHT'] },
    { start: [4, 4], steps: ['UP_LEFT', 'UP', 'RIGHT'] },
    { start: [0, 0], steps: ['RIGHT', 'DOWN_RIGHT', 'RIGHT', 'DOWN'] },
    { start: [4, 0], steps: ['DOWN', 'DOWN_LEFT', 'UP_LEFT'] },
    { start: [1, 4], steps: ['UP_RIGHT', 'UP', 'LEFT', 'UP'] },
    { start: [0, 2], steps: ['UP_RIGHT', 'RIGHT', 'DOWN_RIGHT', 'DOWN'] },
    { start: [2, 4], steps: ['UP', 'UP_LEFT', 'RIGHT', 'UP_RIGHT'] },
    { start: [4, 2], steps: ['UP_LEFT', 'LEFT', 'DOWN_LEFT', 'DOWN'] },
    { start: [2, 0], steps: ['DOWN_LEFT', 'DOWN', 'DOWN_RIGHT', 'RIGHT'] },
    { start: [0, 4], steps: ['RIGHT', 'UP_RIGHT', 'UP', 'UP_LEFT', 'LEFT'] }
  ]),
  7: Object.freeze([
    { start: [0, 6], steps: ['UP', 'RIGHT', 'UP', 'UP_RIGHT', 'RIGHT'] },
    { start: [6, 6], steps: ['LEFT', 'UP', 'UP_LEFT', 'UP'] },
    { start: [0, 0], steps: ['DOWN_RIGHT', 'RIGHT', 'UP_RIGHT', 'RIGHT', 'DOWN'] },
    { start: [6, 0], steps: ['LEFT', 'DOWN_LEFT', 'DOWN', 'DOWN_RIGHT'] },
    { start: [3, 6], steps: ['UP_LEFT', 'UP', 'UP_RIGHT', 'RIGHT', 'UP'] },
    { start: [0, 3], steps: ['UP_RIGHT', 'RIGHT', 'RIGHT', 'DOWN_RIGHT', 'DOWN'] },
    { start: [3, 6], steps: ['UP', 'UP_LEFT', 'LEFT', 'UP_RIGHT', 'RIGHT'] },
    { start: [6, 3], steps: ['UP_LEFT', 'LEFT', 'LEFT', 'DOWN_LEFT', 'DOWN'] },
    { start: [3, 0], steps: ['DOWN_LEFT', 'DOWN', 'DOWN_RIGHT', 'RIGHT', 'RIGHT'] },
    { start: [0, 6], steps: ['RIGHT', 'UP_RIGHT', 'UP', 'UP_LEFT', 'LEFT', 'UP'] }
  ])
});

const ROUTE_TEMPLATES = Object.freeze({
  5: Object.freeze([
    { start: [0, 4], goal: [2, 2], directions: ['UP', 'RIGHT'] },
    { start: [4, 4], goal: [1, 2], directions: ['LEFT', 'UP'] },
    { start: [0, 0], goal: [3, 2], directions: ['RIGHT', 'DOWN'] },
    { start: [4, 0], goal: [1, 3], directions: ['LEFT', 'DOWN'] },
    { start: [1, 4], goal: [4, 1], directions: ['RIGHT', 'UP'] },
    { start: [0, 3], goal: [4, 1], directions: ['RIGHT', 'UP'] },
    { start: [3, 4], goal: [0, 0], directions: ['LEFT', 'UP'] },
    { start: [1, 0], goal: [4, 4], directions: ['RIGHT', 'DOWN'] },
    { start: [4, 2], goal: [0, 4], directions: ['LEFT', 'DOWN'] },
    { start: [2, 4], goal: [0, 1], directions: ['LEFT', 'UP'] }
  ]),
  7: Object.freeze([
    { start: [0, 6], goal: [3, 2], directions: ['UP', 'RIGHT'] },
    { start: [6, 6], goal: [2, 3], directions: ['LEFT', 'UP'] },
    { start: [0, 0], goal: [4, 3], directions: ['RIGHT', 'DOWN'] },
    { start: [6, 0], goal: [2, 4], directions: ['LEFT', 'DOWN'] },
    { start: [1, 6], goal: [5, 2], directions: ['RIGHT', 'UP'] },
    { start: [0, 5], goal: [6, 2], directions: ['RIGHT', 'UP'] },
    { start: [5, 6], goal: [1, 0], directions: ['LEFT', 'UP'] },
    { start: [1, 0], goal: [6, 5], directions: ['RIGHT', 'DOWN'] },
    { start: [6, 2], goal: [0, 6], directions: ['LEFT', 'DOWN'] },
    { start: [3, 6], goal: [0, 1], directions: ['LEFT', 'UP'] }
  ])
});

const COMPRESS_TEMPLATES = Object.freeze({
  5: Object.freeze([
    { start: [0, 4], runs: [['UP', 2], ['RIGHT', 3], ['DOWN_LEFT', 2]] },
    { start: [4, 4], runs: [['UP_LEFT', 2], ['UP', 2], ['RIGHT', 2]] },
    { start: [0, 0], runs: [['RIGHT', 3], ['DOWN', 2], ['LEFT', 2], ['DOWN_RIGHT', 2]] },
    { start: [4, 0], runs: [['DOWN', 3], ['LEFT', 3], ['UP_RIGHT', 2]] },
    { start: [0, 2], runs: [['UP_RIGHT', 2], ['DOWN', 3], ['RIGHT', 2], ['UP_LEFT', 2]] }
  ]),
  7: Object.freeze([
    { start: [0, 6], runs: [['UP', 3], ['RIGHT', 4], ['DOWN_LEFT', 2], ['RIGHT', 2]] },
    { start: [6, 6], runs: [['UP_LEFT', 3], ['UP', 3], ['RIGHT', 3]] },
    { start: [0, 0], runs: [['RIGHT', 4], ['DOWN', 3], ['LEFT', 3], ['DOWN_RIGHT', 3]] },
    { start: [6, 0], runs: [['DOWN', 4], ['LEFT', 4], ['UP_RIGHT', 3]] },
    { start: [0, 3], runs: [['UP_RIGHT', 3], ['DOWN', 4], ['RIGHT', 3], ['UP_LEFT', 3]] }
  ])
});

const BLOCK_ONE_TEMPLATES = Object.freeze([
  { start: [1, 7], pattern: ['UP_RIGHT', 'RIGHT'], repeat: 3 },
  { start: [1, 1], pattern: ['DOWN_RIGHT', 'RIGHT'], repeat: 3 },
  { start: [7, 7], pattern: ['UP_LEFT', 'LEFT'], repeat: 3 },
  { start: [1, 7], pattern: ['UP', 'UP_RIGHT', 'RIGHT'], repeat: 3 },
  { start: [7, 1], pattern: ['DOWN', 'DOWN_LEFT', 'LEFT'], repeat: 3 },
  { start: [0, 8], pattern: ['UP', 'RIGHT'], repeat: 4 },
  { start: [0, 0], pattern: ['DOWN', 'RIGHT'], repeat: 4 },
  { start: [8, 8], pattern: ['UP', 'LEFT'], repeat: 4 },
  { start: [8, 0], pattern: ['DOWN', 'LEFT'], repeat: 4 },
  { start: [2, 8], pattern: ['UP_RIGHT', 'UP', 'RIGHT'], repeat: 3 }
]);

const BLOCK_TWO_TEMPLATES = Object.freeze([
  { start: [1, 9], a: ['UP_RIGHT', 'RIGHT'], aRepeat: 3, connector: 'UP', b: ['UP_LEFT', 'LEFT'], bRepeat: 3 },
  { start: [9, 1], a: ['DOWN_LEFT', 'LEFT'], aRepeat: 3, connector: 'DOWN', b: ['DOWN_RIGHT', 'RIGHT'], bRepeat: 3 },
  { start: [1, 1], a: ['DOWN_RIGHT', 'RIGHT'], aRepeat: 3, connector: 'DOWN', b: ['DOWN_LEFT', 'LEFT'], bRepeat: 3 },
  { start: [9, 9], a: ['UP_LEFT', 'LEFT'], aRepeat: 3, connector: 'UP', b: ['UP_RIGHT', 'RIGHT'], bRepeat: 3 },
  { start: [1, 9], a: ['UP', 'UP_RIGHT', 'RIGHT'], aRepeat: 2, connector: 'RIGHT', b: ['DOWN_RIGHT', 'RIGHT', 'DOWN'], bRepeat: 2 },
  { start: [0, 10], a: ['UP', 'RIGHT'], aRepeat: 4, connector: 'UP', b: ['UP', 'LEFT'], bRepeat: 4 },
  { start: [10, 10], a: ['UP', 'LEFT'], aRepeat: 4, connector: 'UP', b: ['UP', 'RIGHT'], bRepeat: 4 },
  { start: [0, 0], a: ['DOWN', 'RIGHT'], aRepeat: 4, connector: 'DOWN', b: ['DOWN', 'LEFT'], bRepeat: 4 },
  { start: [10, 0], a: ['DOWN', 'LEFT'], aRepeat: 4, connector: 'DOWN', b: ['DOWN', 'RIGHT'], bRepeat: 4 },
  { start: [1, 10], a: ['UP_RIGHT', 'UP'], aRepeat: 3, connector: 'RIGHT', b: ['DOWN_RIGHT', 'DOWN'], bRepeat: 3 }
]);

function movePoint(point, dirKey) {
  const direction = CommandEngine.expandToStepList([{ dir: dirKey, distance: 1 }]);
  if (direction.length !== 1) return { ...point };
  const vectors = {
    UP: [0, -1], UP_RIGHT: [1, -1], RIGHT: [1, 0], DOWN_RIGHT: [1, 1],
    DOWN: [0, 1], DOWN_LEFT: [-1, 1], LEFT: [-1, 0], UP_LEFT: [-1, -1]
  };
  const [dx, dy] = vectors[dirKey];
  return { x: point.x + dx, y: point.y + dy };
}

function appendPatternRoute(current, directions, repeat, steps) {
  for (let invocation = 0; invocation < repeat; invocation++) {
    for (const dir of directions) {
      steps.push(dir);
      current = movePoint(current, dir);
    }
  }
  return current;
}

function buildRoutePoints(start, steps) {
  const points = [];
  let current = { ...start };
  for (const direction of steps) {
    current = movePoint(current, direction);
    points.push({ ...current });
  }
  return points;
}

function pickFuelStopsAtIndexes(routePoints, indexes) {
  const seen = new Set();
  return indexes.flatMap(index => {
    const point = routePoints[index];
    if (!point || index >= routePoints.length - 1) return [];
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...point }];
  });
}

function makeSequenceLevel(template, index, gridSize) {
  const starPos = { x: template.start[0], y: template.start[1] };
  const routePoints = buildRoutePoints(starPos, template.steps);
  return {
    title: `${gridSize}x${gridSize} 순차구조 문제 ${index + 1}`,
    gridSize,
    starPos,
    goalPos: { ...routePoints.at(-1) },
    checkpoints: routePoints.slice(0, -1),
    obstacles: [],
    educationLesson: 'sequence',
    targetStepDirections: [...template.steps],
    witness: {
      main: template.steps.map(dir => ({ dir, distance: 1 }))
    },
    educationToolPolicy: {
      allowedDirections: [...new Set(template.steps)],
      maxMainCommands: template.steps.length
    },
    guide: '① 사용할 수 있는 1칸 방향 명령으로 번호 지점을 차례대로 지나 목표점에 도착하세요. 명령의 순서를 바꾸면 지나가는 지점도 달라집니다.'
  };
}

function getCardinalRouteDistance(template) {
  return (
    Math.abs(template.goal[0] - template.start[0]) +
    Math.abs(template.goal[1] - template.start[1])
  );
}

function makeRoutesLevel(template, index, gridSize) {
  const commandLimit = getCardinalRouteDistance(template);
  return {
    title: `${gridSize}x${gridSize} 여러 길 문제 ${index + 1}`,
    gridSize,
    starPos: { x: template.start[0], y: template.start[1] },
    goalPos: { x: template.goal[0], y: template.goal[1] },
    obstacles: [],
    educationLesson: 'routes',
    educationTargetRouteCount: 3,
    educationToolPolicy: {
      allowedDirections: [...template.directions],
      maxMainCommands: commandLimit
    },
    guide: `② 이 맵에서는 ${template.directions.map(direction => DIRECTIONS[direction].symbol).join('와 ')} 1칸 명령만 사용합니다. ${commandLimit}번 안에 목표점에 도착하는 서로 다른 순서를 세 가지 찾아보세요.`
  };
}

function getMinimumCommandsOnShortestRoutes(level) {
  const shortest = CommandEngine.enumerateShortestPaths(
    level.starPos,
    level.goalPos,
    level.gridSize,
    level.obstacles || [],
    5000
  );
  if (!shortest.isComplete || shortest.paths.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.min(
    ...shortest.paths.map(path => CommandEngine.compressStepList(path).length)
  );
}

function prepareMinimumCommandLevel(level, index, gridSize) {
  const minimumCommandAnalysis = CommandEngine.analyzeMinimumCommands(
    level.starPos,
    level.goalPos,
    level.gridSize,
    level.obstacles || []
  );
  const minimumCommandsOnShortestRoute = getMinimumCommandsOnShortestRoutes(level);
  return {
    ...JSON.parse(JSON.stringify(level)),
    title: `${gridSize}x${gridSize} 최소 명령 비교 문제 ${index + 1}`,
    educationLesson: 'minimum',
    minimumCommandsOnShortestRoute,
    minimumCommandCount: minimumCommandAnalysis.commandCount,
    educationVariantGroup: [
      `minimum-${minimumCommandAnalysis.commandCount}`,
      `shortest-${minimumCommandsOnShortestRoute}`,
      `detour-${level.detourDistance || 0}`,
      `obstacles-${(level.obstacles || []).length}`
    ].join(':'),
    educationToolPolicy: {
      allowedDirections: [...ALL_DIRECTIONS]
    },
    guide: `⑤ 이 맵의 가장 짧은 길은 최소 ${minimumCommandsOnShortestRoute}개 명령 묶음이 필요하지만, 다른 안전한 길에서는 ${minimumCommandAnalysis.commandCount}개까지 줄일 수 있습니다. 이동 칸 수가 아니라 명령 수를 줄여 보세요.`
  };
}

function makeRoutingObstacles(steps, start, gridSize) {
  const path = [{ ...start }];
  let current = { ...start };
  for (const dir of steps) {
    current = movePoint(current, dir);
    path.push({ ...current });
  }
  const used = new Set(path.map(point => `${point.x},${point.y}`));
  const candidates = [];
  for (let index = 0; index < path.length - 1; index += 2) {
    const point = path[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const candidate = { x: point.x + dx, y: point.y + dy };
      const key = `${candidate.x},${candidate.y}`;
      if (
        candidate.x >= 0 && candidate.x < gridSize &&
        candidate.y >= 0 && candidate.y < gridSize &&
        !used.has(key) && !candidates.some(item => item.x === candidate.x && item.y === candidate.y)
      ) {
        candidates.push(candidate);
        break;
      }
    }
    if (candidates.length >= Math.min(6, Math.ceil(gridSize / 2))) break;
  }
  return candidates;
}

function makeBlockOneLevel(template, index, withObstacles) {
  const starPos = { x: template.start[0], y: template.start[1] };
  const steps = [];
  const goalPos = appendPatternRoute({ ...starPos }, template.pattern, template.repeat, steps);
  const routePoints = buildRoutePoints(starPos, steps);
  const fuelStops = pickFuelStopsAtIndexes(
    routePoints,
    Array.from({ length: template.repeat }, (_, invocation) => (
      (invocation + 1) * template.pattern.length - 1
    ))
  );
  const obstacles = withObstacles ? makeRoutingObstacles(steps, starPos, 9) : [];
  const patternPolicy = { availableBlocks: 1, minUsedBlocks: 1, minimumInvocations: 2 };
  const minimumCodeSize = analyzeMinimumCommandBlockCode(steps, patternPolicy).minimumCodeSize;
  return {
    title: `9x9 명령 블록 문제 ${index + 1}`,
    gridSize: 9,
    starPos,
    goalPos,
    fuelStops,
    targetStepDirections: [...steps],
    obstacles,
    educationLesson: 'block_one',
    educationVariantGroup: `pattern-${template.pattern.length}:repeat-${template.repeat}:obstacles-${withObstacles ? 1 : 0}`,
    fuelMissionType: 'ordered-required',
    patternPolicy,
    educationToolPolicy: {
      allowedDirections: [...new Set(steps)],
      allowDirectMainMoves: false
    },
    minimumCodeSize,
    witness: {
      definitions: { A: template.pattern.map(dir => ({ dir, distance: 1 })) },
      main: [{ type: 'block', blockId: 'A', repeat: template.repeat }]
    },
    guide: '⛽ 번호 순서대로 연료를 보급하고, 반복되는 이동을 나만의 명령 블록 A로 만들어 목표점에 도착하세요.'
  };
}

function makeBlockTwoLevel(template, index, withObstacles) {
  const starPos = { x: template.start[0], y: template.start[1] };
  const steps = [];
  let current = appendPatternRoute({ ...starPos }, template.a, template.aRepeat, steps);
  steps.push(template.connector);
  current = movePoint(current, template.connector);
  current = appendPatternRoute(current, template.b, template.bRepeat, steps);
  const routePoints = buildRoutePoints(starPos, steps);
  const aLength = template.a.length * template.aRepeat;
  const connectorIndex = aLength;
  const fuelIndexes = [
    ...Array.from({ length: template.aRepeat }, (_, invocation) => (
      (invocation + 1) * template.a.length - 1
    )),
    connectorIndex,
    ...Array.from({ length: template.bRepeat }, (_, invocation) => (
      connectorIndex + (invocation + 1) * template.b.length
    ))
  ];
  const fuelStops = pickFuelStopsAtIndexes(routePoints, fuelIndexes);
  const obstacles = withObstacles ? makeRoutingObstacles(steps, starPos, 11) : [];
  const patternPolicy = { availableBlocks: 2, minUsedBlocks: 2, minimumInvocations: 2 };
  const minimumCodeSize = analyzeMinimumCommandBlockCode(steps, patternPolicy).minimumCodeSize;
  return {
    title: `11x11 명령 블록 문제 ${index + 1}`,
    gridSize: 11,
    starPos,
    goalPos: current,
    fuelStops,
    targetStepDirections: [...steps],
    obstacles,
    educationLesson: 'block_two',
    educationVariantGroup: `a-${template.a.length}:b-${template.b.length}:repeat-${template.aRepeat}-${template.bRepeat}:obstacles-${withObstacles ? 1 : 0}`,
    fuelMissionType: 'ordered-required',
    patternPolicy,
    educationToolPolicy: {
      allowedDirections: [...new Set(steps)],
      allowDirectMainMoves: true
    },
    minimumCodeSize,
    witness: {
      definitions: {
        A: template.a.map(dir => ({ dir, distance: 1 })),
        B: template.b.map(dir => ({ dir, distance: 1 }))
      },
      main: [
        { type: 'block', blockId: 'A', repeat: template.aRepeat },
        { dir: template.connector, distance: 1 },
        { type: 'block', blockId: 'B', repeat: template.bRepeat }
      ]
    },
    guide: '⛽ 모든 연료 보급소를 순서대로 지나도록 서로 다른 반복 명령을 A와 B로 만들고 조합하세요.'
  };
}

export const PATTERN_EDUCATION_LEVELS = Object.freeze({
  shortest: Object.freeze({
    block_one: Object.freeze(BLOCK_ONE_TEMPLATES.map((template, index) => makeBlockOneLevel(template, index, false))),
    block_two: Object.freeze(BLOCK_TWO_TEMPLATES.map((template, index) => makeBlockTwoLevel(template, index, false)))
  }),
  routing: Object.freeze({
    block_one: Object.freeze(BLOCK_ONE_TEMPLATES.map((template, index) => makeBlockOneLevel(template, index, true))),
    block_two: Object.freeze(BLOCK_TWO_TEMPLATES.map((template, index) => makeBlockTwoLevel(template, index, true)))
  })
});

const LESSON_GUIDES = Object.freeze({
  sequence: '① 명령은 왼쪽부터 차례대로 실행됩니다. 방향을 두 가지 이상 사용해 목표점에 도착해 보세요.',
  routes: '② 같은 목표점에 도착하는 방향 순서가 다른 길을 두 가지 찾아 비교해 보세요.',
  compress: '③ 주어진 한 칸 이동과 정확히 같은 길을, 같은 방향 명령을 묶어 더 적은 명령으로 나타내세요.',
  shortest: '④ 실제로 이동하는 칸 수가 가장 적은 안전 경로를 찾아보세요.',
  minimum: '⑤ 이동 칸 수와 관계없이 목표에 도착하는 명령 블록 수를 가장 적게 만들어 보세요.'
});

function addEducationProblemKeys(levels, activityMode, lessonId, gridSize) {
  return levels.map((level, index) => ({
    ...level,
    educationVariantGroup: level.educationVariantGroup ?? (index % 5),
    educationProblemKey: `missile:${activityMode}:${lessonId}:${gridSize}:${index + 1}`
  }));
}

function makeCompressTemplateSource(template, gridSize) {
  const sourceCommands = template.runs.map(([dir, distance]) => ({ dir, distance }));
  const starPos = { x: template.start[0], y: template.start[1] };
  const result = CommandEngine.simulate(starPos, sourceCommands, gridSize, []);
  if (result.hitWall || result.hitObstacle) {
    throw new Error(`Invalid compress template ${gridSize}x${gridSize}`);
  }
  return { gridSize, starPos, goalPos: result.finalPos, sourceCommands };
}

function uniqueLevels(levels, signatureForLevel) {
  const seen = new Set();
  return levels.filter(level => {
    const signature = signatureForLevel(level);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

/**
 * 한 차시에서 풀 문제(5개)보다 넓은 검증 후보 문제은행을 만든다. 화면에서는
 * 이 은행에서 다섯 문제를 골라 쓰며, 새로고침할 때는 같은 선택을 복원한다.
 */
export function buildEducationProblemBank(presetLevels, activityMode, lessonId, gridSize) {
  if (isPatternEducationLesson(lessonId)) {
    if ((lessonId === 'block_one' && gridSize !== 9) || (lessonId === 'block_two' && gridSize !== 11)) {
      return [];
    }
    const key = (activityMode === 'missile' || !PATTERN_EDUCATION_LEVELS[activityMode]) ? 'shortest' : activityMode;
    return addEducationProblemKeys(
      PATTERN_EDUCATION_LEVELS[key]?.[lessonId] || [],
      activityMode,
      lessonId,
      gridSize
    );
  }

  if (![5, 7].includes(gridSize)) return [];
  if (lessonId === 'sequence') {
    return addEducationProblemKeys(
      (SEQUENCE_TEMPLATES[gridSize] || []).map(
        (template, index) => makeSequenceLevel(template, index, gridSize)
      ),
      activityMode,
      lessonId,
      gridSize
    );
  }
  if (lessonId === 'routes') {
    return addEducationProblemKeys(
      (ROUTE_TEMPLATES[gridSize] || []).map(
        (template, index) => makeRoutesLevel(template, index, gridSize)
      ),
      activityMode,
      lessonId,
      gridSize
    );
  }

  if (lessonId === 'minimum') {
    const contrastLevels = (presetLevels.routing || [])
      .filter(level => level.gridSize === gridSize)
      .filter(level => {
        const globalMinimum = CommandEngine.getMinimumCommandCount(
          level.starPos,
          level.goalPos,
          level.gridSize,
          level.obstacles || []
        );
        return getMinimumCommandsOnShortestRoutes(level) > globalMinimum;
      });
    return addEducationProblemKeys(
      contrastLevels.map(
        (level, index) => prepareMinimumCommandLevel(level, index, gridSize)
      ),
      activityMode,
      lessonId,
      gridSize
    );
  }

  if (lessonId === 'compress') {
    const rawLevels = (presetLevels.efficiency || []).filter(level => level.gridSize === gridSize);
    const addedLevels = (COMPRESS_TEMPLATES[gridSize] || [])
      .map(template => makeCompressTemplateSource(template, gridSize));
    return addEducationProblemKeys(
      [...rawLevels, ...addedLevels].map(
        (level, index) => prepareCompressLevel(level, index, gridSize)
      ),
      activityMode,
      lessonId,
      gridSize
    );
  }

  let sourceMode = activityMode;
  if (lessonId === 'shortest') sourceMode = (activityMode === 'missile' || !presetLevels[activityMode]) ? 'shortest' : activityMode;

  let levels = (presetLevels[sourceMode] || []).filter(level => level.gridSize === gridSize);
  if (lessonId === 'shortest' && sourceMode === 'shortest') {
    const openAlternates = (presetLevels.routing || [])
      .filter(level => level.gridSize === gridSize)
      .map(level => ({ ...JSON.parse(JSON.stringify(level)), obstacles: [] }));
    levels = uniqueLevels([...levels, ...openAlternates], level => {
      const start = level.starPos || level.startPos || {};
      const goal = level.goalPos || level.targetPos || {};
      return `${start.x},${start.y}>${goal.x},${goal.y}`;
    });
  }

  const prepared = levels.map((level, index) => {
    const starPos = level.starPos || level.startPos || { x: 0, y: 0 };
    const goalPos = level.goalPos || level.targetPos || (
      level.sourceCommands ? CommandEngine.simulate(starPos, level.sourceCommands, gridSize).pos : starPos
    );
    const copy = JSON.parse(JSON.stringify(level));
    return {
      ...copy,
      starPos,
      goalPos,
      title: `${gridSize}x${gridSize} ${getEducationLesson(lessonId).title} ${index + 1}`,
      educationLesson: lessonId,
      educationTargetRouteCount: 0,
      educationToolPolicy: {
        allowedDirections: [...ALL_DIRECTIONS]
      },
      guide: LESSON_GUIDES[lessonId]
    };
  });
  return addEducationProblemKeys(prepared, activityMode, lessonId, gridSize);
}

export function buildEducationLevelPool(presetLevels, activityMode, lessonId, gridSize) {
  return buildEducationProblemBank(
    presetLevels,
    activityMode,
    lessonId,
    gridSize
  ).slice(0, 5);
}

function prepareCompressLevel(level, index, gridSize) {
  const starPos = level.starPos || level.startPos || { x: 0, y: 0 };
  const rawCommands = level.sourceCommands || [];
  const singleStepCommands = [];
  for (const cmd of rawCommands) {
    const dist = cmd.distance || 1;
    for (let i = 0; i < dist; i++) {
      singleStepCommands.push({ dir: cmd.dir, distance: 1 });
    }
  }
  const sim = CommandEngine.simulate(starPos, singleStepCommands, gridSize);
  const goalPos = level.goalPos || sim.finalPos;
  const allowedDirs = [...new Set(singleStepCommands.map(c => c.dir))];

  return {
    ...JSON.parse(JSON.stringify(level)),
    gridSize,
    starPos,
    goalPos,
    title: `${gridSize}x${gridSize} 같은 방향 명령 묶기 ${index + 1}`,
    sourceCommands: singleStepCommands,
    compressedCommands: rawCommands,
    educationLesson: 'compress',
    educationToolPolicy: {
      allowedDirections: allowedDirs,
      allowDistanceEditing: true,
      mergeAdjacent: true
    },
    guide: '③ 제시된 한 칸 이동을 같은 방향끼리 묶어서 더 짧고 명쾌한 명령 조합으로 축약해 보세요.'
  };
}
